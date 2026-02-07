"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Fingerprint,
  Globe,
  Key,
  ListChecks,
  Mail,
  Shield,
  User,
} from "lucide-react";

const defaultInterval = 5;

type WizardStep = "account" | "token" | "zone" | "record" | "done";

type ZoneItem = {
  id: string;
  name: string;
  status: string;
  tokenId: string;
  tokenName: string;
};

type DnsRecord = {
  id: string;
  name: string;
  type: string;
  content: string;
};

export default function SetupForm() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>("account");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [tokenName, setTokenName] = useState("");
  const [tokenValue, setTokenValue] = useState("");
  const [zones, setZones] = useState<ZoneItem[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [showAllRecords, setShowAllRecords] = useState(false);

  const activeZone = useMemo(
    () => zones.find((zone) => zone.id === selectedZoneId) || null,
    [zones, selectedZoneId]
  );

  const recordOptions = useMemo(() => {
    if (showAllRecords) {
      return records;
    }
    return records.filter((record) => record.type === "A");
  }, [records, showAllRecords]);

  const loadZones = async () => {
    const response = await fetch("/api/cloudflare/zones", { cache: "no-store" });
    const data = (await response.json()) as {
      status: string;
      zones?: ZoneItem[];
      message?: string;
    };
    if (!response.ok || data.status !== "success") {
      throw new Error(data.message || "Failed to load zones.");
    }
    const zoneList = data.zones ?? [];
    setZones(zoneList);
    if (zoneList.length > 0) {
      setSelectedZoneId((current) => current || zoneList[0].id);
    }
  };

  const loadRecords = async (zone: ZoneItem) => {
    const response = await fetch(
      `/api/cloudflare/records?zoneId=${encodeURIComponent(zone.id)}&tokenId=${encodeURIComponent(zone.tokenId)}`,
      { cache: "no-store" }
    );
    const data = (await response.json()) as {
      status: string;
      records?: DnsRecord[];
      message?: string;
    };
    if (!response.ok || data.status !== "success") {
      throw new Error(data.message || "Failed to load DNS records.");
    }
    const recordList = data.records ?? [];
    setRecords(recordList);
    if (recordList.length > 0) {
      const preferred = recordList.find((record) => record.type === "A");
      setSelectedRecordId(preferred?.id ?? recordList[0].id);
    } else {
      setSelectedRecordId("");
    }
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password: password.trim(),
          confirmPassword: confirmPassword.trim(),
        }),
      });

      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(data.message || "Setup failed.");
      }
      setStep("token");
      setStatus(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Setup failed.";
      setStatus(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToken = async () => {
    setStatus(null);
    setLoading(true);
    try {
      const response = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tokenName.trim(),
          token: tokenValue.trim(),
        }),
      });
      const data = (await response.json()) as { status: string; message?: string };
      if (!response.ok || data.status !== "success") {
        throw new Error(data.message || "Token verification failed.");
      }
      await loadZones();
      setStep("zone");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Token verification failed.";
      setStatus(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectZone = async () => {
    if (!activeZone) {
      setStatus("Select a zone to continue.");
      return;
    }
    setStatus(null);
    setLoading(true);
    try {
      await loadRecords(activeZone);
      setStep("record");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load records.";
      setStatus(message);
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async () => {
    if (!selectedZoneId || !selectedRecordId) {
      setStatus("Select a DNS record to monitor.");
      return;
    }
    setStatus(null);
    setLoading(true);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intervalMinutes: defaultInterval,
          monitoredRecords: [
            {
              zoneId: selectedZoneId,
              recordId: selectedRecordId,
            },
          ],
        }),
      });
      const data = (await response.json()) as { status: string; message?: string };
      if (!response.ok || data.status !== "success") {
        throw new Error(data.message || "Failed to save settings.");
      }
      setStep("done");
      setTimeout(() => router.push("/"), 500);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save settings.";
      setStatus(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step === "zone" && zones.length === 0) {
      setLoading(true);
      loadZones()
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : "Failed to load zones.";
          setStatus(message);
        })
        .finally(() => setLoading(false));
    }
  }, [step, zones.length]);

  useEffect(() => {
    if (step === "record" && activeZone) {
      setLoading(true);
      loadRecords(activeZone)
        .catch((error) => {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to load DNS records.";
          setStatus(message);
        })
        .finally(() => setLoading(false));
    }
  }, [step, activeZone]);

  useEffect(() => {
    setStatus(null);
  }, [step]);

  return (
    <main className="login-shell">
      <div className="login-backdrop">
        <div className="login-blob login-blob-orange" />
        <div className="login-blob login-blob-blue" />
        <div className="login-grid" />
      </div>
      <section className="login-card setup-card">
        <header className="login-header">
          <div className="login-badge">
            <Shield size={14} />
            <span>Setup wizard</span>
          </div>
          <h1>Welcome to Flarewatcher</h1>
          <p>Complete these steps to start monitoring your DNS records.</p>
        </header>

        <div className="wizard-steps">
          {["Account", "Token", "Zone", "Record"].map((label, index) => (
            <div
              key={label}
              className={`wizard-step ${index <= ["account", "token", "zone", "record"].indexOf(step) ? "active" : ""}`}
            >
              <span>{label}</span>
            </div>
          ))}
        </div>

        {step === "account" ? (
          <form className="login-form" onSubmit={handleRegister}>
            <label className="login-field">
              <span>Username</span>
              <div className="login-input">
                <User size={16} />
                <input
                  name="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </div>
            </label>
            <label className="login-field">
              <span>Email</span>
              <div className="login-input">
                <Mail size={16} />
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
            </label>
            <label className="login-field">
              <span>Password</span>
              <div className="login-input">
                <Fingerprint size={16} />
                <input
                  type="password"
                  name="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
            </label>
            <label className="login-field">
              <span>Confirm password</span>
              <div className="login-input">
                <Fingerprint size={16} />
                <input
                  type="password"
                  name="confirmPassword"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
            </label>
            {status ? <div className="login-status">{status}</div> : null}
            <button className="login-submit" type="submit" disabled={loading}>
              {loading ? <span className="login-spinner" /> : (
                <>
                  Create account
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        ) : null}

        {step === "token" ? (
          <div className="wizard-panel">
            <div className="wizard-block">
              <h2>Connect Cloudflare</h2>
              <p>Paste your API token so Flarewatcher can list zones and records.</p>
            </div>
            <label className="login-field">
              <span>Token label</span>
              <div className="login-input">
                <Key size={16} />
                <input
                  value={tokenName}
                  onChange={(event) => setTokenName(event.target.value)}
                  placeholder="e.g. Primary"
                />
              </div>
            </label>
            <label className="login-field">
              <span>Cloudflare API token</span>
              <div className="login-input">
                <Fingerprint size={16} />
                <input
                  type="password"
                  value={tokenValue}
                  onChange={(event) => setTokenValue(event.target.value)}
                  placeholder="Paste API token"
                />
              </div>
            </label>
            {status ? <div className="login-status">{status}</div> : null}
            <div className="wizard-actions">
              <button
                className="login-submit"
                type="button"
                onClick={handleSaveToken}
                disabled={loading || !tokenName.trim() || !tokenValue.trim()}
              >
                {loading ? <span className="login-spinner" /> : "Verify & Save"}
              </button>
            </div>
          </div>
        ) : null}

        {step === "zone" ? (
          <div className="wizard-panel">
            <div className="wizard-block">
              <h2>Select a zone</h2>
              <p>Pick the zone you want to monitor first.</p>
            </div>
            <label className="login-field">
              <span>Zone</span>
              <div className="login-input">
                <Globe size={16} />
                <select
                  value={selectedZoneId}
                  onChange={(event) => setSelectedZoneId(event.target.value)}
                >
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name} ({zone.tokenName})
                    </option>
                  ))}
                </select>
              </div>
            </label>
            {status ? <div className="login-status">{status}</div> : null}
            <div className="wizard-actions">
              <button className="ghost" type="button" onClick={() => setStep("token")}
                disabled={loading}
              >
                Back
              </button>
              <button
                className="login-submit"
                type="button"
                onClick={handleSelectZone}
                disabled={loading || !selectedZoneId}
              >
                {loading ? <span className="login-spinner" /> : "Continue"}
              </button>
            </div>
          </div>
        ) : null}

        {step === "record" ? (
          <div className="wizard-panel">
            <div className="wizard-block">
              <h2>Select a DNS record</h2>
              <p>Pick the A record you want to keep synced with your public IP.</p>
            </div>
            <label className="login-field">
              <span>Record</span>
              <div className="login-input">
                <ListChecks size={16} />
                <select
                  value={selectedRecordId}
                  onChange={(event) => setSelectedRecordId(event.target.value)}
                >
                  {recordOptions.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.name} ({record.type})
                    </option>
                  ))}
                </select>
              </div>
            </label>
            {records.length === 0 ? (
              <div className="login-status">No records available for this zone.</div>
            ) : null}
            {records.length > 0 && recordOptions.length === 0 ? (
              <div className="login-status">
                No A records found. Toggle &quot;Show all records&quot; to select another type.
              </div>
            ) : null}
            <label className="wizard-toggle">
              <input
                type="checkbox"
                checked={showAllRecords}
                onChange={(event) => setShowAllRecords(event.target.checked)}
              />
              <span>Show all record types</span>
            </label>
            {status ? <div className="login-status">{status}</div> : null}
            <div className="wizard-actions">
              <button className="ghost" type="button" onClick={() => setStep("zone")}
                disabled={loading}
              >
                Back
              </button>
              <button
                className="login-submit"
                type="button"
                onClick={handleFinish}
                disabled={loading || !selectedRecordId}
              >
                {loading ? <span className="login-spinner" /> : "Finish setup"}
              </button>
            </div>
          </div>
        ) : null}

        {step === "done" ? (
          <div className="wizard-panel">
            <div className="wizard-block">
              <h2>Setup complete</h2>
              <p>Redirecting you to the dashboard...</p>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
