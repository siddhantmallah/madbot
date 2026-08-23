import { planFor, SOURCE_LABELS } from "../../../lib/opportunities";

const SEV = {
  critical: { label: "Costing you now", bg: "var(--color-accent-100)", fg: "var(--color-accent-800)" },
  warning: { label: "Worth fixing", bg: "var(--color-accent-2-100)", fg: "var(--color-accent-2-800)" },
  // Context rather than a task — a competitor repositioning is worth knowing
  // about without pretending it's work you have to do.
  info: { label: "Worth knowing", bg: "var(--color-neutral-100)", fg: "var(--color-neutral-800)" },
};

export default function Opportunities({
  zoom,
  setZoom,
  sel,
  setSel,
  taken,
  dismissed,
  onTake,
  onDismiss,
  opportunities,
  siteName,
  domain,
  onRerunAudit,
  rerunning,
}) {
  const { plays, nodes, hasAudit, score, sources = {}, hidden = 0 } = opportunities;

  // Gate on there being nothing to show, not on the audit specifically —
  // competitor diffs, AI visibility and Search Console all feed this now, and
  // any one of them can populate the map on its own.
  if (plays.length === 0) {
    return (
      <section data-screen-label="Opportunities" style={{ maxWidth: 680, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <h2 style={{ margin: "0 0 3px" }}>Nothing mapped yet</h2>
          <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>
            {hasAudit
              ? `I checked ${domain} and didn't find anything worth flagging — the foundations are clean. Re-run it any time to pick up changes.`
              : `This site was connected before I started keeping the audit. Run it now and every play below comes from what I actually find on ${domain}.`}
          </p>
        </div>
        <button className="btn btn-primary" onClick={onRerunAudit} disabled={rerunning} style={{ alignSelf: "flex-start" }}>
          {rerunning ? "Reading your site…" : `Run the audit on ${domain}`}
        </button>
      </section>
    );
  }

  const opp = nodes[sel] || plays[0];
  const plan = planFor(opp);
  const criticals = plays.filter((p) => p.severity === "critical").length;

  return (
    <section data-screen-label="Opportunities" className="split-side" style={{ "--side": "342px", gap: 20, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div>
            {/* Not "found on your site" any more — some of these come from a
                competitor's page or from Search Console. */}
            <h2 style={{ margin: "0 0 3px" }}>
              {plays.length} thing{plays.length === 1 ? "" : "s"} worth doing for {domain}
            </h2>
            <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>
              Every circle traces back to a real measurement. Bigger and nearer the middle means it scores higher on
              impact against effort. Click one.
              {hidden > 0 ? ` ${hidden} lower-scoring item${hidden === 1 ? "" : "s"} not drawn.` : ""}
            </p>
            {/* Which signals are actually feeding this, so an empty-looking map
                is explained by what hasn't run rather than left a mystery. */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
              {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                <span
                  key={key}
                  className={sources[key] ? "tag tag-accent-2" : "tag tag-neutral"}
                  style={{ fontSize: 10, opacity: sources[key] ? 1 : 0.45 }}
                  title={sources[key] ? `${label} is feeding this map` : `${label} hasn't run yet`}
                >
                  {label}
                  {sources[key] ? "" : " · none"}
                </span>
              ))}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btn btn-secondary btn-icon" onClick={() => setZoom((z) => Math.max(0.7, z - 0.15))} aria-label="Zoom out">–</button>
            <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", width: 38, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
            <button className="btn btn-secondary btn-icon" onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))} aria-label="Zoom in">+</button>
          </div>
        </div>

        {/* The bubbles are absolutely positioned around a fixed 470,300 centre, so
            this cannot reflow. On a narrow screen it scrolls inside its own frame
            instead of widening the page. */}
        <div className="graph-frame" style={{ position: "relative", height: 600, borderRadius: 34, overflow: "hidden", background: "radial-gradient(85% 78% at 34% 24%, var(--color-accent-2-100) 0%, var(--color-bg) 62%)", border: "1px solid var(--color-divider)" }}>
          <div className="graph-canvas" style={{ position: "absolute", inset: 0, transform: `scale(${zoom})`, transition: "transform .35s cubic-bezier(.2,.8,.2,1)" }}>
            {[540, 360, 180].map((s) => (
              <div key={s} style={{ position: "absolute", left: 470, top: 300, width: s, height: s, borderRadius: "50%", border: "1px dashed var(--color-neutral-300)", transform: "translate(-50%,-50%)" }} />
            ))}

            <div
              style={{
                position: "absolute",
                left: 470,
                top: 300,
                transform: "translate(-50%,-50%)",
                width: 128,
                height: 128,
                borderRadius: "50%",
                background: "var(--color-surface)",
                boxShadow: "var(--shadow-md)",
                display: "grid",
                placeItems: "center",
                textAlign: "center",
                padding: 12,
              }}
            >
              <div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 26, lineHeight: 1 }}>{score ?? "—"}</div>
                <div className="text-muted" style={{ fontSize: 10 }}>site score</div>
              </div>
            </div>

            {plays.map((n) => {
              const active = sel === n.id;
              const isTaken = !!taken[n.id];
              const isDismissed = !!dismissed[n.id];
              return (
                <button
                  key={n.id}
                  onClick={() => setSel(n.id)}
                  title={n.title}
                  style={{
                    position: "absolute",
                    left: n.x,
                    top: n.y,
                    width: n.d,
                    height: n.d,
                    borderRadius: "50%",
                    border: active ? "4px solid var(--color-text)" : isTaken ? "3px solid var(--color-accent)" : "0",
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                    textAlign: "center",
                    padding: 9,
                    background: n.bg,
                    color: n.fg,
                    opacity: isDismissed ? 0.32 : 1,
                    boxShadow: active ? "var(--shadow-lg)" : "var(--shadow-sm)",
                    fontFamily: "var(--font-body)",
                    transition: "transform .2s",
                  }}
                >
                  <span style={{ fontSize: n.fs, fontWeight: 700, lineHeight: 1.2 }}>{n.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="tag tag-accent">{criticals} costing you now</span>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {Object.keys(taken).length} queued by you · {Object.keys(dismissed).length} dismissed
          </span>
          <button className="btn btn-ghost" onClick={onRerunAudit} disabled={rerunning} style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 600 }}>
            {rerunning ? "Re-reading…" : "Re-run the audit"}
          </button>
        </div>
      </div>

      <aside style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 0 }}>
        <div className="card elev-sm" style={{ padding: 18, gap: 9 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="card-kicker">Selected</div>
            <span className="tag" style={{ marginLeft: "auto", fontSize: 10, background: (SEV[opp.severity] || SEV.warning).bg, color: (SEV[opp.severity] || SEV.warning).fg }}>
              {(SEV[opp.severity] || SEV.warning).label}
            </span>
          </div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 19, lineHeight: 1.2 }}>{opp.title}</div>
          <p className="card-body" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{opp.detail}</p>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", paddingTop: 2 }}>
            <span className="tag tag-neutral" style={{ fontSize: 10 }}>{opp.area}</span>
            <span className="tag tag-outline" style={{ fontSize: 10 }}>
              {SOURCE_LABELS[opp.source] || "Measured"}
            </span>
            {opp.score !== undefined ? (
              <span className="tag tag-neutral" style={{ fontSize: 10 }} title="Impact against effort, weighted by how certain the measurement is">
                score {opp.score}
              </span>
            ) : null}
          </div>
          {/* The receipt. Every item says where it came from, so a suggestion
              can be checked rather than taken on faith. */}
          {opp.evidence ? (
            <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }} className="text-muted">
              {opp.evidence}
            </p>
          ) : null}
          <button className="btn btn-primary btn-block" disabled={!!taken[opp.id]} onClick={() => onTake(opp.id)}>
            {taken[opp.id] ? "Queued — I am on it" : "Go get it"}
          </button>
          <button className="btn btn-ghost" disabled={!!dismissed[opp.id]} onClick={() => onDismiss(opp.id)} style={{ alignSelf: "center", fontSize: 12.5 }}>
            {dismissed[opp.id] ? "Noted — won't suggest this again" : "Not for us — and remember why"}
          </button>
        </div>

        <section style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <h5 style={{ margin: 0 }}>What I&apos;d do about it</h5>
          {plan.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "var(--color-surface)", borderRadius: 20, padding: "10px 13px", fontSize: 12.5, lineHeight: 1.5 }}>
              <span style={{ fontFamily: "var(--font-heading)", color: "var(--color-accent)", flex: "none" }}>{i + 1}</span>
              {t}
            </div>
          ))}
        </section>
      </aside>
    </section>
  );
}
