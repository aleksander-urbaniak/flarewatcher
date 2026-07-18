"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Eye, RefreshCw, ShieldCheck } from "lucide-react";

import CommandPalette, { type CommandPaletteAction } from "@/components/CommandPalette";
import ThemeToggle from "@/components/ThemeToggle";
import AppFooter from "@/components/layout/AppFooter";
import AlertingPanel from "@/components/alerting/AlertingPanel";
import ConfigPanel from "@/components/config/ConfigPanel";
import AccessPanel from "@/components/config/AccessPanel";
import SecurityPanel from "@/components/config/SecurityPanel";
import ProfileDetailsPanel from "@/components/config/ProfileDetailsPanel";
import PasswordPanel from "@/components/config/PasswordPanel";
import ZoneManagementPanel from "@/components/zones/ZoneManagementPanel";
import NotificationsBell from "@/components/NotificationsBell";
import UserBadge from "@/components/UserBadge";
import TopNavLinks from "@/components/TopNavLinks";
import {
  DEFAULT_DISCORD_TEMPLATE,
  DEFAULT_SMTP_TEMPLATE,
  normalizeDiscordTemplate,
} from "@/lib/alertTemplates";
import { pushNotification } from "@/lib/clientNotifications";

type Zone = {
  id: string;
  name: string;
  status: string;
  plan?: { name?: string };
  paused?: boolean;
  tokenId: string;
  tokenName: string;
};

type DnsRecord = {
  id: string;
  name: string;
  type: string;
  content: string;
  ttl: number;
  proxied?: boolean;
};

type MonitoredRecord = { zoneId: string; recordId: string };

type UpdateRecord = {
  id: string;
  zoneId: string;
  tokenId: string | null;
  recordId: string;
  name: string;
  type: string;
  previousContent: string | null;
  previousTtl: number | null;
  previousProxied: boolean | null;
  content: string;
  status: string;
  trigger: string;
  actor: string | null;
  propagated: boolean | null;
  propagationNote: string | null;
  response: string;
  createdAt: string;
};

type SettingsResponse = {
  status: "success" | "error";
  settings?: {
    intervalMinutes: number;
    monitoredRecords: MonitoredRecord[];
    discordWebhookUrl?: string | null;
    discordMarkdown?: string | null;
    discordEnabled?: boolean | null;
    smtpHost?: string | null;
    smtpPort?: number | null;
    smtpUser?: string | null;
    smtpPassSet?: boolean;
    smtpFrom?: string | null;
    smtpTo?: string | null;
    smtpMessage?: string | null;
    smtpEnabled?: boolean | null;
    notifyOnIpChange?: boolean | null;
    notifyOnFailure?: boolean | null;
  } | null;
  message?: string;
};

type TokenItem = {
  id: string;
  name: string;
  createdAt: string;
  status?: string;
  missingScopes?: string[];
  scopes?: string[];
  lastCheckedAt?: string;
};

const defaultInterval = 5;
const IP_CHECK_INTERVAL_MS = 10_000;


type UpdatePanelView = "zones" | "config" | "alerting";

