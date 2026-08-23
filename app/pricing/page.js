"use client";

import Link from "next/link";
import { useState } from "react";
import { MadbotMark } from "../components/Brand";

const PLANS = [
  {
    id: "scout",
    name: "Scout",
    price: 29,
    tagline: "One site, watch and suggest. It finds everything and hands you the plan.",
    features: ["Full opportunity map", "Technical audit, weekly", "Friday digest", "Watch and Suggest autonomy"],
    cta: "Start with Scout",
  },
  {
    id: "madbot",
    name: "MADBOT",
    price: 79,
    badge: "most people",
    featured: true,
    tagline: "One site, full autonomy up to Let it rip. It publishes, distributes and prospects.",
    features: [
      "Everything in Scout",
      "~30 actions a day",
      "Content, links and lead discovery",
      "AI visibility tracking",
      "Rollback and full audit trail",
    ],
    cta: "Get MADBOT",
  },
  {
    id: "swarm",
    name: "Swarm",
    price: 249,
    tagline: "Up to ten sites, Full send, standing budgets, one dashboard across all of them.",
    features: ["Everything in MADBOT", "Up to 10 sites", "Standing spend budgets", "Shared guardrails and voice"],
    cta: "Talk to us",
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const priceOf = (p) => (annual ? Math.round(p.price * 10) : p.price);

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", fontSize: 16 }}>
      <header style={{ borderBottom: "1px solid var(--color-divider)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "15px 28px", display: "flex", alignItems: "center", gap: 11 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 11, textDecoration: "none", color: "#fff" }}>
            <MadbotMark size={28} />
            <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 21, letterSpacing: "-.005em" }}>madbot</span>
          </Link>
          <Link href="/login" className="btn btn-secondary" style={{ marginLeft: "auto", fontWeight: 600, fontSize: 13.5, color: "#fff", borderColor: "var(--color-divider)" }}>
            Sign in
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "62px 28px 90px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <h1 style={{ margin: "0 0 12px", fontSize: "clamp(24px,9.3vw,50px)", lineHeight: 1.06 }}>Pay for the work, not the seats</h1>
          <p style={{ margin: "0 auto 24px", fontSize: 17, maxWidth: "34em", color: "rgba(255,255,255,.62)" }}>
            Every plan includes the whole engine. What changes is how much it&apos;s allowed to do each month, and how
            many sites it looks after.
          </p>
          <div className="seg" style={{ background: "var(--color-bg)" }}>
            <label className="seg-opt">
              <input type="radio" name="billing" checked={!annual} onChange={() => setAnnual(false)} />
              Monthly
            </label>
            <label className="seg-opt">
              <input type="radio" name="billing" checked={annual} onChange={() => setAnnual(true)} />
              Yearly — 2 months free
            </label>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 18, alignItems: "start" }}>
          {PLANS.map((p) => (
            <article
              key={p.id}
              className="card"
              style={{
                padding: 30,
                gap: 12,
                background: p.featured ? "linear-gradient(165deg, rgba(255,106,26,.16), var(--color-surface) 55%)" : "var(--color-surface)",
                border: `1px solid ${p.featured ? "var(--color-accent)" : "var(--color-divider)"}`,
                boxShadow: p.featured ? "0 0 60px rgba(255,106,26,.12)" : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 23 }}>{p.name}</h3>
                {p.badge ? (
                  <span className="tag" style={{ marginLeft: "auto", background: "var(--color-accent)", color: "#0A0810" }}>{p.badge}</span>
                ) : null}
              </div>
              <p style={{ margin: 0 }}>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(24px,7.8vw,42px)" }}>${priceOf(p)}</span>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,.5)" }}>{annual ? " /yr" : " /mo"}</span>
              </p>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "rgba(255,255,255,.62)" }}>{p.tagline}</p>
              <ul style={{ listStyle: "none", margin: "4px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 9, fontSize: 14 }}>
                {p.features.map((f) => (
                  <li key={f} style={{ display: "flex", gap: 9, color: "rgba(255,255,255,.8)" }}>
                    <span style={{ color: "var(--color-accent)", flex: "none" }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                className={p.featured ? "btn btn-primary btn-block" : "btn btn-secondary btn-block"}
                href={`/login?mode=signup&plan=${p.id}`}
                style={p.featured ? { color: "#0A0810" } : { fontWeight: 600, color: "#fff", borderColor: "var(--color-divider)" }}
              >
                {p.cta}
              </Link>
            </article>
          ))}
        </div>

        <div className="card" style={{ marginTop: 34, padding: 24, gap: 8, background: "var(--color-neutral-100)", border: "1px dashed var(--color-accent-400)" }}>
          <h4 style={{ margin: 0, fontSize: 17 }}>Checkout isn&apos;t connected yet</h4>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "rgba(255,255,255,.68)" }}>
            These buttons create an account so you can look around — they don&apos;t take payment, because no payment
            processor is wired up on this build. Nobody is charged anything today, and the prices above aren&apos;t
            final.
          </p>
        </div>

        <div style={{ marginTop: 46, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 14.5, color: "rgba(255,255,255,.6)" }}>
            Not sure yet? <Link href="/">Run the free report on your site</Link> — no account needed.
          </p>
        </div>
      </main>
    </div>
  );
}
