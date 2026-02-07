"use client";

import { ExternalLink, Globe, Pencil, ShieldCheck, Trash2 } from "lucide-react";

type Zone = {
  id: string;
  name: string;
  status: string;
  plan?: { name?: string };
  paused?: boolean;
  tokenId: string;
  tokenName: string;
};

type TokenItem = {
  id: string;
  name: string;
  createdAt: string;
  status?: string;
  missingScopes?: string[];
  scopes?: string[];
  lastCheckedAt?: string;
};

type AccessPanelProps = {
  tokens: TokenItem[];
  zones: Zone[];
  editingTokenId: string | null;
  editTokenName: string;
  editTokenValue: string;
  onStartEdit: (token: TokenItem) => void;
  onCancelEdit: () => void;
  onSaveEdit: (tokenId: string) => void;
  onEditNameChange: (value: string) => void;
  onEditValueChange: (value: string) => void;
  onRemoveToken: (tokenId: string) => void;
  onVerifyToken: (tokenId: string) => void;
  onHighlightConfig?: () => void;
};

export default function AccessPanel({
  tokens,
  zones,
  editingTokenId,
  editTokenName,
  editTokenValue,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditNameChange,
  onEditValueChange,
  onRemoveToken,
  onVerifyToken,
  onHighlightConfig,
}: AccessPanelProps) {
  return (
    <section className="panel dashboard-panel access-panel">
      <div className="access-header">
        <div className="access-title">
          <Globe size={18} />
          <span>Cloudflare managed assets</span>
        </div>
        <span className="access-pill">
          {tokens.length} Active {tokens.length === 1 ? "Zone" : "Zones"}
        </span>
      </div>
      <div className="access-grid">
        {tokens.length === 0 ? (
          <p className="muted">No tokens saved yet.</p>
        ) : (
          <>
            {tokens.map((token) => {
              const tokenZones = zones.filter((zone) => zone.tokenId === token.id);
              const primaryZone = tokenZones[0];
              const isEditing = editingTokenId === token.id;
              const plan =
                (primaryZone?.plan?.name || "Free")
                  .replace(/\s*website\s*/i, "")
                  .toUpperCase();
              const lastCheck = token.lastCheckedAt
                ? new Date(token.lastCheckedAt).toLocaleString()
                : "Never";
              return (
                <div
                  key={token.id}
                  className={`asset-card${isEditing ? " editing" : ""}`}
                >
                  <div className="asset-header">
                    <div>
                      <h3>{primaryZone?.name || token.name}</h3>
                      <span className="asset-token-label">Token label: {token.name}</span>
                      <div className="asset-status">
                        <span className="status-dot" />
                        <span>Saved token</span>
                      </div>
                    </div>
                    <div className="asset-actions">
                      <span className="asset-plan">Plan: {plan}</span>
                      <a href="https://dash.cloudflare.com" target="_blank" rel="noreferrer">
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="token-edit">
                      <label>
                        <span>Token label</span>
                        <input
                          type="text"
                          value={editTokenName}
                          onChange={(event) => onEditNameChange(event.target.value)}
                        />
                      </label>
                      <label>
                        <span>New API token (optional)</span>
                        <input
                          type="password"
                          value={editTokenValue}
                          onChange={(event) => onEditValueChange(event.target.value)}
                        />
                      </label>
                      <div className="token-edit-actions">
                        <button type="button" className="ghost" onClick={onCancelEdit}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="primary"
                          onClick={() => onSaveEdit(token.id)}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="asset-meta">
                        <span>Last synchronization</span>
                        <strong>{lastCheck}</strong>
                      </div>
                      <div className="asset-footer">
                        <button
                          type="button"
                          className="asset-primary"
                          onClick={() => onVerifyToken(token.id)}
                        >
                          Verify DNS
                        </button>
                        <button
                          type="button"
                          className="asset-icon"
                          onClick={() => onStartEdit(token)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="asset-icon danger"
                          onClick={() => onRemoveToken(token.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            <div
              role="button"
              tabIndex={0}
              className="asset-card asset-placeholder"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onHighlightConfig?.();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onHighlightConfig?.();
                }
              }}
              aria-label="Configure new asset"
            >
              <div className="asset-placeholder-icon">
                <Globe size={20} />
              </div>
              <span>Configure new asset</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
