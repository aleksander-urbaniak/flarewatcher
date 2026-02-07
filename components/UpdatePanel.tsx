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
    smtpPass?: string | null;
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
  const [tokenValue, setTokenValue] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return window.sessionStorage.getItem("flarewatcher:token-value") ?? "";
  });
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const DEFAULT_DISCORD_MARKDOWN =
    "\u{1F310} **Network Alert: IP Address Change Detected**\n\n" +
    "**Status Update**\n" +
    "The monitoring system has detected a change in your external network configuration. " +
    "Your connection has been updated successfully.\n\n" +
    "**Attribute** | **Details**\n" +
    "**Status** | \u{1F7E2} Active / Updated\n" +
    "**Previous IP** | {previousIp}\n" +
    "**Current IP** | {currentIp}\n" +
    "**Detection Time** | {timestamp}";
  const DEFAULT_SMTP_MESSAGE =
    "{title}\n\n{message}\n\nPrevious IP: {previousIp}\nCurrent IP: {currentIp}\nTimestamp: {timestamp}";
  const [discordMarkdown, setDiscordMarkdown] = useState(DEFAULT_DISCORD_MARKDOWN);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpTo, setSmtpTo] = useState("");
  const [smtpMessage, setSmtpMessage] = useState(DEFAULT_SMTP_MESSAGE);
  const [notifyOnIpChange, setNotifyOnIpChange] = useState(true);
  const [notifyOnFailure, setNotifyOnFailure] = useState(true);
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
    discord: true,
    smtp: true,
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
    window.sessionStorage.setItem("flarewatcher:token-value", tokenValue);
  }, [tokenValue]);

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
          discordMarkdown: discordMarkdown || null,
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
      localStorage.setItem(
        IP_STORAGE_KEY,
        JSON.stringify({ current, previous })
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
      return { current: parsed.current ?? null, previous: parsed.previous ?? null };
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
      setDiscordMarkdown(settings.discordMarkdown ?? DEFAULT_DISCORD_MARKDOWN);
      setAlertEnabled((prev) => ({
        ...prev,
        discord: settings.discordEnabled ?? true,
        smtp: settings.smtpEnabled ?? true,
      }));
      setSmtpHost(settings.smtpHost ?? "");
      setSmtpPort(settings.smtpPort?.toString() ?? "");
      setSmtpUser(settings.smtpUser ?? "");
      setSmtpPass(settings.smtpPass ?? "");
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
        override?.discordMarkdown ?? (discordMarkdown || null),
      discordEnabled: override?.discordEnabled ?? alertEnabled.discord,
      smtpHost: override?.smtpHost ?? (smtpHost || null),
      smtpPort:
        override?.smtpPort ??
        (smtpPort ? Number(smtpPort) || null : null),
      smtpUser: override?.smtpUser ?? (smtpUser || null),
      smtpPass: override?.smtpPass ?? (smtpPass || null),
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
    smtpPort,
    smtpTo,
    smtpUser,
  ]);

  const saveAlertingSettings = useCallback(() => {
    return saveSettings({
      discordWebhookUrl: discordWebhookUrl || null,
      discordMarkdown: discordMarkdown || null,
      smtpHost: smtpHost || null,
      smtpPort: smtpPort ? Number(smtpPort) || null : null,
      smtpUser: smtpUser || null,
      smtpPass: smtpPass || null,
      smtpFrom: smtpFrom || null,
      smtpTo: smtpTo || null,
      smtpMessage: smtpMessage || null,
      notifyOnIpChange,
      notifyOnFailure,
    });
  }, [
    discordMarkdown,
    discordWebhookUrl,
    notifyOnFailure,
    notifyOnIpChange,
    saveSettings,
    smtpFrom,
    smtpHost,
    smtpMessage,
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
    if (!tokenName.trim() || !tokenValue.trim()) {
      addLog("Token name and value are required.", "error");
      addNotification("Token missing", "Name and token are required.", "error");
      return;
    }
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
  };

  const removeToken = async (tokenId: string) => {
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
  };
  const verifyTokenStatus = async (tokenId: string) => {
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
      setPreviousIp(currentIp);
      setCurrentIp(ip);
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
    refreshData,
    saveSettings,
  ]);

  const checkUpdates = useCallback(
    async (ip: string) => {
      if (!ip || monitoredRecords.length === 0) {
        return;
      }

      for (const item of monitoredRecords) {
        const record = dnsRecords[item.zoneId]?.find(
          (entry) => entry.id === item.recordId
        );
        if (record && record.content !== ip) {
          const zone = zones.find((entry) => entry.id === item.zoneId);
          if (zone) {
            await updateRecord(item.zoneId, record, ip, zone.tokenId, "auto");
          }
        }
      }
    },
    [dnsRecords, monitoredRecords, updateRecord, zones]
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
        if (ip !== storedIps.current) {
          setPreviousIp(storedIps.current ?? null);
        }
        setCurrentIp(ip);
        persistIpHistory(ip, storedIps.current ?? null);
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
          if (shouldSuppress) {
            suppressNextIpAlertRef.current = false;
          } else {
            addLog(`IP change detected: ${currentIp ?? "-"} -> ${ip}`, "info");
            addNotification(
              "IP change detected",
              `${currentIp ?? "-"} -> ${ip}`,
              "info"
            );
          }
          setPreviousIp(currentIp);
          setCurrentIp(ip);
          persistIpHistory(ip, currentIp);
          if (!shouldSuppress && notifyOnIpChange) {
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
          />
        ) : null}

        {view === "config" ? (
          <div className="config-layout">
            <div className="config-main">
              <ConfigPanel
                tokenName={tokenName}
                tokenValue={tokenValue}
                status={status}
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
            smtpFrom={smtpFrom}
            smtpTo={smtpTo}
            smtpMessage={smtpMessage}
            alertEnabled={alertEnabled}
            testStatus={testStatus}
            testError={testError}
            defaultMarkdown={DEFAULT_DISCORD_MARKDOWN}
            defaultSmtpMessage={DEFAULT_SMTP_MESSAGE}
            notifyOnIpChange={notifyOnIpChange}
            notifyOnFailure={notifyOnFailure}
            onDiscordWebhookUrl={setDiscordWebhookUrl}
            onDiscordMarkdown={setDiscordMarkdown}
            onSmtpHost={setSmtpHost}
            onSmtpPort={setSmtpPort}
            onSmtpUser={setSmtpUser}
            onSmtpPass={setSmtpPass}
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
