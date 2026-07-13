"use client";

import { useState, type FormEvent } from "react";
import { Lock } from "lucide-react";

export default function PasswordPanel() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    if (nextPassword.length < 8) {
      setStatusMessage("New password must be at least 8 characters.");
      return;
    }
    if (!nextPassword || nextPassword !== confirmPassword) {
      setStatusMessage("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    setStatusMessage("");
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword: nextPassword,
          confirmPassword,
        }),
      });
      const data = (await response.json()) as { status: string; message?: string };
      if (!response.ok || data.status !== "success") {
        throw new Error(data.message || "Unable to update password.");
      }
      setStatusMessage("Password updated.");
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Unable to update password."
      );
    } finally {
      setSubmitting(false);
      setTimeout(() => setStatusMessage(""), 4000);
    }
  };

  return (
    <section className="panel dashboard-panel password-panel">
      <div className="side-panel-header">
        <Lock size={18} />
        <div>
          <span>Authentication</span>
          <p>Update your operator credentials.</p>
        </div>
      </div>
      <form className="panel-body" onSubmit={handleSubmit}>
        <label>
          <span>Current password</span>
          <input
            type="password"
            placeholder="••••••••"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label>
          <span>New password</span>
          <input
            type="password"
            placeholder="At least 8 characters"
            value={nextPassword}
            onChange={(event) => setNextPassword(event.target.value)}
          />
        </label>
        <label>
          <span>Confirm password</span>
          <input
            type="password"
            placeholder="Repeat new password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>
        <div className="panel-actions">
          <button type="submit" disabled={submitting}>
            {submitting ? "Updating..." : "Update password"}
          </button>
          {statusMessage ? <span className="form-status">{statusMessage}</span> : null}
        </div>
      </form>
    </section>
  );
}
