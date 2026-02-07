"use client";

import { useEffect, useState, type FormEvent } from "react";
import { User } from "lucide-react";

type UserResponse = {
  status: string;
  user?: {
    email?: string | null;
    username?: string | null;
  };
  message?: string;
};

export default function ProfileDetailsPanel() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const data = (await response.json()) as UserResponse;
        if (!response.ok || data.status !== "success" || !data.user) {
          return;
        }
        if (!mounted) {
          return;
        }
        setDisplayName(data.user.username ?? "");
        setEmail(data.user.email ?? "");
      } catch {}
    };
    void loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage("Profile changes stored locally for now.");
    setTimeout(() => setStatusMessage(""), 4000);
  };

  return (
    <section className="panel dashboard-panel profile-details-panel">
      <div className="side-panel-header">
        <User size={18} />
        <div>
          <span>Profile identity</span>
          <p>Operator profile & contact details.</p>
        </div>
      </div>
      <form className="panel-body" onSubmit={handleSubmit}>
        <label>
          <span>Display name</span>
          <input
            type="text"
            placeholder="Admin Operator"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <label>
          <span>Email address</span>
          <input
            type="email"
            placeholder="admin@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <div className="panel-actions">
          <button type="submit">Save profile</button>
          {statusMessage ? <span className="form-status">{statusMessage}</span> : null}
        </div>
      </form>
    </section>
  );
}
