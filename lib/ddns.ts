import type { CloudflareToken, UserSettings } from "@prisma/client/index";
import type { Prisma } from "@prisma/client/index";

import { sendAlerts } from "@/lib/alerts";
import { logAuditEvent } from "@/lib/audit";
import { getPublicIp } from "@/lib/ip";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "@/lib/secrets";

type MonitoredRecord = {
  zoneId: string;
  recordId: string;
};

type CloudflareRecord = {
  id: string;
  name: string;
  type: string;
  content: string;
  ttl: number;
  proxied?: boolean;
};

type DdnsUser = {
  id: string;
  email: string;
  settings: UserSettings | null;
  tokens: CloudflareToken[];
};

type SyncUserOptions = {
  userId?: string;
  actor?: string | null;
};

type SyncRecordResult = {
  zoneId: string;
  recordId: string;
  name?: string;
  previousContent?: string | null;
  content: string;
  status: "success" | "error" | "skipped";
  message: string;
};

export type DdnsSyncResult = {
  currentIp: string;
  usersChecked: number;
  recordsChecked: number;
  recordsUpdated: number;
  recordsFailed: number;
  results: SyncRecordResult[];
};

const schedulerState = globalThis as typeof globalThis & {
  flarewatcherDdnsScheduler?: {
    started: boolean;
    running: boolean;
    timer?: NodeJS.Timeout;
    lastCheckedByUser: Map<string, number>;
  };
};

const getSchedulerState = () => {
  schedulerState.flarewatcherDdnsScheduler ??= {
    started: false,
    running: false,
    lastCheckedByUser: new Map<string, number>(),
  };
  return schedulerState.flarewatcherDdnsScheduler;
};

const parseMonitoredRecords = (value: Prisma.JsonValue): MonitoredRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is MonitoredRecord => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return false;
    }
    const candidate = item as Record<string, unknown>;
    return (
      typeof candidate.zoneId === "string" &&
      candidate.zoneId.length > 0 &&
      typeof candidate.recordId === "string" &&
      candidate.recordId.length > 0
    );
  });
};

const getTokenValue = async (token: CloudflareToken) => {
  const decrypted = decryptSecret(token.token);
  if (!decrypted) {
    return null;
  }

  if (!isEncryptedSecret(token.token)) {
    const encrypted = encryptSecret(decrypted);
    if (encrypted && encrypted !== token.token) {
      await prisma.cloudflareToken.update({
        where: { id: token.id },
        data: { token: encrypted },
      });
    }
  }

  return decrypted;
};

const fetchCloudflareRecord = async (
  zoneId: string,
  recordId: string,
  token: string
) => {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }
  );

  const data = (await response.json()) as {
    success?: boolean;
    errors?: { message?: string }[];
    result?: CloudflareRecord;
  };

  if (!response.ok || !data.success || !data.result) {
    throw new Error(data.errors?.[0]?.message || "Unable to load record.");
  }

  return data.result;
};

