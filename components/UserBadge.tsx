"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type UserResponse = {
  status: string;
  user?: {
    username?: string | null;
    email?: string | null;
  };
};

const getInitials = (value: string) => {
  const parts = value.trim().split(/\s+/);
  if (parts.length === 0) {
    return "FW";
  }
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[1]?.[0] ?? "" : parts[0]?.[1] ?? "";
  return `${first}${second}`.toUpperCase() || "FW";
};

export default function UserBadge() {
  const [name, setName] = useState("Admin");
  const [role, setRole] = useState("Operator");
  const [open, setOpen] = useState(false);
  const [renderMenu, setRenderMenu] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as UserResponse;
        if (!mounted || data.status !== "success" || !data.user) {
          return;
        }
        const nextName =
          data.user.username?.trim() ||
          data.user.email?.split("@")[0] ||
          "Admin";
        setName(nextName);
      } catch {}
    };
    void loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) {
        return;
      }
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setRenderMenu(true);
      setMenuClosing(false);
      window.requestAnimationFrame(() => {
        setMenuVisible(true);
      });
      return;
    }

    if (renderMenu) {
      setMenuVisible(false);
      setMenuClosing(true);
      const id = window.setTimeout(() => {
        setRenderMenu(false);
        setMenuClosing(false);
      }, 180);
      return () => window.clearTimeout(id);
    }
  }, [open, renderMenu]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  };

  const handleEdit = () => {
    setOpen(false);
    router.push("/config");
  };

  const initials = useMemo(() => getInitials(name), [name]);

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        type="button"
        className={`user-badge user-menu-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="user-avatar">{initials}</div>
        <div className="user-info">
          <strong>{name}</strong>
          <span>{role}</span>
        </div>
      </button>
      {renderMenu ? (
        <div
          className={`user-menu-panel${menuVisible ? " open" : ""}${
            menuClosing ? " closing" : ""
          }`}
          role="menu"
        >
          <button type="button" className="user-menu-item" onClick={handleEdit}>
            Edit profile
          </button>
          <button type="button" className="user-menu-item danger" onClick={handleLogout}>
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
}
