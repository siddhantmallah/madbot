"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../../providers/AuthProvider";

const CONFIRM_PHRASE = "DELETE MY ACCOUNT";

/**
 * The data rights, as buttons rather than as an email address.
 *
 * GDPR Article 15 and 17, India's DPDP sections 11 and 12, and the CPRA all
 * give a person the right to a copy of their data and to have it erased. Every
 * one of them is satisfiable by "write to us and wait a month", and every one
 * of them is better served by a button that works now. It also means the
 * Privacy Policy can point at something real instead of promising a process.
 *
 * Export is a POST whose response is saved as a file. It used to be a link
 * with the ID token in the query string, which put a live credential into
 * browser history and the hosting provider's request logs, and sent anyone
 * whose export failed to a page of raw JSON.
 */
export default function AccountData() {
  const { user, logOut } = useAuth();
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reauth, setReauth] = useState(false);
  const [done, setDone] = useState(null);

  async function handleExport() {
    setError("");
    setExporting(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/privacy/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't prepare the export. Try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `madbot-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("Couldn't prepare the export. Try again.");
    } finally {
      setExporting(false);
    }
  }

  async function signInAgain() {
    await logOut().catch(() => {});
    router.replace("/login");
  }

  async function handleDelete() {
    setError("");
    setBusy(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/privacy/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, confirm }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        // Deleting needs a fresh sign-in, so a token lifted from an open laptop
        // can't erase the account. Say so and offer the way through.
        setReauth(data.code === "reauth_required");
        setError(
          data.code === "reauth_required"
            ? "Deleting your account needs a fresh sign-in. Sign in again, then come back here within ten minutes."
            : data.error || "The account could not be deleted."
        );
        setBusy(false);
        return;
      }
      setDone(data);
      // The Firebase account is gone, so the session is meaningless now.
      setTimeout(() => logOut().catch(() => {}), 4000);
    } catch (err) {
      setError(String(err?.message || err));
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="card" style={{ padding: 20, gap: 10 }}>
        <span className="card-kicker">Account deleted</span>
        <h3 style={{ margin: 0, fontSize: 19 }}>That&apos;s done.</h3>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--fg-60)" }}>
          {done.deleted.sites} {done.deleted.sites === 1 ? "site" : "sites"} and everything in them, your billing
          history and your sign-in account have all been removed. {done.note}
        </p>
        <ul style={{ margin: "4px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {done.retained.map((r) => (
            <li key={r.what} style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--fg-45)" }}>
              <b style={{ color: "var(--fg-60)" }}>Kept:</b> {r.what}. {r.why}
            </li>
          ))}
        </ul>
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--fg-45)" }}>Signing you out.</p>
      </section>
    );
  }

  return (
    <section className="card" style={{ padding: 20, gap: 12 }}>
      <span className="card-kicker">Your data</span>
      <h3 style={{ margin: 0, fontSize: 19 }}>Take it with you, or take it away</h3>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--fg-60)" }}>
        You can download everything MADBOT holds about this account, or delete the whole thing. Both happen
        immediately. The{" "}
        <Link href="/legal/privacy" style={{ color: "var(--accent-ink)" }}>Privacy Policy</Link> explains what the
        export leaves out and the two things that survive a deletion.
      </p>

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", paddingTop: 2 }}>
        <button className="btn btn-secondary" type="button" onClick={handleExport} disabled={exporting} style={{ fontWeight: 600 }}>
          {exporting ? "Preparing…" : "Download my data"}
        </button>
        {!armed ? (
          <button className="btn btn-ghost" type="button" onClick={() => setArmed(true)} style={{ color: "var(--accent-ink)" }}>
            Delete my account
          </button>
        ) : null}
      </div>

      {armed ? (
        <div style={{ marginTop: 4, padding: "14px 16px", borderRadius: 6, border: "1px solid var(--color-accent-400)", background: "var(--color-accent-100)", display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--color-accent-800)" }}>
            This deletes every site, every lead, every draft and your sign-in account. It cannot be undone and there is
            no grace period. Download your data first if you want a copy.
          </p>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="mono">Type {CONFIRM_PHRASE} to confirm</span>
            <input
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              autoComplete="off"
              spellCheck={false}
              style={{ minHeight: 44 }}
            />
          </label>
          {error ? <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--color-accent-800)" }}>{error}</p> : null}
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            {reauth ? (
              <button className="btn btn-secondary" type="button" onClick={signInAgain}>
                Sign in again
              </button>
            ) : null}
            <button
              className="btn btn-primary"
              type="button"
              onClick={handleDelete}
              disabled={busy || confirm.trim().toUpperCase() !== CONFIRM_PHRASE}
              style={{ color: "var(--on-accent)", opacity: busy || confirm.trim().toUpperCase() !== CONFIRM_PHRASE ? 0.5 : 1 }}
            >
              {busy ? "Deleting…" : "Delete everything"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => { setArmed(false); setConfirm(""); setError(""); }} style={{ color: "var(--fg-60)" }}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error && !armed ? <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--accent-ink)" }}>{error}</p> : null}
    </section>
  );
}
