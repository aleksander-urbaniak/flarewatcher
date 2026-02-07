"use client";

import { useEffect, useState } from "react";
import {
  Cloud,
  CloudOff,
  Copy,
  EllipsisVertical,
  ExternalLink,
  Globe,
  RefreshCcw,
  RotateCcw,
  Search,
} from "lucide-react";

import ToggleSwitch from "@/components/common/ToggleSwitch";

type Zone = {
  id: string;
  name: string;
  status: string;
  plan?: { name?: string };
  paused?: boolean;
  tokenId: string;
  tokenName: string;
};

type DnsRecord = {
  id: string;
  name: string;
  type: string;
  content: string;
  ttl: number;
  proxied?: boolean;
};

type UpdateRecord = {
  id: string;
  zoneId: string;
  tokenId: string | null;
  recordId: string;
  name: string;
  type: string;
  previousContent: string | null;
  previousTtl: number | null;
  previousProxied: boolean | null;
  content: string;
  status: string;
  trigger: string;
  actor: string | null;
  propagated: boolean | null;
  propagationNote: string | null;
  response: string;
  createdAt: string;
};

type ZoneManagementPanelProps = {
  zones: Zone[];
  filteredZones: Zone[];
  dnsRecords: Record<string, DnsRecord[]>;
  monitoredSet: Set<string>;
  selectedZoneId: string;
  onSelectedZoneIdChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  recordTypeFilter: string;
  routingFilter: string;
  autoUpdateFilter: string;
  onRecordTypeFilter: (value: string) => void;
  onRoutingFilter: (value: string) => void;
  onAutoUpdateFilter: (value: string) => void;
  entriesPerPage: number;
  onEntriesPerPageChange: (value: number) => void;
  currentPage: number;
  onCurrentPageChange: (value: number) => void;
  selectedRecords: Set<string>;
  onToggleSelectRecord: (zoneId: string, recordId: string) => void;
  onSelectAllRecords: (zoneId: string, pageKeys: string[], checked: boolean) => void;
  onBulkSetAutoUpdate: (
    zoneId: string,
    recordIds: string[],
    enable: boolean
  ) => void;
  onToggleMonitor: (zoneId: string, recordId: string) => void;
  onUpdateRecord: (
    zoneId: string,
    record: DnsRecord,
    currentIp: string,
    tokenId: string,
    trigger: "manual" | "auto"
  ) => void;
  currentIp: string | null;
  intervalMinutes: number;
  recordCount: number;
  recordsAtRisk: number;
  zoneLastRun: Map<string, UpdateRecord>;
  rollbackUpdates: Map<string, UpdateRecord>;
  onRollbackRecord: (zoneId: string, record: DnsRecord) => void | Promise<void>;
};

