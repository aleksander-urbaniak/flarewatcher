"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Command, Search } from "lucide-react";

export type CommandPaletteAction = {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  hint?: string;
  onSelect: () => void | Promise<void>;
};

type CommandPaletteProps = {
  actions: CommandPaletteAction[];
  title?: string;
};

export default function CommandPalette({
  actions,
  title = "Quick actions",
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [open]);

  const filteredActions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return actions;
    }
    return actions.filter((action) => {
      const haystack = [
        action.label,
        action.description ?? "",
        action.hint ?? "",
        ...(action.keywords ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [actions, query]);

  const runAction = (action: CommandPaletteAction) => {
    setOpen(false);
    setQuery("");
    void Promise.resolve(action.onSelect()).catch(() => null);
  };

  return (
    <>
      <button
        type="button"
        className="cmd-launcher"
        aria-label="Open command palette"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Command size={16} />
        <span>Actions</span>
        <kbd>Ctrl+K</kbd>
      </button>

      {open ? (
        <div
          className="cmd-backdrop"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="cmd-palette"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cmd-head">
              <Search size={14} />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Type a command..."
                aria-label="Search actions"
              />
            </div>
            <div className="cmd-list">
              {filteredActions.length === 0 ? (
                <p className="cmd-empty">No matching commands.</p>
              ) : (
                filteredActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className="cmd-item"
                    onClick={() => runAction(action)}
                  >
                    <span className="cmd-item-label">{action.label}</span>
                    {action.description ? (
                      <span className="cmd-item-description">{action.description}</span>
                    ) : null}
                    {action.hint ? <span className="cmd-item-hint">{action.hint}</span> : null}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
