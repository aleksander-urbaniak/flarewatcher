"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Eye,
  Globe,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
  Trash2,
  User,
  X,
} from "lucide-react";

import CommandPalette, { type CommandPaletteAction } from "@/components/CommandPalette";
import ThemeToggle from "@/components/ThemeToggle";
import AppFooter from "@/components/layout/AppFooter";
import NotificationsBell from "@/components/NotificationsBell";
import UserBadge from "@/components/UserBadge";
import TopNavLinks from "@/components/TopNavLinks";

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

type LogItem = {
  createdAt: number;
  message: string;
  type: "info" | "success" | "error";
};

type UserAudit = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

type TimelineSource = "audit" | "local" | "derived";

type IpTimelineEvent = {
  id: string;
  createdAt: number;
  previousIp: string;
  currentIp: string;
  source: TimelineSource;
  isCurrent: boolean;
};

type DetailModalState =
  | { kind: "audit"; entry: UpdateRecord }
  | { kind: "user"; entry: UserAudit }
  | null;

const LOG_STORAGE_KEY = "flarewatcher:logs";
const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const IP_STORAGE_KEY = "flarewatcher:ip-history";
const IP_LOOKBACK_MONTHS = 6;
const IP_TIMELINE_MAX_ITEMS = 80;
const TIMELINE_COLLAPSE_WINDOW_MS = 10 * 60 * 1000;
const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_PATTERN = /^([0-9a-f]{1,4}:){1,7}[0-9a-f]{1,4}$/i;

const getLookbackStart = () => {
  const since = new Date();
  since.setMonth(since.getMonth() - IP_LOOKBACK_MONTHS);
  return since;
};

const normalizeIp = (value: string | null | undefined) => value?.trim() ?? "";

const isLikelyIp = (value: string) => {
  const candidate = value.trim();
  return IPV4_PATTERN.test(candidate) || IPV6_PATTERN.test(candidate);
};

const collapseIpTransitions = (
  entries: Array<{
    id: string;
    createdAt: number;
    previousIp: string;
    currentIp: string;
    source: Exclude<TimelineSource, "derived">;
  }>
) => {
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  const collapsed: typeof sorted = [];

  sorted.forEach((entry) => {
    const last = collapsed[collapsed.length - 1];
    if (!last) {
      collapsed.push(entry);
      return;
    }

    const sameTransition =
      last.previousIp === entry.previousIp && last.currentIp === entry.currentIp;
    const inWindow =
      Math.abs(entry.createdAt - last.createdAt) <= TIMELINE_COLLAPSE_WINDOW_MS;

    if (sameTransition && inWindow) {
      if (entry.source === "audit" && last.source !== "audit") {
        collapsed[collapsed.length - 1] = entry;
      }
      return;
    }

    collapsed.push(entry);
  });

  return collapsed;
};

const truncateText = (value: string, max = 120) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

const formatActionLabel = (action: string) => {
  const normalized = action.replace(/[._]/g, " ").trim();
  if (!normalized) {
    return "Activity event";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const formatDetailValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "-";
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatDetailValue(item)).join(", ");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
};

