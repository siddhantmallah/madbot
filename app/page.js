"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePageReveal } from "./components/useReveal";
import AuditModal from "./components/AuditModal";
import ThemeToggle from "./components/ThemeToggle";
import { PLANS, PLAN_ORDER, REGIONS, formatPrice, priceFor, highlightsFor } from "../lib/plans";
import { useRegion } from "../lib/useRegion";

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
    a: "It's an explicit target, not a side effect. Today it measures one engine properly — it puts the unbranded questions your buyers actually ask to Claude with live web search, and reports whether you were named, whether you were linked, and who got named instead. The other assistants need their own API access, so the dashboard lists them as unmeasured rather than pretending. It then writes the quotable, schema-marked pages answer engines prefer to cite.",
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
        color: "var(--fg-80)",
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
      <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.65, color: "var(--fg-60)" }}>
        {a}
      </p>
    </article>
  );
}

export default function LandingPage() {
  const rootRef = usePageReveal();
  const [heroUrl, setHeroUrl] = useState("");
  const [auditUrl, setAuditUrl] = useState(null);
  const { region, pending: regionPending } = useRegion();

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
          background: "var(--scrim)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid var(--color-divider)",
        }}
      >
        <div className="nav pad-responsive" style={{ maxWidth: 1180, margin: "0 auto", padding: "15px 28px" }}>
          <span className="nav-brand" style={{ display: "flex", alignItems: "center", gap: 11, color: "var(--fg)", marginRight: "auto" }}>
            <Logo />
            <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 22, letterSpacing: "-.005em", color: "var(--fg)" }}>
              madbot
            </span>
          </span>
          <a href="#how">How it works</a>
          <a href="#does">What it does</a>
          <a href="#rope">Autonomy</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <ThemeToggle compact />
          <Link className="btn btn-primary" href="/login" style={{ marginLeft: 6, color: "var(--on-accent)" }}>
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
            className="split-hero pad-responsive"
            style={{
              position: "relative",
              maxWidth: 1180,
              margin: "0 auto",
              padding: "72px 28px 70px",
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
              <h1 id="hero-h" style={{ margin: "0 0 18px", fontSize: "clamp(31px,12.6vw,68px)", lineHeight: 1.02, letterSpacing: "-.02em" }}>
                Give it a website.
                <br />
                <span style={{ color: "var(--color-accent)" }}>It does the marketing.</span>
              </h1>
              <p style={{ margin: "0 0 28px", fontSize: 19, lineHeight: 1.55, maxWidth: "30em", color: "var(--fg-80)" }}>
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
                    style={{ minHeight: 54, fontSize: 16, background: "var(--color-surface)", color: "var(--fg)", borderColor: "var(--color-divider)" }}
                  />
                </label>
                <button className="btn btn-primary" type="submit" style={{ minHeight: 54, paddingInline: 26, flex: "none", color: "var(--on-accent)" }}>
                  Read my site free
                </button>
              </form>
              <p style={{ margin: "0 0 22px", fontSize: 13.5, color: "var(--fg-45)" }}>
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
                  background: "var(--wash-1)",
                }}
              >
                <span style={{ position: "relative", width: 9, height: 9, flex: "none" }}>
                  <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--color-accent)", animation: "softPulse 2.4s ease-in-out infinite" }} />
                </span>
                <span style={{ fontSize: 12.5, color: "var(--fg-45)", flex: "none" }}>It does</span>
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
                  <dt style={{ fontSize: 11.5, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--fg-45)" }}>
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
              <figcaption style={{ position: "relative", marginTop: "-6%", paddingLeft: "6%", fontSize: 11.5, color: "var(--fg-45)" }}>
                Every opening around one site, scored and ranked — the brightest paths first.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* CUSTOMERS */}
        {/* This was a logo strip reading "Running quietly for" over four named
            businesses, which presented them as paying customers getting ongoing
            results. They aren't, and naming a client publicly needs their
            permission regardless. Replaced with something true. */}
        <section aria-label="What the free report does" style={{ borderBlock: "1px solid var(--color-divider)", background: "var(--wash-1)" }}>
          <div
            data-reveal
            data-stagger="45"
            className="pad-responsive"
            style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 28px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}
          >
            <span className="reveal-fade" style={{ fontSize: 12.5, color: "var(--fg-45)" }}>
              The free report
            </span>
            {[
              "Crawls what's actually there",
              "20+ technical checks",
              "Nothing written to your site",
              "No account needed",
            ].map((n) => (
              <span key={n} className="reveal-fade" style={{ fontSize: 13.5, opacity: 0.62 }}>
                {n}
              </span>
            ))}
          </div>
        </section>

        {/* HOW */}
        <section id="how" aria-labelledby="how-h" style={{ maxWidth: 1180, margin: "0 auto", padding: "84px 28px 24px" }}>
          <h2 id="how-h" style={{ margin: "0 0 12px", fontSize: "clamp(24px,8.1vw,44px)", maxWidth: "16em" }}>
            Four things happen, over and over, without you
          </h2>
          <p style={{ margin: "0 0 44px", fontSize: 17, maxWidth: "34em", color: "var(--fg-60)" }}>
            This is the whole loop. It never stops, and it gets better at your business every week it runs.
          </p>
          <ol
            data-reveal
            data-stagger="70"
            className="grid-4" style={{ listStyle: "none", margin: 0, padding: 0, gap: 22 }}
          >
            {[
              { n: "1", bg: "var(--color-accent)", fg: "var(--on-accent)", ring: false, glow: "rgba(255,106,26,.35)", title: "Reads your site", body: "Products, buyers, rivals, technical debt, and the 83 openings you didn't know were there. One URL, no tags." },
              { n: "2", bg: "var(--color-accent-2-500)", fg: "var(--on-accent)", ring: false, glow: "rgba(168,85,247,.35)", title: "Picks its battles", body: "Every opportunity gets an expected value, a difficulty and a confidence score. Cheap wins first, moonshots last." },
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
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "var(--fg-60)" }}>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* DOES */}
        <section id="does" aria-labelledby="does-h" style={{ maxWidth: 1180, margin: "0 auto", padding: "72px 28px" }}>
          <h2 id="does-h" style={{ margin: "0 0 36px", fontSize: "clamp(24px,8.1vw,44px)", maxWidth: "16em" }}>
            What it actually does all day
          </h2>
          <div data-reveal data-stagger="70" className="grid-3" style={{ gap: 18 }}>
            {[
              { title: "Technical SEO, on autopilot", body: "Crawls, fixes and re-checks: metadata, structure, speed, schema, sitemaps, orphan pages. The boring work that decides everything.", border: "var(--color-divider)", bg: "var(--color-surface)" },
              { title: "Content that sounds like you", body: "Learns your voice from your own pages, then writes pillars, comparisons and answers — and tells you how close to you it got.", border: "var(--color-accent-2-400)", bg: "linear-gradient(160deg, rgba(168,85,247,.14), var(--color-surface))" },
              { title: "Distribution, not just publishing", body: "Directories, communities, dead-link reclamation, guest pitches. A page nobody sees was never worth writing.", border: "var(--color-divider)", bg: "var(--color-surface)" },
              { title: "Buyers, found in public signals", body: "Companies with a deadline you can solve — never bought lists. Scored, drafted for, and capped so you stay a good citizen.", border: "var(--color-divider)", bg: "var(--color-surface)" },
              { title: "Visibility inside AI answers", body: "Asks Claude the questions your buyers ask, with live web search, and reports whether you were named at all — and which rivals were named instead.", border: "var(--color-accent-400)", bg: "linear-gradient(160deg, rgba(255,106,26,.14), var(--color-surface))" },
              { title: "A watch on your rivals", body: "When a competitor ships a page or slips a rank, you hear about it the same week — with a draft already waiting.", border: "var(--color-divider)", bg: "var(--color-surface)" },
            ].map((c) => (
              <article key={c.title} className="card reveal" style={{ padding: 26, gap: 9, border: `1px solid ${c.border}`, background: c.bg }}>
                <h3 className="card-title" style={{ fontSize: 20 }}>{c.title}</h3>
                <p className="card-body" style={{ fontSize: 14.5, opacity: 1, color: "var(--fg-60)" }}>{c.body}</p>
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
            className="split-2 pad-responsive" style={{ maxWidth: 1180, margin: "0 auto", padding: "78px 28px", "--l": ".86fr", gap: 56, alignItems: "center" }}
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
                  <p style={{ margin: 0, fontSize: 13, color: "var(--fg-60)" }}>Publishes and prospects alone. Asks before spending.</p>
                </div>
              </div>
              <span style={{ position: "absolute", right: -4, top: "52%", width: 28, height: 28, borderRadius: "50%", background: "var(--on-accent)", border: "5px solid var(--color-accent)", boxShadow: "0 0 24px rgba(255,106,26,.7)" }} />
            </div>
            <div className="reveal">
              <h2 id="rope-h" style={{ margin: "0 0 16px", fontSize: "clamp(24px,8.1vw,44px)", maxWidth: "14em" }}>You decide how much rope it gets</h2>
              <p style={{ margin: "0 0 24px", fontSize: 17, lineHeight: 1.6, maxWidth: "32em", color: "var(--fg-60)" }}>
                Autonomy isn&apos;t a checkbox buried in settings. It&apos;s one dial on the front page of the product, and it
                governs everything the engine is allowed to do.
              </p>
              <ul style={{ listStyle: "none", margin: "0 0 28px", padding: 0, display: "flex", flexDirection: "column", gap: 13 }}>
                <li style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <span className="tag tag-neutral" style={{ flex: "none", minWidth: 92, justifyContent: "center" }}>Watch</span>
                  <span style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--fg-80)" }}>It looks, it reports, it changes nothing.</span>
                </li>
                <li style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <span className="tag tag-neutral" style={{ flex: "none", minWidth: 92, justifyContent: "center" }}>Suggest</span>
                  <span style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--fg-80)" }}>A plan on your desk each morning. You press the buttons.</span>
                </li>
                <li style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <span className="tag" style={{ flex: "none", minWidth: 92, justifyContent: "center", background: "var(--color-accent)", color: "var(--on-accent)" }}>Let it rip</span>
                  <span style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--fg)" }}>It publishes, distributes and prospects on its own — and asks before spending a cent.</span>
                </li>
                <li style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <span className="tag" style={{ flex: "none", minWidth: 92, justifyContent: "center", background: "var(--color-accent-2-200)", color: "var(--color-accent-2-800)" }}>Full send</span>
                  <span style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--fg-80)" }}>It spends too, inside a budget you set, and hands you the receipts.</span>
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

        {/* WHAT IT MEASURES — this section used to show growth figures and a
            named customer quote. MADBOT is weeks old and had produced neither,
            so both were invented. Selling on what it genuinely measures, and on
            a report the visitor can run on their own site in ten seconds,
            converts better than a testimonial nobody can check. */}
        <section aria-labelledby="proof-h" style={{ maxWidth: 1180, margin: "0 auto", padding: "78px 28px" }}>
          <h2 id="proof-h" style={{ margin: "0 0 14px", fontSize: "clamp(24px,8.1vw,44px)", maxWidth: "17em" }}>
            No customer results to show you yet
          </h2>
          <p style={{ margin: "0 0 36px", maxWidth: "44em", fontSize: 16.5, lineHeight: 1.65, color: "var(--fg-60)" }}>
            MADBOT is new. Plenty of tools will show you a stranger&apos;s traffic chart at this point — we&apos;d
            rather show you what it measures, and let you point it at your own site. Everything below is a real check
            it runs, not a projection.
          </p>
          <div className="split-2" style={{ gap: 48, alignItems: "center" }}>
            <div data-reveal data-stagger="90" className="grid-2" style={{ gap: 16 }}>
              {[
                { k: "Technical checks per crawl", v: "20+", n: "Every one traceable to a line on your page", c: "var(--color-accent)" },
                { k: "Buying questions put to AI", v: "Live", n: "Real model calls with web search, not a lookup table", c: "var(--color-accent-2-700)" },
                { k: "Free report", v: "~10s", n: "No account, no card, nothing written to your site", c: "var(--color-accent-2-700)" },
                { k: "Reversible actions", v: "All", n: "Every change it makes, rolled back in one click", c: "var(--color-accent)" },
              ].map((s) => (
                <div key={s.k} className="card reveal" style={{ padding: 22, gap: 5, background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
                  <span className="card-kicker" style={{ color: s.c }}>{s.k}</span>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(26px,5vw,34px)", lineHeight: 1 }}>{s.v}</span>
                  <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--fg-45)" }}>{s.n}</span>
                </div>
              ))}
            </div>
            <div>
              <blockquote style={{ margin: 0, fontFamily: "var(--font-heading)", fontSize: "clamp(21px,4.4vw,27px)", lineHeight: 1.3 }}>
                &ldquo;Who makes custom sofas to order in Mumbai?&rdquo; — asked with live web search, a real furniture
                maker&apos;s site was named zero times out of four. Four competitors were named instead.
              </blockquote>
              <p style={{ marginTop: 18, marginBottom: 0, fontSize: 14, lineHeight: 1.6, fontFamily: "var(--font-body)", color: "var(--fg-60)" }}>
                One real check, run while building this. That&apos;s the kind of gap MADBOT finds — and the sort of
                thing no rankings report would have told them.
              </p>
            </div>
          </div>
        </section>

        {/* PRICING — rendered from lib/plans.js. There were three separate
            hardcoded copies of the price list before this (here, the pricing
            page, and the plan definitions), and they had already drifted apart. */}
        <section id="pricing" aria-labelledby="price-h" className="pad-responsive" style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 28px 78px" }}>
          <h2 id="price-h" style={{ margin: "0 0 12px", fontSize: "clamp(24px,8.1vw,44px)" }}>Pay for the work, not the seats</h2>
          <p style={{ margin: "0 0 22px", fontSize: 17, maxWidth: "32em", color: "var(--fg-60)" }}>
            Every plan includes the whole engine. What changes is how much of it is allowed to run each month.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 26 }}>
            <span className="tag tag-neutral" style={{ fontSize: 11.5 }}>
              Prices in {REGIONS[region].label} ({REGIONS[region].currency})
            </span>
            <Link href="/pricing" style={{ fontSize: 13 }}>
              Change currency, compare annually, and see top-ups →
            </Link>
          </div>
          <div data-reveal data-stagger="70" className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, alignItems: "start" }}>
            {PLAN_ORDER.map((id) => PLANS[id]).map((p) => (
              <article
                key={p.id}
                className="card reveal"
                style={{
                  padding: 22,
                  gap: 10,
                  background: p.featured ? "var(--color-accent-100)" : "var(--color-surface)",
                  border: p.featured ? "1px solid var(--color-accent)" : "1px solid var(--color-divider)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0, fontSize: 20 }}>{p.name}</h3>
                  {p.featured ? (
                    <span className="tag" style={{ fontSize: 9.5, background: "var(--color-accent)", color: "var(--on-accent)" }}>
                      ★ Most popular
                    </span>
                  ) : null}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(23px,5.4vw,34px)" }}>
                    {regionPending ? "—" : formatPrice(priceFor(p, region), region)}
                  </span>
                  {p.price[region] ? <span style={{ fontSize: 12, color: "var(--fg-45)" }}>/mo</span> : null}
                </div>
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--fg-60)", minHeight: "3em" }}>
                  {p.blurb}
                </p>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5 }}>
                  {highlightsFor(p).slice(0, 6).map((h) => (
                    <li key={h} style={{ display: "flex", gap: 6 }}>
                      <span style={{ color: "var(--color-accent)", flex: "none" }} aria-hidden="true">→</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  className={p.featured ? "btn btn-primary btn-block" : "btn btn-secondary btn-block"}
                  href={`/login?mode=signup&plan=${p.id}`}
                  style={p.featured ? { color: "var(--on-accent)" } : { fontWeight: 600 }}
                >
                  {p.id === "free" ? "Start free" : `Start with ${p.name}`}
                </Link>
              </article>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-h" style={{ borderBlock: "1px solid var(--color-divider)", background: "var(--wash-1)" }}>
          <div style={{ maxWidth: 940, margin: "0 auto", padding: "78px 28px" }}>
            <h2 id="faq-h" style={{ margin: "0 0 32px", fontSize: "clamp(24px,8.1vw,44px)" }}>Fair questions</h2>
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
              <h2 id="cta-h" className="reveal" style={{ margin: "0 0 14px", fontSize: "clamp(24px,8.5vw,46px)", lineHeight: 1.05 }}>
                Ninety seconds from now, you&apos;ll know what you&apos;ve been missing.
              </h2>
              <p className="reveal" style={{ margin: "0 0 28px", fontSize: 17, lineHeight: 1.6, color: "var(--fg-80)" }}>
                Paste a URL. Get the map of everything worth doing. Decide later whether MADBOT should go and do it.
              </p>
              <div className="reveal" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link className="btn btn-primary" href="/login" style={{ minHeight: 52, paddingInline: 28, color: "var(--on-accent)" }}>
                  Read my site free
                </Link>
                <a className="btn btn-secondary" href="#how" style={{ minHeight: 52, paddingInline: 24, fontWeight: 600, color: "var(--fg)", borderColor: "var(--fg-32)" }}>
                  See how it works
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: "1px solid var(--color-divider)" }}>
        <div className="footer-grid pad-responsive" style={{ maxWidth: 1180, margin: "0 auto", padding: "46px 28px", gap: 28 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}>
              <Logo size={26} ring={1.6} />
              <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 19, letterSpacing: "-.005em", color: "var(--fg)" }}>madbot</span>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, maxWidth: "26em", color: "var(--fg-45)" }}>
              Autonomous website marketing. One dial, a full audit trail, and no seats to buy.
            </p>
          </div>
          <nav aria-label="Product" style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 14 }}>
            <h4 style={{ margin: "0 0 2px", fontSize: 12.5, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--fg-45)" }}>Product</h4>
            <a href="#how">How it works</a>
            <a href="#does">What it does</a>
            <a href="#rope">Autonomy</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <nav aria-label="Learn" style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 14 }}>
            <h4 style={{ margin: "0 0 2px", fontSize: 12.5, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--fg-45)" }}>Learn</h4>
            <a href="#faq">FAQ</a>
            <a href="#does">AI search visibility</a>
            <a href="#proof-h">Results</a>
            <a href="#rope">Guardrails</a>
          </nav>
          <nav aria-label="Company" style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 14 }}>
            <h4 style={{ margin: "0 0 2px", fontSize: 12.5, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--fg-45)" }}>Company</h4>
            <Link href="/login">Get started</Link>
            <a href="#faq">Trust &amp; safety</a>
            <a href="#faq">Privacy</a>
            <a href="#faq">Contact</a>
          </nav>
        </div>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 28px 36px", fontSize: 12.5, color: "var(--fg-32)" }}>
          © 2026 MADBOT. No customer results are shown on this page — MADBOT is new and hasn&apos;t earned any yet.
        </div>
      </footer>

      {auditUrl ? <AuditModal url={auditUrl} onClose={() => setAuditUrl(null)} /> : null}
    </div>
  );
}
