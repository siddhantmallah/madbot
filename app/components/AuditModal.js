"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { SiteIcon } from "./Brand";
import { THRESHOLDS as T, bandFor } from "../../lib/auditClient";

const GATE_AFTER_MS = 60_000;

// The report is always a dark document (it sits on the .dark-stage tokens), so
// the severity tints are fixed dark-friendly values rather than theme tokens
// that would flip pale on a light-theme page.
const TONE = {
  critical: { label: "Costing you now", color: "#FF6A1A", bg: "rgba(255,106,26,.16)", fg: "#FFB088" },
  warning: { label: "Worth fixing", color: "#B972FF", bg: "rgba(168,85,247,.18)", fg: "#DCBEFF" },
  good: { label: "Already right", color: "#4DD68D", bg: "rgba(77,214,141,.14)", fg: "#9FEBC2" },
  none: { label: "Not measured", color: "rgba(255,255,255,.32)", bg: "rgba(255,255,255,.06)", fg: "rgba(255,255,255,.6)" },
};

// Same order the engine walks them in, so the report reads like the audit ran.
const AREAS = ["Foundations", "Crawlability", "AI & structured data", "Sharing", "Content", "Performance", "Security"];

// The AdSense section's own areas, in the order buildAdsenseReport walks them.
const ADSENSE_AREAS = ["Inventory", "Eligibility", "Policy", "Setup"];

// The bands come from lib/auditClient.js, where the audit reads them too: it
// expresses its own score ceilings in terms of these edges, so a copy here
// could put a label and the number it labels on opposite sides of a boundary.
// Called directly rather than aliased to a module-scope const — Turbopack
// evaluates that alias before the imported module is ready.

// One frame later, so CSS transitions have a "from" to animate out of.
function useRevealed() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return on;
}

function ScoreRing({ score, size = 176, stroke = 12 }) {
  const on = useRevealed();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const b = bandFor(score);
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)", display: "block" }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={stroke} />
        <circle
          className="rep-ring"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TONE[b.tone].color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={on ? c * (1 - score / 100) : c}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: Math.round(size * 0.31), lineHeight: 1, color: "var(--fg)" }}>{score}</div>
          <div className="mono" style={{ marginTop: 5 }}>of 100</div>
        </div>
      </div>
    </div>
  );
}

// A row of segments that grow in. Widths are percentages minus their share of
// the gaps, so n segments fill exactly the row.
function SegmentBar({ segments, height = 10, gap = 2 }) {
  const on = useRevealed();
  const n = segments.length;
  return (
    <div style={{ display: "flex", gap, height, background: "rgba(255,255,255,.05)", overflow: "hidden" }}>
      {segments.map((s, i) => (
        <div
          key={i}
          className="rep-bar"
          style={{ width: on ? `calc(${s.pct}% - ${(gap * (n - 1)) / n}px)` : 0, background: s.color, flex: "none" }}
        />
      ))}
    </div>
  );
}

// A measured value drawn against the exact line the audit judged it by. The
// marks are the thresholds from lib/auditClient.js, the same ones the
// finding used, so the bar and the verdict always agree.
function Gauge({ label, display, value, max, marks, tone, note }) {
  const on = useRevealed();
  const t = TONE[tone];
  const pct = value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: "14px 16px 13px", background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: 6, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span className="mono">{label}</span>
        <span style={{ fontFamily: "var(--font-heading)", fontSize: 23, lineHeight: 1, color: t.color, whiteSpace: "nowrap" }}>{display}</span>
      </div>
      <div style={{ position: "relative", height: 10, background: "rgba(255,255,255,.05)" }}>
        <div className="rep-bar" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: on ? `${pct}%` : 0, background: t.color }} />
        {marks.map((m) => (
          <div key={m.at} title={m.label} style={{ position: "absolute", left: `${Math.min(100, (m.at / max) * 100)}%`, top: -4, bottom: -4, width: 1, background: "rgba(255,255,255,.55)" }} />
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, lineHeight: 1.4, color: "var(--fg-45)" }}>
        <span className="mono" style={{ fontSize: 10, alignSelf: "flex-end" }}>{marks.map((m) => m.label).join(" · ")}</span>
        <span>{note}</span>
      </div>
    </div>
  );
}

