"use client";

import { useEffect, useMemo, useState } from "react";

type ActivityType = "info" | "success" | "error";

export type ActivityItem = {
  createdAt: number;
  message: string;
  type: ActivityType;
};

type LiveActivityTickerProps = {
  activity?: ActivityItem | null;
};

const LOG_STORAGE_KEY = "flarewatcher:logs";

const readLatestActivity = (): ActivityItem | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(LOG_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as ActivityItem[];
    const next = parsed[0];
    if (!next || typeof next.createdAt !== "number" || typeof next.message !== "string") {
      return null;
    }
    const type: ActivityType =
      next.type === "success" || next.type === "error" ? next.type : "info";
    return { ...next, type };
  } catch {
    return null;
  }
};

const formatRelativeTime = (createdAt: number, now: number): string => {
  const seconds = Math.max(0, Math.floor((now - createdAt) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export default function LiveActivityTicker({ activity }: LiveActivityTickerProps) {
  const [fallbackActivity, setFallbackActivity] = useState<ActivityItem | null>(() =>
    readLatestActivity()
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activity) {
      return;
    }
    const sync = () => setFallbackActivity(readLatestActivity());
    const refresh = window.setInterval(sync, 10_000);
    window.addEventListener("storage", sync);
    return () => {
      window.clearInterval(refresh);
      window.removeEventListener("storage", sync);
    };
  }, [activity]);

  const item = activity ?? fallbackActivity;
  const relative = useMemo(() => {
    if (!item) {
      return "Idle";
    }
    return formatRelativeTime(item.createdAt, now);
  }, [item, now]);

  return (
    <div
      className={`activity-ticker ${item ? `type-${item.type}` : "type-idle"}`}
      title={item?.message ?? "No recent activity"}
    >
      <span className="activity-ticker-dot" aria-hidden="true" />
      <span className="activity-ticker-label">Live</span>
      <span className="activity-ticker-text">
        {item?.message ?? "No recent activity yet"}
      </span>
      <span className="activity-ticker-time">{relative}</span>
    </div>
  );
}