const findRecordWithToken = async (
  user: DdnsUser,
  item: MonitoredRecord
) => {
  let lastError = "No usable Cloudflare token found.";

  for (const tokenRecord of user.tokens) {
    const token = await getTokenValue(tokenRecord);
    if (!token) {
      continue;
    }

    try {
      const record = await fetchCloudflareRecord(
        item.zoneId,
        item.recordId,
        token
      );
      return { tokenId: tokenRecord.id, token, record };
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }

  throw new Error(lastError);
};

const checkPropagation = async (record: CloudflareRecord, ipAddress: string) => {
  if (record.type.toUpperCase() !== "A") {
    return {
      propagated: null as boolean | null,
      propagationNote: "Propagation check skipped for non-A record.",
    };
  }

  try {
    const dnsResponse = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(
        record.name
      )}&type=A`,
      {
        headers: { Accept: "application/dns-json" },
        cache: "no-store",
      }
    );
    const dnsData = (await dnsResponse.json()) as {
      Answer?: { data?: string }[];
    };
    const answers = (dnsData.Answer ?? [])
      .map((entry) => entry.data)
      .filter((entry): entry is string => Boolean(entry));
    const propagated = answers.includes(ipAddress);
    return {
      propagated,
      propagationNote: propagated
        ? "DNS record matches public IP."
        : "DNS record has not propagated yet.",
    };
  } catch {
    return {
      propagated: null as boolean | null,
      propagationNote: "Propagation check failed.",
    };
  }
};

const updateCloudflareRecord = async (
  item: MonitoredRecord,
  token: string,
  record: CloudflareRecord,
  ipAddress: string
) => {
  const payload = {
    name: record.name,
    type: record.type.toUpperCase(),
    content: ipAddress,
    ttl: record.ttl || 3600,
    proxied: Boolean(record.proxied),
    comment: "Flarewatcher auto-update",
  };

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${item.zoneId}/dns_records/${item.recordId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    }
  );

  const data = (await response.json()) as {
    success?: boolean;
    errors?: { message?: string }[];
  };

  if (!response.ok || !data.success) {
    throw new Error(data.errors?.[0]?.message || "Cloudflare rejected the update.");
  }

  return data;
};

const syncRecord = async (
  user: DdnsUser,
  item: MonitoredRecord,
  ipAddress: string,
  actor: string | null
): Promise<SyncRecordResult> => {
  const found = await findRecordWithToken(user, item);
  const record = found.record;

  if (record.content === ipAddress) {
    return {
      zoneId: item.zoneId,
      recordId: item.recordId,
      name: record.name,
      previousContent: record.content,
      content: ipAddress,
      status: "skipped",
      message: "Record already matches public IP.",
    };
  }

  let status: "success" | "error" = "success";
  let message = "DNS record updated.";
  let responseBody: unknown = null;

  try {
    responseBody = await updateCloudflareRecord(
      item,
      found.token,
      record,
      ipAddress
    );
  } catch (error) {
    status = "error";
    message = error instanceof Error ? error.message : "Update failed.";
    responseBody = { error: message };
  }

  const { propagated, propagationNote } = await checkPropagation(record, ipAddress);

  await prisma.dnsUpdate.create({
    data: {
      zoneId: item.zoneId,
      tokenId: found.tokenId,
      recordId: item.recordId,
      name: record.name,
      type: record.type.toUpperCase(),
      previousContent: record.content ?? null,
      previousTtl: typeof record.ttl === "number" ? record.ttl : null,
      previousProxied:
        typeof record.proxied === "boolean" ? record.proxied : null,
      content: ipAddress,
      ttl: record.ttl || 3600,
      proxied: Boolean(record.proxied),
      comment: "Flarewatcher auto-update",
      status,
      trigger: "auto",
      actor,
      propagated,
      propagationNote,
      response: JSON.stringify(responseBody),
    },
  });

  await logAuditEvent({
    userId: user.id,
    action: "dns.update",
    targetType: "record",
    targetId: item.recordId,
    detail: {
      zoneId: item.zoneId,
      name: record.name,
      type: record.type,
      status,
      trigger: "auto",
    },
  });

  if (status === "error" && user.settings?.notifyOnFailure) {
    await sendAlerts(user.id, {
      title: "Flarewatcher DNS update failed",
      body: `${record.name} failed to update: ${message}`,
      previousIp: record.content,
      currentIp: ipAddress,
    });
  }

  return {
    zoneId: item.zoneId,
    recordId: item.recordId,
    name: record.name,
    previousContent: record.content,
    content: ipAddress,
    status,
    message,
  };
};

export async function syncDdnsRecords(
  options: SyncUserOptions = {}
): Promise<DdnsSyncResult> {
  const currentIp = await getPublicIp();
  const users = await prisma.user.findMany({
    where: options.userId ? { id: options.userId } : undefined,
    include: {
      settings: true,
      tokens: true,
    },
  });

  const result: DdnsSyncResult = {
    currentIp,
    usersChecked: 0,
    recordsChecked: 0,
    recordsUpdated: 0,
    recordsFailed: 0,
    results: [],
  };

  for (const user of users) {
    const monitoredRecords = user.settings
      ? parseMonitoredRecords(user.settings.monitoredRecords)
      : [];

    if (monitoredRecords.length === 0) {
      continue;
    }

    result.usersChecked += 1;
    const previousIps = new Set<string>();
    let updatedForUser = 0;

    for (const item of monitoredRecords) {
      result.recordsChecked += 1;
      try {
        const recordResult = await syncRecord(
          user,
          item,
          currentIp,
          options.actor ?? "system"
        );
        result.results.push(recordResult);
        if (recordResult.status === "success") {
          result.recordsUpdated += 1;
          updatedForUser += 1;
          if (recordResult.previousContent) {
            previousIps.add(recordResult.previousContent);
          }
        } else if (recordResult.status === "error") {
          result.recordsFailed += 1;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to process record.";
        result.recordsFailed += 1;
        result.results.push({
          zoneId: item.zoneId,
          recordId: item.recordId,
          content: currentIp,
          status: "error",
          message,
        });
        if (user.settings?.notifyOnFailure) {
          await sendAlerts(user.id, {
            title: "Flarewatcher DNS update failed",
            body: `Record ${item.recordId} failed to update: ${message}`,
            currentIp,
          });
        }
      }
    }

    if (updatedForUser > 0 && user.settings?.notifyOnIpChange) {
      const previousIp = Array.from(previousIps).find((ip) => ip !== currentIp);
      await sendAlerts(user.id, {
        title: "Flarewatcher IP change",
        body: `Previous IP: ${previousIp ?? "-"}\nCurrent IP: ${currentIp}`,
        previousIp,
        currentIp,
      });
    }
  }

  return result;
}

export async function runScheduledDdnsSync() {
  const state = getSchedulerState();
  if (state.running) {
    return;
  }

  state.running = true;
  try {
    const settings = await prisma.userSettings.findMany({
      select: {
        userId: true,
        intervalMinutes: true,
        monitoredRecords: true,
      },
    });
    const now = Date.now();

    for (const setting of settings) {
      if (parseMonitoredRecords(setting.monitoredRecords).length === 0) {
        continue;
      }

      const intervalMs = Math.max(1, setting.intervalMinutes) * 60_000;
      const lastChecked = state.lastCheckedByUser.get(setting.userId) ?? 0;
      if (now - lastChecked < intervalMs) {
        continue;
      }

      state.lastCheckedByUser.set(setting.userId, now);
      await syncDdnsRecords({ userId: setting.userId, actor: "system" });
    }
  } finally {
    state.running = false;
  }
}

export function startDdnsScheduler() {
  const state = getSchedulerState();
  if (state.started || process.env.FLAREWATCHER_DDNS_SCHEDULER === "false") {
    return;
  }

  state.started = true;
  const intervalMs = 60_000;
  void runScheduledDdnsSync().catch(() => {});
  state.timer = setInterval(() => {
    void runScheduledDdnsSync().catch(() => {});
  }, intervalMs);
  state.timer.unref?.();
}
