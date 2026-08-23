import { ago, kindColor, minutesAgo } from "../data";

function connectedOn(site) {
  const d = site?.createdAt?.toDate ? site.createdAt.toDate() : null;
  return d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "today";
}

function StatCard({ kicker, value, meta }) {
  return (
    <div className="card elev-sm" style={{ gap: 4, padding: "18px 20px" }}>
      <div className="card-kicker">{kicker}</div>
      <div style={{ fontFamily: "var(--font-heading)", fontSize: 36, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12 }} className="text-muted">{meta}</div>
    </div>
  );
}

export default function Growth({
  site,
  activity,
  content,
  leads,
  approvals,
  pendingCount,
  goApprovals,
  goLog,
  feedTop,
  onUndo,
  paused,
  domain,
  onSendDigest,
  sendingDigest,
}) {
  const drafted = content.filter((c) => c.status !== "published").length;
  const published = content.filter((c) => c.status === "published").length;
  const sentLeads = leads.filter((l) => l.status === "sent").length;
  const queuedLeads = leads.filter((l) => l.status === "queued").length;

  return (
    <section data-screen-label="Growth" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 3px", fontSize: 32 }}>Here&apos;s what&apos;s been happening.</h2>
          <p style={{ margin: 0, fontSize: 14 }} className="text-muted">
            {activity.length} {activity.length === 1 ? "action" : "actions"} on {domain} since you connected it on {connectedOn(site)}.
          </p>
        </div>
        {pendingCount > 0 ? (
          <button className="btn btn-primary" onClick={goApprovals} style={{ marginLeft: "auto" }}>
            {pendingCount} {pendingCount === 1 ? "thing" : "things"} need you
          </button>
        ) : null}
      </div>

      {/* Real counts, straight out of Firestore — nothing modelled or estimated. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 14 }}>
        <StatCard kicker="Actions logged" value={activity.length} meta="every one reversible" />
        <StatCard kicker="Content" value={drafted + published} meta={`${drafted} draft${drafted === 1 ? "" : "s"} · ${published} published`} />
        <StatCard kicker="Prospects found" value={leads.length} meta={`${queuedLeads} queued · ${sentLeads} marked sent`} />
        <StatCard kicker="Waiting on you" value={pendingCount} meta={`of ${approvals.length} total in the queue`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <section className="card" style={{ padding: 18, gap: 12, background: "var(--color-neutral-100)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h4 style={{ margin: 0 }}>Live engine feed</h4>
            <button className="btn btn-ghost" onClick={goLog} style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 600 }}>
              Full log
            </button>
          </div>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            {feedTop.length === 0 ? (
              <li className="text-muted" style={{ fontSize: 13, padding: "8px 4px" }}>Nothing logged yet — give it a minute.</li>
            ) : null}
            {feedTop.map((f, i) => {
              const isUndone = !!f.undone;
              const tag = isUndone ? "Rolled back" : f.tag || "";
              const showTag = isUndone || f.tag;
              const fresh = i === 0 && minutesAgo(f.createdAt) < 1;
              return (
                <li
                  key={f.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "62px 24px minmax(0,1fr) auto",
                    gap: 10,
                    alignItems: "center",
                    padding: "11px 12px",
                    borderRadius: 20,
                    background: fresh ? "var(--color-accent-100)" : f.k === "win" ? "var(--color-accent-2-100)" : "var(--color-bg)",
                    animation: fresh ? "slideIn .45s cubic-bezier(.2,.8,.2,1)" : "none",
                  }}
                >
                  <span style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }} className="text-muted">
                    {ago(minutesAgo(f.createdAt))}
                  </span>
                  <span style={{ width: 24, height: 24, borderRadius: "50%", background: kindColor(f.k), flex: "none" }} />
                  <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>{f.text}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, justifySelf: "end" }}>
                    {showTag ? (
                      <span
                        className="tag"
                        style={{
                          fontSize: 10.5,
                          background: isUndone ? "var(--color-neutral-100)" : f.k === "win" ? "var(--color-accent-2-200)" : "var(--color-accent-100)",
                          color: isUndone ? "var(--color-neutral-800)" : f.k === "win" ? "var(--color-accent-2-800)" : "var(--color-accent-800)",
                        }}
                      >
                        {tag}
                      </span>
                    ) : null}
                    {f.undo && !isUndone ? (
                      <button className="btn btn-ghost" onClick={() => onUndo(f.id, true)} style={{ fontSize: 12, fontWeight: 600 }}>
                        Undo
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }} className="text-muted">
            <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--color-accent-300)", borderTopColor: "var(--color-accent)", animation: "sweep 1.4s linear infinite", display: "block", flex: "none" }} />
            {paused ? "Paused — I will not touch anything until you resume." : `Working on ${domain}…`}
          </div>
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Traffic and ranking numbers require a real analytics source. Rather
              than model them, say so plainly and point at the next step. */}
          <section className="card elev-sm" style={{ padding: 18, gap: 10, border: "1px dashed var(--color-accent-400)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <h4 style={{ margin: 0 }}>Traffic &amp; rankings</h4>
              <span className="tag tag-accent" style={{ marginLeft: "auto" }}>Not connected</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }} className="text-muted">
              Organic visitors, keyword positions and impressions come from Google Search Console. Connect it and
              real numbers appear here, measured against the day you connected {domain}.
            </p>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--color-accent-800)" }}>
              Until then I won&apos;t show a number I can&apos;t actually measure.
            </p>
            <button className="btn btn-secondary" disabled style={{ fontWeight: 600, fontSize: 13, alignSelf: "flex-start" }}>
              Connect Search Console — coming soon
            </button>
          </section>

          <section className="card elev-sm" style={{ padding: 18, gap: 9, background: "var(--color-neutral-100)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <h4 style={{ margin: 0 }}>Competitor watch</h4>
              <span className="tag tag-neutral" style={{ marginLeft: "auto" }}>Not connected</span>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }} className="text-muted">
              Tracking a rival&apos;s pages and rank movements needs a ranking data source. Nothing is being watched
              yet — when it is, changes show up here the same week they happen.
            </p>
          </section>

          <section className="card elev-sm" style={{ padding: 18, gap: 9, background: "var(--color-accent-2-100)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <h4 style={{ margin: 0 }}>Digest</h4>
              <span className="tag tag-accent-2" style={{ marginLeft: "auto" }}>Email</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--color-accent-2-900)", lineHeight: 1.55 }}>
              A summary of what shipped, what&apos;s waiting on you, and what changed — built from this dashboard&apos;s
              real activity and sent to your account email.
            </p>
            <button className="btn btn-secondary" onClick={onSendDigest} disabled={sendingDigest} style={{ fontWeight: 600, fontSize: 13, alignSelf: "flex-start" }}>
              {sendingDigest ? "Sending…" : "Send me this digest now"}
            </button>
          </section>
        </div>
      </div>
    </section>
  );
}
