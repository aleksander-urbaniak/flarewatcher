"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  CheckCircle,
  ChevronDown,
  HelpCircle,
  Mail,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import ToggleSwitch from "@/components/common/ToggleSwitch";
import { normalizeDiscordTemplate } from "@/lib/alertTemplates";

type AlertingPanelProps = {
  discordWebhookUrl: string;
  discordMarkdown: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  smtpTo: string;
  smtpMessage: string;
  alertEnabled: { discord: boolean; smtp: boolean };
  testStatus: "idle" | "discord" | "smtp";
  testError: { discord?: string | null; smtp?: string | null };
  defaultMarkdown: string;
  defaultSmtpMessage: string;
  currentIp: string | null;
  previousIp: string | null;
  notifyOnIpChange: boolean;
  notifyOnFailure: boolean;
  onDiscordWebhookUrl: (value: string) => void;
  onDiscordMarkdown: (value: string) => void;
  onSmtpHost: (value: string) => void;
  onSmtpPort: (value: string) => void;
  onSmtpUser: (value: string) => void;
  onSmtpPass: (value: string) => void;
  onSmtpFrom: (value: string) => void;
  onSmtpTo: (value: string) => void;
  onSmtpMessage: (value: string) => void;
  onToggleDiscord: (next: boolean) => void;
  onToggleSmtp: (next: boolean) => void;
  onNotifyOnIpChange: (next: boolean) => void;
  onNotifyOnFailure: (next: boolean) => void;
  onTest: (type: "discord" | "smtp") => void;
  onSave: () => void;
};

