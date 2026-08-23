"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SiteIcon } from "./Brand";

const GATE_AFTER_MS = 60_000;

const SEVERITY = {
  critical: { label: "Costing you now", color: "#FF6A1A", bg: "var(--color-accent-100)", fg: "var(--color-accent-800)" },
  warning: { label: "Worth fixing", color: "#B972FF", bg: "var(--color-accent-2-100)", fg: "var(--color-accent-2-800)" },
  good: { label: "Already right", color: "#5C5670", bg: "var(--color-neutral-100)", fg: "var(--color-neutral-800)" },
};

function scoreColor(score) {
  if (score >= 80) return "#7ED957";
  if (score >= 55) return "#FF9557";
  return "#FF6A1A";
}

function ScoreRing({ score }) {
  const color = scoreColor(score);
  return (
    <div
      style={{
        width: 116,
        height: 116,
        borderRadius: "50%",
        background: `conic-gradient(${color} 0 ${score}%, var(--color-neutral-300) ${score}% 100%)`,
        display: "grid",
        placeItems: "center",
        flex: "none",
      }}
    >
      <div style={{ width: 92, height: 92, borderRadius: "50%", background: "var(--color-bg)", display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 34, lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.45)" }}>of 100</div>
        </div>
      </div>
    </div>
  );
}

function Scanning({ domain }) {
  const steps = [
    `Fetching ${domain}`,
    "Reading titles, headings and meta tags",
    "Looking for structured data",
    "Checking robots.txt and sitemap",
    "Measuring response time and page weight",
    "Working out what it all costs you",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => Math.min(v + 1, steps.length - 1)), 900);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={{ padding: "64px 40px", textAlign: "center" }}>
      <div style={{ width: 46, height: 46, margin: "0 auto 22px", borderRadius: "50%", border: "3px solid var(--color-accent-300)", borderTopColor: "var(--color-accent)", animation: "sweep 1s linear infinite" }} />
      <h3 style={{ margin: "0 0 8px", fontSize: 24 }}>Reading {domain}…</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 340, margin: "0 auto" }}>
        {steps.map((s, idx) => (
          <div
            key={s}
            style={{
              fontSize: 13,
              color: idx < i ? "rgba(255,255,255,.4)" : idx === i ? "#fff" : "rgba(255,255,255,.2)",
              transition: "color .3s",
            }}
          >
            {idx < i ? "✓ " : idx === i ? "→ " : "  "}
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

function FindingRow({ f }) {
  const s = SEVERITY[f.severity] || SEVERITY.good;
  return (
    <div
      style={{
        display: "flex",
        gap: 13,
        padding: "14px 16px",
        borderRadius: 20,
        background: f.severity === "good" ? "rgba(255,255,255,.02)" : "var(--color-surface)",
        borderLeft: `3px solid ${s.color}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: f.detail ? 5 : 0 }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.35 }}>{f.title}</span>
          <span className="tag" style={{ fontSize: 9.5, background: s.bg, color: s.fg, flex: "none" }}>{f.area}</span>
        </div>
        {f.detail ? (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,.62)" }}>{f.detail}</p>
        ) : null}
        {f.fix ? (
          <div style={{ marginTop: 9, paddingTop: 9, borderTop: "1px solid var(--color-divider)", fontSize: 12.5, lineHeight: 1.55, display: "flex", gap: 8 }}>
            <span style={{ color: "var(--color-accent)", fontWeight: 700, flex: "none" }}>MADBOT would</span>
            <span style={{ color: "rgba(255,255,255,.72)" }}>{f.fix}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Gate({ url }) {
  const qs = `?mode=signup&next=pricing${url ? `&url=${encodeURIComponent(url)}` : ""}`;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 5,
        display: "grid",
        placeItems: "center",
        padding: 28,
        background: "linear-gradient(to bottom, rgba(10,8,16,.72) 0%, rgba(10,8,16,.95) 42%)",
        backdropFilter: "blur(7px)",
        animation: "revealFade .5s ease",
      }}
    >
      <div className="card elev-lg" style={{ maxWidth: 470, padding: 30, gap: 14, textAlign: "center", border: "1px solid var(--color-accent-400)" }}>
        <h3 style={{ margin: 0, fontSize: 27, lineHeight: 1.15 }}>That&apos;s the diagnosis. Want it fixed?</h3>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "rgba(255,255,255,.68)" }}>
          Every SEO tool on the market will hand you a list like the one behind this panel. MADBOT is the one that
          then goes and does the work — writes the pages, marks up the schema, builds the internal links, and shows
          you the receipts for each one.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "left", fontSize: 13.5, color: "rgba(255,255,255,.75)", padding: "4px 0" }}>
          <div>→ A full plan, ordered by what it&apos;s worth</div>
          <div>→ The work carried out at the autonomy level you set</div>
          <div>→ One-click rollback on everything it touches</div>
        </div>
        <Link className="btn btn-primary" href={`/login${qs}`} style={{ minHeight: 50, fontSize: 15.5, color: "#0A0810" }}>
          Create your account
        </Link>
        <Link href="/pricing" style={{ fontSize: 13, color: "var(--color-accent-700)", textDecoration: "none" }}>
          See pricing first
        </Link>
      </div>
    </div>
  );
}

export default function AuditModal({ url, onClose }) {
  const [state, setState] = useState({ phase: "loading" });
  const [gated, setGated] = useState(false);
  const scrollRef = useRef(null);

  const domain = useMemo(() => String(url || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0], [url]);

  useEffect(() => {
    let alive = true;
    const startedAt = Date.now();
    (async () => {
      try {
        const res = await fetch(`/api/audit?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        // Hold the scanning view briefly so the steps don't flash past.
        const wait = Math.max(0, 3200 - (Date.now() - startedAt));
        setTimeout(() => {
          if (!alive) return;
          setState(data.ok ? { phase: "done", data } : { phase: "error", error: data.error });
        }, wait);
      } catch {
        if (alive) setState({ phase: "error", error: "Something went wrong reaching that site." });
      }
    })();
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => {
    if (state.phase !== "done") return undefined;
    const id = setTimeout(() => setGated(true), GATE_AFTER_MS);
    return () => clearTimeout(id);
  }, [state.phase]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !gated) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, gated]);

  const d = state.data;
  const criticals = d ? d.findings.filter((f) => f.severity === "critical") : [];
  const warnings = d ? d.findings.filter((f) => f.severity === "warning") : [];
  const goods = d ? d.findings.filter((f) => f.severity === "good") : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Site report for ${domain}`}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(4,3,7,.82)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: "24px 16px" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !gated) onClose();
      }}
    >
      <div
        className="card elev-lg"
        style={{
          position: "relative",
          width: "min(960px, 100%)",
          maxHeight: "92vh",
          padding: 0,
          overflow: "hidden",
          background: "var(--color-bg)",
          border: "1px solid var(--color-divider)",
          animation: "rise .4s cubic-bezier(.2,.8,.2,1)",
        }}
      >
        {!gated ? (
          <button
            onClick={onClose}
            aria-label="Close report"
            style={{ position: "absolute", right: 16, top: 14, zIndex: 6, width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,.07)", color: "#fff", fontSize: 17, lineHeight: 1, display: "grid", placeItems: "center" }}
          >
            ×
          </button>
        ) : null}

        {gated ? <Gate url={url} /> : null}

        <div ref={scrollRef} style={{ maxHeight: "92vh", overflowY: "auto" }}>
          {state.phase === "loading" ? <Scanning domain={domain} /> : null}

          {state.phase === "error" ? (
            <div style={{ padding: "56px 40px", textAlign: "center" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 23 }}>I couldn&apos;t read {domain}</h3>
              <p style={{ margin: "0 0 20px", fontSize: 14, color: "rgba(255,255,255,.6)" }}>{state.error}</p>
              <button className="btn btn-secondary" onClick={onClose} style={{ fontWeight: 600 }}>Try another address</button>
            </div>
          ) : null}

          {state.phase === "done" && d ? (
            <>
              {/* Header */}
              <div style={{ padding: "30px 34px 24px", borderBottom: "1px solid var(--color-divider)", background: "radial-gradient(90% 120% at 80% 0%, rgba(255,106,26,.10), rgba(0,0,0,0))" }}>
                <div style={{ display: "flex", gap: 26, alignItems: "center", flexWrap: "wrap" }}>
                  <ScoreRing score={d.score} />
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                      <SiteIcon site={{ faviconUrl: d.faviconUrl, title: d.title, url: d.url }} size={17} />
                      <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.5)" }}>{domain}</span>
                    </div>
                    <h2 style={{ margin: "0 0 8px", fontSize: 27, lineHeight: 1.15 }}>
                      {d.counts.critical > 0
                        ? `${d.counts.critical} thing${d.counts.critical === 1 ? "" : "s"} costing you traffic right now`
                        : d.counts.warning > 0
                        ? `${d.counts.warning} thing${d.counts.warning === 1 ? "" : "s"} worth fixing`
                        : "Solid foundations — now go win the terms"}
                    </h2>
                    <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "rgba(255,255,255,.6)" }}>
                      {d.title ? `“${d.title.slice(0, 90)}${d.title.length > 90 ? "…" : ""}”` : "This page has no title tag."}
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 18 }}>
                  <span className="tag" style={{ background: "var(--color-accent-100)", color: "var(--color-accent-800)" }}>{d.counts.critical} critical</span>
                  <span className="tag" style={{ background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}>{d.counts.warning} warnings</span>
                  <span className="tag tag-neutral">{d.counts.good} already right</span>
                  <span className="tag tag-outline">Checked live, just now</span>
                </div>
              </div>

              {/* Real measured stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(122px,1fr))", gap: 1, background: "var(--color-divider)", borderBottom: "1px solid var(--color-divider)" }}>
                {[
                  ["Words of copy", d.stats.wordCount.toLocaleString()],
                  ["Response time", `${(d.stats.responseMs / 1000).toFixed(2)}s`],
                  ["Schema types", d.stats.schemaTypes.length],
                  ["Pages linked", d.stats.distinctPages],
                  ["Images", d.stats.images],
                  ["Page weight", `${d.stats.htmlKb} KB`],
                ].map(([label, val]) => (
                  <div key={label} style={{ background: "var(--color-bg)", padding: "14px 16px" }}>
                    <div style={{ fontSize: 10, letterSpacing: ".09em", textTransform: "uppercase", color: "rgba(255,255,255,.42)", marginBottom: 3 }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-heading)", fontSize: 20 }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Findings */}
              <div style={{ padding: "26px 34px 34px", display: "flex", flexDirection: "column", gap: 22 }}>
                {criticals.length ? (
                  <section style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    <h4 style={{ margin: 0, fontSize: 16 }}>Costing you now</h4>
                    {criticals.map((f) => <FindingRow key={f.title} f={f} />)}
                  </section>
                ) : null}

                {warnings.length ? (
                  <section style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    <h4 style={{ margin: 0, fontSize: 16 }}>Worth fixing</h4>
                    {warnings.map((f) => <FindingRow key={f.title} f={f} />)}
                  </section>
                ) : null}

                {goods.length ? (
                  <section style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    <h4 style={{ margin: 0, fontSize: 16 }}>Already right</h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 8 }}>
                      {goods.map((f) => (
                        <div key={f.title} style={{ display: "flex", gap: 8, fontSize: 13, padding: "9px 12px", borderRadius: 14, background: "rgba(255,255,255,.02)" }}>
                          <span style={{ color: "#7ED957", flex: "none" }}>✓</span>
                          <span style={{ color: "rgba(255,255,255,.7)" }}>{f.title}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                <div className="card" style={{ padding: 22, gap: 10, background: "linear-gradient(150deg, rgba(255,106,26,.12), var(--color-surface) 60%)", border: "1px solid var(--color-accent-400)" }}>
                  <h4 style={{ margin: 0, fontSize: 18 }}>Anyone can tell you this. Almost nobody fixes it.</h4>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "rgba(255,255,255,.72)" }}>
                    This report took seconds and cost nothing. The reason a report like it usually changes nothing is
                    that the next step — writing the pages, marking up the schema, earning the links — is weeks of work nobody
                    has time for. That&apos;s the part MADBOT does, at whatever level of autonomy you&apos;re
                    comfortable giving it, with a full audit trail and one-click undo.
                  </p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 4 }}>
                    <Link className="btn btn-primary" href={`/login?mode=signup&next=pricing&url=${encodeURIComponent(url)}`} style={{ color: "#0A0810" }}>
                      Get this fixed
                    </Link>
                    <Link className="btn btn-secondary" href="/pricing" style={{ fontWeight: 600, color: "#fff", borderColor: "rgba(255,255,255,.3)" }}>
                      See pricing
                    </Link>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
