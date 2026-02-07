"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Fingerprint,
  Mail,
  Shield,
} from "lucide-react";

export default function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setLoading(true);

    const payload: {
      email: string;
      password: string;
      twoFactorToken?: string;
    } = {
      email: email.trim(),
      password: password.trim(),
    };

    if (twoFactorRequired && twoFactorToken.trim()) {
      payload.twoFactorToken = twoFactorToken.trim();
    }

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { status?: string; message?: string };
      if (response.ok && data.status === "success") {
        router.push("/");
        return;
      }

      if (data.status === "two_factor_required") {
        setTwoFactorRequired(true);
        setStatus("Enter the 6-digit code from your authenticator.");
        return;
      }

      setStatus(data.message || "Login failed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed.";
      setStatus(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-shell">
      <div className="login-backdrop">
        <div className="login-blob login-blob-orange" />
        <div className="login-blob login-blob-blue" />
        <div className="login-grid" />
      </div>
      <section className="login-card">
        <header className="login-header">
          <div className="login-badge">
            <Shield size={14} />
            <span>Flarewatcher Access</span>
          </div>
          <h1>Sign in</h1>
          <p>Securely manage your Cloudflare DNS infrastructure and analytics.</p>
        </header>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span>Email Address</span>
            <div className="login-input">
              <Mail size={16} />
              <input
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
                required
              />
            </div>
          </label>

          <label className="login-field">
            <span>Password</span>
            <div className="login-input">
              <Fingerprint size={16} />
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                className="login-visibility"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          {twoFactorRequired ? (
            <label className="login-field">
              <span>Two-factor code</span>
              <div className="login-input">
                <Fingerprint size={16} />
                <input
                  type="text"
                  name="twoFactorToken"
                  inputMode="numeric"
                  placeholder="123456"
                  value={twoFactorToken}
                  onChange={(event) => setTwoFactorToken(event.target.value)}
                  required
                />
              </div>
            </label>
          ) : null}

          {status ? <div className="login-status">{status}</div> : null}

          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? (
              <span className="login-spinner" />
            ) : (
              <>
                Sign in to Access
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      </section>
    </main>
  );
}