export default function UpdatePanel({ view = "zones" }: { view?: UpdatePanelView }) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"idle" | "fetching" | "updating">("idle");
  const [zones, setZones] = useState<Zone[]>([]);
  const [dnsRecords, setDnsRecords] = useState<Record<string, DnsRecord[]>>({});
  const [monitoredRecords, setMonitoredRecords] = useState<MonitoredRecord[]>([]);
  const [intervalMinutes, setIntervalMinutes] = useState(defaultInterval);
  const [currentIp, setCurrentIp] = useState<string | null>(null);
  const [previousIp, setPreviousIp] = useState<string | null>(null);
  const IP_STORAGE_KEY = "flarewatcher:ip-history";
  const [search, setSearch] = useState("");
  const [selectedZoneId, setSelectedZoneId] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return window.sessionStorage.getItem("flarewatcher:selected-zone") ?? "";
  });
  const [entriesPerPage, setEntriesPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [recordTypeFilter, setRecordTypeFilter] = useState("all");
  const [routingFilter, setRoutingFilter] = useState("all");
  const [autoUpdateFilter, setAutoUpdateFilter] = useState("all");
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [tokenName, setTokenName] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return window.sessionStorage.getItem("flarewatcher:token-name") ?? "";
  });
  // Not persisted to sessionStorage (unlike tokenName): this holds a raw
  // Cloudflare API token, and a failed save shouldn't leave it sitting in
  // storage indefinitely.
  const [tokenValue, setTokenValue] = useState("");
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const DEFAULT_DISCORD_MARKDOWN = DEFAULT_DISCORD_TEMPLATE;
  const DEFAULT_SMTP_MESSAGE = DEFAULT_SMTP_TEMPLATE;
  const [discordMarkdown, setDiscordMarkdown] = useState(DEFAULT_DISCORD_MARKDOWN);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpPassSet, setSmtpPassSet] = useState(false);
  const [smtpPassDirty, setSmtpPassDirty] = useState(false);
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpTo, setSmtpTo] = useState("");
  const [smtpMessage, setSmtpMessage] = useState(DEFAULT_SMTP_MESSAGE);
  const [notifyOnIpChange, setNotifyOnIpChange] = useState(true);
  const [notifyOnFailure, setNotifyOnFailure] = useState(true);
  const [tokenActionBusy, setTokenActionBusy] = useState(false);
  const [editingTokenId, setEditingTokenId] = useState<string | null>(null);
  const [editTokenName, setEditTokenName] = useState("");
  const [editTokenValue, setEditTokenValue] = useState("");
  const [auditLog, setAuditLog] = useState<UpdateRecord[]>([]);
  const [logs, setLogs] = useState<
    { createdAt: number; message: string; type: "info" | "success" | "error" }[]
  >([]);
  const didInitRef = useRef(false);
  const suppressNextIpAlertRef = useRef(false);
  const [testStatus, setTestStatus] = useState<
    "idle" | "discord" | "smtp"
  >("idle");
  const [testError, setTestError] = useState<Record<string, string | null>>({
    discord: null,
    smtp: null,
  });

  const LOG_STORAGE_KEY = "flarewatcher:logs";
  const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
  const [alertEnabled, setAlertEnabled] = useState({
    discord: false,
    smtp: false,
  });

  const persistLogs = useCallback(
    (items: typeof logs) => {
      if (typeof window === "undefined") {
        return;
      }
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(items));
    },
    [LOG_STORAGE_KEY]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.sessionStorage.setItem("flarewatcher:token-name", tokenName);
  }, [tokenName]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.sessionStorage.setItem("flarewatcher:selected-zone", selectedZoneId);
  }, [selectedZoneId]);

  const addLog = useCallback(
    (message: string, type: "info" | "success" | "error" = "info") => {
      const createdAt = Date.now();
      setLogs((prev) => {
        const next = [{ createdAt, message, type }, ...prev]
          .filter((entry) => createdAt - entry.createdAt <= LOG_RETENTION_MS)
          .slice(0, 100);
        persistLogs(next);
        return next;
      });
    },
    [LOG_RETENTION_MS, persistLogs]
  );

  const addNotification = useCallback(
    (
      title: string,
      message: string | undefined,
      type: "info" | "success" | "error" | "warning" = "info"
    ) => {
      pushNotification({ title, message, type });
    },
    []
  );

  const runAlertTest = useCallback(async (type: "discord" | "smtp") => {
    setTestStatus(type);
    setTestError((prev) => ({ ...prev, [type]: null }));
    try {
      const response = await fetch("/api/alerts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          discordWebhookUrl: discordWebhookUrl || null,
          discordMarkdown: normalizeDiscordTemplate(
            discordMarkdown || DEFAULT_DISCORD_MARKDOWN
          ),
          smtpHost: smtpHost || null,
          smtpPort: smtpPort ? Number(smtpPort) || null : null,
          smtpUser: smtpUser || null,
          smtpPass: smtpPass || null,
          smtpFrom: smtpFrom || null,
          smtpTo: smtpTo || null,
          smtpMessage: smtpMessage || null,
        }),
      });
      const data = (await response.json()) as { status: string; message?: string };
      if (!response.ok || data.status !== "success") {
        throw new Error(data.message || "Alert test failed.");
      }
      addLog(`Test ${type} alert sent.`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Alert test failed.";
      setTestError((prev) => ({ ...prev, [type]: message }));
      addLog(message, "error");
    } finally {
      setTestStatus("idle");
    }
  }, [
    addLog,
    DEFAULT_DISCORD_MARKDOWN,
    discordMarkdown,
    discordWebhookUrl,
    smtpFrom,
    smtpHost,
    smtpMessage,
    smtpPass,
    smtpPort,
    smtpTo,
    smtpUser,
  ]);

  const loadPersistedLogs = useCallback(() => {
    if (typeof window === "undefined") {
      return [];
    }
    try {
      const raw = localStorage.getItem(LOG_STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as {
        createdAt: number;
        message: string;
        type: "info" | "success" | "error";
      }[];
      const now = Date.now();
      const filtered = parsed.filter(
        (entry) => now - entry.createdAt <= LOG_RETENTION_MS
      );
      persistLogs(filtered);
      return filtered;
    } catch {
      return [];
    }
  }, [LOG_RETENTION_MS, LOG_STORAGE_KEY, persistLogs]);

  const persistIpHistory = useCallback(
    (current: string | null, previous: string | null) => {
      if (typeof window === "undefined") {
        return;
      }
      const normalizedCurrent = current?.trim() || null;
      const normalizedPrevious = previous?.trim() || null;
      const safePrevious =
        normalizedCurrent &&
        normalizedPrevious &&
        normalizedCurrent === normalizedPrevious
          ? null
          : normalizedPrevious;
      localStorage.setItem(
        IP_STORAGE_KEY,
        JSON.stringify({ current: normalizedCurrent, previous: safePrevious })
      );
    },
    [IP_STORAGE_KEY]
  );

  const loadIpHistory = useCallback(() => {
    if (typeof window === "undefined") {
      return { current: null as string | null, previous: null as string | null };
    }
    try {
      const raw = localStorage.getItem(IP_STORAGE_KEY);
      if (!raw) {
        return { current: null as string | null, previous: null as string | null };
      }
      const parsed = JSON.parse(raw) as {
        current?: string | null;
        previous?: string | null;
      };
      const current = parsed.current?.trim() || null;
      const previous = parsed.previous?.trim() || null;
      const safePrevious =
        current && previous && current === previous ? null : previous;
      return { current, previous: safePrevious };
    } catch {
      return { current: null as string | null, previous: null as string | null };
    }
  }, [IP_STORAGE_KEY]);

  const formatRelativeTime = (value?: string) => {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    const diffMs = Date.now() - date.getTime();
    const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
    if (diffSeconds < 60) {
      return `${diffSeconds}s ago`;
    }
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const monitoredSet = useMemo(() => {
    return new Set(monitoredRecords.map((item) => `${item.zoneId}:${item.recordId}`));
  }, [monitoredRecords]);

  const fetchPublicIp = useCallback(async () => {
    const response = await fetch("/api/ip", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Unable to fetch public IP.");
    }
    const data = (await response.json()) as { status: string; ip?: string };
    if (data.status !== "success" || !data.ip) {
      throw new Error("Unable to fetch public IP.");
    }
    return data.ip;
  }, []);

  const fetchZones = useCallback(async () => {
    const response = await fetch("/api/cloudflare/zones", { cache: "no-store" });
    const data = (await response.json()) as {
      status: string;
      zones?: Zone[];
      message?: string;
    };
    if (!response.ok || data.status !== "success") {
      throw new Error(data.message || "Failed to load zones.");
    }
    return data.zones ?? [];
  }, []);

  const fetchRecords = useCallback(async (zoneId: string, tokenId: string) => {
    const response = await fetch(
      `/api/cloudflare/records?zoneId=${encodeURIComponent(
        zoneId
      )}&tokenId=${encodeURIComponent(tokenId)}`,
      { cache: "no-store" }
    );
    const data = (await response.json()) as {
      status: string;
      records?: DnsRecord[];
      message?: string;
    };
    if (!response.ok || data.status !== "success") {
      throw new Error(data.message || "Failed to load DNS records.");
    }
    return data.records ?? [];
  }, []);

  const loadSettings = useCallback(async () => {
    const response = await fetch("/api/settings", { cache: "no-store" });
    const data = (await response.json()) as SettingsResponse;
    if (response.ok && data.status === "success" && data.settings) {
      const settings = data.settings;
      setIntervalMinutes(settings.intervalMinutes || defaultInterval);
      setMonitoredRecords((settings.monitoredRecords as MonitoredRecord[]) || []);
      setDiscordWebhookUrl(settings.discordWebhookUrl ?? "");
      setDiscordMarkdown(
        normalizeDiscordTemplate(
          settings.discordMarkdown ?? DEFAULT_DISCORD_MARKDOWN
        )
      );
      setAlertEnabled((prev) => ({
        ...prev,
        discord: settings.discordEnabled ?? false,
        smtp: settings.smtpEnabled ?? false,
      }));
      setSmtpHost(settings.smtpHost ?? "");
      setSmtpPort(settings.smtpPort?.toString() ?? "");
      setSmtpUser(settings.smtpUser ?? "");
      // The server never sends the decrypted password back; only whether one is stored.
      setSmtpPass("");
      setSmtpPassSet(Boolean(settings.smtpPassSet));
      setSmtpPassDirty(false);
      setSmtpFrom(settings.smtpFrom ?? "");
      setSmtpTo(settings.smtpTo ?? "");
      setSmtpMessage(settings.smtpMessage ?? DEFAULT_SMTP_MESSAGE);
      setNotifyOnIpChange(settings.notifyOnIpChange ?? true);
      setNotifyOnFailure(settings.notifyOnFailure ?? true);
    }
  }, [DEFAULT_DISCORD_MARKDOWN, DEFAULT_SMTP_MESSAGE]);

  const saveSettings = useCallback(async (
    override?: Partial<{
      intervalMinutes: number;
      monitoredRecords: MonitoredRecord[];
      discordWebhookUrl: string | null;
      discordMarkdown: string | null;
      discordEnabled: boolean;
      smtpHost: string | null;
      smtpPort: number | null;
      smtpUser: string | null;
      smtpPass: string | null;
      smtpFrom: string | null;
      smtpTo: string | null;
      smtpMessage: string | null;
      smtpEnabled: boolean;
      notifyOnIpChange: boolean;
      notifyOnFailure: boolean;
    }>
  ): Promise<boolean> => {
    const payload = {
      intervalMinutes: override?.intervalMinutes ?? intervalMinutes,
      monitoredRecords: override?.monitoredRecords ?? monitoredRecords,
      discordWebhookUrl:
        override?.discordWebhookUrl ?? (discordWebhookUrl || null),
      discordMarkdown:
        override?.discordMarkdown ??
        normalizeDiscordTemplate(discordMarkdown || DEFAULT_DISCORD_MARKDOWN),
      discordEnabled: override?.discordEnabled ?? alertEnabled.discord,
      smtpHost: override?.smtpHost ?? (smtpHost || null),
      smtpPort:
        override?.smtpPort ??
        (smtpPort ? Number(smtpPort) || null : null),
      smtpUser: override?.smtpUser ?? (smtpUser || null),
      // undefined = "leave the stored password alone" (the server treats a
      // missing key differently from an explicit null, which clears it).
      // We never receive the real password back, so only send a new value
      // when the operator actually typed one in this session.
      smtpPass:
        override?.smtpPass !== undefined
          ? override.smtpPass
          : smtpPassDirty
            ? smtpPass || null
            : undefined,
      smtpFrom: override?.smtpFrom ?? (smtpFrom || null),
      smtpTo: override?.smtpTo ?? (smtpTo || null),
      smtpMessage: override?.smtpMessage ?? (smtpMessage || null),
      smtpEnabled: override?.smtpEnabled ?? alertEnabled.smtp,
      notifyOnIpChange:
        override?.notifyOnIpChange ?? notifyOnIpChange,
      notifyOnFailure:
        override?.notifyOnFailure ?? notifyOnFailure,
    };

    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = (await response.json()) as { message?: string };
      addLog(data.message || "Failed to save settings.", "error");
      addNotification("Settings failed", data.message, "error");
      return false;
    } else {
      addLog("Settings saved.", "success");
      addNotification("Settings saved", "Configuration updated.", "success");
      return true;
    }
  }, [
    addLog,
    addNotification,
    alertEnabled,
    DEFAULT_DISCORD_MARKDOWN,
    discordMarkdown,
    discordWebhookUrl,
    intervalMinutes,
    monitoredRecords,
    notifyOnFailure,
    notifyOnIpChange,
    smtpFrom,
    smtpHost,
    smtpMessage,
    smtpPass,
    smtpPassDirty,
    smtpPort,
    smtpTo,
    smtpUser,
  ]);

  const saveAlertingSettings = useCallback(() => {
    return saveSettings({
      discordWebhookUrl: discordWebhookUrl || null,
      discordMarkdown: normalizeDiscordTemplate(
        discordMarkdown || DEFAULT_DISCORD_MARKDOWN
      ),
      smtpHost: smtpHost || null,
      smtpPort: smtpPort ? Number(smtpPort) || null : null,
      smtpUser: smtpUser || null,
      smtpPass: smtpPassDirty ? smtpPass || null : undefined,
      smtpFrom: smtpFrom || null,
      smtpTo: smtpTo || null,
      smtpMessage: smtpMessage || null,
      notifyOnIpChange,
      notifyOnFailure,
    });
  }, [
    DEFAULT_DISCORD_MARKDOWN,
    discordMarkdown,
    discordWebhookUrl,
    notifyOnFailure,
    notifyOnIpChange,
    saveSettings,
    smtpFrom,
    smtpHost,
    smtpMessage,
    smtpPassDirty,
    smtpPass,
    smtpPort,
    smtpTo,
    smtpUser,
  ]);

  const loadTokens = useCallback(async () => {
    const response = await fetch("/api/tokens", { cache: "no-store" });
    const data = (await response.json()) as {
      status: string;
      tokens?: TokenItem[];
    };
    if (response.ok && data.status === "success") {
      setTokens(data.tokens ?? []);
    }
  }, []);

  const highlightConfigPanel = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }
    const panel = document.getElementById("system-configuration");
    if (!panel) {
      return;
    }
    panel.animate(
      [
        { boxShadow: "0 0 0 0 rgba(249, 115, 22, 0.35)" },
        { boxShadow: "0 0 0 14px rgba(249, 115, 22, 0)" },
      ],
      { duration: 900, easing: "ease-out" }
    );
  }, []);

  const addToken = async () => {
    if (tokenActionBusy) {
      return;
    }
    if (!tokenName.trim() || !tokenValue.trim()) {
      addLog("Token name and value are required.", "error");
      addNotification("Token missing", "Name and token are required.", "error");
      return;
    }
    setTokenActionBusy(true);
    try {
      const response = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tokenName, token: tokenValue }),
      });
      const data = (await response.json()) as {
        status: string;
        message?: string;
        token?: TokenItem;
      };
      if (!response.ok || data.status !== "success") {
        addLog(data.message || "Failed to save token.", "error");
        addNotification("Token save failed", data.message, "error");
        return;
      }
      setTokenName("");
      setTokenValue("");
      await loadTokens();
      if (data.token?.missingScopes && data.token.missingScopes.length > 0) {
        addLog(
          `Token saved with missing scopes: ${data.token.missingScopes.join(", ")}.`,
          "error"
        );
        addNotification(
          "Token saved with warnings",
          data.token.missingScopes.join(", "),
          "warning"
        );
      } else {
        addLog("Token saved.", "success");
        addNotification("Token saved", "Cloudflare token stored.", "success");
      }
      await refreshData();
    } finally {
      setTokenActionBusy(false);
    }
  };

  const removeToken = async (tokenId: string) => {
    if (tokenActionBusy) {
      return;
    }
    setTokenActionBusy(true);
    try {
      const response = await fetch(`/api/tokens?tokenId=${encodeURIComponent(tokenId)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        addLog("Failed to remove token.", "error");
        addNotification("Token remove failed", "Unable to remove token.", "error");
        return;
      }
      await loadTokens();
      await refreshData();
      addNotification("Token removed", "Cloudflare token deleted.", "info");
    } finally {
      setTokenActionBusy(false);
    }
  };

  const startEditToken = (token: TokenItem) => {
    setEditingTokenId(token.id);
    setEditTokenName(token.name);
    setEditTokenValue("");
  };

  const cancelEditToken = () => {
    setEditingTokenId(null);
    setEditTokenName("");
    setEditTokenValue("");
  };

  const saveTokenEdit = async (tokenId: string) => {
    if (tokenActionBusy) {
      return;
    }
    if (!editTokenName.trim()) {
      addLog("Token label is required.", "error");
      addNotification("Token update failed", "Token label is required.", "error");
      return;
    }
    const payload: { tokenId: string; name: string; token?: string } = {
      tokenId,
      name: editTokenName.trim(),
    };
    if (editTokenValue.trim()) {
      payload.token = editTokenValue.trim();
    }
    setTokenActionBusy(true);
    try {
      const response = await fetch("/api/tokens", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { status: string; message?: string };
      if (!response.ok || data.status !== "success") {
        addLog(data.message || "Failed to update token.", "error");
        addNotification("Token update failed", data.message, "error");
        return;
      }
      addLog("Token updated.", "success");
      addNotification("Token updated", "Token settings saved.", "success");
      cancelEditToken();
      await loadTokens();
      await refreshData();
    } finally {
      setTokenActionBusy(false);
    }
  };
  const verifyTokenStatus = async (tokenId: string) => {
    if (tokenActionBusy) {
      return;
    }
    setTokenActionBusy(true);
    try {
      const response = await fetch(`/api/tokens?tokenId=${encodeURIComponent(tokenId)}`, {
        method: "PATCH",
      });
      const data = (await response.json()) as {
        status: string;
        message?: string;
        token?: TokenItem;
      };
      if (!response.ok || data.status !== "success") {
        addLog(data.message || "Token verification failed.", "error");
        addNotification("Token verification failed", data.message, "error");
        return;
      }
      await loadTokens();
      await refreshData();
      if (data.token?.missingScopes && data.token.missingScopes.length > 0) {
        addLog(`Token missing scopes: ${data.token.missingScopes.join(", ")}.`, "error");
        addNotification(
          "Token missing scopes",
          data.token.missingScopes.join(", "),
          "warning"
        );
      } else {
        addLog("Token scopes verified.", "success");
        addNotification("Token verified", "Scopes look good.", "success");
      }
    } finally {
      setTokenActionBusy(false);
    }
  };

  const refreshData = useCallback(async (options?: { notifyResult?: boolean }) => {
    setStatus("fetching");
    try {
      const notifyResult = options?.notifyResult ?? false;
      const zonesData = await fetchZones();
      setZones(zonesData);
      if (zonesData.length > 0) {
        const stored =
          typeof window !== "undefined"
            ? window.sessionStorage.getItem("flarewatcher:selected-zone")
            : null;
        const preferred = selectedZoneId || stored || "";
        const next = zonesData.find((zone) => zone.id === preferred)
          ? preferred
          : zonesData[0].id;
        setSelectedZoneId(next);
      } else {
        setSelectedZoneId("");
      }
      const recordMap: Record<string, DnsRecord[]> = {};
      const results = await Promise.allSettled(
        zonesData.map(async (zone) => ({
          zoneId: zone.id,
          records: await fetchRecords(zone.id, zone.tokenId),
        }))
      );
      results.forEach((result) => {
        if (result.status === "fulfilled") {
          recordMap[result.value.zoneId] = result.value.records;
        }
      });
      setDnsRecords(recordMap);
      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length > 0) {
        addLog(`${failed.length} token(s) failed during zone sync.`, "error");
        if (notifyResult) {
          addNotification(
            "Zone sync completed",
            `${failed.length} token(s) failed.`,
            "warning"
          );
        }
      } else if (notifyResult) {
        addNotification(
          "Zone sync completed",
          `${zonesData.length} zones loaded.`,
          "success"
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed.";
      addLog(message, "error");
      addNotification("Zone sync failed", message, "error");
    } finally {
      setStatus("idle");
    }
  }, [addLog, addNotification, fetchRecords, fetchZones, selectedZoneId]);

  const syncCloudflare = useCallback(async () => {
    await refreshData({ notifyResult: true });
    await loadTokens();
  }, [loadTokens, refreshData]);

  const loadAuditLog = useCallback(async () => {
    const response = await fetch("/api/updates", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as { updates: UpdateRecord[] };
    setAuditLog(data.updates ?? []);
  }, []);

  const updateRecord = useCallback(async (
    zoneId: string,
    record: DnsRecord,
    newIp: string,
    tokenId: string,
    trigger: "manual" | "auto"
  ) => {
    setStatus("updating");
    try {
      if (trigger === "manual") {
        suppressNextIpAlertRef.current = true;
      }
      addLog(`Updating ${record.name} -> ${newIp}`, "info");
      const response = await fetch("/api/dns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zoneId,
          recordId: record.id,
          tokenId,
          ttl: record.ttl || 3600,
          proxied: Boolean(record.proxied),
          comment: "Flarewatcher auto-update",
          trigger,
        }),
      });

      const data = (await response.json()) as { status: string; message?: string };
      if (!response.ok || data.status !== "success") {
        throw new Error(data.message || "Update failed.");
      }

      addLog(`Record updated: ${record.name}`, "success");
      addNotification(
        "Record updated",
        `${record.name} -> ${newIp}`,
        "success"
      );
      await refreshData();
      const ip = await fetchPublicIp();
      if (ip !== currentIp) {
        setPreviousIp(currentIp);
        setCurrentIp(ip);
        persistIpHistory(ip, currentIp);
      } else if (!currentIp) {
        setCurrentIp(ip);
        persistIpHistory(ip, previousIp);
      }
      await loadAuditLog();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed.";
      addLog(message, "error");
      if (trigger === "manual") {
        addNotification("Update failed", message, "error");
      }
      if (trigger === "auto") {
        const key = `${zoneId}:${record.id}`;
        if (monitoredSet.has(key)) {
          const next = monitoredRecords.filter(
            (item) => `${item.zoneId}:${item.recordId}` !== key
          );
          setMonitoredRecords(next);
          void saveSettings({ monitoredRecords: next });
          const reason = `Auto-update disabled: ${record.name} failed to update (${message}).`;
          addLog(reason, "error");
          addNotification("Auto-update disabled", reason, "warning");
        }
      }
    } finally {
      setStatus("idle");
    }
  }, [
    addLog,
    addNotification,
    currentIp,
    fetchPublicIp,
    loadAuditLog,
    monitoredRecords,
    monitoredSet,
    persistIpHistory,
    previousIp,
    refreshData,
    saveSettings,
  ]);

  const checkUpdates = useCallback(
    async (ip: string) => {
      if (!ip || monitoredRecords.length === 0) {
        return;
      }

      const response = await fetch("/api/dns/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json()) as {
        status: string;
        recordsUpdated?: number;
        recordsFailed?: number;
        message?: string;
      };

      if (!response.ok || data.status === "error") {
        throw new Error(data.message || "Auto-update sync failed.");
      }

      if ((data.recordsUpdated ?? 0) > 0 || (data.recordsFailed ?? 0) > 0) {
        await refreshData();
        await loadAuditLog();
        if ((data.recordsUpdated ?? 0) > 0) {
          addLog(`${data.recordsUpdated} monitored record(s) updated.`, "success");
          addNotification(
            "Auto-update completed",
            `${data.recordsUpdated} record(s) now point to ${ip}.`,
            "success"
          );
        }
        if ((data.recordsFailed ?? 0) > 0) {
          addLog(`${data.recordsFailed} monitored record(s) failed to update.`, "error");
          addNotification(
            "Auto-update issues",
            `${data.recordsFailed} record(s) could not be updated.`,
            "warning"
          );
        }
      }
    },
    [
      addLog,
      addNotification,
      loadAuditLog,
      monitoredRecords.length,
      refreshData,
    ]
  );

  const toggleMonitor = async (zoneId: string, recordId: string) => {
    const key = `${zoneId}:${recordId}`;
    const isAlready = monitoredSet.has(key);
    const recordName =
      dnsRecords[zoneId]?.find((entry) => entry.id === recordId)?.name ??
      "record";
    const updated = isAlready
      ? monitoredRecords.filter((item) => `${item.zoneId}:${item.recordId}` !== key)
      : [...monitoredRecords, { zoneId, recordId }];
    suppressNextIpAlertRef.current = true;
    setMonitoredRecords(updated);
    const ok = await saveSettings({ monitoredRecords: updated });
    if (!ok) {
      suppressNextIpAlertRef.current = false;
      setMonitoredRecords(monitoredRecords);
      addNotification(
        "Auto-update unchanged",
        `Could not ${isAlready ? "disable" : "enable"} auto-update for ${recordName}.`,
        "error"
      );
    }
  };

  useEffect(() => {
    if (didInitRef.current) {
      return;
    }
    didInitRef.current = true;
    const init = async () => {
      setLoading(true);
      try {
        setLogs(loadPersistedLogs());
        const storedIps = loadIpHistory();
        if (storedIps.current) {
          setCurrentIp(storedIps.current);
        }
        if (storedIps.previous) {
          setPreviousIp(storedIps.previous);
        }
        await loadSettings();
        await loadTokens();
        await refreshData();
        await loadAuditLog();
        const ip = await fetchPublicIp();
        const nextPreviousIp =
          ip !== storedIps.current
            ? (storedIps.current ?? null)
            : (storedIps.previous ?? null);
        setCurrentIp(ip);
        setPreviousIp(nextPreviousIp);
        persistIpHistory(ip, nextPreviousIp);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Initialization failed.";
        addLog(message, "error");
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [
    addLog,
    fetchPublicIp,
    loadAuditLog,
    loadIpHistory,
    loadPersistedLogs,
    loadSettings,
    loadTokens,
    persistIpHistory,
    refreshData,
  ]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedRecords(new Set());
  }, [selectedZoneId, search, recordTypeFilter, routingFilter, autoUpdateFilter]);

  const toggleSelectRecord = (zoneId: string, recordId: string) => {
    const key = `${zoneId}:${recordId}`;
    setSelectedRecords((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleSelectAllRecords = (
    _zoneId: string,
    pageKeys: string[],
    checked: boolean
  ) => {
    setSelectedRecords((prev) => {
      const next = new Set(prev);
      pageKeys.forEach((key) => {
        if (checked) {
          next.add(key);
        } else {
          next.delete(key);
        }
      });
      return next;
    });
  };

  const bulkSetAutoUpdate = async (zoneId: string, recordIds: string[], enable: boolean) => {
    const updated = new Set(monitoredRecords.map((item) => `${item.zoneId}:${item.recordId}`));
    recordIds.forEach((recordId) => {
      const key = `${zoneId}:${recordId}`;
      if (enable) {
        updated.add(key);
      } else {
        updated.delete(key);
      }
    });
    const next = Array.from(updated).map((key) => {
      const [z, r] = key.split(":");
      return { zoneId: z, recordId: r };
    });
    suppressNextIpAlertRef.current = true;
    setMonitoredRecords(next);
    const ok = await saveSettings({ monitoredRecords: next });
    if (!ok) {
      suppressNextIpAlertRef.current = false;
      setMonitoredRecords(monitoredRecords);
      addNotification(
        "Auto-update unchanged",
        `Failed to ${enable ? "enable" : "disable"} auto-update for selected records.`,
        "error"
      );
      return;
    }
    setSelectedRecords(new Set());
  };

  useEffect(() => {
    const loop = async () => {
      try {
        const ip = await fetchPublicIp();
        const shouldSuppress = suppressNextIpAlertRef.current;
        if (ip !== currentIp) {
          const isInitialDetection = currentIp === null;
          if (shouldSuppress) {
            suppressNextIpAlertRef.current = false;
          } else if (!isInitialDetection) {
            addLog(`IP change detected: ${currentIp} -> ${ip}`, "info");
            addNotification(
              "IP change detected",
              `${currentIp} -> ${ip}`,
              "info"
            );
          }
          setPreviousIp(currentIp);
          setCurrentIp(ip);
          persistIpHistory(ip, currentIp);
          if (!shouldSuppress && !isInitialDetection && notifyOnIpChange) {
            await fetch("/api/alerts/ip-change", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                previousIp: currentIp,
                currentIp: ip,
              }),
            });
          }
        } else if (shouldSuppress) {
          suppressNextIpAlertRef.current = false;
        }
        await checkUpdates(ip);
      } catch (error) {
        const message = error instanceof Error ? error.message : "IP check failed.";
        addLog(message, "error");
        addNotification("IP check failed", message, "error");
      }
    };

    if (!loading) {
      loop();
      const id = setInterval(loop, IP_CHECK_INTERVAL_MS);
      return () => clearInterval(id);
    }
  }, [
    addLog,
    addNotification,
    checkUpdates,
    currentIp,
    fetchPublicIp,
    loading,
    notifyOnIpChange,
    persistIpHistory,
  ]);

  const activeZones = useMemo(() => {
    if (selectedZoneId) {
      return zones.filter((zone) => zone.id === selectedZoneId);
    }
    return zones.length > 0 ? [zones[0]] : [];
  }, [zones, selectedZoneId]);

  const filteredZones = useMemo(() => {
    const query = search.trim().toLowerCase();
    const zoneList = activeZones;
    if (!query) {
      return zoneList;
    }
    return zoneList.filter((zone) =>
      zone.name.toLowerCase().includes(query) ||
      zone.tokenName.toLowerCase().includes(query) ||
      dnsRecords[zone.id]?.some((record) =>
        record.name.toLowerCase().includes(query) ||
        record.type.toLowerCase().includes(query)
      )
    );
  }, [activeZones, dnsRecords, search]);

  const recordCount = useMemo(() => {
    return activeZones.reduce(
      (total, zone) => total + (dnsRecords[zone.id]?.length ?? 0),
      0
    );
  }, [activeZones, dnsRecords]);

  const zoneLastRun = useMemo(() => {
    const map = new Map<string, UpdateRecord>();
    auditLog.forEach((entry) => {
      const existing = map.get(entry.zoneId);
      if (!existing || new Date(entry.createdAt) > new Date(existing.createdAt)) {
        map.set(entry.zoneId, entry);
      }
    });
    return map;
  }, [auditLog]);

  const rollbackUpdates = useMemo(() => {
    const map = new Map<string, UpdateRecord>();
    auditLog.forEach((entry) => {
      if (!entry.tokenId || !entry.previousContent) {
        return;
      }
      const key = `${entry.zoneId}:${entry.recordId}`;
      const existing = map.get(key);
      if (!existing || new Date(entry.createdAt) > new Date(existing.createdAt)) {
        map.set(key, entry);
      }
    });
    return map;
  }, [auditLog]);

  const recordsAtRisk = useMemo(() => {
    if (!currentIp) {
      return 0;
    }
    return activeZones.reduce((count, zone) => {
      const records = dnsRecords[zone.id] ?? [];
      return (
        count +
        records.filter(
          (record) =>
            record.type === "A" &&
            record.content !== currentIp
        ).length
      );
    }, 0);
  }, [activeZones, dnsRecords, currentIp]);

  const rollbackRecord = useCallback(
    async (zoneId: string, record: DnsRecord) => {
      const update = rollbackUpdates.get(`${zoneId}:${record.id}`);
      if (!update) {
        addNotification(
          "Rollback unavailable",
          "No previous record snapshot is available for this entry.",
          "warning"
        );
        return;
      }

      setStatus("updating");
      try {
        const response = await fetch("/api/dns/rollback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updateId: update.id }),
        });
        const data = (await response.json()) as { status: string; message?: string };
        if (!response.ok || data.status !== "success") {
          throw new Error(data.message || "Rollback failed.");
        }
        addLog(`Rollback applied: ${record.name}`, "success");
        addNotification(
          "Rollback completed",
          `${record.name} restored to ${update.previousContent}.`,
          "success"
        );
        await refreshData();
        await loadAuditLog();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Rollback failed.";
        addLog(message, "error");
        addNotification("Rollback failed", message, "error");
      } finally {
        setStatus("idle");
      }
    },
    [addLog, addNotification, loadAuditLog, refreshData, rollbackUpdates]
  );

  const commandActions = useMemo<CommandPaletteAction[]>(() => {
    const actions: CommandPaletteAction[] = [
      {
        id: "nav-dashboard",
        label: "Open dashboard",
        description: "Go to the main overview.",
        keywords: ["home", "overview"],
        onSelect: () => window.location.assign("/"),
      },
      {
        id: "nav-zones",
        label: "Open zone management",
        description: "Go to records and sync controls.",
        keywords: ["dns", "zones", "records"],
        onSelect: () => window.location.assign("/zones"),
      },
      {
        id: "nav-config",
        label: "Open settings",
        description: "Go to tokens and profile settings.",
        keywords: ["config", "settings"],
        onSelect: () => window.location.assign("/config"),
      },
      {
        id: "nav-alerting",
        label: "Open alerting",
        description: "Go to Discord and SMTP alert setup.",
        keywords: ["alerts", "discord", "smtp"],
        onSelect: () => window.location.assign("/alerting"),
      },
      {
        id: "nav-logs",
        label: "Open logs",
        description: "Go to system and audit logs.",
        keywords: ["audit", "activity", "events"],
        onSelect: () => window.location.assign("/logs"),
      },
      {
        id: "sync-cloudflare",
        label: "Sync Cloudflare now",
        description: "Refresh zones and records immediately.",
        keywords: ["sync", "refresh", "cloudflare"],
        onSelect: () => syncCloudflare(),
      },
    ];

    if (view === "zones") {
      actions.push({
        id: "focus-zone-search",
        label: "Focus record search",
        description: "Place cursor in the records search field.",
        keywords: ["search", "filter"],
        onSelect: () => {
          const searchEl = document.getElementById("zone-record-search");
          if (searchEl instanceof HTMLInputElement) {
            searchEl.focus();
            searchEl.select();
          }
        },
      });

      zones.slice(0, 12).forEach((zone) => {
        actions.push({
          id: `jump-zone-${zone.id}`,
          label: `Jump to zone: ${zone.name}`,
          description: zone.tokenName,
          keywords: ["zone", zone.name, zone.tokenName],
          onSelect: () => setSelectedZoneId(zone.id),
        });
      });
    }

    if (view === "config") {
      actions.push({
        id: "focus-system-configuration",
        label: "Highlight system configuration",
        description: "Scroll to and pulse the configuration panel.",
        keywords: ["configuration", "token", "settings"],
        onSelect: () => highlightConfigPanel(),
      });
    }

    if (view === "alerting") {
      actions.push({
        id: "save-alerting-settings",
        label: "Save alerting settings",
        description: "Persist current Discord and SMTP configuration.",
        keywords: ["save", "alerts", "smtp", "discord"],
        onSelect: async () => {
          await saveAlertingSettings();
        },
      });
      actions.push({
        id: "test-discord-alert",
        label: "Send Discord test alert",
        description: "Run a test alert to the configured Discord webhook.",
        keywords: ["discord", "test"],
        onSelect: () => runAlertTest("discord"),
      });
      actions.push({
        id: "test-smtp-alert",
        label: "Send SMTP test alert",
        description: "Run a test alert using current SMTP settings.",
        keywords: ["smtp", "email", "test"],
        onSelect: () => runAlertTest("smtp"),
      });
    }

    return actions;
  }, [
    highlightConfigPanel,
    runAlertTest,
    saveAlertingSettings,
    syncCloudflare,
    view,
    zones,
  ]);

  if (loading) {
    return (
      <div className="loading-screen">
        <RefreshCw className="spin" />
      </div>
    );
  }

  return (
    <div className="ui-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <div className="brand">
              <div className="brand-icon">
                <Eye className="brand-eye" />
              </div>
              <div>
                <h1>Flarewatcher</h1>
                <div className="brand-sub">
                  <ShieldCheck size={12} />
                  <span>Cloudflare DDNS</span>
                </div>
              </div>
            </div>
          </div>

          <div className="topbar-center">
            <TopNavLinks />
          </div>

          <div className="topbar-actions">
            <div className="public-ip">
              <div className="public-ip-row">
                <span className="public-ip-label">Current IP</span>
                <div className="public-ip-value">
                  <span className="ip-status" aria-hidden="true" />
                  <strong>{currentIp ?? "Detecting..."}</strong>
                  <span className="ip-tooltip">
                    Previous IP: {previousIp ?? "--"}
                  </span>
                </div>
              </div>
            </div>
            <ThemeToggle />
            <NotificationsBell />
            <UserBadge />
          </div>
        </div>
      </header>

      <main className="panel-page">
        {view === "zones" ? (
          <ZoneManagementPanel
            zones={zones}
            filteredZones={filteredZones}
            dnsRecords={dnsRecords}
            monitoredSet={monitoredSet}
            selectedZoneId={selectedZoneId}
            onSelectedZoneIdChange={setSelectedZoneId}
            search={search}
            onSearchChange={setSearch}
            recordTypeFilter={recordTypeFilter}
            routingFilter={routingFilter}
            autoUpdateFilter={autoUpdateFilter}
            onRecordTypeFilter={setRecordTypeFilter}
            onRoutingFilter={setRoutingFilter}
            onAutoUpdateFilter={setAutoUpdateFilter}
            entriesPerPage={entriesPerPage}
            onEntriesPerPageChange={setEntriesPerPage}
            currentPage={currentPage}
            onCurrentPageChange={setCurrentPage}
            selectedRecords={selectedRecords}
            onToggleSelectRecord={toggleSelectRecord}
            onSelectAllRecords={toggleSelectAllRecords}
            onBulkSetAutoUpdate={bulkSetAutoUpdate}
            onToggleMonitor={toggleMonitor}
            onUpdateRecord={updateRecord}
            currentIp={currentIp}
            intervalMinutes={intervalMinutes}
            recordCount={recordCount}
            recordsAtRisk={recordsAtRisk}
            zoneLastRun={zoneLastRun}
            rollbackUpdates={rollbackUpdates}
            onRollbackRecord={rollbackRecord}
            busy={status !== "idle"}
          />
        ) : null}

        {view === "config" ? (
          <div className="config-layout">
            <div className="config-main">
              <ConfigPanel
                tokenName={tokenName}
                tokenValue={tokenValue}
                status={status}
                busy={tokenActionBusy}
                onTokenNameChange={setTokenName}
                onTokenValueChange={setTokenValue}
                onSync={syncCloudflare}
                onSaveToken={addToken}
                onBlurInterval={() => saveSettings()}
              />
              <AccessPanel
                tokens={tokens}
                zones={zones}
                editingTokenId={editingTokenId}
                editTokenName={editTokenName}
                editTokenValue={editTokenValue}
                busy={tokenActionBusy}
                onStartEdit={startEditToken}
                onCancelEdit={cancelEditToken}
                onSaveEdit={saveTokenEdit}
                onEditNameChange={setEditTokenName}
                onEditValueChange={setEditTokenValue}
                onRemoveToken={removeToken}
                onVerifyToken={verifyTokenStatus}
                onHighlightConfig={highlightConfigPanel}
              />
            </div>
            <aside className="config-side">
              <ProfileDetailsPanel />
              <PasswordPanel />
              <SecurityPanel onLog={addLog} onNotify={addNotification} />
            </aside>
          </div>
        ) : null}

        {view === "alerting" ? (
          <AlertingPanel
            discordWebhookUrl={discordWebhookUrl}
            discordMarkdown={discordMarkdown}
            smtpHost={smtpHost}
            smtpPort={smtpPort}
            smtpUser={smtpUser}
            smtpPass={smtpPass}
            smtpPassSet={smtpPassSet}
            smtpFrom={smtpFrom}
            smtpTo={smtpTo}
            smtpMessage={smtpMessage}
            alertEnabled={alertEnabled}
            testStatus={testStatus}
            testError={testError}
            defaultMarkdown={DEFAULT_DISCORD_MARKDOWN}
            defaultSmtpMessage={DEFAULT_SMTP_MESSAGE}
            currentIp={currentIp}
            previousIp={previousIp}
            notifyOnIpChange={notifyOnIpChange}
            notifyOnFailure={notifyOnFailure}
            onDiscordWebhookUrl={setDiscordWebhookUrl}
            onDiscordMarkdown={setDiscordMarkdown}
            onSmtpHost={setSmtpHost}
            onSmtpPort={setSmtpPort}
            onSmtpUser={setSmtpUser}
            onSmtpPass={(value) => {
              setSmtpPass(value);
              setSmtpPassDirty(true);
            }}
            onSmtpFrom={setSmtpFrom}
            onSmtpTo={setSmtpTo}
            onSmtpMessage={setSmtpMessage}
            onToggleDiscord={(next) => {
              setAlertEnabled((prev) => ({ ...prev, discord: next }));
              void saveSettings({ discordEnabled: next });
              addNotification(
                "Discord alerts",
                next ? "Enabled (future enable)." : "Disabled.",
                next ? "success" : "info"
              );
            }}
            onToggleSmtp={(next) => {
              setAlertEnabled((prev) => ({ ...prev, smtp: next }));
              void saveSettings({ smtpEnabled: next });
              addNotification(
                "SMTP alerts",
                next ? "Enabled (future enable)." : "Disabled.",
                next ? "success" : "info"
              );
            }}
            onNotifyOnIpChange={setNotifyOnIpChange}
            onNotifyOnFailure={setNotifyOnFailure}
            onTest={runAlertTest}
            onSave={saveAlertingSettings}
          />
        ) : null}
      </main>

      <AppFooter />
      <CommandPalette actions={commandActions} />
    </div>
  );
}
