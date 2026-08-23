"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePageReveal } from "./components/useReveal";
import AuditModal from "./components/AuditModal";

// Illustrative examples of the kind of work the engine does — deliberately
// phrased as capability, not as a live feed of things happening right now.
const TICKER_LINES = [
  "Finds the pages you should have and don't",
  "Marks up your schema so answer engines can cite you",
  "Writes and ships the pages, then tracks what moved",
  "Spots the companies who have your problem this week",
  "Rolls any of it back in one click",
];

const FAQS = [
  {
    q: "Will it publish things to my site without asking?",
    a: "Only if you turn the dial that far. At Watch it changes nothing; at Let it rip it publishes but never spends; at Full send it spends inside your budget. Everything it does is reversible in one click.",
  },
  {
    q: "How is this different from an SEO tool?",
    a: "An SEO tool hands you a list of problems and a monthly bill. MADBOT does the work — ships the pages, fixes the debt, earns the links, finds the buyers — and then tells you what changed.",
  },
  {
    q: "What does it need from me to get started?",
    a: "A website address. No tags, no keyword research, no onboarding call. It reads the site, tells you what it thinks you sell, and you correct it if it's wrong — corrections teach it faster than forms do.",
  },
  {
    q: "How do I know it won't make things up about my product?",
    a: "You write guardrails in plain English — “never say we're SOC 2 certified”. Anything public-facing, anything with a price tag, and anything it's under 60% sure about goes to an approvals queue instead of going out.",
  },
  {
    q: "Can it get me cited by AI answer engines?",
    a: "That's an explicit target, not a side effect. It tracks your citation share across nine answer engines every week and writes the quotable, schema-marked pages those engines prefer to cite.",
  },
  {
    q: "What happens if I turn it off?",
    a: "Everything it made is yours and stays on your site. Export the audit trail on the way out, and roll back anything you'd rather undo.",
  },
];

function Ticker() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm) return;
    const id = setInterval(() => setI((v) => (v + 1) % TICKER_LINES.length), 3400);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      key={i}
      style={{
        fontSize: 13,
        color: "rgba(255,255,255,.82)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        animation: "revealFade .45s ease",
      }}
    >
      {TICKER_LINES[i]}
    </span>
  );
}

function Logo({ size = 30, ring = 1.8 }) {
  return (
    <span
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${ring}px solid #E4EC1B`,
        display: "grid",
        placeItems: "center",
        flex: "none",
      }}
    >
      <span
        style={{
          width: size * 0.43,
          height: size * 0.43,
          border: `${ring}px solid #E4EC1B`,
          transform: "rotate(45deg)",
          display: "block",
        }}
      />
    </span>
  );
}

function FaqItem({ q, a }) {
  return (
    <article>
      <h3 style={{ margin: "0 0 7px", fontSize: 21 }}>{q}</h3>
      <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.65, color: "rgba(255,255,255,.62)" }}>
        {a}
      </p>
    </article>
  );
}

