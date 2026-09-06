"use client";

import Link from "next/link";
import { MadbotMark } from "./Brand";
import ThemeToggle from "./ThemeToggle";
import SiteFooter from "./SiteFooter";
import { COMPANY, missingForLaunch } from "../../lib/company";

/**
 * The shell every policy document renders in.
 *
 * Legal pages get read in two ways — skimmed for one clause, or read start to
 * finish by somebody deciding whether to trust you — so the layout serves
 * both: a sticky contents list keyed to numbered sections, and a plain
 * single-column measure for reading. Deliberately not the dark stage the
 * marketing pages use; this is a document, and a document should be quiet.
 */
export default function LegalPage({ title, kicker, updated, effective, intro, toc = [], children }) {
  const missing = missingForLaunch();

  return (
    <div className="marketing" style={{ minHeight: "100vh", background: "var(--color-bg)", fontSize: 16 }}>
      <header style={{ borderBottom: "1px solid var(--color-divider)", position: "sticky", top: 0, zIndex: 10, background: "var(--color-bg)" }}>
        <div className="nav pad-responsive" style={{ maxWidth: 1180, margin: "0 auto", padding: "15px 28px" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 11, textDecoration: "none", color: "var(--fg)", marginRight: "auto" }}>
            <MadbotMark size={29} />
            <span style={{ fontFamily: "var(--font-body)", fontSize: 21, color: "var(--fg)" }}>madbot</span>
          </Link>
          <ThemeToggle compact />
          <Link className="btn btn-secondary" href="/legal" style={{ fontWeight: 600, color: "var(--fg)", borderColor: "var(--color-divider)" }}>
            All policies
          </Link>
        </div>
      </header>

      <main className="pad-responsive" style={{ maxWidth: 1180, margin: "0 auto", padding: "clamp(32px, 5vw, 60px) 28px 80px" }}>
        <div className="kicker-row mono" style={{ marginBottom: 20 }}>
          <span>{kicker || "Legal"}</span>
          {effective ? <span>In force from {effective}</span> : null}
          <span>Last updated {updated}</span>
        </div>

        <h1 style={{ margin: "0 0 18px", fontSize: "clamp(32px, 5.4vw, 60px)", lineHeight: 1.02, letterSpacing: "-.015em", maxWidth: "14em" }}>
          {title}
        </h1>

        {intro ? (
          <div style={{ maxWidth: "44em", fontSize: 17, lineHeight: 1.65, color: "var(--fg-80)", marginBottom: 30 }}>{intro}</div>
        ) : null}

        {/* An incomplete policy that looks complete is worse than one that says
            what it is missing. This block disappears on its own once the
            company details in lib/company.js are filled in. */}
        {missing.length ? (
          <div
            role="note"
            style={{
              maxWidth: "44em",
              marginBottom: 34,
              padding: "16px 18px",
              borderRadius: 6,
              border: "1px solid var(--color-accent-400)",
              background: "var(--color-accent-100)",
              fontSize: 13.5,
              lineHeight: 1.6,
              color: "var(--color-accent-800)",
            }}
          >
            <b>This document is not yet complete.</b> {COMPANY.legalName} has not published the following, which
            this policy needs before it can be relied on: {missing.join(", ")}. Please contact us for any of these in
            the meantime.
          </div>
        ) : null}

        <div className="legal-body">
          {toc.length ? (
            <nav aria-label="Contents" className="legal-toc">
              <h2 className="mono" style={{ margin: "0 0 12px", fontSize: 11 }}>Contents</h2>
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {toc.map((t, i) => (
                  <li key={t.id} style={{ display: "flex", gap: 9, fontSize: 13.5, lineHeight: 1.4 }}>
                    <span className="mono" style={{ flex: "none", color: "var(--fg-32)" }}>{String(i + 1).padStart(2, "0")}</span>
                    <a href={`#${t.id}`} style={{ color: "var(--fg-60)", textDecoration: "none" }}>{t.title}</a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}

          <div style={{ minWidth: 0, maxWidth: "46em" }}>{children}</div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

/** One numbered clause. `index` is passed rather than derived so the number on
 *  screen always matches the contents list even if sections move. */
export function LegalSection({ id, index, title, children }) {
  return (
    <section id={id} style={{ scrollMarginTop: 80, marginBottom: 38 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 13, marginBottom: 12, flexWrap: "wrap" }}>
        <span className="section-index" style={{ whiteSpace: "nowrap" }}>{String(index).padStart(2, "0")}</span>
        <h2 style={{ margin: 0, fontSize: "clamp(21px, 2.4vw, 27px)", lineHeight: 1.12 }}>{title}</h2>
      </div>
      <div className="legal-prose">{children}</div>
    </section>
  );
}

/** A set-off block for something a reader must not miss. */
export function Callout({ children, tone = "neutral" }) {
  const accent = tone === "warn" ? "var(--color-accent)" : "var(--color-accent-2)";
  return (
    <div
      style={{
        margin: "16px 0",
        padding: "14px 16px",
        borderRadius: 6,
        borderLeft: `3px solid ${accent}`,
        background: "var(--wash-1)",
        fontSize: 14.5,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}

/** A definition-style table. Rows are [term, description]. */
export function DefTable({ rows, head }) {
  return (
    <div style={{ overflowX: "auto", margin: "16px 0" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 420 }}>
        {head ? (
          <thead>
            <tr>
              {head.map((h) => (
                <th
                  key={h}
                  className="mono"
                  style={{ textAlign: "left", padding: "9px 12px", borderBottom: "1px solid var(--color-divider)", fontSize: 10, whiteSpace: "nowrap" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td
                  key={j}
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--color-divider)",
                    verticalAlign: "top",
                    lineHeight: 1.55,
                    color: j === 0 ? "var(--fg)" : "var(--fg-80)",
                    fontWeight: j === 0 ? 600 : 400,
                    minWidth: j === 0 ? 130 : undefined,
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
