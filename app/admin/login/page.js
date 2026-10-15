"use client";

import { useEffect, useState } from "react";
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { auth, githubProvider, googleProvider } from "../../../lib/firebase";

/**
 * The console's door. Three steps, each refused on the server if skipped:
 *
 *   1. a fresh sign-in (a Firebase session cookie can only be made from one
 *      less than five minutes old), so someone at an unlocked laptop that is
 *      still signed in to MADBOT doesn't walk straight in;
 *   2. the first time only: adding the console to an authenticator app;
 *   3. the six-digit code from that app.
 */
export default function AdminLogin() {
  const [user, setUser] = useState(undefined);
  const [step, setStep] = useState("identify"); // identify | code | enroll
  const [enrolment, setEnrolment] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);

  const usesPassword = !!user?.providerData?.some((p) => p.providerId === "password");
  const usesGoogle = !!user?.providerData?.some((p) => p.providerId === "google.com");

  async function start(fresh) {
    const idToken = await fresh.getIdToken(true);
    const res = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 404) throw new Error("This account doesn't have access to the console.");
    if (!res.ok) throw new Error(data.error || "Couldn't start signing in.");
    if (data.step === "enroll") setEnrolment({ secret: data.secret, otpauth: data.otpauth, qrSvg: data.qrSvg || null });
    setStep(data.step);
  }

  async function confirmIdentity(how) {
    setError("");
    setBusy(true);
    try {
      let cred;
      if (user) {
        if (how === "password") cred = await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
        else cred = await reauthenticateWithPopup(user, how === "github" ? githubProvider : googleProvider);
      } else if (how === "password") {
        cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        cred = await signInWithPopup(auth, how === "github" ? githubProvider : googleProvider);
      }
      setPassword("");
      await start(cred.user);
    } catch (err) {
      setError(
        err?.code === "auth/invalid-credential" || err?.code === "auth/wrong-password"
          ? "That password isn't right."
          : err?.code === "auth/popup-closed-by-user"
          ? "The sign-in window was closed before it finished."
          : err?.message || "Couldn't sign in."
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, code: code.replace(/\s/g, "") }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That code wasn't accepted.");
      window.location.assign("/admin");
    } catch (err) {
      setError(err.message);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="adm" style={{ display: "grid", placeItems: "center", padding: 16 }}>
      <div className="adm-dialog" style={{ width: "min(440px, 100%)", gap: 14 }}>
        <span className="mono">Platform console</span>
        <h1 style={{ margin: 0, fontSize: 22 }}>
          {step === "identify" ? "Confirm it's you" : step === "enroll" ? "Set up your authenticator" : "Enter your code"}
        </h1>

        {error ? (
          <p role="alert" className="adm-error" style={{ margin: 0 }}>
            {error}
          </p>
        ) : null}

        {step === "identify" && user === undefined ? <p className="adm-note">Checking who&apos;s signed in…</p> : null}

        {step === "identify" && user !== undefined ? (
          <>
            <p className="adm-note" style={{ fontSize: 14 }}>
              {user ? (
                <>
                  Signed in as <b>{user.email}</b>. The console needs a fresh sign-in, so confirm it&apos;s you.
                </>
              ) : (
                "Sign in with the account that has console access."
              )}
            </p>
            {!user || usesPassword ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  confirmIdentity("password");
                }}
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {!user ? (
                  <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 13 }}>
                    Email
                    <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </label>
                ) : null}
                <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 13 }}>
                  Password
                  <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
                <button className="btn btn-primary" type="submit" disabled={busy} style={{ color: "var(--on-accent)" }}>
                  {busy ? "Checking…" : "Continue"}
                </button>
              </form>
            ) : null}
            {!user || usesGoogle ? (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => confirmIdentity("google")}>
                Continue with Google
              </button>
            ) : null}
            {!user || user.providerData.some((p) => p.providerId === "github.com") ? (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => confirmIdentity("github")}>
                Continue with GitHub
              </button>
            ) : null}
          </>
        ) : null}

        {step === "enroll" && enrolment ? (
          <>
            <p className="adm-note" style={{ fontSize: 14 }}>
              The console needs a second factor. Scan this with an authenticator app (Google Authenticator, Microsoft
              Authenticator, 1Password, Authy), then enter the six-digit code it shows.
            </p>
            {enrolment.qrSvg ? (
              // Our own server drew this SVG from the otpauth URI (qrcode, in
              // /api/admin/session); nothing in it comes from user input.
              <div
                role="img"
                aria-label="QR code for your authenticator app"
                style={{ background: "#fff", padding: 10, borderRadius: 8, width: 220, maxWidth: "100%", alignSelf: "center", lineHeight: 0 }}
                dangerouslySetInnerHTML={{ __html: enrolment.qrSvg }}
              />
            ) : null}
            <div className="adm-card" style={{ margin: 0 }}>
              <span className="mono">Can&apos;t scan? Enter this setup key instead</span>
              <code style={{ fontSize: 16, letterSpacing: ".08em", overflowWrap: "anywhere" }}>{enrolment.secret.match(/.{1,4}/g).join(" ")}</code>
              <a href={enrolment.otpauth} style={{ fontSize: 13 }}>
                Open in an authenticator app on this device
              </a>
            </div>
            <p className="adm-note">This code and key are shown once, and stop working if you leave this page. Don&apos;t screenshot or share them. If you lose the app, another owner can reset it for you.</p>
          </>
        ) : null}

        {step === "code" || step === "enroll" ? (
          <form onSubmit={submitCode} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 13 }}>
              6-digit code
              <input
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                style={{ fontSize: 20, letterSpacing: ".2em" }}
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ color: "var(--on-accent)" }}>
              {busy ? "Checking…" : "Open the console"}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
