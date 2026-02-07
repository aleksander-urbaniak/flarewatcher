"use client";

import { Eye } from "lucide-react";

export default function AppFooter() {
  return (
    <footer className="ui-footer">
      <div>
        <Eye className="brand-eye" size={14} />
        <span>Flarewatcher v1.0.0</span>
      </div>
      <span>(c) 2026 FLAREWATCHER - ALL SYSTEMS OPERATIONAL</span>
    </footer>
  );
}