export default function LandingPage() {
  const rootRef = usePageReveal();
  const [heroUrl, setHeroUrl] = useState("");
  const [auditUrl, setAuditUrl] = useState(null);

  // The free report runs before any account exists — that's the whole point of
  // it. Signing up is what happens after they've seen it's worth something.
  function handleStartSubmit(e) {
    e.preventDefault();
    const url = heroUrl.trim();
    if (!url) return;
    setAuditUrl(url);
  }

  return (
    <div ref={rootRef} style={{ minHeight: "100vh", fontSize: 16, overflowX: "hidden", background: "var(--color-bg)" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: "rgba(10,8,16,.82)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid var(--color-divider)",
        }}
      >
        <div className="nav" style={{ maxWidth: 1180, margin: "0 auto", padding: "15px 28px" }}>
          <span className="nav-brand" style={{ display: "flex", alignItems: "center", gap: 11, color: "#fff", marginRight: "auto" }}>
            <Logo />
            <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 22, letterSpacing: "-.005em", color: "#fff" }}>
              madbot
            </span>
          </span>
          <a href="#how">How it works</a>
          <a href="#does">What it does</a>
          <a href="#rope">Autonomy</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <Link className="btn btn-primary" href="/login" style={{ marginLeft: 6, color: "#0A0810" }}>
            Sign in
          </Link>
        </div>
        <div
          id="m-progress"
          aria-hidden="true"
          style={{
            height: 2,
            background: "linear-gradient(90deg,#FF6A1A,#A855F7)",
            transform: "scaleX(0)",
            transformOrigin: "left",
            transition: "transform .1s linear",
          }}
        />
      </header>

      <main>
        {/* HERO */}
        <section aria-labelledby="hero-h" style={{ position: "relative", overflow: "hidden" }}>
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              top: -120,
              width: 1100,
              height: 700,
              transform: "translateX(-30%)",
              background:
                "radial-gradient(50% 50% at 50% 50%, rgba(255,106,26,.16) 0%, rgba(168,85,247,.10) 45%, rgba(0,0,0,0) 72%)",
              pointerEvents: "none",
            }}
          />
          <div
            data-reveal
            data-stagger="85"
            style={{
              position: "relative",
              maxWidth: 1180,
              margin: "0 auto",
              padding: "72px 28px 70px",
              display: "grid",
              gridTemplateColumns: "minmax(0,1.02fr) minmax(0,.88fr)",
              gap: 44,
              alignItems: "center",
            }}
          >
            <div className="reveal">
              <span
                className="tag"
                style={{
                  background: "var(--color-accent-2-100)",
                  color: "var(--color-accent-2-800)",
                  border: "1px solid var(--color-accent-2-400)",
                  marginBottom: 20,
                }}
              >
                Autonomous website marketing
              </span>
              <h1 id="hero-h" style={{ margin: "0 0 18px", fontSize: 68, lineHeight: 1.02, letterSpacing: "-.02em" }}>
                Give it a website.
                <br />
                <span style={{ color: "var(--color-accent)" }}>It does the marketing.</span>
              </h1>
              <p style={{ margin: "0 0 28px", fontSize: 19, lineHeight: 1.55, maxWidth: "30em", color: "rgba(255,255,255,.66)" }}>
                MADBOT reads your site, finds the openings, writes and ships the pages, earns the links, spots the
                people who need you, and tells you exactly what it did. You keep a dial and a veto.
              </p>
              <form onSubmit={handleStartSubmit} style={{ display: "flex", gap: 10, maxWidth: 520, marginBottom: 14 }}>
                <label style={{ flex: 1 }}>
                  <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}>
                    Your website address
                  </span>
                  <input
                    className="input"
                    type="text"
                    inputMode="url"
                    autoComplete="off"
                    value={heroUrl}
                    onChange={(e) => setHeroUrl(e.target.value)}
                    placeholder="yourcompany.com"
                    style={{ minHeight: 54, fontSize: 16, background: "var(--color-surface)", color: "#fff", borderColor: "var(--color-divider)" }}
                  />
                </label>
                <button className="btn btn-primary" type="submit" style={{ minHeight: 54, paddingInline: 26, flex: "none", color: "#0A0810" }}>
                  Read my site free
                </button>
              </form>
              <p style={{ margin: "0 0 22px", fontSize: 13.5, color: "rgba(255,255,255,.45)" }}>
                A real report in about ten seconds. No account, no card, nothing touched.
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "12px 16px",
                  border: "1px solid var(--color-divider)",
                  borderRadius: 999,
                  maxWidth: 520,
                  background: "rgba(255,255,255,.03)",
                }}
              >
                <span style={{ position: "relative", width: 9, height: 9, flex: "none" }}>
                  <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--color-accent)", animation: "softPulse 2.4s ease-in-out infinite" }} />
                </span>
                <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.4)", flex: "none" }}>It does</span>
                <Ticker />
              </div>
              <dl style={{ display: "flex", gap: 38, margin: "34px 0 0", flexWrap: "wrap" }}>
                <div>
                  <dt style={{ fontSize: 11.5, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--color-accent)" }}>
                    The free report
                  </dt>
                  <dd style={{ margin: "5px 0 0", fontFamily: "var(--font-heading)", fontSize: 30 }}>No account</dd>
                </div>
                <div>
                  <dt style={{ fontSize: 11.5, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--color-accent-2-700)" }}>
                    Checks run live
                  </dt>
                  <dd style={{ margin: "5px 0 0", fontFamily: "var(--font-heading)", fontSize: 30 }}>20+</dd>
                </div>
                <div>
                  <dt style={{ fontSize: 11.5, letterSpacing: ".09em", textTransform: "uppercase", color: "rgba(255,255,255,.5)" }}>
                    Every action
                  </dt>
                  <dd style={{ margin: "5px 0 0", fontFamily: "var(--font-heading)", fontSize: 30 }}>Reversible</dd>
                </div>
              </dl>
            </div>
            <figure className="reveal" style={{ margin: 0, position: "relative", overflow: "visible" }}>
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: "150%",
                  height: "150%",
                  transform: "translate(-50%,-50%)",
                  background:
                    "radial-gradient(50% 50% at 50% 50%, rgba(255,106,26,.12) 0%, rgba(168,85,247,.09) 42%, rgba(0,0,0,0) 70%)",
                  pointerEvents: "none",
                }}
              />
              <img
                src="/opportunity-graph.png"
                width={1600}
                height={1600}
                alt="MADBOT's opportunity map: a glowing radial graph of scored growth opportunities around one site, the brightest routes already in progress"
                style={{ position: "relative", width: "124%", maxWidth: "none", height: "auto", margin: "-12%" }}
              />
              <figcaption style={{ position: "relative", marginTop: "-6%", paddingLeft: "6%", fontSize: 11.5, color: "rgba(255,255,255,.42)" }}>
                Every opening around one site, scored and ranked — the brightest paths first.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* CUSTOMERS */}
        <section aria-label="Customers" style={{ borderBlock: "1px solid var(--color-divider)", background: "rgba(255,255,255,.02)" }}>
          <div
            data-reveal
            data-stagger="45"
            style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 28px", display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}
          >
            <span className="reveal-fade" style={{ fontSize: 12.5, color: "rgba(255,255,255,.4)" }}>
              Running quietly for
            </span>
            {["CertNotify", "Sofaalay", "Regulane", "AuctionBazi"].map((n) => (
              <span key={n} className="reveal-fade" style={{ fontFamily: "var(--font-heading)", fontSize: 17, opacity: 0.55 }}>
                {n}
              </span>
            ))}
          </div>
        </section>

        {/* HOW */}
        <section id="how" aria-labelledby="how-h" style={{ maxWidth: 1180, margin: "0 auto", padding: "84px 28px 24px" }}>
          <h2 id="how-h" style={{ margin: "0 0 12px", fontSize: 44, maxWidth: "16em" }}>
            Four things happen, over and over, without you
          </h2>
          <p style={{ margin: "0 0 44px", fontSize: 17, maxWidth: "34em", color: "rgba(255,255,255,.6)" }}>
            This is the whole loop. It never stops, and it gets better at your business every week it runs.
          </p>
          <ol
            data-reveal
            data-stagger="70"
            style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 22 }}
          >
            {[
              { n: "1", bg: "var(--color-accent)", fg: "#0A0810", ring: false, glow: "rgba(255,106,26,.35)", title: "Reads your site", body: "Products, buyers, rivals, technical debt, and the 83 openings you didn't know were there. One URL, no tags." },
              { n: "2", bg: "var(--color-accent-2-500)", fg: "#0A0810", ring: false, glow: "rgba(168,85,247,.35)", title: "Picks its battles", body: "Every opportunity gets an expected value, a difficulty and a confidence score. Cheap wins first, moonshots last." },
              { n: "3", bg: "transparent", fg: "var(--color-accent)", ring: "var(--color-accent)", title: "Does the work", body: "Writes, publishes, fixes, submits, lists, pitches and finds buyers — inside the rules you wrote in plain English." },
              { n: "4", bg: "transparent", fg: "var(--color-accent-2-700)", ring: "var(--color-accent-2-500)", title: "Shows the receipts", body: "One Friday digest, one honest baseline it never re-bases, and a one-click rollback on every single action." },
            ].map((s) => (
              <li key={s.n} className="reveal" style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                <span
                  style={{
                    width: 70,
                    height: 70,
                    borderRadius: "50%",
                    background: s.bg,
                    color: s.fg,
                    border: s.ring ? `2px solid ${s.ring}` : undefined,
                    display: "grid",
                    placeItems: "center",
                    fontFamily: "var(--font-heading)",
                    fontSize: 27,
                    boxShadow: s.glow ? `0 0 40px ${s.glow}` : undefined,
                  }}
                >
                  {s.n}
                </span>
                <h3 style={{ margin: 0, fontSize: 22 }}>{s.title}</h3>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "rgba(255,255,255,.58)" }}>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* DOES */}
        <section id="does" aria-labelledby="does-h" style={{ maxWidth: 1180, margin: "0 auto", padding: "72px 28px" }}>
          <h2 id="does-h" style={{ margin: "0 0 36px", fontSize: 44, maxWidth: "16em" }}>
            What it actually does all day
          </h2>
          <div data-reveal data-stagger="70" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 18 }}>
            {[
              { title: "Technical SEO, on autopilot", body: "Crawls, fixes and re-checks: metadata, structure, speed, schema, sitemaps, orphan pages. The boring work that decides everything.", border: "var(--color-divider)", bg: "var(--color-surface)" },
              { title: "Content that sounds like you", body: "Learns your voice from your own pages, then writes pillars, comparisons and answers — and tells you how close to you it got.", border: "var(--color-accent-2-400)", bg: "linear-gradient(160deg, rgba(168,85,247,.14), var(--color-surface))" },
              { title: "Distribution, not just publishing", body: "Directories, communities, dead-link reclamation, guest pitches. A page nobody sees was never worth writing.", border: "var(--color-divider)", bg: "var(--color-surface)" },
              { title: "Buyers, found in public signals", body: "Companies with a deadline you can solve — never bought lists. Scored, drafted for, and capped so you stay a good citizen.", border: "var(--color-divider)", bg: "var(--color-surface)" },
              { title: "Visibility inside AI answers", body: "Tracks your citation share across nine answer engines weekly, and writes the quotable pages they prefer to cite.", border: "var(--color-accent-400)", bg: "linear-gradient(160deg, rgba(255,106,26,.14), var(--color-surface))" },
              { title: "A watch on your rivals", body: "When a competitor ships a page or slips a rank, you hear about it the same week — with a draft already waiting.", border: "var(--color-divider)", bg: "var(--color-surface)" },
            ].map((c) => (
              <article key={c.title} className="card reveal" style={{ padding: 26, gap: 9, border: `1px solid ${c.border}`, background: c.bg }}>
                <h3 className="card-title" style={{ fontSize: 20 }}>{c.title}</h3>
                <p className="card-body" style={{ fontSize: 14.5, opacity: 1, color: "rgba(255,255,255,.6)" }}>{c.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ROPE / AUTONOMY DIAL */}
        <section
          id="rope"
          aria-labelledby="rope-h"
          style={{ borderBlock: "1px solid var(--color-divider)", background: "radial-gradient(60% 80% at 20% 50%, rgba(168,85,247,.10), rgba(0,0,0,0))" }}
        >
          <div
            data-reveal
            data-stagger="90"
            style={{ maxWidth: 1180, margin: "0 auto", padding: "78px 28px", display: "grid", gridTemplateColumns: "minmax(0,.86fr) minmax(0,1fr)", gap: 56, alignItems: "center" }}
          >
            <div className="reveal" style={{ position: "relative", width: "100%", maxWidth: 400, aspectRatio: "1", justifySelf: "center" }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--color-surface)", border: "1px solid var(--color-divider)" }} />
              <svg viewBox="0 0 400 400" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
                <circle cx="200" cy="200" r="150" fill="none" stroke="#2A2636" strokeWidth="18" strokeLinecap="round" strokeDasharray="706 943" transform="rotate(135 200 200)" />
                <circle cx="200" cy="200" r="150" fill="none" stroke="#FF6A1A" strokeWidth="18" strokeLinecap="round" strokeDasharray="495 943" transform="rotate(135 200 200)" />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", padding: "0 70px" }}>
                <div>
                  <span style={{ fontSize: 11, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--color-accent)" }}>Autonomy</span>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 38, lineHeight: 1.05, margin: "5px 0 7px" }}>Let it rip</div>
                  <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,.55)" }}>Publishes and prospects alone. Asks before spending.</p>
                </div>
              </div>
              <span style={{ position: "absolute", right: -4, top: "52%", width: 28, height: 28, borderRadius: "50%", background: "#0A0810", border: "5px solid var(--color-accent)", boxShadow: "0 0 24px rgba(255,106,26,.7)" }} />
            </div>
            <div className="reveal">
              <h2 id="rope-h" style={{ margin: "0 0 16px", fontSize: 44, maxWidth: "14em" }}>You decide how much rope it gets</h2>
              <p style={{ margin: "0 0 24px", fontSize: 17, lineHeight: 1.6, maxWidth: "32em", color: "rgba(255,255,255,.6)" }}>
                Autonomy isn&apos;t a checkbox buried in settings. It&apos;s one dial on the front page of the product, and it
                governs everything the engine is allowed to do.
              </p>
              <ul style={{ listStyle: "none", margin: "0 0 28px", padding: 0, display: "flex", flexDirection: "column", gap: 13 }}>
                <li style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <span className="tag tag-neutral" style={{ flex: "none", minWidth: 92, justifyContent: "center" }}>Watch</span>
                  <span style={{ fontSize: 14.5, lineHeight: 1.5, color: "rgba(255,255,255,.72)" }}>It looks, it reports, it changes nothing.</span>
                </li>
                <li style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <span className="tag tag-neutral" style={{ flex: "none", minWidth: 92, justifyContent: "center" }}>Suggest</span>
                  <span style={{ fontSize: 14.5, lineHeight: 1.5, color: "rgba(255,255,255,.72)" }}>A plan on your desk each morning. You press the buttons.</span>
                </li>
                <li style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <span className="tag" style={{ flex: "none", minWidth: 92, justifyContent: "center", background: "var(--color-accent)", color: "#0A0810" }}>Let it rip</span>
                  <span style={{ fontSize: 14.5, lineHeight: 1.5, color: "#fff" }}>It publishes, distributes and prospects on its own — and asks before spending a cent.</span>
                </li>
                <li style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <span className="tag" style={{ flex: "none", minWidth: 92, justifyContent: "center", background: "var(--color-accent-2-200)", color: "var(--color-accent-2-800)" }}>Full send</span>
                  <span style={{ fontSize: 14.5, lineHeight: 1.5, color: "rgba(255,255,255,.72)" }}>It spends too, inside a budget you set, and hands you the receipts.</span>
                </li>
              </ul>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {["Guardrails in plain English", "One-click rollback", "Full audit trail"].map((t) => (
                  <span key={t} className="tag" style={{ background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)", border: "1px solid var(--color-accent-2-400)" }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* PROOF */}
        <section aria-labelledby="proof-h" style={{ maxWidth: 1180, margin: "0 auto", padding: "78px 28px" }}>
          <h2 id="proof-h" style={{ margin: "0 0 36px", fontSize: 44, maxWidth: "15em" }}>
            Six weeks on one small site
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 48, alignItems: "center" }}>
            <div data-reveal data-stagger="90" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {[
                { k: "Organic visitors", v: "1,240 → 1,712", c: "var(--color-accent)" },
                { k: "Top-10 keywords", v: "6 → 29", c: "var(--color-accent-2-700)" },
                { k: "Qualified leads / mo", v: "3 → 46", c: "var(--color-accent-2-700)" },
                { k: "Engines citing them", v: "1 → 4", c: "var(--color-accent)" },
              ].map((s) => (
                <div key={s.k} className="card reveal" style={{ padding: 22, gap: 5, background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
                  <span className="card-kicker" style={{ color: s.c }}>{s.k}</span>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: 34, lineHeight: 1 }}>{s.v}</span>
                </div>
              ))}
            </div>
            <figure style={{ margin: 0 }}>
              <blockquote style={{ margin: 0, fontFamily: "var(--font-heading)", fontSize: 27, lineHeight: 1.3 }}>
                &ldquo;I checked it obsessively for a week, then I stopped. That&apos;s the review: I forgot it was
                running and the traffic kept going up.&rdquo;
              </blockquote>
              <figcaption style={{ marginTop: 18, fontSize: 14, fontFamily: "var(--font-body)", color: "rgba(255,255,255,.55)" }}>
                Priya Raman — founder, CertNotify · a two-person team
              </figcaption>
            </figure>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" aria-labelledby="price-h" style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 28px 78px" }}>
          <h2 id="price-h" style={{ margin: "0 0 12px", fontSize: 44 }}>Pay for the work, not the seats</h2>
          <p style={{ margin: "0 0 36px", fontSize: 17, maxWidth: "32em", color: "rgba(255,255,255,.6)" }}>
            Every plan includes the whole engine. What changes is how much it&apos;s allowed to do each month.
          </p>
          <div data-reveal data-stagger="70" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 18, alignItems: "start" }}>
            <article className="card reveal" style={{ padding: 28, gap: 11, background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
              <h3 style={{ margin: 0, fontSize: 22 }}>Scout</h3>
              <p style={{ margin: 0 }}>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 40 }}>$29</span>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,.45)" }}> /mo</span>
              </p>
              <p className="card-body" style={{ fontSize: 14, opacity: 1, color: "rgba(255,255,255,.58)" }}>
                One site, Watch and Suggest. It finds everything and hands you the plan.
              </p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 14, color: "rgba(255,255,255,.78)" }}>
                <li>Full opportunity map</li>
                <li>Technical audit, weekly</li>
                <li>Friday digest</li>
              </ul>
              <Link className="btn btn-secondary btn-block" href="/login" style={{ fontWeight: 600, color: "#fff", borderColor: "var(--color-divider)" }}>
                Start free
              </Link>
            </article>
            <article
              className="card reveal"
              style={{ padding: 28, gap: 11, background: "linear-gradient(165deg, rgba(255,106,26,.16), var(--color-surface) 55%)", border: "1px solid var(--color-accent)", boxShadow: "0 0 60px rgba(255,106,26,.12)" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 22 }}>MADBOT</h3>
                <span className="tag" style={{ marginLeft: "auto", background: "var(--color-accent)", color: "#0A0810" }}>most people</span>
              </div>
              <p style={{ margin: 0 }}>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 40 }}>$79</span>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,.5)" }}> /mo</span>
              </p>
              <p className="card-body" style={{ fontSize: 14, opacity: 1, color: "rgba(255,255,255,.7)" }}>
                One site, full autonomy up to Let it rip. It publishes, distributes and prospects.
              </p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
                <li>~30 actions a day</li>
                <li>Content, links and lead discovery</li>
                <li>AI visibility tracking</li>
                <li>Rollback and audit trail</li>
              </ul>
              <Link className="btn btn-primary btn-block" href="/login" style={{ color: "#0A0810" }}>
                Connect a site
              </Link>
            </article>
            <article className="card reveal" style={{ padding: 28, gap: 11, background: "var(--color-surface)", border: "1px solid var(--color-accent-2-400)" }}>
              <h3 style={{ margin: 0, fontSize: 22 }}>Swarm</h3>
              <p style={{ margin: 0 }}>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 40 }}>$249</span>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,.45)" }}> /mo</span>
              </p>
              <p className="card-body" style={{ fontSize: 14, opacity: 1, color: "rgba(255,255,255,.58)" }}>
                Up to ten sites, Full send, standing budgets, and one dashboard across all of them.
              </p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 14, color: "rgba(255,255,255,.78)" }}>
                <li>Multi-site switcher</li>
                <li>Standing spend budgets</li>
                <li>Shared guardrails and voice</li>
              </ul>
              <a className="btn btn-secondary btn-block" href="#start" style={{ fontWeight: 600, color: "var(--color-accent-2-800)", borderColor: "var(--color-accent-2-400)" }}>
                Talk to us
              </a>
            </article>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-h" style={{ borderBlock: "1px solid var(--color-divider)", background: "rgba(255,255,255,.02)" }}>
          <div style={{ maxWidth: 940, margin: "0 auto", padding: "78px 28px" }}>
            <h2 id="faq-h" style={{ margin: "0 0 32px", fontSize: 44 }}>Fair questions</h2>
            <div data-reveal data-stagger="70" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {FAQS.map((f) => (
                <div key={f.q} className="reveal">
                  <FaqItem q={f.q} a={f.a} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section aria-labelledby="cta-h" style={{ maxWidth: 1180, margin: "0 auto", padding: "86px 28px" }}>
          <div
            style={{
              position: "relative",
              borderRadius: 44,
              padding: "58px 48px",
              overflow: "hidden",
              background: "linear-gradient(120deg, rgba(255,106,26,.20), rgba(168,85,247,.20))",
              border: "1px solid var(--color-divider)",
            }}
          >
            <div data-reveal data-stagger="90" style={{ position: "relative", zIndex: 1, maxWidth: "34em" }}>
              <h2 id="cta-h" className="reveal" style={{ margin: "0 0 14px", fontSize: 46, lineHeight: 1.05 }}>
                Ninety seconds from now, you&apos;ll know what you&apos;ve been missing.
              </h2>
              <p className="reveal" style={{ margin: "0 0 28px", fontSize: 17, lineHeight: 1.6, color: "rgba(255,255,255,.75)" }}>
                Paste a URL. Get the map of everything worth doing. Decide later whether MADBOT should go and do it.
              </p>
              <div className="reveal" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link className="btn btn-primary" href="/login" style={{ minHeight: 52, paddingInline: 28, color: "#0A0810" }}>
                  Read my site free
                </Link>
                <a className="btn btn-secondary" href="#how" style={{ minHeight: 52, paddingInline: 24, fontWeight: 600, color: "#fff", borderColor: "rgba(255,255,255,.35)" }}>
                  See how it works
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: "1px solid var(--color-divider)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "46px 28px", display: "grid", gridTemplateColumns: "minmax(0,1.4fr) repeat(3,minmax(0,1fr))", gap: 28 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}>
              <Logo size={26} ring={1.6} />
              <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 19, letterSpacing: "-.005em", color: "#fff" }}>madbot</span>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, maxWidth: "26em", color: "rgba(255,255,255,.45)" }}>
              Autonomous website marketing. One dial, a full audit trail, and no seats to buy.
            </p>
          </div>
          <nav aria-label="Product" style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 14 }}>
            <h4 style={{ margin: "0 0 2px", fontSize: 12.5, letterSpacing: ".09em", textTransform: "uppercase", color: "rgba(255,255,255,.4)" }}>Product</h4>
            <a href="#how">How it works</a>
            <a href="#does">What it does</a>
            <a href="#rope">Autonomy</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <nav aria-label="Learn" style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 14 }}>
            <h4 style={{ margin: "0 0 2px", fontSize: 12.5, letterSpacing: ".09em", textTransform: "uppercase", color: "rgba(255,255,255,.4)" }}>Learn</h4>
            <a href="#faq">FAQ</a>
            <a href="#does">AI search visibility</a>
            <a href="#proof-h">Results</a>
            <a href="#rope">Guardrails</a>
          </nav>
          <nav aria-label="Company" style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 14 }}>
            <h4 style={{ margin: "0 0 2px", fontSize: 12.5, letterSpacing: ".09em", textTransform: "uppercase", color: "rgba(255,255,255,.4)" }}>Company</h4>
            <Link href="/login">Get started</Link>
            <a href="#faq">Trust &amp; safety</a>
            <a href="#faq">Privacy</a>
            <a href="#faq">Contact</a>
          </nav>
        </div>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 28px 36px", fontSize: 12.5, color: "rgba(255,255,255,.35)" }}>
          © 2026 MADBOT. Figures shown are from a consenting customer&apos;s dashboard.
        </div>
      </footer>

      {auditUrl ? <AuditModal url={auditUrl} onClose={() => setAuditUrl(null)} /> : null}
    </div>
  );
}
