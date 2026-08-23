"use client";

import {
  DEFAULT_POLICY,
  DECISIONS,
  JURISDICTIONS,
  LEVELS,
  LEVEL_META,
} from "../../../lib/dataPolicy";

const DECISION_STYLE = {
  [DECISIONS.ALLOWED]: { label: "Allowed", bg: "var(--color-accent-2-100)", fg: "var(--color-accent-2-800)" },
  [DECISIONS.REVIEW]: { label: "Ask me", bg: "var(--color-accent-100)", fg: "var(--color-accent-800)" },
  [DECISIONS.NEVER]: { label: "Never", bg: "var(--color-neutral-200)", fg: "var(--color-neutral-800)" },
};

const ORDER = [LEVELS.COMPANY, LEVELS.ROLE_INBOX, LEVELS.NAMED_PERSON];
const REGIONS = ["EU", "UK", "US", "IN", "CA", "OTHER"];

/**
 * The data rules, sitting alongside the plain-English guardrails on the Autonomy
 * screen — because "what may you collect about people" is the same kind of
 * decision as "what may you publish without asking", and belongs in the same
 * place rather than buried in settings.
 */
export default function DataRules({ policy, onChange }) {
  const p = policy || DEFAULT_POLICY;

  function setCell(level, region, decision) {
    onChange({
      ...p,
      levels: { ...p.levels, [level]: { ...p.levels[level], [region]: decision } },
    });
  }

  return (
    <section className="card elev-sm" style={{ padding: 18, gap: 14 }}>
      <div>
        <h4 style={{ margin: "0 0 4px" }}>Data &amp; privacy rules</h4>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }} className="text-muted">
          Three levels, because they aren&apos;t the same thing. A company&apos;s certificate and published pricing are
          commercial facts. A named employee&apos;s email address is personal data, and the law treats it that way
          wherever it was found.
        </p>
      </div>

      {/* The levels, explained before the controls — the distinction is the
          whole point and the grid is meaningless without it. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {ORDER.map((level, i) => {
          const m = LEVEL_META[level];
          return (
            <div key={level} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span
                style={{
                  flex: "none",
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  background: "var(--color-neutral-200)",
                  color: "var(--color-neutral-800)",
                  fontSize: 11,
                  fontWeight: 700,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {i + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  {m.label}
                  <span
                    className="tag"
                    style={{
                      fontSize: 9.5,
                      background: m.personalData === false ? "var(--color-accent-2-100)" : "var(--color-accent-100)",
                      color: m.personalData === false ? "var(--color-accent-2-800)" : "var(--color-accent-800)",
                    }}
                  >
                    {m.personalData === false ? "not personal data" : m.personalData === "sometimes" ? "may be personal data" : "personal data"}
                  </span>
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.5 }} className="text-muted">
                  {m.why}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* The grid. Company-level is fixed as allowed everywhere: switching off
          reading a public homepage would break the product and protects nobody. */}
      <div className="scroll-x">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 520 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "7px 10px", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--fg-45)" }}>
                Prospect is in
              </th>
              {ORDER.map((level) => (
                <th key={level} style={{ textAlign: "left", padding: "7px 10px", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--fg-45)" }}>
                  {LEVEL_META[level].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {REGIONS.map((region) => (
              <tr key={region} style={{ borderTop: "1px solid var(--color-divider)" }}>
                <td style={{ padding: "9px 10px" }}>
                  <span style={{ fontWeight: 600 }}>{JURISDICTIONS[region].label}</span>
                  <br />
                  <span className="text-muted" style={{ fontSize: 11 }}>{JURISDICTIONS[region].regime}</span>
                </td>
                {ORDER.map((level) => {
                  const value = p.levels?.[level]?.[region] || DECISIONS.REVIEW;
                  const locked = level === LEVELS.COMPANY;
                  return (
                    <td key={level} style={{ padding: "9px 10px" }}>
                      {locked ? (
                        <span className="tag" style={{ fontSize: 10, ...styleFor(value) }} title="Reading a company's public website is always permitted — it isn't personal data.">
                          {DECISION_STYLE[value].label}
                        </span>
                      ) : (
                        <select
                          className="input"
                          value={value}
                          onChange={(e) => setCell(level, region, e.target.value)}
                          style={{ width: "auto", minHeight: 30, paddingBlock: 0, fontSize: 12 }}
                        >
                          <option value={DECISIONS.ALLOWED}>Allowed</option>
                          <option value={DECISIONS.REVIEW}>Ask me</option>
                          <option value={DECISIONS.NEVER}>Never</option>
                        </select>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Fixed rules. Presented as fixed rather than as switches, because
          offering a toggle would imply there's a lawful way to do these. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7, paddingTop: 2 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>Not configurable</div>
        {[
          {
            k: "Special-category data",
            v: "Never collected",
            why: "Health, beliefs, politics, ethnicity, sexuality, union membership. There is no lawful basis for gathering these for cold sales, so there is no switch.",
          },
          {
            k: "Outreach email",
            v: "Always drafted, never sent",
            why: "A person presses send, at every autonomy level. An unattended agent emailing strangers from your domain risks your sending reputation and makes any complaint yours to answer.",
          },
          {
            k: "An objection",
            v: "Honoured immediately and permanently",
            why: "Suppression records are never deleted, because forgetting one means contacting that person again.",
          },
        ].map((r) => (
          <div key={r.k} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12.5 }}>
            <span style={{ minWidth: 148, flex: "none", color: "var(--fg-60)" }}>{r.k}</span>
            <span>
              <strong>{r.v}</strong>
              <br />
              <span className="text-muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>{r.why}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Retention. Shown as a consequence, not a preference. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 2 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>How long anything is kept</div>
        {[
          { k: "Active prospects", v: `${p.retentionDays.active} days`, why: "Then deleted automatically, unless something happens with them." },
          { k: "Declined prospects", v: `${p.retentionDays.rejected} days`, why: "Shorter, because there is no reason to keep them." },
          { k: "Objections", v: "Kept indefinitely", why: "The only thing retained is the fact that this contact must not be approached." },
        ].map((r) => (
          <div key={r.k} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 12.5 }}>
            <span style={{ minWidth: 148, flex: "none", color: "var(--fg-60)" }}>{r.k}</span>
            <span>
              <strong>{r.v}</strong> <span className="text-muted" style={{ fontSize: 11.5 }}>— {r.why}</span>
            </span>
          </div>
        ))}
      </div>

      <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55 }} className="text-muted">
        These are settings, not legal advice. They&apos;re designed to make the defensible choice the default and to
        record what was done and why — but whether your use of them is lawful depends on your business, and that&apos;s
        worth checking with someone qualified.
      </p>
    </section>
  );
}

function styleFor(v) {
  const s = DECISION_STYLE[v] || DECISION_STYLE[DECISIONS.REVIEW];
  return { background: s.bg, color: s.fg };
}
