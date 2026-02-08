"use client";

import { Eye } from "lucide-react";

export default function AppFooter() {
  const rawVersion = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
  const normalizedVersion = rawVersion.startsWith("v") ? rawVersion.slice(1) : rawVersion;
  const appVersionLabel = /^\d+\.\d+\.\d+/.test(normalizedVersion)
    ? `v${normalizedVersion}`
    : normalizedVersion;

  return (
    <footer className="ui-footer">
      <div>
        <Eye className="brand-eye" size={14} />
        <span>Flarewatcher {appVersionLabel}</span>
      </div>
      <span>(c) 2026 FLAREWATCHER - ALL SYSTEMS OPERATIONAL</span>
    </footer>
  );
}