export default function ZoneManagementPanel({
  zones,
  filteredZones,
  dnsRecords,
  monitoredSet,
  selectedZoneId,
  onSelectedZoneIdChange,
  search,
  onSearchChange,
  recordTypeFilter,
  routingFilter,
  autoUpdateFilter,
  onRecordTypeFilter,
  onRoutingFilter,
  onAutoUpdateFilter,
  entriesPerPage,
  onEntriesPerPageChange,
  currentPage,
  onCurrentPageChange,
  selectedRecords,
  onToggleSelectRecord,
  onSelectAllRecords,
  onBulkSetAutoUpdate,
  onToggleMonitor,
  onUpdateRecord,
  currentIp,
  intervalMinutes,
  recordCount,
  recordsAtRisk,
  zoneLastRun,
  rollbackUpdates,
  onRollbackRecord,
}: ZoneManagementPanelProps) {
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);

  useEffect(() => {
    if (!openMenuKey) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".record-menu")) {
        setOpenMenuKey(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenuKey(null);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenuKey]);

  return (
    <>
      <section className="panel dashboard-panel zone-panel">
        <div className="panel-heading">
          <Globe size={14} />
          <span>Zone management</span>
        </div>
        <div className="content-header">
          <div>
            <h3>
              Zone management
              <span className="status-pill">Active</span>
            </h3>
            <p>
              Managing {zones.length} configured zones with {recordCount} active
              records.
            </p>
            {recordsAtRisk > 0 ? (
              <div className="risk-badge">{recordsAtRisk} records at risk</div>
            ) : null}
          </div>
          <div className="content-actions">
            {zones.length > 0 ? (
              <label className="zone-select">
                <span>Selected zone</span>
                <select
                  value={selectedZoneId}
                  onChange={(event) => onSelectedZoneIdChange(event.target.value)}
                >
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name} ({zone.tokenName})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="search">
              <Search size={16} />
              <input
                id="zone-record-search"
                type="text"
                placeholder="Search records..."
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-panel zone-panel">
        <div className="zone-list">
          {filteredZones.length === 0 ? (
            <div className="zone-empty">
              <h3>No zones found</h3>
              <p>Add a Cloudflare token and sync to load zones.</p>
            </div>
          ) : (
            filteredZones.map((zone) => {
              const zoneRecords = dnsRecords[zone.id] ?? [];
              const searchQuery = search.trim().toLowerCase();
              const filteredRecords = zoneRecords.filter((record) => {
                if (
                  searchQuery &&
                  !record.name.toLowerCase().includes(searchQuery) &&
                  !record.type.toLowerCase().includes(searchQuery)
                ) {
                  return false;
                }
                if (recordTypeFilter !== "all" && record.type !== recordTypeFilter) {
                  return false;
                }
                if (
                  routingFilter !== "all" &&
                  (routingFilter === "proxied") !== Boolean(record.proxied)
                ) {
                  return false;
                }
                const isMonitored = monitoredSet.has(`${zone.id}:${record.id}`);
                if (autoUpdateFilter === "on" && !isMonitored) {
                  return false;
                }
                if (autoUpdateFilter === "off" && isMonitored) {
                  return false;
                }
                return true;
              });
              const totalPages = Math.max(
                1,
                Math.ceil(filteredRecords.length / entriesPerPage)
              );
              const page = Math.min(currentPage, totalPages);
              const startIndex = (page - 1) * entriesPerPage;
              const pageRecords = filteredRecords.slice(
                startIndex,
                startIndex + entriesPerPage
              );
              const pageKeys = pageRecords.map(
                (record) => `${zone.id}:${record.id}`
              );
              const selectedKeys = Array.from(selectedRecords).filter((key) =>
                key.startsWith(`${zone.id}:`)
              );
              const allSelected =
                pageKeys.length > 0 &&
                pageKeys.every((key) => selectedRecords.has(key));
              const recordTypes = Array.from(
                new Set(zoneRecords.map((record) => record.type))
              ).sort();
              const monitoredCount = zoneRecords.filter((record) =>
                monitoredSet.has(`${zone.id}:${record.id}`)
              ).length;
              const lastRun = zoneLastRun.get(zone.id) || null;
              return (
                <div key={zone.id} className="zone-card">
                  <div className="zone-top">
                    <div className="zone-meta">
                      <div className="zone-icon">
                        <Globe size={18} />
                      </div>
                      <div>
                        <span className="zone-top-label">Zone records</span>
                        <h3>
                          {zone.name}
                          <span className="zone-dot" />
                        </h3>
                        <p>
                          {zone.tokenName} - Plan:{" "}
                          {(zone.plan?.name || "Free").replace(
                            /\s*website\s*/i,
                            ""
                          )}
                        </p>
                      </div>
                    </div>
                    <a
                      className="icon-button subtle"
                      href="https://dash.cloudflare.com"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={16} />
                    </a>
                  </div>

                  <div className="table-controls">
                    <div className="table-filters">
                      <label>
                        <span>Record type</span>
                        <select
                          value={recordTypeFilter}
                          onChange={(event) =>
                            onRecordTypeFilter(event.target.value)
                          }
                        >
                          <option value="all">All</option>
                          {recordTypes.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Routing</span>
                        <select
                          value={routingFilter}
                          onChange={(event) => onRoutingFilter(event.target.value)}
                        >
                          <option value="all">All</option>
                          <option value="proxied">Proxied</option>
                          <option value="direct">Direct</option>
                        </select>
                      </label>
                      <label>
                        <span>Auto-update</span>
                        <select
                          value={autoUpdateFilter}
                          onChange={(event) =>
                            onAutoUpdateFilter(event.target.value)
                          }
                        >
                          <option value="all">All</option>
                          <option value="on">On</option>
                          <option value="off">Off</option>
                        </select>
                      </label>
                    </div>
                    <div className="bulk-actions">
                      <span>{selectedKeys.length} selected</span>
                      <button
                        type="button"
                        className="ghost"
                        disabled={selectedKeys.length === 0}
                        onClick={() =>
                          onBulkSetAutoUpdate(
                            zone.id,
                            selectedKeys.map((key) => key.split(":")[1]),
                            true
                          )
                        }
                      >
                        Enable auto-update
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={selectedKeys.length === 0}
                        onClick={() =>
                          onBulkSetAutoUpdate(
                            zone.id,
                            selectedKeys.map((key) => key.split(":")[1]),
                            false
                          )
                        }
                      >
                        Disable auto-update
                      </button>
                    </div>
                  </div>

                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th className="th-check">
                            <input
                              type="checkbox"
                              aria-label="Select all records"
                              checked={allSelected}
                              onChange={(event) =>
                                onSelectAllRecords(
                                  zone.id,
                                  pageKeys,
                                  event.target.checked
                                )
                              }
                            />
                          </th>
                          <th>Record</th>
                          <th>Type</th>
                          <th>Routing</th>
                          <th>Current Target</th>
                          <th>Auto-update</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageRecords.map((record) => {
                          const isMonitored = monitoredSet.has(
                            `${zone.id}:${record.id}`
                          );
                          const isUpToDate = record.content === currentIp;
                          const menuKey = `${zone.id}:${record.id}`;
                          const rollbackEntry = rollbackUpdates.get(menuKey);
                          const rollbackDisabled = !rollbackEntry?.previousContent;

                          return (
                            <tr key={record.id}>
                              <td className="td-check">
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${record.name}`}
                                  checked={selectedRecords.has(
                                    `${zone.id}:${record.id}`
                                  )}
                                  onChange={() =>
                                    onToggleSelectRecord(zone.id, record.id)
                                  }
                                />
                              </td>
                              <td>
                                <div className="record-title">
                                  <strong>{record.name}</strong>
                                </div>
                              </td>
                              <td>
                                <span className="type-pill">{record.type}</span>
                              </td>
                              <td>
                                {record.proxied ? (
                                  <span className="badge proxied">
                                    <Cloud size={12} />
                                    Proxied
                                  </span>
                                ) : (
                                  <span className="badge direct">
                                    <CloudOff size={12} />
                                    Direct
                                  </span>
                                )}
                              </td>
                              <td>
                                <div className="target-stack">
                                  <code>{record.content}</code>
                                  {isUpToDate ? (
                                    <span className="tag ok">In Sync</span>
                                  ) : null}
                                </div>
                              </td>
                              <td>
                                <div className="toggle-wrap">
                                  <ToggleSwitch
                                    enabled={isMonitored}
                                    onChange={() =>
                                      onToggleMonitor(zone.id, record.id)
                                    }
                                  />
                                </div>
                              </td>
                              <td>
                                <div className="row-actions">
                                  <button
                                    type="button"
                                    className="action"
                                    onClick={() =>
                                      onUpdateRecord(
                                        zone.id,
                                        record,
                                        currentIp || "",
                                        zone.tokenId,
                                        "manual"
                                      )
                                    }
                                  >
                                    <RefreshCcw size={16} />
                                  </button>
                                  <div className="record-menu">
                                    <button
                                      type="button"
                                      className="action menu-trigger"
                                      aria-label={`More actions for ${record.name}`}
                                      aria-expanded={openMenuKey === menuKey}
                                      onClick={() =>
                                        setOpenMenuKey((prev) =>
                                          prev === menuKey ? null : menuKey
                                        )
                                      }
                                    >
                                      <EllipsisVertical size={16} />
                                    </button>
                                    {openMenuKey === menuKey ? (
                                      <div className="record-menu-panel" role="menu">
                                        <button
                                          type="button"
                                          className="record-menu-item"
                                          role="menuitem"
                                          onClick={() => {
                                            if (typeof navigator !== "undefined") {
                                              void navigator.clipboard.writeText(record.name);
                                            }
                                            setOpenMenuKey(null);
                                          }}
                                        >
                                          <Copy size={14} />
                                          <span>Copy DNS name</span>
                                        </button>
                                        <button
                                          type="button"
                                          className="record-menu-item"
                                          role="menuitem"
                                          onClick={() => {
                                            window.open(
                                              `https://dash.cloudflare.com/?to=/:account/${encodeURIComponent(
                                                zone.name
                                              )}/dns/records`,
                                              "_blank",
                                              "noopener,noreferrer"
                                            );
                                            setOpenMenuKey(null);
                                          }}
                                        >
                                          <ExternalLink size={14} />
                                          <span>Open in Cloudflare</span>
                                        </button>
                                        <button
                                          type="button"
                                          className="record-menu-item"
                                          role="menuitem"
                                          onClick={() => {
                                            onUpdateRecord(
                                              zone.id,
                                              record,
                                              currentIp || "",
                                              zone.tokenId,
                                              "manual"
                                            );
                                            setOpenMenuKey(null);
                                          }}
                                        >
                                          <RefreshCcw size={14} />
                                          <span>Force refresh</span>
                                        </button>
                                        <button
                                          type="button"
                                          className="record-menu-item danger"
                                          role="menuitem"
                                          disabled={rollbackDisabled}
                                          onClick={() => {
                                            if (!rollbackDisabled) {
                                              void onRollbackRecord(zone.id, record);
                                            }
                                            setOpenMenuKey(null);
                                          }}
                                        >
                                          <RotateCcw size={14} />
                                          <span>Rollback last update</span>
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="table-footer">
                    <div className="footer-left">
                      Showing {filteredRecords.length === 0 ? 0 : startIndex + 1} to{" "}
                      {Math.min(startIndex + entriesPerPage, filteredRecords.length)} of{" "}
                      {filteredRecords.length} results
                    </div>
                    <div className="footer-right">
                      <label className="footer-select">
                        <span>Per page</span>
                        <select
                          value={entriesPerPage}
                          onChange={(event) =>
                            onEntriesPerPageChange(Number(event.target.value))
                          }
                        >
                          {[10, 25, 50, 100].map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="footer-pages">
                        <button
                          type="button"
                          className="page-btn"
                          onClick={() =>
                            onCurrentPageChange(Math.max(1, currentPage - 1))
                          }
                          disabled={page === 1}
                        >
                          Prev
                        </button>
                        <span className="page-indicator">
                          {page} / {totalPages}
                        </span>
                        <button
                          type="button"
                          className="page-btn"
                          onClick={() =>
                            onCurrentPageChange(Math.min(totalPages, currentPage + 1))
                          }
                          disabled={page === totalPages}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </>
  );
}
