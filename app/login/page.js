"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "../providers/AuthProvider";
import { GoogleMark, GithubMark, MadbotMark } from "../components/Brand";

const PREVIEW_LINES = [
  "Finds the pages you should have and don't",
  "Fixes the technical debt holding your rankings down",
  "Marks up schema so answer engines can cite you",
  "Scores companies who match your ideal customer",
];

function friendlyAuthError(err) {
  const code = err?.code || "";
  if (code.includes("email-already-in-use")) return "That email already has an account — try signing in instead.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "Wrong email or password.";
  if (code.includes("weak-password")) return "Use at least 6 characters for your password.";
  if (code.includes("invalid-email")) return "That doesn't look like a valid email address.";
  if (code.includes("popup-closed-by-user")) return "Sign-in window closed before finishing.";
  if (code.includes("account-exists-with-different-credential"))
    return "That email is already linked to a different sign-in method.";
  return err?.message || "Something went wrong. Try again.";
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading, signUp, logIn, logInWithGoogle, logInWithGithub } = useAuth();

  const [mode, setMode] = useState(params.get("mode") === "signup" ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  const incomingUrl = params.get("url");
  const next = params.get("next");
  const plan = params.get("plan");

  // Coming from the free report or a pricing button, the next stop is pricing.
  // Otherwise straight into the dashboard, carrying any site they typed.
  const dashboardDest = incomingUrl ? `/dashboard?url=${encodeURIComponent(incomingUrl)}` : "/dashboard";
  const afterAuth =
    next === "pricing"
      ? `/pricing${incomingUrl ? `?url=${encodeURIComponent(incomingUrl)}` : ""}`
      : dashboardDest;

  useEffect(() => {
    if (!loading && user) router.replace(afterAuth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, router]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % PREVIEW_LINES.length), 3400);
    return () => clearInterval(id);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUp(email, pass, name, plan);
      } else {
        await logIn(email, pass);
      }
      router.push(afterAuth);
    } catch (err) {
      setError(friendlyAuthError(err));
      setBusy(false);
    }
  }

  async function handleOAuth(provider) {
    setError("");
    setBusy(true);
    try {
      await (provider === "google" ? logInWithGoogle(plan) : logInWithGithub(plan));
      router.push(afterAuth);
    } catch (err) {
      setError(friendlyAuthError(err));
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) minmax(0,1.05fr)",
        background: "var(--color-bg)",
        fontSize: 16,
        overflow: "hidden",
      }}
    >
      <section
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "34px 40px",
          overflow: "hidden",
          borderRight: "1px solid var(--color-divider)",
        }}
      >
        <div aria-hidden="true" style={{ position: "absolute", left: "66%", top: "26%", width: 1080, height: 1080, transform: "translate(-50%,-50%)", pointerEvents: "none" }}>
          <img src="/opportunity-graph.png" width={1600} height={1600} alt="" style={{ width: "100%", height: "auto", opacity: 0.5 }} />
        </div>
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: "linear-gradient(to top right, rgba(10,8,16,.96) 0%, rgba(10,8,16,.86) 38%, rgba(10,8,16,.35) 68%, rgba(10,8,16,0) 92%)",
          }}
        />
        <Link href="/" style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "#fff", width: "max-content" }}>
          <MadbotMark size={30} />
          <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 22, letterSpacing: "-.005em", color: "#fff" }}>madbot</span>
        </Link>
        {/* The text column stays narrow for readability; the pill is a UI
            element, not body copy, so it gets room for its longest line rather
            than truncating one mid-sentence. */}
        <div style={{ position: "relative", maxWidth: "34em", animation: "fadeUp .7s cubic-bezier(.22,.75,.3,1) both" }}>
          <h2 style={{ margin: "0 0 12px", maxWidth: "22em", fontSize: 34, lineHeight: 1.1 }}>It keeps working while you&apos;re away.</h2>
          <p style={{ margin: "0 0 22px", maxWidth: "26em", fontSize: 15, lineHeight: 1.6, color: "rgba(255,255,255,.78)" }}>
            Connect a site once. From then on, this is what a normal week looks like.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 11, width: "max-content", maxWidth: "100%", padding: "12px 16px", border: "1px solid var(--color-divider)", borderRadius: 999, background: "rgba(10,8,16,.72)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-accent)", flex: "none", animation: "softPulse 2.4s ease-in-out infinite" }} />
            <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.55)", flex: "none" }}>For example</span>
            <span key={tick} style={{ fontSize: 13, color: "rgba(255,255,255,.82)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", animation: "revealFade .45s ease" }}>
              {PREVIEW_LINES[tick]}
            </span>
          </div>
        </div>
        <p style={{ position: "relative", margin: 0, fontSize: 12.5, color: "rgba(255,255,255,.35)" }}>
          getmadbot.com · autonomous website marketing
        </p>
      </section>

      <section style={{ display: "grid", placeItems: "center", padding: "40px 32px" }}>
        <div style={{ width: "min(420px,100%)", animation: "fadeUp .6s cubic-bezier(.22,.75,.3,1) both" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 38, lineHeight: 1.08 }}>
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p style={{ margin: "0 0 26px", fontSize: 15, color: "rgba(255,255,255,.55)" }}>
            {mode === "signup"
              ? plan
                ? `Setting you up on the ${plan} plan. No card required — checkout isn't live yet.`
                : "Takes about a minute. No card required."
              : "Sign in and pick up where you left off."}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => handleOAuth("google")}
              style={{ minHeight: 48, fontWeight: 600, fontSize: 14.5, color: "#fff", borderColor: "var(--color-divider)", background: "rgba(255,255,255,.04)" }}
            >
              <GoogleMark />
              Continue with Google
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => handleOAuth("github")}
              style={{ minHeight: 48, fontWeight: 600, fontSize: 14.5, color: "#fff", borderColor: "var(--color-divider)", background: "rgba(255,255,255,.04)" }}
            >
              <GithubMark />
              Continue with GitHub
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
            <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,.35)" }}>or with email</span>
            <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {mode === "signup" && (
              <div className="field">
                <label htmlFor="lg-name" style={{ color: "rgba(255,255,255,.6)" }}>Your name</label>
                <input
                  className="input"
                  id="lg-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Priya Raman"
                  style={{ minHeight: 50, fontSize: 15, background: "var(--color-surface)", color: "#fff", borderColor: "var(--color-divider)" }}
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="lg-email" style={{ color: "rgba(255,255,255,.6)" }}>Work email</label>
              <input
                className="input"
                id="lg-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                style={{ minHeight: 50, fontSize: 15, background: "var(--color-surface)", color: "#fff", borderColor: "var(--color-divider)" }}
              />
            </div>
            <div className="field">
              <label htmlFor="lg-pass" style={{ color: "rgba(255,255,255,.6)" }}>Password</label>
              <input
                className="input"
                id="lg-pass"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••••"
                style={{ minHeight: 50, fontSize: 15, background: "var(--color-surface)", color: "#fff", borderColor: "var(--color-divider)" }}
              />
            </div>

            {error ? (
              <div style={{ fontSize: 13, color: "var(--color-accent-700)", background: "var(--color-accent-100)", borderRadius: 14, padding: "10px 14px" }}>
                {error}
              </div>
            ) : null}

            <button className="btn btn-primary" type="submit" disabled={busy} style={{ minHeight: 52, fontSize: 16, color: "#0A0810" }}>
              {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>

          <p style={{ margin: "22px 0 0", fontSize: 13.5, color: "rgba(255,255,255,.5)" }}>
            {mode === "signup" ? (
              <>Already have an account? <button type="button" className="btn btn-ghost" style={{ fontSize: "inherit", padding: 0 }} onClick={() => setMode("signin")}>Sign in</button></>
            ) : (
              <>No account yet? <button type="button" className="btn btn-ghost" style={{ fontSize: "inherit", padding: 0 }} onClick={() => setMode("signup")}>Create one free</button></>
            )}
          </p>
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
