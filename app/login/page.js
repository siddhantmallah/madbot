"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "../providers/AuthProvider";
import { GoogleMark, GithubMark, MadbotMark } from "../components/Brand";
import ThemeToggle from "../components/ThemeToggle";
import { MIN_LENGTH, checkRules, isAcceptable, strength } from "../../lib/password";

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
  if (code === "madbot/weak-password") return err.message;
  if (code.includes("email-already-in-use")) return "That email already has an account. Try signing in instead.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "Wrong email or password.";
  if (code.includes("too-many-requests")) return "Too many attempts. Wait a minute and try again.";
  if (code.includes("weak-password")) return `Use at least ${MIN_LENGTH} characters.`;
  if (code.includes("invalid-email")) return "That doesn't look like a valid email address.";
  if (code.includes("popup-closed-by-user")) return "Sign-in window closed before finishing.";
  if (code.includes("popup-blocked")) return "Your browser blocked the sign-in window. Allow popups and try again.";
  if (code.includes("network-request-failed")) return "Couldn't reach the server. Check your connection.";
  if (code.includes("account-exists-with-different-credential"))
    return "That email is already linked to a different sign-in method.";
  if (code.includes("unauthorized-domain"))
    return "This domain isn't authorised for sign-in yet. Add it in Firebase console, under Authentication, Settings, Authorized domains.";
  return err?.message || "Something went wrong. Try again.";
}

function EyeIcon({ off }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {off ? <path d="M3 3l18 18" /> : null}
    </svg>
  );
}

/**
 * A password input with a reveal toggle.
 *
 * The toggle is a real button rather than an icon with a click handler, so it
 * is reachable by keyboard and announces its state. Revealing is a genuine
 * accessibility feature: the alternative is people choosing shorter passwords
 * because long ones are hard to type blind.
 */
function PasswordField({ id, label, value, onChange, autoComplete, placeholder, describedBy }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id} className="mono" style={{ display: "block", marginBottom: 6 }}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          className="input"
          id={id}
          type={shown ? "text" : "password"}
          required
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-describedby={describedBy}
          style={{ minHeight: 50, fontSize: 15, background: "var(--color-bg)", color: "var(--fg)", borderColor: "var(--color-divider)", paddingRight: 46 }}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          title={shown ? "Hide password" : "Show password"}
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            width: 34,
            height: 34,
            display: "grid",
            placeItems: "center",
            borderRadius: 5,
            background: "transparent",
            border: "none",
            color: shown ? "var(--color-accent)" : "var(--fg-45)",
            cursor: "pointer",
          }}
        >
          <EyeIcon off={shown} />
        </button>
      </div>
    </div>
  );
}

/** The live rule list. Hidden until they start typing, so an empty form is not
 *  a wall of unmet conditions. */
