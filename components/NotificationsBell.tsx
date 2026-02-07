"use client";

import { Bell } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LiveActivityTicker from "@/components/LiveActivityTicker";

import {
  clearNotifications,
  loadNotifications,
  markAllRead,
  markNotificationRead,
  NotificationItem,
} from "@/lib/clientNotifications";

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>(() => loadNotifications());
  const [autoPreview, setAutoPreview] = useState(false);
  const lastCountRef = useRef(items.length);
  const manualOpenRef = useRef(false);
  const autoCloseRef = useRef<number | null>(null);

  const applyItems = useCallback((nextItems: NotificationItem[]) => {
    lastCountRef.current = nextItems.length;
    setItems(nextItems);
  }, []);

  const refreshNotifications = useCallback(() => {
    const nextItems = loadNotifications();
    const prevCount = lastCountRef.current;
    const nextCount = nextItems.length;

    if (nextCount > prevCount && !manualOpenRef.current) {
      setOpen(true);
      setAutoPreview(true);
      if (autoCloseRef.current) {
        window.clearTimeout(autoCloseRef.current);
      }
      autoCloseRef.current = window.setTimeout(() => {
        if (!manualOpenRef.current) {
          setOpen(false);
          setAutoPreview(false);
        }
      }, 4000);
    }

    applyItems(nextItems);
  }, [applyItems]);

  useEffect(() => {
    const onNotify = () => refreshNotifications();
    const onStorage = (event: StorageEvent) => {
      if (event.key === "flarewatcher:notifications") {
        refreshNotifications();
      }
    };
    window.addEventListener("fw:notify", onNotify as EventListener);
    window.addEventListener("fw:notify:read", onNotify as EventListener);
    window.addEventListener("fw:notify:clear", onNotify as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("fw:notify", onNotify as EventListener);
      window.removeEventListener("fw:notify:read", onNotify as EventListener);
      window.removeEventListener("fw:notify:clear", onNotify as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshNotifications]);

  const unreadCount = useMemo(
    () => items.filter((item) => !item.read).length,
    [items]
  );

  return (
    <div className={`notif-wrap${open ? " open" : ""}`}>
      <button
        type="button"
        className="notif-bell"
        onClick={() => {
          setOpen((prev) => {
            const next = !prev;
            manualOpenRef.current = next;
            setAutoPreview(false);
            if (autoCloseRef.current) {
              window.clearTimeout(autoCloseRef.current);
              autoCloseRef.current = null;
            }
            return next;
          });
        }}
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 ? (
          <span className="notif-badge">{unreadCount}</span>
        ) : null}
      </button>
      <div className={`notif-panel${open ? " open" : ""}`}>
          <div className="notif-header">
            <span>Notifications</span>
            <div className="notif-actions">
              <button
                type="button"
                onClick={() => applyItems(markAllRead())}
              >
                Mark read
              </button>
              <button
                type="button"
                onClick={() => applyItems(clearNotifications())}
              >
                Clear
              </button>
            </div>
          </div>
          <div className="notif-live">
            <LiveActivityTicker />
          </div>
          <div className="notif-list">
            {items.length === 0 ? (
              <p className="notif-empty">No notifications yet.</p>
            ) : (
              (autoPreview ? items.slice(0, 1) : items).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`notif-item ${item.type} ${item.read ? "read" : ""}`}
                    onClick={() => applyItems(markNotificationRead(item.id))}
                  >
                  <div>
                    <strong>{item.title}</strong>
                    {item.message ? <span>{item.message}</span> : null}
                  </div>
                  <em>
                    {new Date(item.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </em>
                </button>
              ))
            )}
          </div>
      </div>
    </div>
  );
}
