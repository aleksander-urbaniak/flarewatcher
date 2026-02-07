"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { ShieldCheck, ShieldOff } from "lucide-react";

type SecurityPanelProps = {
  onLog: (message: string, type?: "info" | "success" | "error") => void;
  onNotify: (
    title: string,
    message: string | undefined,
    type?: "info" | "success" | "error" | "warning"
  ) => void;
};

type UserResponse = {
  status: string;
  user?: {
    id: string;
    email: string;
    username: string;
    twoFactorEnabled: boolean;
  };
  message?: string;
};

type SetupResponse = {
  status: string;
  secret?: string;
  otpauth?: string;
  message?: string;
};

export default function SecurityPanel({ onLog, onNotify }: SecurityPanelProps) {
  const [loading, setLoading] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  const loadUser = async () => {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    const data = (await response.json()) as UserResponse;
    if (!response.ok || data.status !== "success" || !data.user) {
      throw new Error(data.message || "Unable to load user.");
    }
    setTwoFactorEnabled(data.user.twoFactorEnabled);
    setEmail(data.user.email);
  };

  useEffect(() => {
    void loadUser().catch(() => null);
  }, []);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    if (showSetupModal) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
  }, [showSetupModal]);

  const startSetup = async () => {
    setStatus(null);
    setLoading(true);
    try {
      const response = await fetch("/api/2fa/setup", { cache: "no-store" });
      const data = (await response.json()) as SetupResponse;
      if (!response.ok || data.status !== "success") {
        throw new Error(data.message || "Unable to start 2FA setup.");
      }
      setSecret(data.secret ?? null);
      setOtpauth(data.otpauth ?? null);
      setShowSetupModal(true);
      onLog("2FA setup started.", "info");
      onNotify("2FA setup", "Scan the QR code or enter the secret.", "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : "2FA setup failed.";
      setStatus(message);
      onLog(message, "error");
      onNotify("2FA setup failed", message, "error");
    } finally {
      setLoading(false);
    }
  };

  const verifySetup = async () => {
    if (!code.trim()) {
      setStatus("Enter a valid 2FA code.");
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const response = await fetch("/api/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code.trim() }),
      });
      const data = (await response.json()) as { status: string; message?: string };
      if (!response.ok || data.status !== "success") {
        throw new Error(data.message || "Invalid 2FA code.");
      }
      setTwoFactorEnabled(true);
      setSecret(null);
      setOtpauth(null);
      setCode("");
      setShowSetupModal(false);
      setStatus(null);
      onLog("2FA enabled.", "success");
      onNotify("2FA enabled", "Two-factor authentication is active.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "2FA verification failed.";
      setStatus(message);
      onLog(message, "error");
      onNotify("2FA verification failed", message, "error");
    } finally {
      setLoading(false);
    }
  };

  const disable2fa = async () => {
    if (!code.trim()) {
      setStatus("Enter a valid 2FA code.");
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const response = await fetch("/api/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code.trim() }),
      });
      const data = (await response.json()) as { status: string; message?: string };
      if (!response.ok || data.status !== "success") {
        throw new Error(data.message || "Unable to disable 2FA.");
      }
      setTwoFactorEnabled(false);
      setSecret(null);
      setOtpauth(null);
      setCode("");
      setShowSetupModal(false);
      onLog("2FA disabled.", "success");
      onNotify("2FA disabled", "Two-factor authentication is disabled.", "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : "2FA disable failed.";
      setStatus(message);
      onLog(message, "error");
      onNotify("2FA disable failed", message, "error");
    } finally {
      setLoading(false);
    }
  };

  const copyValue = async (value: string | null) => {
    if (!value || typeof navigator === "undefined") {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      onNotify("Copied", "Value copied to clipboard.", "success");
    } catch {
      onNotify("Copy failed", "Unable to copy value.", "error");
    }
  };

  const closeSetupModal = () => {
    setSecret(null);
    setOtpauth(null);
    setCode("");
    setShowSetupModal(false);
  };

  return (
    <section className="panel dashboard-panel security-panel security-highlight">
      <div className="security-hero">
        <div className="security-hero-icon">
          <ShieldCheck size={20} />
        </div>
        <div>
          <span>Two-factor auth</span>
          <p>Secure operator login with TOTP verification.</p>
        </div>
        <div className="security-pill">
          {twoFactorEnabled ? "Enabled" : "Disabled"}
        </div>
      </div>
      <div className="panel-body">
        <div className="security-status">
          <div>
            <h3>{twoFactorEnabled ? "2FA is enabled" : "2FA is disabled"}</h3>
            <p>
              {twoFactorEnabled
                ? "Use a TOTP app to generate sign-in codes."
                : "Add an authenticator app for extra protection."}
            </p>
          </div>
          <div className={`status-pill ${twoFactorEnabled ? "on" : "off"}`}>
            {twoFactorEnabled ? "Enabled" : "Disabled"}
          </div>
        </div>

        {!twoFactorEnabled ? (
          <div className="security-block">
            <p className="muted">Account: {email || ""}</p>
            <button
              type="button"
              className="button"
              onClick={startSetup}
              disabled={loading}
            >
              {loading ? "Preparing..." : "Start setup"}
            </button>
          </div>
        ) : null}

        {portalReady && showSetupModal && secret
          ? createPortal(
              <div
                className="modal-backdrop"
                role="dialog"
                aria-modal="true"
                onClick={closeSetupModal}
              >
                <div
                  className="modal-card"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="modal-header">
                    <div>
                      <h3>TOTP setup</h3>
                      <p>Scan the code in your authenticator app, then confirm.</p>
                    </div>
                    <button
                      type="button"
                      className="ghost modal-close"
                      onClick={closeSetupModal}
                    >
                      Close
                    </button>
                  </div>
                  <div className="modal-body security-setup">
                    {otpauth ? (
                      <div className="totp-qr">
                        <div className="totp-qr-frame">
                          <Image
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                              otpauth
                            )}`}
                            alt="Scan this QR code with your authenticator app"
                            width={200}
                            height={200}
                          />
                        </div>
                        <p>Scan this QR code in your authenticator app.</p>
                      </div>
                    ) : null}
                    <div>
                      <label>Secret key</label>
                      <div className="security-code">
                        <span>{secret}</span>
                        <button type="button" onClick={() => copyValue(secret)}>
                          Copy
                        </button>
                      </div>
                    </div>
                    <div>
                      <label>OTP Auth URL</label>
                      <div className="security-code">
                        <span>{otpauth}</span>
                        <button type="button" onClick={() => copyValue(otpauth)}>
                          Copy
                        </button>
                      </div>
                    </div>
                    <label>
                      <span>Verification code</span>
                      <input
                        type="text"
                        placeholder="123456"
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                      />
                    </label>
                    <div className="security-actions">
                      <button
                        type="button"
                        className="ghost modal-close"
                        onClick={closeSetupModal}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="button"
                        onClick={verifySetup}
                        disabled={loading}
                      >
                        {loading ? "Verifying..." : "Enable 2FA"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )
          : null}

        {twoFactorEnabled ? (
          <div className="security-disable">
            <label>
              <span>Disable with code</span>
              <input
                type="text"
                placeholder="123456"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="ghost danger"
              onClick={disable2fa}
              disabled={loading}
            >
              <ShieldOff size={14} />
              Disable 2FA
            </button>
          </div>
        ) : null}

        {status ? <div className="status error">{status}</div> : null}
      </div>
    </section>
  );
}
