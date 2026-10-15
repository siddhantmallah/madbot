"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { applyActionCode } from "firebase/auth";
import { auth } from "../../../lib/firebase";
import { useAuth } from "../../providers/AuthProvider";

const MESSAGES = {
  "auth/expired-action-code": "This link has expired. Send yourself a new one from the dashboard.",
  "auth/invalid-action-code": "This link has already been used, or a newer one replaced it. If your address isn't confirmed yet, send a new link from the dashboard.",
  "auth/user-disabled": "This account has been suspended.",
  "auth/user-not-found": "The account this link was for no longer exists.",
};

/**
 * Where the confirm-your-email link lands. It used to go to Firebase's own
 * page on madbot-256aa.firebaseapp.com; a mail from getmadbot.com whose button
 * leads to another domain is a spam signal, and those mails were landing in
 * spam. The link carries Firebase's one-time code, applied here.
 */
function Action() {
  const params = useSearchParams();
  const { user, refreshUser } = useAuth();
  const mode = params.get("mode");
  const oobCode = params.get("oobCode");
  const known = mode === "verifyEmail" && !!oobCode;
  const [state, setState] = useState({ status: known ? "working" : "bad", error: null });
  const ran = useRef(false);

  useEffect(() => {
    // A code works once. React may run effects twice in development, and a
    // second apply would report the first one's success as a failure.
    if (!known || ran.current) return;
    ran.current = true;
    applyActionCode(auth, oobCode)
      .then(() => setState({ status: "done", error: null }))
      .catch((err) => setState({ status: "failed", error: MESSAGES[err?.code] || "That link didn't work. Send a new one from the dashboard." }));
  }, [known, oobCode]);

  // Signed in on this device: pick up the change now, which also starts the
  // trial (AuthProvider.refreshUser), rather than on the dashboard's next poll.
  // Once: refreshUser hands back a new user object when the address flips to
  // confirmed, which re-runs this effect.
  const refreshed = useRef(false);
  useEffect(() => {
    if (state.status !== "done" || !user || refreshed.current) return;
    refreshed.current = true;
    refreshUser().catch(() => {});
  }, [state.status, user, refreshUser]);

  let title;
  let body;
  if (state.status === "working") {
    title = "Confirming your address…";
    body = <p style={{ margin: 0 }}>One moment.</p>;
  } else if (state.status === "done") {
    title = "Your email address is confirmed";
    body = (
      <>
        <p style={{ margin: 0 }}>{user ? "Your free trial starts now." : "Sign in to start your free trial."}</p>
        <Link href={user ? "/dashboard" : "/login"} className="btn btn-primary" style={{ color: "var(--on-accent)", alignSelf: "flex-start" }}>
          {user ? "Open the dashboard" : "Sign in"}
        </Link>
      </>
    );
  } else {
    title = "That link didn't work";
    body = (
      <>
        <p style={{ margin: 0 }}>{state.error || "This link is incomplete. Open it again from the email."}</p>
        <Link href="/dashboard" className="btn btn-secondary" style={{ alignSelf: "flex-start" }}>
          Go to the dashboard
        </Link>
      </>
    );
  }

  return (
    <main id="main" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "var(--color-bg)", color: "var(--color-text)" }}>
      <div className="card" role="status" aria-live="polite" style={{ maxWidth: 480, width: "100%", padding: 28, gap: 14, lineHeight: 1.6 }}>
        <span className="card-kicker">Your account</span>
        <h1 style={{ margin: 0, fontSize: 26 }}>{title}</h1>
        {body}
      </div>
    </main>
  );
}

export default function AuthActionPage() {
  return (
    <Suspense fallback={null}>
      <Action />
    </Suspense>
  );
}
