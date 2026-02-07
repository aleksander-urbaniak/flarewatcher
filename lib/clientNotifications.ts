export type NotificationType = "info" | "success" | "error" | "warning";

export type NotificationItem = {
  id: string;
  title: string;
  message?: string;
  type: NotificationType;
  createdAt: number;
  read: boolean;
};

const STORAGE_KEY = "flarewatcher:notifications";
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const readFromStorage = (): NotificationItem[] => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as NotificationItem[];
    const now = Date.now();
    const filtered = parsed.filter((item) => now - item.createdAt <= RETENTION_MS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return filtered;
  } catch {
    return [];
  }
};

const writeToStorage = (items: NotificationItem[]) => {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

export const loadNotifications = () => readFromStorage();

export const pushNotification = (
  partial: Omit<NotificationItem, "id" | "createdAt" | "read"> & {
    id?: string;
  }
) => {
  if (typeof window === "undefined") {
    return [] as NotificationItem[];
  }
  const now = Date.now();
  const nextItem: NotificationItem = {
    id: partial.id ?? `${now}-${Math.random().toString(16).slice(2)}`,
    title: partial.title,
    message: partial.message,
    type: partial.type,
    createdAt: now,
    read: false,
  };
  const existing = readFromStorage();
  const next = [nextItem, ...existing].slice(0, 100);
  writeToStorage(next);
  window.dispatchEvent(new CustomEvent("fw:notify", { detail: nextItem }));
  return next;
};

export const markAllRead = () => {
  const next = readFromStorage().map((item) => ({ ...item, read: true }));
  writeToStorage(next);
  window.dispatchEvent(new CustomEvent("fw:notify:read"));
  return next;
};

export const clearNotifications = () => {
  writeToStorage([]);
  window.dispatchEvent(new CustomEvent("fw:notify:clear"));
  return [] as NotificationItem[];
};

export const markNotificationRead = (id: string) => {
  const next = readFromStorage().map((item) =>
    item.id === id ? { ...item, read: true } : item
  );
  writeToStorage(next);
  window.dispatchEvent(new CustomEvent("fw:notify:read"));
  return next;
};
