"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const TICKER_LINES = [
  'Published "SSL expiry alerts: the 2026 guide" — 1,840 words',
  "Fixed 11 missing meta descriptions and 3 orphan pages",
  '"ssl expiry alert tool" entered the top 10 — #7 from nowhere',
  "Scored 43 orgs with certs expiring inside 30 days",
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("priya@certnotify.com");
  const [pass, setPass] = useState("••••••••••");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % TICKER_LINES.length), 3400);
    return () => clearInterval(id);
  }, []);

  function signIn(e) {
    e.preventDefault();
    setBusy(true);
    setTimeout(() => router.push("/dashboard"), 620);
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
          <span style={{ position: "relative", width: 30, height: 30, borderRadius: "50%", border: "1.8px solid #E4EC1B", display: "grid", placeItems: "center", flex: "none" }}>
            <span style={{ width: 13, height: 13, border: "1.8px solid #E4EC1B", transform: "rotate(45deg)", display: "block" }} />
          </span>
          <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 22, letterSpacing: "-.005em", color: "#fff" }}>madbot</span>
        </Link>
        <div style={{ position: "relative", maxWidth: "26em", animation: "fadeUp .7s cubic-bezier(.22,.75,.3,1) both" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 34, lineHeight: 1.1 }}>It kept working while you were away.</h2>
          <p style={{ margin: "0 0 22px", fontSize: 15, lineHeight: 1.6, color: "rgba(255,255,255,.78)" }}>
            Since your last sign-in: 112 actions, 24 pages indexed, 43 prospects scored, and two things waiting on a
            human.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 16px", border: "1px solid var(--color-divider)", borderRadius: 999, background: "rgba(10,8,16,.72)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-accent)", flex: "none", animation: "softPulse 2.4s ease-in-out infinite" }} />
            <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.55)", flex: "none" }}>Live now</span>
            <span key={tick} style={{ fontSize: 13, color: "rgba(255,255,255,.82)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", animation: "revealFade .45s ease" }}>
              {TICKER_LINES[tick]}
            </span>
          </div>
        </div>
        <p style={{ position: "relative", margin: 0, fontSize: 12.5, color: "rgba(255,255,255,.35)" }}>
          madbot.com · autonomous website marketing
        </p>
      </section>

      <section style={{ display: "grid", placeItems: "center", padding: "40px 32px" }}>
        <div style={{ width: "min(420px,100%)", animation: "fadeUp .6s cubic-bezier(.22,.75,.3,1) both" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 38, lineHeight: 1.08 }}>Welcome back</h1>
          <p style={{ margin: "0 0 26px", fontSize: 15, color: "rgba(255,255,255,.55)" }}>Sign in and see what it did this week.</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => router.push("/dashboard")}
              style={{ minHeight: 48, fontWeight: 600, fontSize: 14.5, color: "#fff", borderColor: "var(--color-divider)", background: "rgba(255,255,255,.04)" }}
            >
              <span style={{ width: 18, height: 18, borderRadius: "50%", background: "linear-gradient(135deg,#FF6A1A,#A855F7)", display: "block", flex: "none" }} />
              Continue with Google
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => router.push("/dashboard")}
              style={{ minHeight: 48, fontWeight: 600, fontSize: 14.5, color: "#fff", borderColor: "var(--color-divider)", background: "rgba(255,255,255,.04)" }}
            >
              <span style={{ width: 18, height: 18, borderRadius: 4, background: "var(--color-neutral-400)", display: "block", flex: "none" }} />
              Continue with GitHub
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
            <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,.35)" }}>or with email</span>
            <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
          </div>

          <form onSubmit={signIn} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="field">
              <label htmlFor="lg-email" style={{ color: "rgba(255,255,255,.6)" }}>Work email</label>
              <input
                className="input"
                id="lg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                style={{ minHeight: 50, fontSize: 15, background: "var(--color-surface)", color: "#fff", borderColor: "var(--color-divider)" }}
              />
            </div>
            <div className="field">
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <label htmlFor="lg-pass" style={{ color: "rgba(255,255,255,.6)" }}>Password</label>
                <a href="#forgot" style={{ marginLeft: "auto", fontSize: 12, marginBottom: 5 }}>Forgot it?</a>
              </div>
              <input
                className="input"
                id="lg-pass"
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••••"
                style={{ minHeight: 50, fontSize: 15, background: "var(--color-surface)", color: "#fff", borderColor: "var(--color-divider)" }}
              />
            </div>
            <label className="radio" style={{ gap: 10, color: "rgba(255,255,255,.65)", fontSize: 13.5 }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={() => setRemember((r) => !r)}
                style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 6,
                  border: `1.5px solid ${remember ? "var(--color-accent)" : "rgba(255,255,255,.35)"}`,
                  background: remember ? "var(--color-accent)" : "transparent",
                  flex: "none",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 11,
                  color: "#0A0810",
                  fontWeight: 800,
                }}
              >
                {remember ? "✓" : ""}
              </span>
              Keep me signed in on this device
            </label>
            <button className="btn btn-primary" type="submit" style={{ minHeight: 52, fontSize: 16, color: "#0A0810" }}>
              {busy ? "Waking the engine…" : "Sign in"}
            </button>
          </form>

          <div style={{ marginTop: 18, padding: "14px 16px", border: "1px dashed var(--color-accent-400)", borderRadius: 22, background: "var(--color-accent-100)" }}>
            <div style={{ fontSize: 12.5, color: "var(--color-accent-800)", marginBottom: 8 }}>
              Showing this to someone? Skip the credentials.
            </div>
            <Link className="btn btn-primary" href="/dashboard" style={{ minHeight: 42, fontSize: 14, color: "#0A0810", width: "100%" }}>
              Open the demo dashboard
            </Link>
          </div>

          <p style={{ margin: "22px 0 0", fontSize: 13.5, color: "rgba(255,255,255,.5)" }}>
            No account yet? <Link href="/">Connect a site free</Link> — it audits before it asks for anything.
          </p>
        </div>
      </section>
    </div>
  );
}