export default function AlertingPanel({
  discordWebhookUrl,
  discordMarkdown,
  smtpHost,
  smtpPort,
  smtpUser,
  smtpPass,
  smtpFrom,
  smtpTo,
  smtpMessage,
  alertEnabled,
  testStatus,
  testError,
  defaultMarkdown,
  defaultSmtpMessage,
  currentIp,
  previousIp,
  notifyOnIpChange,
  notifyOnFailure,
  onDiscordWebhookUrl,
  onDiscordMarkdown,
  onSmtpHost,
  onSmtpPort,
  onSmtpUser,
  onSmtpPass,
  onSmtpFrom,
  onSmtpTo,
  onSmtpMessage,
  onToggleDiscord,
  onToggleSmtp,
  onNotifyOnIpChange,
  onNotifyOnFailure,
  onTest,
  onSave,
}: AlertingPanelProps) {
  const [openHelp, setOpenHelp] = useState<"discord" | "smtp" | null>(null);
  const discordHelpRef = useRef<HTMLDivElement | null>(null);
  const smtpHelpRef = useRef<HTMLDivElement | null>(null);
  const [discordRender, setDiscordRender] = useState(false);
  const [discordVisible, setDiscordVisible] = useState(false);
  const [discordClosing, setDiscordClosing] = useState(false);
  const [smtpRender, setSmtpRender] = useState(false);
  const [smtpVisible, setSmtpVisible] = useState(false);
  const [smtpClosing, setSmtpClosing] = useState(false);
  const discordCloseRef = useRef<number | null>(null);
  const smtpCloseRef = useRef<number | null>(null);
  const discordMessageRef = useRef<HTMLTextAreaElement | null>(null);
  const smtpMessageRef = useRef<HTMLTextAreaElement | null>(null);
  const placeholderItems = [
    { token: "{title}", description: "Alert title." },
    { token: "{message}", description: "Alert body content." },
    { token: "{previousIp}", description: "Previous public IP (or N/A if unknown)." },
    { token: "{currentIp}", description: "Current public IP." },
    { token: "{timestamp}", description: "Local time when the alert is sent." },
  ];
  const previewValues = useMemo(() => {
    const previewPreviousIp = previousIp?.trim() || "-";
    const previewCurrentIp = currentIp?.trim() || "N/A";
    return {
      "{title}": "Flarewatcher IP change",
      "{message}": `Previous IP: ${previewPreviousIp}\nCurrent IP: ${previewCurrentIp}`,
      "{previousIp}": previewPreviousIp,
      "{currentIp}": previewCurrentIp,
      "{timestamp}": new Date().toLocaleString(),
    };
  }, [currentIp, previousIp]);

  const applyPreviewValues = (template: string) => {
    return Object.entries(previewValues).reduce((result, [token, value]) => {
      return result.split(token).join(value);
    }, template);
  };

  const discordPreview = applyPreviewValues(
    normalizeDiscordTemplate(discordMarkdown || defaultMarkdown)
  );
  const smtpPreview = applyPreviewValues(smtpMessage || defaultSmtpMessage);

  const insertPlaceholder = (
    token: string,
    value: string,
    onChange: (next: string) => void,
    ref: { current: HTMLTextAreaElement | null }
  ) => {
    const field = ref.current;
    if (!field) {
      onChange(`${value}${token}`);
      return;
    }
    const start = field.selectionStart ?? value.length;
    const end = field.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
    onChange(next);
    window.requestAnimationFrame(() => {
      field.focus();
      const position = start + token.length;
      field.setSelectionRange(position, position);
    });
  };

  useEffect(() => {
    if (!openHelp) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const activeRef =
        openHelp === "discord" ? discordHelpRef.current : smtpHelpRef.current;
      if (activeRef && !activeRef.contains(target)) {
        setOpenHelp(null);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenHelp(null);
      }
    };

    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openHelp]);

  useEffect(() => {
    const openDiscord = () => {
      if (discordCloseRef.current) {
        window.clearTimeout(discordCloseRef.current);
        discordCloseRef.current = null;
      }
      setDiscordClosing(false);
      setDiscordRender(true);
      window.requestAnimationFrame(() => {
        setDiscordVisible(true);
      });
    };

    const closeDiscord = () => {
      if (!discordRender) {
        return;
      }
      setDiscordClosing(true);
      setDiscordVisible(false);
      if (discordCloseRef.current) {
        window.clearTimeout(discordCloseRef.current);
      }
      discordCloseRef.current = window.setTimeout(() => {
        setDiscordRender(false);
        setDiscordClosing(false);
        discordCloseRef.current = null;
      }, 180);
    };

    const openSmtp = () => {
      if (smtpCloseRef.current) {
        window.clearTimeout(smtpCloseRef.current);
        smtpCloseRef.current = null;
      }
      setSmtpClosing(false);
      setSmtpRender(true);
      window.requestAnimationFrame(() => {
        setSmtpVisible(true);
      });
    };

    const closeSmtp = () => {
      if (!smtpRender) {
        return;
      }
      setSmtpClosing(true);
      setSmtpVisible(false);
      if (smtpCloseRef.current) {
        window.clearTimeout(smtpCloseRef.current);
      }
      smtpCloseRef.current = window.setTimeout(() => {
        setSmtpRender(false);
        setSmtpClosing(false);
        smtpCloseRef.current = null;
      }, 180);
    };

    if (openHelp === "discord") {
      openDiscord();
      closeSmtp();
      return;
    }

    if (openHelp === "smtp") {
      openSmtp();
      closeDiscord();
      return;
    }

    closeDiscord();
    closeSmtp();
  }, [openHelp, discordRender, smtpRender]);

  return (
    <section className="dashboard-panel alerting-panel">
      <div className="alerting-kicker">
        <ShieldCheck size={16} />
        <span>Alerting</span>
      </div>
      <div className="alerting-list">
        <div className={`alerting-card ${alertEnabled.discord ? "" : "collapsed"}`}>
          <div className="alerting-card-header">
            <div className="alerting-card-title">
              <div className="alerting-icon discord">
                <MessageSquare size={18} />
              </div>
              <div>
                <h4>Discord</h4>
                <p>Webhook notifications for DNS updates.</p>
              </div>
            </div>
            <div className="alerting-card-actions">
              <ToggleSwitch
                enabled={alertEnabled.discord}
                onChange={() => onToggleDiscord(!alertEnabled.discord)}
              />
              <ChevronDown
                className={`alerting-card-toggle ${alertEnabled.discord ? "open" : ""}`}
                size={18}
              />
            </div>
          </div>
          <div className="alerting-card-body">
            <label className="alerting-field">
              <span>Discord webhook</span>
              <input
                type="text"
                placeholder="https://discord.com/api/webhooks/..."
                value={discordWebhookUrl}
                onChange={(event) => onDiscordWebhookUrl(event.target.value)}
              />
            </label>
            <label className="alerting-field">
              <div className="alerting-field-label">
                <span>Markdown message</span>
                <div className="alerting-help-wrap" ref={discordHelpRef}>
                  <button
                    type="button"
                    className="alerting-help"
                    aria-label="Discord markdown placeholders"
                    aria-expanded={openHelp === "discord"}
                    aria-controls="discord-placeholders"
                    onClick={() =>
                      setOpenHelp((prev) => (prev === "discord" ? null : "discord"))
                    }
                  >
                    <HelpCircle size={14} />
                  </button>
                  {discordRender ? (
                    <div
                      id="discord-placeholders"
                      className={`alerting-placeholder-popover${
                        discordVisible ? " open" : discordClosing ? " closing" : ""
                      }`}
                      role="tooltip"
                    >
                      <div className="alerting-placeholder-title">Available placeholders</div>
                      <ul className="alerting-placeholder-list">
                        {placeholderItems.map((item) => (
                          <li key={item.token}>
                            <code>{item.token}</code>
                            <p className="alerting-placeholder-text">{item.description}</p>
                          </li>
                        ))}
                      </ul>
                      <p className="alerting-placeholder-note">
                        Supports Discord markdown formatting.
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
              <textarea
                ref={discordMessageRef}
                className="alerting-textarea"
                placeholder={defaultMarkdown}
                value={discordMarkdown}
                onChange={(event) => onDiscordMarkdown(event.target.value)}
                rows={4}
              />
              <div className="alerting-builder">
                <span className="alerting-builder-label">Insert placeholder</span>
                <div className="alerting-builder-chips">
                  {placeholderItems.map((item) => (
                    <button
                      key={`discord-chip-${item.token}`}
                      type="button"
                      className="alerting-token-chip"
                      onClick={() =>
                        insertPlaceholder(
                          item.token,
                          discordMarkdown,
                          onDiscordMarkdown,
                          discordMessageRef
                        )
                      }
                    >
                      {item.token}
                    </button>
                  ))}
                </div>
              </div>
              <div className="alerting-preview">
                <span className="alerting-preview-label">Preview</span>
                <div className="alerting-preview-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                    {discordPreview}
                  </ReactMarkdown>
                </div>
              </div>
            </label>
            <div className="alerting-actions">
              <button
                type="button"
                className="alerting-test"
                disabled={testStatus !== "idle"}
                onClick={() => onTest("discord")}
              >
                Test Discord
              </button>
              {testError.discord ? (
                <span className="alerting-error">{testError.discord}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className={`alerting-card ${alertEnabled.smtp ? "" : "collapsed"}`}>
          <div className="alerting-card-header">
            <div className="alerting-card-title">
              <div className="alerting-icon smtp">
                <Mail size={18} />
              </div>
              <div>
                <h4>SMTP</h4>
                <p>Custom SMTP configuration for outbound alerts.</p>
              </div>
            </div>
            <div className="alerting-card-actions">
              <ToggleSwitch
                enabled={alertEnabled.smtp}
                onChange={() => onToggleSmtp(!alertEnabled.smtp)}
              />
              <ChevronDown
                className={`alerting-card-toggle ${alertEnabled.smtp ? "open" : ""}`}
                size={18}
              />
            </div>
          </div>
          <div className="alerting-card-body">
            <div className="alerting-grid">
              <label className="alerting-field span-10">
                <span>SMTP host</span>
                <input
                  type="text"
                  placeholder="smtp.example.com"
                  value={smtpHost}
                  onChange={(event) => onSmtpHost(event.target.value)}
                />
              </label>
              <label className="alerting-field span-2">
                <span>SMTP port</span>
                <input
                  type="number"
                  placeholder="587"
                  value={smtpPort}
                  onChange={(event) => onSmtpPort(event.target.value)}
                />
              </label>
              <label className="alerting-field span-12">
                <span>SMTP user</span>
                <input
                  type="text"
                  placeholder="user@example.com"
                  value={smtpUser}
                  onChange={(event) => onSmtpUser(event.target.value)}
                />
              </label>
              <label className="alerting-field span-12">
                <span>SMTP pass</span>
                <input
                  type="password"
                  placeholder="password"
                  value={smtpPass}
                  onChange={(event) => onSmtpPass(event.target.value)}
                />
              </label>
              <label className="alerting-field span-12">
                <span>SMTP from</span>
                <input
                  type="text"
                  placeholder="Flarewatcher <no-reply@example.com>"
                  value={smtpFrom}
                  onChange={(event) => onSmtpFrom(event.target.value)}
                />
              </label>
              <label className="alerting-field span-12">
                <span>SMTP to</span>
                <input
                  type="email"
                  placeholder="alerts@example.com"
                  value={smtpTo}
                  onChange={(event) => onSmtpTo(event.target.value)}
                />
              </label>
              <label className="alerting-field span-12">
                <div className="alerting-field-label">
                  <span>SMTP message</span>
                  <div className="alerting-help-wrap" ref={smtpHelpRef}>
                    <button
                      type="button"
                      className="alerting-help"
                      aria-label="SMTP message placeholders"
                      aria-expanded={openHelp === "smtp"}
                      aria-controls="smtp-placeholders"
                      onClick={() =>
                        setOpenHelp((prev) => (prev === "smtp" ? null : "smtp"))
                      }
                    >
                      <HelpCircle size={14} />
                    </button>
                  {smtpRender ? (
                    <div
                      id="smtp-placeholders"
                      className={`alerting-placeholder-popover${
                        smtpVisible ? " open" : smtpClosing ? " closing" : ""
                      }`}
                      role="tooltip"
                    >
                        <div className="alerting-placeholder-title">
                          Available placeholders
                        </div>
                        <ul className="alerting-placeholder-list">
                          {placeholderItems.map((item) => (
                            <li key={item.token}>
                              <code>{item.token}</code>
                              <p className="alerting-placeholder-text">
                                {item.description}
                              </p>
                            </li>
                          ))}
                        </ul>
                        <p className="alerting-placeholder-note">
                          Sent as plain text in the email body.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
                <textarea
                  ref={smtpMessageRef}
                  className="alerting-textarea"
                  placeholder={defaultSmtpMessage}
                  value={smtpMessage}
                  onChange={(event) => onSmtpMessage(event.target.value)}
                  rows={5}
                />
                <div className="alerting-builder">
                  <span className="alerting-builder-label">Insert placeholder</span>
                  <div className="alerting-builder-chips">
                    {placeholderItems.map((item) => (
                      <button
                        key={`smtp-chip-${item.token}`}
                        type="button"
                        className="alerting-token-chip"
                        onClick={() =>
                          insertPlaceholder(
                            item.token,
                            smtpMessage,
                            onSmtpMessage,
                            smtpMessageRef
                          )
                        }
                      >
                        {item.token}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="alerting-preview">
                  <span className="alerting-preview-label">Preview</span>
                  <pre>{smtpPreview}</pre>
                </div>
              </label>
            </div>
            <div className="alerting-actions">
              <button
                type="button"
                className="alerting-test"
                disabled={testStatus !== "idle"}
                onClick={() => onTest("smtp")}
              >
                Test SMTP
              </button>
              {testError.smtp ? (
                <span className="alerting-error">{testError.smtp}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="alerting-triggers">
        <span className="alerting-triggers-label">Triggers</span>
        <div className="alerting-trigger-list">
          <label className="alerting-trigger">
            <input
              type="checkbox"
              checked={notifyOnIpChange}
              onChange={(event) => onNotifyOnIpChange(event.target.checked)}
            />
            <span className="alerting-trigger-box">
              <CheckCircle size={12} />
            </span>
            <span className="alerting-trigger-text">Notify on IP change</span>
          </label>
          <label className="alerting-trigger">
            <input
              type="checkbox"
              checked={notifyOnFailure}
              onChange={(event) => onNotifyOnFailure(event.target.checked)}
            />
            <span className="alerting-trigger-box">
              <CheckCircle size={12} />
            </span>
            <span className="alerting-trigger-text">Notify on failure</span>
          </label>
        </div>
      </div>

      <div className="alerting-footer">
        <button type="button" className="alerting-save" onClick={onSave}>
          Save alerting
        </button>
      </div>
    </section>
  );
}
