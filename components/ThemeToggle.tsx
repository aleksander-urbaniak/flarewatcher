"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "flarewatcher:theme";

const applyTheme = (mode: ThemeMode) => {
  if (typeof window === "undefined") {
    return;
  }
  const root = document.documentElement;
  const body = document.body;
  root.dataset.theme = mode;
  body.dataset.theme = mode;
  if (mode === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("theme-dark", prefersDark);
    root.classList.toggle("theme-light", !prefersDark);
    body.classList.toggle("theme-dark", prefersDark);
    body.classList.toggle("theme-light", !prefersDark);
  } else {
    root.classList.toggle("theme-dark", mode === "dark");
    root.classList.toggle("theme-light", mode === "light");
    body.classList.toggle("theme-dark", mode === "dark");
    body.classList.toggle("theme-light", mode === "light");
  }
};

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "system";
    }
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    return stored || "system";
  });
  const modeRef = useRef<ThemeMode>(mode);

  useEffect(() => {
    modeRef.current = mode;
    applyTheme(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, mode);
    }
  }, [mode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (modeRef.current === "system") {
        applyTheme("system");
      }
    };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  const updateMode = (next: ThemeMode) => {
    setMode(next);
  };

  return (
    <div className="theme-toggle" role="group" aria-label="Theme switch">
      <button
        type="button"
        className={`theme-btn ${mode === "light" ? "active" : ""}`}
        onClick={() => updateMode("light")}
        aria-label="Light mode"
      >
        <Sun size={16} />
      </button>
      <button
        type="button"
        className={`theme-btn ${mode === "dark" ? "active" : ""}`}
        onClick={() => updateMode("dark")}
        aria-label="Dark mode"
      >
        <Moon size={16} />
      </button>
      <button
        type="button"
        className={`theme-btn ${mode === "system" ? "active" : ""}`}
        onClick={() => updateMode("system")}
        aria-label="System theme"
      >
        <Monitor size={16} />
      </button>
    </div>
  );
}
