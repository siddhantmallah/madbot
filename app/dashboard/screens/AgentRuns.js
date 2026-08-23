import { ago, minutesAgo } from "../data";
import { statusStyle, JOB_STATUS } from "../../../lib/jobTypes";

function Duration({ ms }) {
  if (!ms) return null;
  const s = ms / 1000;
  return <span>{s < 60 ? `${s.toFixed(1)}s` : `${(s / 60).toFixed(1)} min`}</span>;
}

export default function AgentRuns({ jobs, onRunCrawl, onRunAudit, onRunCompetitorScan, busy, domain, competitorCount }) {
  const running = jobs.filter((j) => [JOB_STATUS.RUNNING, JOB_STATUS.VERIFYING, JOB_STATUS.QUEUED].includes(j.status));

  return (
    <section data-screen-label="Agent runs" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 3px" }}>Agent runs</h2>
          <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>
            Every action MADBOT takes runs as a job with its own steps, timing and result. Nothing happens outside
            one of these.
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: 18, gap: 12, background: "var(--color-neutral-100)" }}>
        <h4 style={{ margin: 0 }}>Start a run</h4>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={onRunCrawl} disabled={!!busy} style={{ fontSize: 13 }}>
            {busy === "crawl_site" ? "Crawling…" : `Crawl ${domain}`}
          </button>
          <button className="btn btn-secondary" onClick={onRunAudit} disabled={!!busy} style={{ fontWeight: 600, fontSize: 13 }}>
            {busy === "audit_site" ? "Auditing…" : "Re-audit homepage"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={onRunCompetitorScan}
            disabled={!!busy || competitorCount === 0}
            style={{ fontWeight: 600, fontSize: 13 }}
          >
            {busy === "competitor_scan" ? "Scanning…" : `Scan ${competitorCount} competitor${competitorCount === 1 ? "" : "s"}`}
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 11.5 }} className="text-muted">
          Runs happen while this tab is open. Unattended scheduling needs a service account — see the note below.
        </p>
      </div>

      {running.length ? (
        <div className="card elev-sm" style={{ padding: 16, gap: 8, border: "1px solid var(--color-accent-400)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--color-accent-300)", borderTopColor: "var(--color-accent)", animation: "sweep 1s linear infinite", display: "block", flex: "none" }} />
            <strong style={{ fontSize: 13.5 }}>{running.length} run{running.length === 1 ? "" : "s"} in flight</strong>
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {jobs.length === 0 ? (
          <div className="text-muted" style={{ fontSize: 13.5 }}>No runs yet. Start one above.</div>
        ) : null}

        {jobs.map((j) => {
          const s = statusStyle(j.status);
          return (
            <div key={j.id} className="card elev-sm" style={{ padding: 18, gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 16 }}>{j.label || j.type}</span>
                <span className="tag" style={{ fontSize: 10, background: s.bg, color: s.fg }}>{s.label}</span>
                <span className="tag tag-neutral" style={{ fontSize: 10 }}>{j.agent || "MADBOT"}</span>
                {j.attempt > 1 ? <span className="tag tag-outline" style={{ fontSize: 10 }}>attempt {j.attempt}</span> : null}
                <span className="text-muted" style={{ fontSize: 11.5, marginLeft: "auto" }}>
                  {j.createdAt ? ago(minutesAgo(j.createdAt)) : ""}
                  {j.durationMs ? <> · <Duration ms={j.durationMs} /></> : null}
                </span>
              </div>

              {j.summary ? (
                <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{j.summary}</div>
              ) : null}

              {j.error ? (
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--color-accent-800)", background: "var(--color-accent-100)", borderRadius: 12, padding: "9px 12px" }}>
                  {j.error}
                </div>
              ) : null}

              {(j.steps || []).length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {(j.plannedSteps || []).map((name) => {
                    const done = (j.steps || []).find((st) => st.name === name);
                    return (
                      <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                        <span style={{ color: done ? "var(--ok)" : "var(--fg-22)", flex: "none", width: 12 }}>
                          {done ? "✓" : "·"}
                        </span>
                        <span style={{ color: done ? "var(--fg-80)" : "var(--fg-32)" }}>{name}</span>
                        {done?.detail ? <span className="text-muted" style={{ fontSize: 11 }}>— {done.detail}</span> : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {j.result ? (
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", paddingTop: 2 }}>
                  {Object.entries(j.result).map(([k, v]) => (
                    <span key={k} className="tag tag-neutral" style={{ fontSize: 10 }}>
                      {k}: {typeof v === "number" ? v.toLocaleString() : String(v)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