// For lengths that have a healthy window rather than a floor: the window is
// shaded, the value is a marker that lands inside or outside it.
function RangeGauge({ label, value, min, max, scaleMax, tone, note, unit = "" }) {
  const on = useRevealed();
  const t = TONE[tone];
  const clamp = value == null ? null : Math.min(value, scaleMax);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: "14px 16px 13px", background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: 6, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span className="mono">{label}</span>
        <span style={{ fontFamily: "var(--font-heading)", fontSize: 23, lineHeight: 1, color: t.color, whiteSpace: "nowrap" }}>
          {value == null ? "—" : `${value}${unit}`}
        </span>
      </div>
      <div style={{ position: "relative", height: 10, background: "rgba(255,255,255,.05)" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(min / scaleMax) * 100}%`, width: `${((max - min) / scaleMax) * 100}%`, background: TONE.good.bg, borderLeft: `1px solid ${TONE.good.color}`, borderRight: `1px solid ${TONE.good.color}` }} />
        {clamp != null ? (
          <div className="rep-marker" style={{ position: "absolute", top: -4, bottom: -4, width: 4, background: t.color, left: on ? `calc(${(clamp / scaleMax) * 100}% - 2px)` : 0 }} />
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, lineHeight: 1.4, color: "var(--fg-45)" }}>
        <span className="mono" style={{ fontSize: 10, alignSelf: "flex-end" }}>{min}–{max} healthy</span>
        <span>{note}</span>
      </div>
    </div>
  );
}

// Every verdict here mirrors buildFindings() in lib/audit.js, threshold for
// threshold. If the audit changes what it penalises, change it there and here.
function metricsFor(d) {
  const s = d.stats;
  const titleLen = d.title ? d.title.length : null;
  const descLen = d.description ? d.description.length : null;
  const schemaN = s.schemaTypes.length;
  const altMissingPct = s.images ? Math.round((s.imagesMissingAlt / s.images) * 100) : 0;
  const altOk = s.images ? s.images - s.imagesMissingAlt : null;

  return [
    {
      kind: "gauge",
      label: "Words of copy",
      display: s.wordCount.toLocaleString(),
      value: s.wordCount,
      max: Math.max(600, s.wordCount),
      tone: s.wordCount < T.wordsCritical ? "critical" : s.wordCount < T.wordsWarning ? "warning" : "good",
      marks: [{ at: T.wordsCritical, label: `${T.wordsCritical} thin` }, { at: T.wordsWarning, label: `${T.wordsWarning} healthy` }],
      note: s.wordCount < T.wordsCritical ? "Nothing for an answer engine to quote" : s.wordCount < T.wordsWarning ? "Thin for competitive terms" : "Enough substance to rank on",
    },
    {
      kind: "gauge",
      label: "First response",
      display: `${(s.responseMs / 1000).toFixed(2)}s`,
      value: s.responseMs,
      max: Math.max(3000, s.responseMs),
      tone: s.responseMs > T.responseCriticalMs ? "critical" : s.responseMs > T.responseWarningMs ? "warning" : "good",
      marks: [{ at: T.responseWarningMs, label: `${T.responseWarningMs / 1000}s` }, { at: T.responseCriticalMs, label: `${T.responseCriticalMs / 1000}s` }],
      note: s.responseMs > T.responseWarningMs ? "Slow first byte costs rankings and visitors" : "Quick first response, measured live",
    },
    {
      kind: "gauge",
      label: "Pages linked from home",
      display: String(s.distinctPages),
      value: s.distinctPages,
      max: Math.max(8, s.distinctPages),
      tone: s.distinctPages === 0 && s.anchorLinks > 2 ? "critical" : s.distinctPages < T.pagesLinked ? "warning" : "good",
      marks: [{ at: T.pagesLinked, label: `${T.pagesLinked}+ healthy` }],
      note:
        s.distinctPages === 0 && s.anchorLinks > 2
          ? `${s.anchorLinks} same-page jumps, nothing else to rank from`
          : s.distinctPages < T.pagesLinked
          ? "Thin structure caps how many terms you can rank for"
          : "Crawlers have paths into the rest of the site",
    },
    {
      kind: "gauge",
      label: "Schema types",
      display: String(schemaN),
      value: schemaN,
      max: Math.max(4, schemaN),
      tone: schemaN === 0 ? "critical" : "good",
      marks: [{ at: 1, label: "1+ parseable" }],
      note: schemaN ? s.schemaTypes.slice(0, 3).join(", ") : "Invisible to answer engines and rich results",
    },
    {
      kind: "range",
      label: "Title length",
      value: titleLen,
      min: T.titleMin,
      max: T.titleMax,
      scaleMax: 90,
      unit: " ch",
      tone: titleLen == null ? "critical" : titleLen > T.titleMax || titleLen < T.titleMin ? "warning" : "good",
      note: titleLen == null ? "No title tag at all" : titleLen > T.titleMax ? "Truncated in results" : titleLen < T.titleMin ? "Room left for buying-intent words" : "Renders in full",
    },
    {
      kind: "range",
      label: "Meta description",
      value: descLen,
      min: T.descriptionMin,
      max: T.descriptionMax,
      scaleMax: 220,
      unit: " ch",
      tone: descLen == null ? "critical" : descLen > T.descriptionMax || descLen < T.descriptionMin ? "warning" : "good",
      note: descLen == null ? "Google is writing your snippet for you" : descLen > T.descriptionMax ? "Cut off mid-sentence" : descLen < T.descriptionMin ? "Wastes snippet width" : "A sensible length",
    },
    {
      kind: "gauge",
      label: "Images with alt text",
      display: s.images ? `${altOk}/${s.images}` : "—",
      value: s.images ? altOk : null,
      max: Math.max(1, s.images),
      tone: !s.images ? "none" : s.imagesMissingAlt === 0 ? "good" : altMissingPct > T.altMissingPct ? "critical" : "warning",
      marks: s.images ? [{ at: s.images, label: "all" }] : [],
      note: !s.images ? "No images on the homepage" : s.imagesMissingAlt === 0 ? "All described" : `${altMissingPct}% missing — free keyword context unused`,
    },
    {
      kind: "gauge",
      label: "Script tags",
      display: String(s.scripts),
      value: s.scripts,
      max: Math.max(40, s.scripts),
      tone: s.scripts > T.scripts ? "warning" : "good",
      marks: [{ at: T.scripts, label: `${T.scripts} limit` }],
      note: s.scripts > T.scripts ? "Each one is work before the page is usable" : "Within a sensible budget",
    },
    {
      kind: "gauge",
      label: "Images sized",
      display: s.images ? `${s.images - s.imagesMissingDims}/${s.images}` : "—",
      value: s.images ? s.images - s.imagesMissingDims : null,
      max: Math.max(1, s.images),
      tone: !s.images
        ? "none"
        : s.imagesMissingDims === 0
        ? "good"
        : (s.imagesMissingDims / s.images) * 100 > T.dimsMissingPct
        ? "warning"
        : "good",
      marks: s.images ? [{ at: s.images, label: "all" }] : [],
      note: !s.images
        ? "No images on the homepage"
        : s.imagesMissingDims === 0
        ? "No layout shift as they load"
        : `${s.imagesMissingDims} with no width/height — the layout jumps`,
    },
    {
      kind: "gauge",
      label: "Readable text",
      display: `${s.textRatio}%`,
      value: s.textRatio,
      max: Math.max(25, s.textRatio),
      tone: s.textRatio < T.textRatioMin ? "warning" : "good",
      marks: [{ at: T.textRatioMin, label: `${T.textRatioMin}% floor` }],
      note: s.textRatio < T.textRatioMin ? "Mostly markup — bytes shipped for very little content" : "A sensible share of the bytes is copy",
    },
    {
      kind: "gauge",
      label: "Render-blocking scripts",
      display: String(s.blockingScripts),
      value: s.blockingScripts,
      max: Math.max(6, s.blockingScripts),
      tone: s.blockingScripts > T.blockingScripts ? "warning" : "good",
      marks: [{ at: T.blockingScripts, label: `${T.blockingScripts} limit` }],
      note: s.blockingScripts > T.blockingScripts ? "The page stays blank until these load" : "Nothing much is holding up the first paint",
    },
  ];
}

function Scanning({ domain, adsense }) {
  const steps = [
    `Fetching ${domain}`,
    "Reading titles, headings and meta tags",
    "Looking for structured data",
    "Checking robots.txt, sitemap and 404s",
    "Reading the security and compression headers",
    "Measuring response time and page weight",
    ...(adsense ? ["Reading ads.txt and the AdSense policy pages"] : []),
    "Working out what it all costs you",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => Math.min(v + 1, steps.length - 1)), 900);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={{ padding: "72px 40px 80px", textAlign: "center" }}>
      <div style={{ width: 52, height: 52, margin: "0 auto 26px", borderRadius: "50%", border: "3px solid rgba(255,106,26,.25)", borderTopColor: "var(--color-accent)", animation: "sweep 1s linear infinite" }} />
      <div className="mono" style={{ marginBottom: 10 }}>Live read</div>
      <h3 style={{ margin: "0 0 22px", fontSize: "clamp(24px, 3vw, 32px)", lineHeight: 1.1 }}>Reading {domain}…</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, maxWidth: 360, margin: "0 auto", textAlign: "left" }}>
        {steps.map((s, idx) => (
          <div key={s} className="mono" style={{ display: "flex", gap: 10, color: idx < i ? "var(--fg-45)" : idx === i ? "var(--fg)" : "var(--fg-22)", transition: "color .3s", textTransform: "none", letterSpacing: ".02em", fontSize: 12 }}>
            <span style={{ flex: "none", width: 14 }}>{idx < i ? "✓" : idx === i ? "→" : ""}</span>
            <span>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * `actionLabel` exists because the default one is a promise.
 *
 * "MADBOT would →" is true of the SEO findings: writing the missing page and
 * marking up the schema is the product. It is not true of "install a certified
 * consent platform" or "publish an ads.txt" — those are the owner's to do, and
 * labelling them as ours would be selling work that does not happen.
 */
function Finding({ f, index, actionLabel = "MADBOT would →" }) {
  const t = TONE[f.severity] || TONE.good;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: "0 16px", padding: "16px 18px", borderRadius: 6, background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingTop: 3 }}>
        <span className="mono" style={{ color: "var(--fg-45)" }}>{String(index).padStart(2, "0")}</span>
        <span aria-hidden="true" style={{ width: 8, height: 8, background: t.color }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: f.detail ? 6 : 0 }}>
          <span style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.35 }}>{f.title}</span>
          <span className="tag" style={{ fontSize: 9.5, background: t.bg, color: t.fg, flex: "none", borderRadius: 4 }}>{f.area}</span>
        </div>
        {f.detail ? <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--fg-60)" }}>{f.detail}</p> : null}
        {f.fix ? (
          <div style={{ marginTop: 11, paddingTop: 10, borderTop: "1px solid var(--color-divider)", fontSize: 13, lineHeight: 1.55, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span className="mono" style={{ color: "var(--color-accent)", flex: "none" }}>{actionLabel}</span>
            <span style={{ color: "var(--fg-80)", flex: "1 1 240px", minWidth: 0 }}>{f.fix}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The AdSense readiness section — asked for, so it sits above the SEO
 * findings rather than at the bottom.
 *
 * It carries its own score because it answers a different question from the
 * rest of the report: not "will this rank" but "can this earn". Mixing the two
 * into one number would make both of them mean less.
 */
function AdsenseSection({ index, report }) {
  const b = bandFor(report.score);
  const areaRows = ADSENSE_AREAS.map((a) => {
    const fs = report.findings.filter((f) => f.area === a);
    return { area: a, fs, right: fs.filter((f) => f.severity === "good").length };
  }).filter((r) => r.fs.length);

  const problems = report.findings.filter((f) => f.severity !== "good");
  const wins = report.findings.filter((f) => f.severity === "good");
  const s = report.stats;

  return (
    <section>
      <SectionHead index={index} title="AdSense readiness" count={`${report.findings.length} checks`} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: "22px 32px", alignItems: "center", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", minWidth: 0 }}>
          <ScoreRing score={report.score} size={126} stroke={10} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <span className="mono" style={{ color: "var(--fg-45)" }}>Mechanically</span>
            <span style={{ fontFamily: "var(--font-heading)", fontSize: 25, lineHeight: 1, color: TONE[b.tone].color }}>
              {report.counts.critical === 0 ? "Ready" : report.counts.critical > 2 ? "Not ready" : "Nearly"}
            </span>
            <span style={{ fontSize: 12.5, color: "var(--fg-60)" }}>
              {report.counts.critical} blocking · {report.counts.warning} to tidy · {report.counts.good} already right
            </span>
          </div>
        </div>

        <div style={{ flex: "1 1 320px", minWidth: 0, display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: "10px 14px", alignItems: "center" }}>
          {areaRows.map((r) => (
            <Fragment key={r.area}>
              <span className="mono" style={{ whiteSpace: "nowrap" }}>{r.area}</span>
              <SegmentBar segments={r.fs.map((f) => ({ pct: 100 / r.fs.length, color: TONE[f.severity].color }))} height={11} />
              <span style={{ fontSize: 12.5, color: "var(--fg-60)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {r.right}/{r.fs.length} right
              </span>
            </Fragment>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 1, marginBottom: 16, background: "var(--color-divider)", border: "1px solid var(--color-divider)" }}>
        {[
          ["Ad code", s.installed ? "loaded" : "not present"],
          ["Ad slots", s.slots || "none"],
          ["Publisher id", s.clients.length ? s.clients[0].replace(/^ca-/, "") : "none found"],
          ["ads.txt", s.adsTxt.exists ? `${s.adsTxt.records} record${s.adsTxt.records === 1 ? "" : "s"}` : "absent"],
          ["Google authorised", s.adsTxt.googlePubIds.length ? "yes" : "no"],
          ["Consent platform", s.consent.length ? s.consent[0] : "none"],
          ["Pages found", s.pageCount || "1"],
          ["Words per ad", s.wordsPerSlot === null ? "—" : s.wordsPerSlot],
        ].map(([label, val]) => (
          <div key={label} style={{ background: "var(--color-bg)", padding: "11px 14px" }}>
            <div className="mono" style={{ fontSize: 9.5, marginBottom: 4 }}>{label}</div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 17, lineHeight: 1.15, wordBreak: "break-word" }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {problems.map((f, i) => <Finding key={f.title} f={f} index={i + 1} actionLabel="To be ready →" />)}
      </div>

      {wins.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8, marginTop: 8 }}>
          {wins.map((f) => (
            <div key={f.title} style={{ display: "flex", gap: 10, fontSize: 13.5, padding: "11px 14px", borderRadius: 6, background: "var(--wash-1)", border: "1px solid var(--color-divider)" }}>
              <span style={{ color: TONE.good.color, flex: "none" }}>✓</span>
              <span style={{ color: "var(--fg-80)" }}>{f.title}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Said out loud, because the section would otherwise read as a verdict
          on whether Google will say yes — which nothing measurable can be. */}
      <div style={{ marginTop: 14, padding: "13px 16px", borderRadius: 6, border: "1px dashed var(--color-divider)", display: "flex", flexDirection: "column", gap: 7 }}>
        <span className="mono" style={{ color: "var(--fg-45)" }}>What this can&apos;t tell you</span>
        {report.notes.map((n) => (
          <span key={n} style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--fg-60)" }}>{n}</span>
        ))}
      </div>
    </section>
  );
}

function SectionHead({ index, title, count }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "6px 14px", marginBottom: 12, flexWrap: "wrap" }}>
      <span className="section-index" style={{ whiteSpace: "nowrap" }}>{index}</span>
      <h3 style={{ margin: 0, fontSize: "clamp(19px, 2vw, 23px)", lineHeight: 1.1 }}>{title}</h3>
      {count != null ? <span className="mono" style={{ color: "var(--fg-45)" }}>{count}</span> : null}
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
        background: "linear-gradient(to bottom, var(--scrim) 0%, var(--scrim-strong) 42%)",
        backdropFilter: "blur(7px)",
        animation: "revealFade .5s ease",
      }}
    >
      <div className="card elev-lg" style={{ maxWidth: 470, padding: 30, gap: 14, textAlign: "center", border: "1px solid var(--color-accent-400)", borderRadius: 6 }}>
        <div className="mono">That&apos;s the diagnosis</div>
        <h3 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>Want it fixed?</h3>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "var(--fg-80)" }}>
          Every SEO tool will hand you a list like the one behind this panel. MADBOT is the one that then goes and does
          the work — writes the missing pages, marks up the schema, lists you where buyers look — and shows you the
          receipt for each one.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "left", fontSize: 13.5, color: "var(--fg-80)", padding: "4px 0" }}>
          <div>→ A full plan, ordered by what it&apos;s worth</div>
          <div>→ The work carried out at the autonomy level you set</div>
          <div>→ Everything logged; nothing published without your say</div>
        </div>
        <Link className="btn btn-primary" href={`/login${qs}`} style={{ minHeight: 50, fontSize: 15.5, color: "var(--on-accent)" }}>
          Create your account
        </Link>
        <Link href="/pricing" style={{ fontSize: 13, color: "var(--color-accent)", textDecoration: "none" }}>
          See pricing first
        </Link>
      </div>
    </div>
  );
}

/**
 * The free report. This is the first thing most people see of MADBOT, so it
 * reads as an analytics document rather than a list: a scored ring with a
 * band, health by area, every measurement drawn against the threshold the
 * audit judged it by, and then the findings with what MADBOT would do about
 * each. Every number on screen is measured live from the site — nothing is
 * modelled or estimated.
 */
export default function AuditModal({ url, adsense = false, onClose }) {
  const [state, setState] = useState({ phase: "loading" });
  const [gated, setGated] = useState(false);

  const domain = useMemo(() => String(url || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0], [url]);

  useEffect(() => {
    let alive = true;
    const startedAt = Date.now();
    (async () => {
      try {
        const res = await fetch(`/api/audit?url=${encodeURIComponent(url)}${adsense ? "&adsense=1" : ""}`);
        const data = await res.json();
        // Hold the scanning view briefly so the steps don't flash past.
        const wait = Math.max(0, 3200 - (Date.now() - startedAt));
        setTimeout(() => {
          if (!alive) return;
          setState(data.ok ? { phase: "done", data, checkedAt: new Date() } : { phase: "error", error: data.error });
        }, wait);
      } catch {
        if (alive) setState({ phase: "error", error: "Something went wrong reaching that site." });
      }
    })();
    return () => {
      alive = false;
    };
  }, [url, adsense]);

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
  const total = d ? d.findings.length : 0;
  const metrics = d ? metricsFor(d) : [];
  const b = d ? bandFor(d.score) : null;
  const time = state.checkedAt ? state.checkedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  const areaRows = d
    ? AREAS.map((a) => {
        const fs = d.findings.filter((f) => f.area === a);
        return { area: a, fs, right: fs.filter((f) => f.severity === "good").length };
      }).filter((r) => r.fs.length)
    : [];

  const pad = "clamp(18px, 3vw, 34px)";

  // 01 is the header and score, 02 the measurements; everything after is
  // numbered as it is emitted. Reset on every render by being declared here.
  let sectionNo = 2;
  const nextIndex = () => String((sectionNo += 1)).padStart(2, "0");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Site report for ${domain}`}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(4,3,7,.84)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: "20px 12px" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !gated) onClose();
      }}
    >
      <div
        className="marketing dark-stage"
        style={{
          position: "relative",
          width: "min(1080px, 100%)",
          maxHeight: "94vh",
          overflow: "hidden",
          border: "1px solid var(--color-divider)",
          borderRadius: 8,
          boxShadow: "0 40px 120px rgba(0,0,0,.6)",
          animation: "rise .4s cubic-bezier(.2,.8,.2,1)",
          fontSize: 16,
        }}
      >
        {!gated ? (
          <button
            onClick={onClose}
            aria-label="Close report"
            style={{ position: "absolute", right: 14, top: 14, zIndex: 6, width: 36, height: 36, borderRadius: 6, background: "var(--color-surface)", border: "1px solid var(--fg-32)", color: "var(--fg)", fontSize: 18, lineHeight: 1, display: "grid", placeItems: "center", boxShadow: "0 6px 18px rgba(0,0,0,.45)" }}
          >
            ×
          </button>
        ) : null}

        {gated ? <Gate url={url} /> : null}

        <div style={{ maxHeight: "94vh", overflowY: "auto" }}>
          {state.phase === "loading" ? <Scanning domain={domain} adsense={adsense} /> : null}

          {state.phase === "error" ? (
            <div style={{ padding: "64px 40px", textAlign: "center" }}>
              <div className="mono" style={{ marginBottom: 10 }}>Could not read</div>
              <h3 style={{ margin: "0 0 8px", fontSize: 26 }}>{domain}</h3>
              <p style={{ margin: "0 0 22px", fontSize: 14, color: "var(--fg-60)" }}>{state.error}</p>
              <button className="btn btn-secondary" onClick={onClose} style={{ fontWeight: 600, color: "var(--fg)", borderColor: "var(--color-divider)" }}>Try another address</button>
            </div>
          ) : null}

          {state.phase === "done" && d ? (
            <>
              {/* 01 — Header and score */}
              <header style={{ padding: `${pad} ${pad} 0` }}>
                <div className="kicker-row mono" style={{ marginBottom: 18, paddingRight: 48 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <SiteIcon site={{ faviconUrl: d.faviconUrl, title: d.title, url: d.url }} size={14} />
                    Site report — {domain}
                  </span>
                  <span>Checked live · {time}</span>
                  <span>{total} checks</span>
                </div>
                <h2 style={{ margin: "0 0 10px", fontSize: "clamp(28px, 4vw, 46px)", lineHeight: 1.02, letterSpacing: "-.01em", maxWidth: "18em" }}>
                  {d.counts.critical > 0
                    ? `${d.counts.critical} thing${d.counts.critical === 1 ? "" : "s"} costing you traffic right now`
                    : d.counts.warning > 0
                    ? `${d.counts.warning} thing${d.counts.warning === 1 ? "" : "s"} worth fixing`
                    : "Solid foundations — now go win the terms"}
                </h2>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--fg-60)" }}>
                  {d.title ? `“${d.title.slice(0, 90)}${d.title.length > 90 ? "…" : ""}”` : "This page has no title tag."}
                </p>
              </header>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "28px 40px", alignItems: "center", padding: `26px ${pad} 28px`, borderBottom: "1px solid var(--color-divider)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "18px 24px", flex: "0 1 auto", flexWrap: "wrap", minWidth: 0 }}>
                  <ScoreRing score={d.score} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: "1 1 150px", minWidth: 0 }}>
                    <span className="mono" style={{ color: "var(--fg-45)" }}>Verdict</span>
                    <span style={{ fontFamily: "var(--font-heading)", fontSize: 30, lineHeight: 1, color: TONE[b.tone].color }}>{b.label}</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                      {["critical", "warning", "good"].map((k) => (
                        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--fg-80)", fontVariantNumeric: "tabular-nums" }}>
                          <span aria-hidden="true" style={{ width: 8, height: 8, background: TONE[k].color, flex: "none" }} />
                          <b style={{ fontWeight: 700, minWidth: "1.4em" }}>{d.counts[k]}</b> {TONE[k].label.toLowerCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ flex: "1 1 360px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                    <span className="mono" style={{ color: "var(--fg-45)" }}>Health by area</span>
                    <span className="mono" style={{ color: "var(--fg-45)" }}>each block one check</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: "11px 14px", alignItems: "center" }}>
                    {areaRows.map((r) => (
                      <Fragment key={r.area}>
                        <span className="mono" style={{ whiteSpace: "nowrap" }}>{r.area}</span>
                        <SegmentBar segments={r.fs.map((f) => ({ pct: 100 / r.fs.length, color: TONE[f.severity].color }))} height={12} />
                        <span style={{ fontSize: 12.5, color: "var(--fg-60)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                          {r.right}/{r.fs.length} right
                        </span>
                      </Fragment>
                    ))}
                  </div>
                  <SegmentBar
                    height={6}
                    gap={0}
                    segments={[
                      { pct: (d.counts.critical / total) * 100, color: TONE.critical.color },
                      { pct: (d.counts.warning / total) * 100, color: TONE.warning.color },
                      { pct: (d.counts.good / total) * 100, color: TONE.good.color },
                    ].filter((s) => s.pct > 0)}
                  />
                </div>
              </div>

              {/* 02 — The numbers */}
              <section style={{ padding: `26px ${pad}`, borderBottom: "1px solid var(--color-divider)" }}>
                <SectionHead index="02 — Measured live" title="The numbers, against the line each one is judged by" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
                  {metrics.map((m) =>
                    m.kind === "range" ? <RangeGauge key={m.label} {...m} /> : <Gauge key={m.label} {...m} />
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 1, marginTop: 14, background: "var(--color-divider)", border: "1px solid var(--color-divider)" }}>
                  {[
                    ["HTML weight", `${d.stats.htmlKb} KB`],
                    ["Compression", d.stats.compression || "none"],
                    ["DOM elements", d.stats.domElements.toLocaleString()],
                    ["Internal links", d.stats.internalLinks],
                    ["External links", d.stats.externalLinks],
                    ["Sitemap URLs", d.stats.sitemapUrls || "none"],
                    ["H2 headings", d.stats.h2],
                    ["Stylesheets", d.stats.stylesheets],
                    ["Charset", d.stats.charset || "undeclared"],
                    ["X/Twitter card", d.stats.twitterCard || "none"],
                    ["Social profiles", d.stats.social.length || "none"],
                    ["Analytics", d.stats.analytics.length ? d.stats.analytics.length : "none"],
                    ["http → https", d.stats.httpsRedirect === null ? "—" : d.stats.httpsRedirect ? "redirects" : "both live"],
                    ["404 handling", d.stats.notFoundOk === null ? "—" : d.stats.notFoundOk ? "correct" : "answers 200"],
                    ["Security headers", d.stats.securityHeadersMissing.length ? `${d.stats.securityHeadersMissing.length} missing` : "set"],
                    ["Indexable", d.stats.noindex ? "noindex" : "yes"],
                  ].map(([label, val]) => (
                    <div key={label} style={{ background: "var(--color-bg)", padding: "11px 14px" }}>
                      <div className="mono" style={{ fontSize: 9.5, marginBottom: 4 }}>{label}</div>
                      <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, lineHeight: 1 }}>{val}</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 03 onwards — the AdSense section if it was asked for, then
                  the findings. Numbered from a counter rather than by hand:
                  the indices used to be spelled out per section and adding one
                  more meant three separate expressions had to agree. */}
              <div style={{ padding: `26px ${pad} ${pad}`, display: "flex", flexDirection: "column", gap: 30 }}>
                {d.adsense ? <AdsenseSection index={nextIndex()} report={d.adsense} /> : null}

                {criticals.length ? (
                  <section>
                    <SectionHead index={nextIndex()} title="Costing you now" count={`${criticals.length}`} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {criticals.map((f, i) => <Finding key={f.title} f={f} index={i + 1} />)}
                    </div>
                  </section>
                ) : null}

                {warnings.length ? (
                  <section>
                    <SectionHead index={nextIndex()} title="Worth fixing" count={`${warnings.length}`} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {warnings.map((f, i) => <Finding key={f.title} f={f} index={criticals.length + i + 1} />)}
                    </div>
                  </section>
                ) : null}

                {goods.length ? (
                  <section>
                    <SectionHead index={nextIndex()} title="Already right" count={`${goods.length}`} />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
                      {goods.map((f) => (
                        <div key={f.title} style={{ display: "flex", gap: 10, fontSize: 13.5, padding: "11px 14px", borderRadius: 6, background: "var(--wash-1)", border: "1px solid var(--color-divider)" }}>
                          <span style={{ color: TONE.good.color, flex: "none" }}>✓</span>
                          <span style={{ color: "var(--fg-80)" }}>{f.title}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                <div style={{ padding: "clamp(22px, 3vw, 30px)", borderRadius: 6, background: "linear-gradient(150deg, rgba(255,106,26,.14), var(--color-surface) 62%)", border: "1px solid var(--color-accent-400)", display: "flex", flexDirection: "column", gap: 12 }}>
                  <span className="mono">What happens next</span>
                  <h3 style={{ margin: 0, fontSize: "clamp(22px, 2.6vw, 30px)", lineHeight: 1.08 }}>Anyone can tell you this. Almost nobody fixes it.</h3>
                  <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "var(--fg-80)", maxWidth: "62em" }}>
                    This report took seconds and cost nothing. The reason a report like it usually changes nothing is that the
                    next step — writing the pages that are missing, marking up the schema, listing you where buyers look — is
                    weeks of work nobody has time for. That&apos;s the part MADBOT does, at whatever level of autonomy
                    you&apos;re comfortable giving it, with every action logged and nothing published without your say.
                  </p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 4 }}>
                    <Link className="btn btn-primary" href={`/login?mode=signup&next=pricing&url=${encodeURIComponent(url)}`} style={{ color: "var(--on-accent)", minHeight: 48 }}>
                      Get this fixed
                    </Link>
                    <Link className="btn btn-secondary" href="/pricing" style={{ fontWeight: 600, color: "var(--fg)", borderColor: "var(--fg-32)", minHeight: 48 }}>
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
