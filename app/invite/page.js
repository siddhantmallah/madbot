"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "../providers/AuthProvider";

/**
 * Where an invitation email lands. Accepting needs a signed-in account whose
 * confirmed address is the one invited; the server checks all of it
 * (/api/orgs/invites/accept), this page only explains and asks.
 */
function Invite() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading, emailVerified, logOut, sendVerification, refreshUser } = useAuth();
  const [state, setState] = useState({ busy: false, error: null });

  const orgId = params.get("org") || "";
  const inviteId = params.get("invite") || "";
  const token = params.get("token") || "";
  const complete = orgId && inviteId && token;
  const here = `/invite?${new URLSearchParams({ org: orgId, invite: inviteId, token }).toString()}`;
  const loginHref = `/login?next=${encodeURIComponent(here)}`;

  async function accept() {
    setState({ busy: true, error: null });
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/orgs/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, orgId, inviteId, token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setState({ busy: false, error: data.error || "That didn't work. Try again." });
        return;
      }
      router.replace("/dashboard");
    } catch {
      setState({ busy: false, error: "Couldn't reach the server. Check your connection and try again." });
    }
  }

  async function resend() {
    setState({ busy: true, error: null, sent: false });
    try {
      await sendVerification();
      setState({ busy: false, error: null, sent: true });
    } catch (err) {
      setState({ busy: false, error: err.message, sent: false });
    }
  }

  let body;
  if (!complete) {
    body = <p style={{ margin: 0 }}>This invitation link is incomplete. Open it again from the email, or ask whoever invited you for a new one.</p>;
  } else if (loading) {
    body = <p style={{ margin: 0 }}>Checking whether you&apos;re signed in…</p>;
  } else if (!user) {
    body = (
      <>
        <p style={{ margin: 0 }}>Sign in, or create an account, with the email address the invitation was sent to. You&apos;ll come straight back here.</p>
        <Link href={loginHref} className="btn btn-primary" style={{ color: "var(--on-accent)", alignSelf: "flex-start" }}>
          Sign in to accept
        </Link>
      </>
    );
  } else if (!emailVerified) {
    body = (
      <>
        <p style={{ margin: 0 }}>Confirm your email address ({user.email}) first, from the link in the email we sent. Then come back here and press &ldquo;I&apos;ve confirmed it&rdquo;.</p>
        {state.error ? (
          <p role="alert" style={{ margin: 0, color: "var(--color-accent-800)" }}>
            {state.error}
          </p>
        ) : null}
        {state.sent ? <p role="status" style={{ margin: 0 }}>Sent. Check your inbox, and the spam folder.</p> : null}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" style={{ color: "var(--on-accent)" }} onClick={() => refreshUser()} disabled={state.busy}>
            I&apos;ve confirmed it
          </button>
          <button type="button" className="btn btn-secondary" onClick={resend} disabled={state.busy}>
            {state.busy ? "Sending…" : "Send the email again"}
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <p style={{ margin: 0 }}>
          You&apos;re signed in as <b>{user.email}</b>. Accepting adds you to the organisation; your own workspace stays as it is, and you can switch between them from the dashboard.
        </p>
        {state.error ? (
          <p role="alert" style={{ margin: 0, color: "var(--color-accent-800)" }}>
            {state.error}
          </p>
        ) : null}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" style={{ color: "var(--on-accent)" }} onClick={accept} disabled={state.busy}>
            {state.busy ? "Accepting…" : "Accept the invitation"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => logOut().then(() => router.replace(loginHref))} disabled={state.busy}>
            Use a different account
          </button>
        </div>
      </>
    );
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "var(--color-bg)", color: "var(--color-text)" }}>
      <div className="card" style={{ maxWidth: 520, width: "100%", padding: 28, gap: 14, lineHeight: 1.6 }}>
        <span className="card-kicker">Invitation</span>
        <h1 style={{ margin: 0, fontSize: 26 }}>Join an organisation on MADBOT</h1>
        {body}
      </div>
    </main>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={null}>
      <Invite />
    </Suspense>
  );
}
