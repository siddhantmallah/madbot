"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../../providers/AuthProvider";

/**
 * The two things an account can be quietly missing, said out loud.
 *
 * Both used to be invisible. An unverified address meant the trial silently
 * never started, and a refused trial meant the plan badge said "Free" with no
 * explanation. Either one produces a customer who thinks the product is broken,
 * which is worse than the actual situation in both cases.
 *
 * Renders nothing when there is nothing to say.
 */
export default function AccountNotices() {
  const { user, sendVerification, refreshUser, trialStatus } = useAuth();
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [message, setMessage] = useState("");

  const needsVerification = !!user && !user.emailVerified && !!user.email;
  const trialRefused = trialStatus?.reason === "already-used";

  // Confirmation happens in a different tab, so this one has to ask. Cheap
  // (one Firebase read) and only while there is something to wait for.
  useEffect(() => {
    if (!needsVerification) return undefined;
    const id = setInterval(() => refreshUser(), 10000);
    return () => clearInterval(id);
  }, [needsVerification, refreshUser]);

  if (!needsVerification && !trialRefused) return null;

  async function resend() {
    setState("sending");
    setMessage("");
    try {
      const r = await sendVerification();
      setState("sent");
      setMessage(
        r?.sandboxSender
          ? "Sent, but the sending domain isn't verified yet so it will only reach the Resend account's own address."
          : "Sent. Check your inbox, and your spam folder."
      );
    } catch (err) {
      setState("error");
      setMessage(err.message || "Couldn't send it. Try again shortly.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
      {needsVerification ? (
        <div
          role="status"
          className="card"
          style={{ padding: "14px 16px", gap: 8, border: "1px solid var(--color-accent-400)", background: "var(--color-accent-100)" }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 320px", minWidth: 0 }}>
              <b style={{ fontSize: 14.5, color: "var(--color-accent-800)" }}>Confirm your email address</b>
              <p style={{ margin: "4px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "var(--color-accent-800)" }}>
                We sent a link to {user.email}. Your free trial starts once you open it. Until then this account is on
                the free plan.
              </p>
              {message ? (
                <p style={{ margin: "7px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "var(--color-accent-800)", opacity: 0.85 }}>{message}</p>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: "0 0 auto" }}>
              <button className="btn btn-secondary" type="button" onClick={() => refreshUser()} style={{ fontWeight: 600, minHeight: 38 }}>
                I&apos;ve confirmed it
              </button>
              <button className="btn btn-primary" type="button" onClick={resend} disabled={state === "sending"} style={{ color: "var(--on-accent)", minHeight: 38 }}>
                {state === "sending" ? "Sending…" : "Resend"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {trialRefused ? (
        <div
          role="status"
          className="card"
          style={{ padding: "14px 16px", gap: 6, border: "1px solid var(--color-divider)", background: "var(--wash-1)" }}
        >
          <b style={{ fontSize: 14.5 }}>No trial on this account</b>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--fg-60)" }}>
            A free trial has already been used for this email address, so this account is on the free plan. Everything
            that reports is still switched on. <Link href="/pricing" style={{ color: "var(--color-accent)" }}>See the plans</Link> if you
            want the rest.
          </p>
        </div>
      ) : null}
    </div>
  );
}