function PasswordRules({ password, email, name, id }) {
  const rules = checkRules(password, { email, name });
  const s = strength(password, { email, name });
  if (!password) return null;
  return (
    <div id={id} style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: -4 }}>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            style={{
              height: 3,
              flex: 1,
              background: i <= s.score ? (s.score <= 1 ? "var(--color-accent)" : s.score === 2 ? "#E8A33D" : "var(--ok)") : "var(--wash-2)",
              transition: "background .2s",
            }}
          />
        ))}
        <span className="mono" style={{ marginLeft: 8, minWidth: "6em", textAlign: "right", color: "var(--fg-45)" }}>{s.label}</span>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "3px 12px" }}>
        {rules.map((r) => (
          <li key={r.id} style={{ display: "flex", gap: 7, alignItems: "flex-start", fontSize: 12, lineHeight: 1.45, color: r.ok ? "var(--fg-60)" : "var(--fg-45)" }}>
            <span aria-hidden="true" style={{ flex: "none", width: 12, color: r.ok ? "var(--ok)" : "var(--fg-32)" }}>{r.ok ? "✓" : "○"}</span>
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Sign in, sign up, reset a password, confirm an email address.
 *
 * One route rather than four, because from the visitor's side it is a single
 * decision, and bouncing between pages loses the plan or the site URL they
 * arrived carrying.
 */
function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading, signUp, logIn, logInWithGoogle, logInWithGithub, resetPassword, sendVerification, refreshUser } = useAuth();

  const [mode, setMode] = useState(params.get("mode") === "signup" ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tick, setTick] = useState(0);
  const [checking, setChecking] = useState(false);

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

  // An already-signed-in visitor goes straight through, unless they have just
  // signed up and still have an address to confirm.
  useEffect(() => {
    if (loading || !user) return;
    if (mode === "verify") return;
    router.replace(afterAuth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, router, mode]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % PREVIEW_LINES.length), 3400);
    return () => clearInterval(id);
  }, []);

  // Confirmation happens in another tab or on a phone, so this one has to keep
  // asking rather than wait to be told.
  useEffect(() => {
    if (mode !== "verify") return undefined;
    const id = setInterval(async () => {
      const ok = await refreshUser();
      if (ok) router.replace(afterAuth);
    }, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, afterAuth]);

  const signupReady = isAcceptable(pass, { email, name }) && confirm === pass && email.includes("@");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");

    if (mode === "reset") {
      setBusy(true);
      try {
        await resetPassword(email);
        setNotice(`If an account exists for ${email}, a reset link is on its way. Check your spam folder too.`);
      } catch (err) {
        setError(friendlyAuthError(err));
      }
      setBusy(false);
      return;
    }

    if (mode === "signup") {
      if (pass !== confirm) {
        setError("The two passwords don't match.");
        return;
      }
      if (!isAcceptable(pass, { email, name })) {
        setError("Please meet all the password requirements below.");
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        await signUp(email, pass, name, plan);
        // Confirming the address is what starts the trial, so stay here and
        // say so rather than dropping them into a dashboard that quietly does
        // less than they expect.
        setMode("verify");
        setBusy(false);
        return;
      }
      await logIn(email, pass);
      router.push(afterAuth);
    } catch (err) {
      setError(friendlyAuthError(err));
      setBusy(false);
    }
  }

  async function handleOAuth(provider) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await (provider === "google" ? logInWithGoogle(plan) : logInWithGithub(plan));
      router.push(afterAuth);
    } catch (err) {
      setError(friendlyAuthError(err));
      setBusy(false);
    }
  }

  async function handleResend() {
    setError("");
    setNotice("");
    try {
      const r = await sendVerification();
      setNotice(
        r?.sandboxSender
          ? "Sent. The sending domain isn't verified yet, so it will only reach the Resend account's own address."
          : "Sent. Give it a minute, and check your spam folder."
      );
    } catch (err) {
      setError(err.message || "Couldn't send it. Try again shortly.");
    }
  }

  async function handleCheckVerified() {
    setChecking(true);
    setError("");
    const ok = await refreshUser();
    setChecking(false);
    if (ok) router.replace(afterAuth);
    else setError("Not confirmed yet. Open the link in the email, then try again.");
  }

  const inputStyle = { minHeight: 50, fontSize: 15, background: "var(--color-bg)", color: "var(--fg)", borderColor: "var(--color-divider)" };

  const heading =
    mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : mode === "verify" ? "Confirm your email" : "Welcome back";
  const stepLabel =
    mode === "signup" ? "01 — Create account" : mode === "reset" ? "01 — Reset password" : mode === "verify" ? "02 — Confirm email" : "01 — Sign in";

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
            <span>{mode === "signup" ? "New account" : mode === "verify" ? "Almost there" : "Sign in"}</span>
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
            <span className="mono">{stepLabel}</span>
            <ThemeToggle compact />
          </div>
          <h1 style={{ margin: "0 0 8px", fontSize: "clamp(28px, 2.5vw, 36px)", lineHeight: 1.06 }}>{heading}</h1>

          {mode === "verify" ? (
            <>
              <p style={{ margin: "0 0 20px", fontSize: 14.5, lineHeight: 1.6, color: "var(--fg-60)" }}>
                We&apos;ve sent a link to <b style={{ color: "var(--fg)" }}>{email || user?.email}</b>. Open it and your
                account is ready. Confirming is also what starts your free trial, which is why we ask first.
              </p>
              {notice ? (
                <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--fg-80)", background: "var(--wash-2)", borderRadius: 6, padding: "10px 14px", marginBottom: 12 }}>{notice}</div>
              ) : null}
              {error ? (
                <div role="alert" style={{ fontSize: 13, lineHeight: 1.5, color: "var(--color-accent-800)", background: "var(--color-accent-100)", borderRadius: 6, padding: "10px 14px", marginBottom: 12 }}>{error}</div>
              ) : null}
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <button className="btn btn-primary" type="button" onClick={handleCheckVerified} disabled={checking} style={{ minHeight: 52, fontSize: 16, color: "var(--on-accent)" }}>
                  {checking ? "Checking…" : "I've confirmed it"}
                </button>
                <button className="btn btn-secondary" type="button" onClick={handleResend} style={{ minHeight: 46, fontWeight: 600, color: "var(--fg)", borderColor: "var(--color-divider)" }}>
                  Send it again
                </button>
              </div>
              <p style={{ margin: "18px 0 0", fontSize: 13, lineHeight: 1.55, color: "var(--fg-45)" }}>
                You can <Link href="/dashboard" style={{ color: "var(--color-accent)" }}>skip to the dashboard</Link> and
                confirm later. Your free trial stays switched off until you do.
              </p>
            </>
          ) : (
            <>
              <p style={{ margin: "0 0 24px", fontSize: 14.5, lineHeight: 1.55, color: "var(--fg-60)" }}>
                {mode === "signup"
                  ? plan
                    ? `Setting you up on the ${plan} plan. No card required, and checkout isn't live yet.`
                    : "Takes about a minute. No card required."
                  : mode === "reset"
                  ? "Type your email address and we'll send you a link to set a new password."
                  : "Sign in and pick up where you left off."}
              </p>

              {mode !== "reset" ? (
                <>
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
                </>
              ) : null}

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {mode === "signup" ? (
                  <div className="field">
                    <label htmlFor="lg-name" className="mono" style={{ display: "block", marginBottom: 6 }}>Your name</label>
                    <input className="input" id="lg-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Raman" autoComplete="name" style={inputStyle} />
                  </div>
                ) : null}

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

                {mode !== "reset" ? (
                  <PasswordField
                    id="lg-pass"
                    label="Password"
                    value={pass}
                    onChange={setPass}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    placeholder={mode === "signup" ? `At least ${MIN_LENGTH} characters` : "••••••••••"}
                    describedBy={mode === "signup" ? "pass-rules" : undefined}
                  />
                ) : null}

                {mode === "signup" ? (
                  <>
                    <PasswordRules id="pass-rules" password={pass} email={email} name={name} />
                    <PasswordField
                      id="lg-confirm"
                      label="Confirm password"
                      value={confirm}
                      onChange={setConfirm}
                      autoComplete="new-password"
                      placeholder="Type it once more"
                    />
                    {confirm && confirm !== pass ? (
                      <p style={{ margin: "-8px 0 0", fontSize: 12.5, color: "var(--color-accent)" }}>The two passwords don&apos;t match.</p>
                    ) : null}
                  </>
                ) : null}

                {notice ? (
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--fg-80)", background: "var(--wash-2)", borderRadius: 6, padding: "10px 14px" }}>{notice}</div>
                ) : null}
                {error ? (
                  <div role="alert" style={{ fontSize: 13, lineHeight: 1.5, color: "var(--color-accent-800)", background: "var(--color-accent-100)", borderRadius: 6, padding: "10px 14px" }}>
                    {error}
                  </div>
                ) : null}

                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={busy || (mode === "signup" && !signupReady)}
                  style={{ minHeight: 52, fontSize: 16, color: "var(--on-accent)", marginTop: 4, opacity: busy || (mode === "signup" && !signupReady) ? 0.55 : 1 }}
                >
                  {busy ? "Working…" : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
                </button>
              </form>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "20px 0 0", fontSize: 13.5, color: "var(--fg-45)" }}>
                {mode === "signin" ? (
                  <>
                    <p style={{ margin: 0 }}>
                      No account yet?{" "}
                      <button type="button" className="btn btn-ghost" style={{ fontSize: "inherit", padding: 0, minHeight: 0, color: "var(--color-accent)" }} onClick={() => { setMode("signup"); setError(""); setNotice(""); }}>
                        Create one free
                      </button>
                    </p>
                    <p style={{ margin: 0 }}>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: "inherit", padding: 0, minHeight: 0, color: "var(--fg-60)" }} onClick={() => { setMode("reset"); setError(""); setNotice(""); }}>
                        Forgotten your password?
                      </button>
                    </p>
                  </>
                ) : null}

                {mode === "signup" ? (
                  <>
                    <p style={{ margin: 0 }}>
                      Already have an account?{" "}
                      <button type="button" className="btn btn-ghost" style={{ fontSize: "inherit", padding: 0, minHeight: 0, color: "var(--color-accent)" }} onClick={() => { setMode("signin"); setError(""); setNotice(""); }}>
                        Sign in
                      </button>
                    </p>
                    <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "var(--fg-32)" }}>
                      By creating an account you agree to the{" "}
                      <Link href="/legal/terms" style={{ color: "var(--fg-60)" }}>Terms of Service</Link> and the{" "}
                      <Link href="/legal/privacy" style={{ color: "var(--fg-60)" }}>Privacy Policy</Link>.
                    </p>
                  </>
                ) : null}

                {mode === "reset" ? (
                  <p style={{ margin: 0 }}>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: "inherit", padding: 0, minHeight: 0, color: "var(--color-accent)" }} onClick={() => { setMode("signin"); setError(""); setNotice(""); }}>
                      Back to sign in
                    </button>
                  </p>
                ) : null}
              </div>
            </>
          )}
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
