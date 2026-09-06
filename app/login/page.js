"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "../providers/AuthProvider";
import { GoogleMark, GithubMark, MadbotMark } from "../components/Brand";
import ThemeToggle from "../components/ThemeToggle";

// The same live graph as the landing hero, client-only for the same reason.
const HeroScene = dynamic(() => import("../components/HeroScene"), { ssr: false });

const PREVIEW_LINES = [
  "Finds the pages you should have and don't",
  "Marks up schema so answer engines can cite you",
  "Lists you in the directories buyers check",
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

/**
 * Sign-in.
 *
 * The previous version was a two-column template: a dimmed still image on the
 * left, a small form floating in the right half. At a wide viewport that meant
 * a 420px card marooned in a thousand pixels of black. This is the landing
 * hero's stage — the live graph full-bleed, a display-scale headline on the
 * left — with the form as a hard-edged panel pinned to the right column, so it
 * has a definite place at every width rather than drifting toward the centre.
 */
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

  const inputStyle = { minHeight: 50, fontSize: 15, background: "var(--color-bg)", color: "var(--fg)", borderColor: "var(--color-divider)" };

  return (
    <div className="marketing auth-stage dark-stage grain" data-hero-zone style={{ fontSize: 16 }}>
      <div className="hero-grid" aria-hidden="true" />
      <HeroScene className="hero-scene">
        <img
          src="/opportunity-graph.png"
          alt=""
          aria-hidden="true"
          width={1600}
          height={1600}
          style={{ position: "absolute", left: "50%", top: "50%", width: "70%", maxWidth: 1000, height: "auto", transform: "translate(-60%,-50%)", opacity: 0.45, pointerEvents: "none" }}
        />
      </HeroScene>
      <div className="auth-vignette" aria-hidden="true" />

      {/* Left: the pitch, at the scale of the landing hero. */}
      <section className="auth-aside" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 40, padding: "clamp(22px, 3vw, 40px) clamp(20px, 3.2vw, 48px)" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--fg)", width: "max-content" }}>
          <MadbotMark size={30} />
          <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 22, letterSpacing: "-.005em", color: "var(--fg)" }}>madbot</span>
        </Link>

        <div style={{ maxWidth: "min(720px, 100%)", animation: "fadeUp .7s cubic-bezier(.22,.75,.3,1) both" }}>
          <div className="kicker-row mono" style={{ marginBottom: 22 }}>
            <span>Autonomous website marketing</span>
            <span>{mode === "signup" ? "New account" : "Sign in"}</span>
          </div>
          <h2 className="display-xl" style={{ fontSize: "clamp(38px, 5.4vw, 88px)", maxWidth: "9.5em" }}>
            It keeps working
            <br />
            while you&apos;re away.
          </h2>
          <p style={{ margin: "24px 0 26px", maxWidth: "26em", fontSize: "clamp(15px, 1.2vw, 17px)", lineHeight: 1.6, color: "var(--fg-80)" }}>
            Connect a site once. From then on, this is what a normal week looks like.
          </p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 11, maxWidth: "100%", padding: "11px 15px", border: "1px solid var(--color-divider)", borderRadius: 6, background: "var(--scrim)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-accent)", flex: "none", animation: "softPulse 2.4s ease-in-out infinite" }} />
            <span className="mono" style={{ flex: "none" }}>For example</span>
            <span key={tick} style={{ fontSize: 13, color: "var(--fg-80)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, animation: "revealFade .45s ease" }}>
              {PREVIEW_LINES[tick]}
            </span>
          </div>
        </div>

        <p className="mono" style={{ margin: 0 }}>getmadbot.com</p>
      </section>

      {/* Right: the form, in a hard-edged panel with a definite width. */}
      <section className="auth-form" style={{ display: "grid", alignItems: "center", padding: "clamp(22px, 3vw, 40px) clamp(20px, 3.2vw, 48px)" }}>
        <div className="card hard elev-lg" style={{ width: "100%", maxWidth: 480, marginInline: "auto", padding: "clamp(24px, 3vw, 36px)", gap: 0, animation: "fadeUp .6s cubic-bezier(.22,.75,.3,1) both" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <span className="mono">{mode === "signup" ? "01 — Create account" : "01 — Sign in"}</span>
            <ThemeToggle compact />
          </div>
          <h1 style={{ margin: "0 0 8px", fontSize: "clamp(30px, 2.6vw, 38px)", lineHeight: 1.06 }}>
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p style={{ margin: "0 0 24px", fontSize: 14.5, lineHeight: 1.55, color: "var(--fg-60)" }}>
            {mode === "signup"
              ? plan
                ? `Setting you up on the ${plan} plan. No card required — checkout isn't live yet.`
                : "Takes about a minute. No card required."
              : "Sign in and pick up where you left off."}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 20 }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => handleOAuth("google")}
              style={{ minHeight: 48, fontWeight: 600, fontSize: 14.5, color: "var(--fg)", borderColor: "var(--color-divider)", background: "var(--wash-1)" }}
            >
              <GoogleMark />
              Continue with Google
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => handleOAuth("github")}
              style={{ minHeight: 48, fontWeight: 600, fontSize: 14.5, color: "var(--fg)", borderColor: "var(--color-divider)", background: "var(--wash-1)" }}
            >
              <GithubMark />
              Continue with GitHub
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
            <span className="mono">or with email</span>
            <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {mode === "signup" && (
              <div className="field">
                <label htmlFor="lg-name" className="mono" style={{ display: "block", marginBottom: 6 }}>Your name</label>
                <input className="input" id="lg-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Raman" style={inputStyle} />
              </div>
            )}
            <div className="field">
              <label htmlFor="lg-email" className="mono" style={{ display: "block", marginBottom: 6 }}>Work email</label>
              <input
                className="input"
                id="lg-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                style={inputStyle}
              />
            </div>
            <div className="field">
              <label htmlFor="lg-pass" className="mono" style={{ display: "block", marginBottom: 6 }}>Password</label>
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
                style={inputStyle}
              />
            </div>

            {error ? (
              <div style={{ fontSize: 13, color: "var(--color-accent-800)", background: "var(--color-accent-100)", borderRadius: 6, padding: "10px 14px" }}>
                {error}
              </div>
            ) : null}

            <button className="btn btn-primary" type="submit" disabled={busy} style={{ minHeight: 52, fontSize: 16, color: "var(--on-accent)", marginTop: 4 }}>
              {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>

          <p style={{ margin: "20px 0 0", fontSize: 13.5, color: "var(--fg-45)" }}>
            {mode === "signup" ? (
              <>Already have an account? <button type="button" className="btn btn-ghost" style={{ fontSize: "inherit", padding: 0, color: "var(--color-accent)" }} onClick={() => setMode("signin")}>Sign in</button></>
            ) : (
              <>No account yet? <button type="button" className="btn btn-ghost" style={{ fontSize: "inherit", padding: 0, color: "var(--color-accent)" }} onClick={() => setMode("signup")}>Create one free</button></>
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