export default function LogsPanel() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [auditLog, setAuditLog] = useState<UpdateRecord[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [userAudit, setUserAudit] = useState<UserAudit[]>([]);
  const [loadingUserAudit, setLoadingUserAudit] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPerPage, setAuditPerPage] = useState(6);
  const [userPage, setUserPage] = useState(1);
  const [userPerPage, setUserPerPage] = useState(6);
  const [auditQuery, setAuditQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [currentIp, setCurrentIp] = useState<string | null>(null);
  const [previousIp, setPreviousIp] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState<DetailModalState>(null);
  const [timelineDragging, setTimelineDragging] = useState(false);
  const [clearingAudit, setClearingAudit] = useState(false);
  const [clearingUserAudit, setClearingUserAudit] = useState(false);
  const auditListRef = useRef<HTMLDivElement>(null);
  const userListRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const lastTimelineFocusKeyRef = useRef<string | null>(null);
  const timelinePointerIdRef = useRef<number | null>(null);
  const timelineStartXRef = useRef(0);
  const timelineStartScrollLeftRef = useRef(0);

  const loadPersistedLogs = () => {
    if (typeof window === "undefined") {
      return [];
    }
    try {
      const raw = localStorage.getItem(LOG_STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as LogItem[];
      const now = Date.now();
      const filtered = parsed.filter(
        (entry) => now - entry.createdAt <= LOG_RETENTION_MS
      );
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(filtered));
      return filtered;
    } catch {
      return [];
    }
  };

  const clearLogs = useCallback(() => {
    setLogs([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem(LOG_STORAGE_KEY);
    }
  }, []);

  const loadAuditLog = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const response = await fetch(
        `/api/updates?months=${IP_LOOKBACK_MONTHS}&take=2000`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { updates: UpdateRecord[] };
      setAuditLog(data.updates ?? []);
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  const loadUserAudit = useCallback(async () => {
    setLoadingUserAudit(true);
    try {
      const response = await fetch("/api/audit", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { events: UserAudit[] };
      setUserAudit(data.events ?? []);
    } finally {
      setLoadingUserAudit(false);
    }
  }, []);

  useEffect(() => {
    setLogs(loadPersistedLogs());
    void loadAuditLog();
    void loadUserAudit();
  }, [loadAuditLog, loadUserAudit]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = localStorage.getItem(IP_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          current?: string | null;
          previous?: string | null;
        };
        setCurrentIp(parsed.current ?? null);
        setPreviousIp(parsed.previous ?? null);
      }
    } catch {
      setCurrentIp(null);
      setPreviousIp(null);
    }
  }, []);

  const measurePerPage = useCallback(
    (listEl: HTMLDivElement | null, fallbackCardHeight: number) => {
      if (!listEl || typeof window === "undefined") {
        return null;
      }
      const styles = window.getComputedStyle(listEl);
      const paddingTop = parseFloat(styles.paddingTop) || 0;
      const paddingBottom = parseFloat(styles.paddingBottom) || 0;
      const gap = parseFloat(styles.rowGap || styles.gap || "0") || 0;
      const listHeight = listEl.clientHeight - paddingTop - paddingBottom;
      const firstCard = listEl.querySelector(".audit-card, .activity-card") as
        | HTMLElement
        | null;
      const cardHeight = firstCard?.getBoundingClientRect().height || fallbackCardHeight;
      const next = Math.max(1, Math.floor((listHeight + gap) / (cardHeight + gap)));
      return next;
    },
    []
  );

  const updateAuditPerPage = useCallback(() => {
    const next = measurePerPage(auditListRef.current, 72);
    if (next && next !== auditPerPage) {
      setAuditPerPage(next);
      setAuditPage(1);
    }
  }, [auditPerPage, measurePerPage]);

  const updateUserPerPage = useCallback(() => {
    const next = measurePerPage(userListRef.current, 72);
    if (next && next !== userPerPage) {
      setUserPerPage(next);
      setUserPage(1);
    }
  }, [userPerPage, measurePerPage]);

  useEffect(() => {
    updateAuditPerPage();
  }, [auditLog.length, updateAuditPerPage]);

  useEffect(() => {
    updateUserPerPage();
  }, [userAudit.length, updateUserPerPage]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const auditEl = auditListRef.current;
    const userEl = userListRef.current;
    const observer = new ResizeObserver(() => {
      updateAuditPerPage();
      updateUserPerPage();
    });
    if (auditEl) observer.observe(auditEl);
    if (userEl) observer.observe(userEl);
    return () => observer.disconnect();
  }, [updateAuditPerPage, updateUserPerPage]);

  const filteredAuditLog = useMemo(() => {
    const query = auditQuery.trim().toLowerCase();
    if (!query) {
      return auditLog;
    }
    return auditLog.filter((entry) => {
      const createdAt = new Date(entry.createdAt);
      const timeText = `${createdAt.toLocaleTimeString()} ${createdAt.toLocaleDateString()} ${createdAt.toISOString()}`.toLowerCase();
      return (
        entry.name.toLowerCase().includes(query) ||
        entry.trigger.toLowerCase().includes(query) ||
        entry.status.toLowerCase().includes(query) ||
        timeText.includes(query)
      );
    });
  }, [auditLog, auditQuery]);

  const auditTotal = filteredAuditLog.length;
  const auditTotalPages = Math.max(1, Math.ceil(auditTotal / auditPerPage));
  const auditPageSafe = Math.min(auditPage, auditTotalPages);
  const auditStart = (auditPageSafe - 1) * auditPerPage;
  const auditCards = useMemo(
    () => filteredAuditLog.slice(auditStart, auditStart + auditPerPage),
    [filteredAuditLog, auditStart, auditPerPage]
  );

  const filteredUserAudit = useMemo(() => {
    const query = userQuery.trim().toLowerCase();
    if (!query) {
      return userAudit;
    }
    return userAudit.filter((entry) => {
      const createdAt = new Date(entry.createdAt);
      const timeText = `${createdAt.toLocaleTimeString()} ${createdAt.toLocaleDateString()} ${createdAt.toISOString()}`.toLowerCase();
      const action = entry.action.toLowerCase();
      const targetType = entry.targetType?.toLowerCase() ?? "";
      const targetId = entry.targetId?.toLowerCase() ?? "";
      return (
        action.includes(query) ||
        targetType.includes(query) ||
        targetId.includes(query) ||
        timeText.includes(query)
      );
    });
  }, [userAudit, userQuery]);

  const userTotal = filteredUserAudit.length;
  const userTotalPages = Math.max(1, Math.ceil(userTotal / userPerPage));
  const userPageSafe = Math.min(userPage, userTotalPages);
  const userStart = (userPageSafe - 1) * userPerPage;
  const userAuditEntries = useMemo(
    () => filteredUserAudit.slice(userStart, userStart + userPerPage),
    [filteredUserAudit, userStart, userPerPage]
  );

  useEffect(() => {
    if (auditPage > auditTotalPages) {
      setAuditPage(auditTotalPages);
    }
  }, [auditPage, auditTotalPages]);

  useEffect(() => {
    setAuditPage(1);
  }, [auditQuery]);

  useEffect(() => {
    if (userPage > userTotalPages) {
      setUserPage(userTotalPages);
    }
  }, [userPage, userTotalPages]);

  useEffect(() => {
    setUserPage(1);
  }, [userQuery]);

  useEffect(() => {
    if (!detailModal || typeof document === "undefined") {
      return;
    }
    const close = () => setDetailModal(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    document.body.classList.add("modal-open");
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [detailModal]);

  const getAuditTitle = useCallback((entry: UpdateRecord) => {
    const trigger = entry.trigger.toLowerCase();
    if (trigger === "rollback") {
      return "Rollback DNS record";
    }
    if (entry.status.toLowerCase() === "success") {
      return "Updated DNS record";
    }
    return "DNS update attempt";
  }, []);

  const clearAuditLog = useCallback(async () => {
    setClearingAudit(true);
    try {
      const response = await fetch("/api/updates", { method: "DELETE" });
      if (!response.ok) {
        return;
      }
      setAuditLog([]);
      setAuditPage(1);
    } finally {
      setClearingAudit(false);
    }
  }, []);

  const clearUserAudit = useCallback(async () => {
    setClearingUserAudit(true);
    try {
      const response = await fetch("/api/audit", { method: "DELETE" });
      if (!response.ok) {
        return;
      }
      setUserAudit([]);
      setUserPage(1);
    } finally {
      setClearingUserAudit(false);
    }
  }, []);

  const getUserSummary = useCallback((entry: UserAudit) => {
    if (entry.targetType || entry.targetId) {
      return `${entry.targetType ?? "target"}: ${entry.targetId ?? "-"}`;
    }
    if (entry.detail && typeof entry.detail === "object") {
      const fields = (entry.detail as Record<string, unknown>).fields;
      if (Array.isArray(fields) && fields.length > 0) {
        return `fields: ${fields.map((item) => String(item)).join(", ")}`;
      }
      const first = Object.entries(entry.detail)[0];
      if (first) {
        return `${first[0]}: ${formatDetailValue(first[1])}`;
      }
    }
    return "-";
  }, []);

  const getAuditModalPayload = useCallback((entry: UpdateRecord) => {
    let parsedResponse: unknown = entry.response;
    try {
      parsedResponse = JSON.parse(entry.response);
    } catch {
      parsedResponse = entry.response;
    }
    return {
      id: entry.id,
      zoneId: entry.zoneId,
      tokenId: entry.tokenId,
      recordId: entry.recordId,
      name: entry.name,
      type: entry.type,
      trigger: entry.trigger,
      status: entry.status,
      actor: entry.actor,
      previousContent: entry.previousContent,
      previousTtl: entry.previousTtl,
      previousProxied: entry.previousProxied,
      content: entry.content,
      propagated: entry.propagated,
      propagationNote: entry.propagationNote,
      createdAt: entry.createdAt,
      response: parsedResponse,
    };
  }, []);

  const getUserModalPayload = useCallback((entry: UserAudit) => {
    return {
      id: entry.id,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      createdAt: entry.createdAt,
      detail: entry.detail,
    };
  }, []);

  const detailModalPayload = useMemo(() => {
    if (!detailModal) {
      return null;
    }
    if (detailModal.kind === "audit") {
      return getAuditModalPayload(detailModal.entry);
    }
    return getUserModalPayload(detailModal.entry);
  }, [detailModal, getAuditModalPayload, getUserModalPayload]);

  const handleTimelinePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      const container = timelineScrollRef.current;
      if (!container) {
        return;
      }
      timelinePointerIdRef.current = event.pointerId;
      timelineStartXRef.current = event.clientX;
      timelineStartScrollLeftRef.current = container.scrollLeft;
      setTimelineDragging(true);
      container.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    []
  );

  const handleTimelinePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (timelinePointerIdRef.current !== event.pointerId) {
        return;
      }
      const container = timelineScrollRef.current;
      if (!container) {
        return;
      }
      const deltaX = event.clientX - timelineStartXRef.current;
      container.scrollLeft = timelineStartScrollLeftRef.current - deltaX;
      event.preventDefault();
    },
    []
  );

  const handleTimelinePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (timelinePointerIdRef.current !== event.pointerId) {
        return;
      }
      const container = timelineScrollRef.current;
      if (container && container.hasPointerCapture(event.pointerId)) {
        container.releasePointerCapture(event.pointerId);
      }
      timelinePointerIdRef.current = null;
      setTimelineDragging(false);
    },
    []
  );

  const ipTimeline = useMemo<IpTimelineEvent[]>(() => {
    const lookbackStart = getLookbackStart().getTime();
    const auditTransitions = auditLog
      .map((entry, index) => {
        const createdAt = new Date(entry.createdAt).getTime();
        if (!Number.isFinite(createdAt) || createdAt < lookbackStart) {
          return null;
        }
        const previous = normalizeIp(entry.previousContent);
        const current = normalizeIp(entry.content);
        if (!isLikelyIp(previous) || !isLikelyIp(current) || previous === current) {
          return null;
        }
        return {
          id: `audit-${entry.id}-${index}`,
          createdAt,
          previousIp: previous,
          currentIp: current,
          source: "audit" as const,
        };
      })
      .filter(
        (
          entry
        ): entry is {
          id: string;
          createdAt: number;
          previousIp: string;
          currentIp: string;
          source: "audit";
        } => Boolean(entry)
      );

    const localTransitions = logs
      .map((entry, index) => {
        if (entry.createdAt < lookbackStart) {
          return null;
        }
        const match = /IP change detected:\s*(.+?)\s*(?:->|→)\s*(.+)$/i.exec(
          entry.message
        );
        if (!match) {
          return null;
        }
        const previous = normalizeIp(match[1]);
        const current = normalizeIp(match[2]);
        if (!isLikelyIp(previous) || !isLikelyIp(current) || previous === current) {
          return null;
        }
        return {
          id: `local-${entry.createdAt}-${index}`,
          createdAt: entry.createdAt,
          previousIp: previous,
          currentIp: current,
          source: "local" as const,
        };
      })
      .filter(
        (
          entry
        ): entry is {
          id: string;
          createdAt: number;
          previousIp: string;
          currentIp: string;
          source: "local";
        } => Boolean(entry)
      );

    const mergedReal = collapseIpTransitions([
      ...auditTransitions,
      ...localTransitions,
    ]).slice(-IP_TIMELINE_MAX_ITEMS);
    const timelineEntries = mergedReal;

    if (timelineEntries.length === 0) {
      if (currentIp || previousIp) {
        return [
          {
            id: "current-state",
            createdAt: Date.now(),
            previousIp: previousIp ?? "--",
            currentIp: currentIp ?? "--",
            source: "derived",
            isCurrent: true,
          },
        ];
      }
      return [];
    }

    let currentIndex = -1;
    if (currentIp && isLikelyIp(currentIp)) {
      for (let index = timelineEntries.length - 1; index >= 0; index -= 1) {
        if (timelineEntries[index].currentIp === currentIp) {
          currentIndex = index;
          break;
        }
      }
    }
    if (currentIndex === -1) {
      currentIndex = timelineEntries.length - 1;
    }

    return timelineEntries.map((entry, index) => ({
      ...entry,
      isCurrent: index === currentIndex,
    }));
  }, [auditLog, currentIp, logs, previousIp]);

  const currentTimelineNodeId = useMemo(
    () => ipTimeline.find((item) => item.isCurrent)?.id ?? null,
    [ipTimeline]
  );

  useEffect(() => {
    if (!currentTimelineNodeId) {
      return;
    }
    const container = timelineScrollRef.current;
    if (!container) {
      return;
    }
    const focusKey = `${currentTimelineNodeId}:${ipTimeline.length}`;
    if (focusKey === lastTimelineFocusKeyRef.current) {
      return;
    }
    const node = container.querySelector<HTMLElement>(
      `[data-timeline-node-id="${currentTimelineNodeId}"]`
    );
    if (!node) {
      return;
    }
    const left =
      node.offsetLeft - (container.clientWidth - node.getBoundingClientRect().width) / 2;
    container.scrollTo({
      left: Math.max(0, left),
      behavior: "smooth",
    });
    lastTimelineFocusKeyRef.current = focusKey;
  }, [currentTimelineNodeId, ipTimeline.length]);
  const commandActions = useMemo<CommandPaletteAction[]>(
    () => [
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
        description: "Go to DNS records and update controls.",
        keywords: ["zones", "dns", "records"],
        onSelect: () => window.location.assign("/zones"),
      },
      {
        id: "nav-config",
        label: "Open settings",
        description: "Go to tokens and security settings.",
        keywords: ["settings", "config"],
        onSelect: () => window.location.assign("/config"),
      },
      {
        id: "nav-alerting",
        label: "Open alerting",
        description: "Go to Discord and SMTP alert settings.",
        keywords: ["alerting", "smtp", "discord"],
        onSelect: () => window.location.assign("/alerting"),
      },
      {
        id: "reload-audit-log",
        label: "Refresh audit log",
        description: "Reload DNS update audit entries.",
        keywords: ["audit", "refresh"],
        onSelect: () => loadAuditLog(),
      },
      {
        id: "reload-user-activity",
        label: "Refresh user activity",
        description: "Reload account activity entries.",
        keywords: ["activity", "refresh"],
        onSelect: () => loadUserAudit(),
      },
      {
        id: "focus-audit-search",
        label: "Focus audit search",
        description: "Jump to the audit log search field.",
        keywords: ["search", "audit", "filter"],
        onSelect: () => {
          const input = document.getElementById("logs-audit-search");
          if (input instanceof HTMLInputElement) {
            input.focus();
            input.select();
          }
        },
      },
      {
        id: "focus-activity-search",
        label: "Focus activity search",
        description: "Jump to the user activity search field.",
        keywords: ["search", "activity", "filter"],
        onSelect: () => {
          const input = document.getElementById("logs-user-search");
          if (input instanceof HTMLInputElement) {
            input.focus();
            input.select();
          }
        },
      },
      {
        id: "clear-system-log",
        label: "Clear system log",
        description: "Remove locally stored system log entries.",
        keywords: ["clear", "system", "logs"],
        onSelect: () => clearLogs(),
      },
      {
        id: "clear-audit-log",
        label: "Clear audit log",
        description: "Delete DNS update audit entries.",
        keywords: ["clear", "audit", "updates"],
        onSelect: () => clearAuditLog(),
      },
      {
        id: "clear-user-activity",
        label: "Clear user activity",
        description: "Delete activity entries for your account.",
        keywords: ["clear", "user", "activity"],
        onSelect: () => clearUserAudit(),
      },
    ],
    [clearAuditLog, clearLogs, clearUserAudit, loadAuditLog, loadUserAudit]
  );

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
                  <span>Logs Center</span>
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

      <main className="ui-main logs-main">
        <section className="logs-grid">
          <section className="panel log-panel-card">
            <div className="panel-heading">
              <Terminal size={14} />
              <span>System Log</span>
              <div className="panel-heading-actions">
                <button type="button" className="log-clear" onClick={clearLogs}>
                  <Trash2 size={14} />
                  <span>Clear</span>
                </button>
              </div>
            </div>
            <div className="log-ip-history">
              <span>Public IP History</span>
              <div className="log-ip-history-path">
                {previousIp ?? "--"} {"->"} {currentIp ?? "--"}
              </div>
            </div>
            <div
              className="log-stream"
            >
              {logs.length === 0 ? (
                <p className="muted">No logs yet.</p>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className={`log-line ${log.type}`}>
                    <span>[{new Date(log.createdAt).toLocaleTimeString()}]</span>
                    <p>{log.message}</p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="panel audit-panel-card">
            <div className="panel-heading">
              <ShieldCheck size={14} />
              <span>Audit Log</span>
              <div className="panel-heading-actions">
                <button
                  type="button"
                  className="ghost refresh"
                  onClick={loadAuditLog}
                  disabled={loadingAudit}
                  aria-label="Refresh audit log"
                >
                  <RefreshCw size={14} className={loadingAudit ? "spin" : ""} />
                </button>
                <button
                  type="button"
                  className="log-clear"
                  onClick={clearAuditLog}
                  disabled={clearingAudit}
                >
                  <Trash2 size={14} />
                  <span>{clearingAudit ? "Clearing..." : "Clear"}</span>
                </button>
              </div>
            </div>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="search" style={{ width: "100%" }}>
                <Search size={14} />
                <input
                  id="logs-audit-search"
                  type="search"
                  placeholder="Search by domain, trigger, status, or time"
                  value={auditQuery}
                  onChange={(event) => setAuditQuery(event.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
            </div>
            <div
              ref={auditListRef}
              className="audit-card-list"
            >
              {auditCards.length === 0 ? (
                <p className="muted">No updates logged yet.</p>
              ) : (
                auditCards.map((entry) => {
                  return (
                    <article key={entry.id} className="audit-card detailed">
                      <div className="event-head">
                        <div className="event-lead">
                          <span className={`event-icon audit ${entry.status.toLowerCase()}`}>
                            <ShieldCheck size={14} />
                          </span>
                          <div className="event-main">
                            <div className="event-title-row">
                              <strong>{getAuditTitle(entry)}</strong>
                              <span className="event-target-pill">{entry.name}</span>
                            </div>
                            <span className="event-subline">
                              {new Date(entry.createdAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="event-details-btn"
                          onClick={() => setDetailModal({ kind: "audit", entry })}
                        >
                          View Details
                        </button>
                      </div>
                      <div className="event-chip-row">
                        <span className={`audit-pill ${entry.status.toLowerCase()}`}>
                          {entry.status}
                        </span>
                        <span className="event-chip">{entry.trigger.toUpperCase()}</span>
                        <span className="event-chip">{entry.type}</span>
                        {entry.actor ? (
                          <span className="event-chip">{truncateText(entry.actor, 26)}</span>
                        ) : null}
                      </div>
                      <p className="event-route-line">
                        <span>Record IP</span>
                        <code>{entry.previousContent ?? "--"}</code>
                        <span>{"->"}</span>
                        <code>{entry.content ?? "--"}</code>
                      </p>
                    </article>
                  );
                })
              )}
            </div>
            <div className="table-footer">
              <div className="footer-left">
                Showing {auditTotal === 0 ? 0 : auditStart + 1} to{" "}
                {Math.min(auditStart + auditPerPage, auditTotal)} of {auditTotal}{" "}
                results
              </div>
              <div className="footer-right">
                <div className="footer-pages">
                  <button
                    type="button"
                    className="page-btn"
                    onClick={() => setAuditPage(Math.max(1, auditPageSafe - 1))}
                    disabled={auditPageSafe === 1}
                  >
                    Prev
                  </button>
                  <span className="page-indicator">
                    {auditPageSafe} / {auditTotalPages}
                  </span>
                  <button
                    type="button"
                    className="page-btn"
                    onClick={() =>
                      setAuditPage(Math.min(auditTotalPages, auditPageSafe + 1))
                    }
                    disabled={auditPageSafe === auditTotalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="panel activity-panel-card">
            <div className="panel-heading">
              <ShieldCheck size={14} />
              <span>User Activity</span>
              <div className="panel-heading-actions">
                <button
                  type="button"
                  className="ghost refresh"
                  onClick={loadUserAudit}
                  disabled={loadingUserAudit}
                  aria-label="Refresh user activity"
                >
                  <RefreshCw size={14} className={loadingUserAudit ? "spin" : ""} />
                </button>
                <button
                  type="button"
                  className="log-clear"
                  onClick={clearUserAudit}
                  disabled={clearingUserAudit}
                >
                  <Trash2 size={14} />
                  <span>{clearingUserAudit ? "Clearing..." : "Clear"}</span>
                </button>
              </div>
            </div>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="search" style={{ width: "100%" }}>
                <Search size={14} />
                <input
                  id="logs-user-search"
                  type="search"
                  placeholder="Search by action, target, or time"
                  value={userQuery}
                  onChange={(event) => setUserQuery(event.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
            </div>
            <div
              ref={userListRef}
              className="activity-card-list"
            >
              {userAuditEntries.length === 0 ? (
                <p className="muted">No user activity logged yet.</p>
              ) : (
                userAuditEntries.map((entry) => {
                  return (
                    <article key={entry.id} className="activity-card detailed">
                      <div className="event-head">
                        <div className="event-lead">
                          <span className="event-icon user">
                            <User size={14} />
                          </span>
                          <div className="event-main">
                            <div className="event-title-row">
                              <strong>{formatActionLabel(entry.action)}</strong>
                              {entry.targetId ? (
                                <span className="event-target-pill">
                                  {truncateText(entry.targetId, 26)}
                                </span>
                              ) : null}
                            </div>
                            <span className="event-subline">
                              {new Date(entry.createdAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="event-details-btn"
                          onClick={() => setDetailModal({ kind: "user", entry })}
                        >
                          View Details
                        </button>
                      </div>
                      <p className="event-route-line">
                        <span>Summary</span>
                        <code>{truncateText(getUserSummary(entry), 150)}</code>
                      </p>
                    </article>
                  );
                })
              )}
            </div>
            <div className="table-footer">
              <div className="footer-left">
                Showing {userTotal === 0 ? 0 : userStart + 1} to{" "}
                {Math.min(userStart + userPerPage, userTotal)} of {userTotal} results
              </div>
              <div className="footer-right">
                <div className="footer-pages">
                  <button
                    type="button"
                    className="page-btn"
                    onClick={() => setUserPage(Math.max(1, userPageSafe - 1))}
                    disabled={userPageSafe === 1}
                  >
                    Prev
                  </button>
                  <span className="page-indicator">
                    {userPageSafe} / {userTotalPages}
                  </span>
                  <button
                    type="button"
                    className="page-btn"
                    onClick={() =>
                      setUserPage(Math.min(userTotalPages, userPageSafe + 1))
                    }
                    disabled={userPageSafe === userTotalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </section>
        </section>

        <section className="panel ip-timeline-panel">
          <div className="panel-heading ip-timeline-heading">
            <div className="ip-timeline-heading-main">
              <Globe size={14} />
              <span>IP change timeline</span>
            </div>
            <span className="ip-timeline-range">Last {IP_LOOKBACK_MONTHS} months</span>
          </div>
          {ipTimeline.length === 0 ? (
            <p className="muted">No IP transition events recorded in the last 6 months.</p>
          ) : (
            <>
              <div
                ref={timelineScrollRef}
                className={`ip-timeline-scroll${timelineDragging ? " dragging" : ""}`}
                onPointerDown={handleTimelinePointerDown}
                onPointerMove={handleTimelinePointerMove}
                onPointerUp={handleTimelinePointerEnd}
                onPointerCancel={handleTimelinePointerEnd}
              >
                <ol className="ip-timeline-horizontal">
                  {ipTimeline.map((item, index) => (
                    <li
                      key={item.id}
                      data-timeline-node-id={item.id}
                      className={`ip-timeline-node ${index % 2 === 0 ? "top" : "bottom"}${
                        item.isCurrent ? " current" : ""
                      }`}
                    >
                      <span className="ip-timeline-dot" aria-hidden="true" />
                      <article className="ip-timeline-content">
                        <div className="ip-timeline-badges">
                          {item.isCurrent ? (
                            <span className="ip-timeline-current-badge">Current</span>
                          ) : null}
                        </div>
                        <time dateTime={new Date(item.createdAt).toISOString()}>
                          {new Date(item.createdAt).toLocaleString()}
                        </time>
                        <div className="ip-timeline-route">
                          <code>{item.previousIp}</code>
                          <span>to</span>
                          <code>{item.currentIp}</code>
                        </div>
                      </article>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </section>

        {detailModal && detailModalPayload ? (
          <div
            className="modal-backdrop logs-detail-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="View details"
            onClick={() => setDetailModal(null)}
          >
            <div className="modal-card logs-detail-modal" onClick={(event) => event.stopPropagation()}>
              <div className="logs-detail-modal-head">
                <h3>View Details</h3>
                <button
                  type="button"
                  className="ghost modal-close logs-detail-close"
                  onClick={() => setDetailModal(null)}
                  aria-label="Close details"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="logs-detail-summary">
                <span
                  className={`event-icon ${detailModal.kind === "audit" ? "audit" : "user"}${
                    detailModal.kind === "audit"
                      ? ` ${detailModal.entry.status.toLowerCase()}`
                      : ""
                  }`}
                >
                  {detailModal.kind === "audit" ? (
                    <ShieldCheck size={14} />
                  ) : (
                    <User size={14} />
                  )}
                </span>
                <div className="logs-detail-summary-main">
                  <div className="event-title-row">
                    <strong>
                      {detailModal.kind === "audit"
                        ? getAuditTitle(detailModal.entry)
                        : formatActionLabel(detailModal.entry.action)}
                    </strong>
                    <span className="event-target-pill">
                      {detailModal.kind === "audit"
                        ? detailModal.entry.name
                        : truncateText(detailModal.entry.targetId ?? "-", 32)}
                    </span>
                  </div>
                  <span className="event-subline">
                    {new Date(detailModal.entry.createdAt).toLocaleString()}
                  </span>
                  {detailModal.kind === "audit" ? (
                    <p className="event-route-line">
                      <span>Record IP</span>
                      <code>{detailModal.entry.previousContent ?? "--"}</code>
                      <span>{"->"}</span>
                      <code>{detailModal.entry.content ?? "--"}</code>
                    </p>
                  ) : (
                    <p className="event-route-line">
                      <span>Summary</span>
                      <code>{truncateText(getUserSummary(detailModal.entry), 180)}</code>
                    </p>
                  )}
                </div>
              </div>
              <div className="logs-detail-json-wrap">
                <pre className="logs-detail-json">
                  {JSON.stringify(detailModalPayload, null, 2)}
                </pre>
              </div>
              <div className="logs-detail-footer">
                <button
                  type="button"
                  className="ghost modal-close"
                  onClick={() => setDetailModal(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
      <AppFooter />
      <CommandPalette actions={commandActions} />
    </div>
  );
}

