"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, Eye, Globe, Settings, ShieldCheck, Terminal } from "lucide-react";

import CommandPalette, { type CommandPaletteAction } from "@/components/CommandPalette";
import ThemeToggle from "@/components/ThemeToggle";
import AppFooter from "@/components/layout/AppFooter";
import NotificationsBell from "@/components/NotificationsBell";
import UserBadge from "@/components/UserBadge";
import TopNavLinks from "@/components/TopNavLinks";

type Tile = {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  tone: "blue" | "amber" | "emerald" | "slate";
};

const tiles: Tile[] = [
  {
    title: "Zone management",
    description: "Browse zones, records, and sync status.",
    href: "/zones",
    icon: <Globe size={20} />,
    tone: "blue",
  },
  {
    title: "Settings",
    description: "Tokens, refresh interval, and access checks.",
    href: "/config",
    icon: <Settings size={20} />,
    tone: "amber",
  },
  {
    title: "Alerting",
    description: "Email, Discord, Telegram, SMTP.",
    href: "/alerting",
    icon: <Bell size={20} />,
    tone: "emerald",
  },
  {
    title: "Logs",
    description: "System and audit history.",
    href: "/logs",
    icon: <Terminal size={20} />,
    tone: "slate",
  },
];

export default function DashboardHome() {
  const [currentIp, setCurrentIp] = useState<string | null>(null);
  const loadIp = useCallback(async () => {
    try {
      const response = await fetch("/api/ip", { cache: "no-store" });
      const data = (await response.json()) as { status: string; ip?: string };
      if (data.status === "success") {
        setCurrentIp(data.ip ?? null);
      } else {
        setCurrentIp(null);
      }
    } catch {
      setCurrentIp(null);
    }
  }, []);

  const commandActions = useMemo<CommandPaletteAction[]>(
    () => [
      {
        id: "nav-zones",
        label: "Open zone management",
        description: "Go to DNS records and monitoring controls.",
        keywords: ["zones", "records", "dns"],
        onSelect: () => window.location.assign("/zones"),
      },
      {
        id: "nav-config",
        label: "Open settings",
        description: "Go to tokens and system configuration.",
        keywords: ["config", "settings", "tokens"],
        onSelect: () => window.location.assign("/config"),
      },
      {
        id: "nav-alerting",
        label: "Open alerting",
        description: "Edit Discord/SMTP notifications.",
        keywords: ["alerts", "discord", "smtp"],
        onSelect: () => window.location.assign("/alerting"),
      },
      {
        id: "nav-logs",
        label: "Open logs",
        description: "Review system and audit activity.",
        keywords: ["logs", "audit", "events"],
        onSelect: () => window.location.assign("/logs"),
      },
      {
        id: "refresh-ip",
        label: "Refresh public IP",
        description: "Reload current detected public IP.",
        keywords: ["ip", "refresh"],
        onSelect: () => loadIp(),
      },
    ],
    [loadIp]
  );

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadIp();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadIp]);


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
                  <span className="ip-tooltip">Previous IP: --</span>
                </div>
              </div>
            </div>
            <ThemeToggle />
            <NotificationsBell />
            <UserBadge />
          </div>
        </div>
      </header>

      <main className="dashboard-home">
        <div className="dashboard-tiles">
          {tiles.map((tile) => (
            <a key={tile.title} className={`dashboard-tile tone-${tile.tone}`} href={tile.href}>
              <div className="tile-icon">{tile.icon}</div>
              <div>
                <h3>{tile.title}</h3>
                <p>{tile.description}</p>
              </div>
            </a>
          ))}
        </div>
      </main>
      <AppFooter />
      <CommandPalette actions={commandActions} />
    </div>
  );
}
