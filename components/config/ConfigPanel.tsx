"use client";

import { RefreshCw, Settings } from "lucide-react";

type ConfigPanelProps = {
  tokenName: string;
  tokenValue: string;
  status: "idle" | "fetching" | "updating";
  onTokenNameChange: (value: string) => void;
  onTokenValueChange: (value: string) => void;
  onSync: () => void;
  onSaveToken: () => void;
  onBlurInterval: () => void;
};

export default function ConfigPanel({
  tokenName,
  tokenValue,
  status,
  onTokenNameChange,
  onTokenValueChange,
  onSync,
  onSaveToken,
  onBlurInterval,
}: ConfigPanelProps) {
  return (
    <section className="panel dashboard-panel" id="system-configuration">
      <div className="panel-heading">
        <Settings size={14} />
        <span>System configuration</span>
      </div>
      <div className="panel-body">
        <label>
          <span>Token label</span>
          <input
            type="text"
            placeholder="e.g. Personal, Work"
            value={tokenName}
            onChange={(event) => onTokenNameChange(event.target.value)}
          />
        </label>
        <label>
          <span>Cloudflare API token</span>
          <div className="token-input">
            <input
              type="password"
              placeholder="Paste your CF-API-Token here..."
              value={tokenValue}
              onChange={(event) => onTokenValueChange(event.target.value)}
            />
            {tokenValue.trim().length > 0 ? <em>Valid format</em> : null}
          </div>
        </label>
        <div className="panel-actions">
          <button
            type="button"
            className="ghost"
            onClick={onSync}
            disabled={status !== "idle"}
          >
            <RefreshCw size={14} className={status !== "idle" ? "spin" : ""} />
            Sync Cloudflare
          </button>
          <button
            type="button"
            onClick={() => {
              onBlurInterval();
              onSaveToken();
            }}
          >
            Apply configuration
          </button>
        </div>
      </div>
    </section>
  );
}
