"use client";

import { useState, type FormEvent } from "react";
import { Lock } from "lucide-react";

export default function PasswordPanel() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nextPassword || nextPassword !== confirmPassword) {
      setStatusMessage("Passwords do not match.");
      return;
    }
    setStatusMessage("Password update queued locally.");
    setCurrentPassword("");
    setNextPassword("");
    setConfirmPassword("");
    setTimeout(() => setStatusMessage(""), 4000);
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
            placeholder="At least 12 characters"
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
          <button type="submit">Update password</button>
          {statusMessage ? <span className="form-status">{statusMessage}</span> : null}
        </div>
      </form>
    </section>
  );
}
