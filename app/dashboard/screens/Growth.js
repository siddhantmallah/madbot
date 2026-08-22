import { ago, kindColor } from "../data";

const SCOREBOARD = [
  { label: "Organic visitors / mo", delta: "1,240 → 1,712", before: "44%", now: "78%" },
  { label: "Keywords in the top 10", delta: "6 → 29", before: "18%", now: "66%" },
  { label: "Qualified leads / mo", delta: "3 → 46", before: "8%", now: "88%" },
];

export default function Growth({ actionCount, pendingCount, goApprovals, goLog, feedTop, undone, onUndo, paused }) {
  return (
    <section data-screen-label="Growth" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 3px", fontSize: 32 }}>Week 6 was a good week.</h2>
          <p style={{ margin: 0, fontSize: 14 }} className="text-muted">
            I did {actionCount} things, you approved 2, and here&apos;s what came of it.
          </p>
        </div>
        <button className="btn btn-primary" onClick={goApprovals} style={{ marginLeft: "auto" }}>
          {pendingCount} things need you · 90 seconds
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 14 }}>
        <div className="card elev-sm" style={{ gap: 4, padding: "18px 20px" }}>
          <div className="card-kicker">Organic visitors</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 36, lineHeight: 1 }}>+38%</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 30, marginTop: 6 }}>
            {[34, 41, 37, 56, 66, 100].map((h, i) => (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: `${h}%`,
                  background: h >= 100 ? "var(--color-accent)" : h >= 56 ? "var(--color-accent-400)" : "var(--color-accent-300)",
                  borderRadius: 3,
                }}
              />
            ))}
          </div>
        </div>
        <div className="card elev-sm" style={{ gap: 4, padding: "18px 20px" }}>
          <div className="card-kicker">Qualified prospects</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 36, lineHeight: 1 }}>+43</div>
          <div style={{ fontSize: 12 }} className="text-muted">18 opened · 6 replied · 2 demos booked</div>
        </div>
        <div className="card elev-sm" style={{ gap: 4, padding: "18px 20px" }}>
          <div className="card-kicker">Referring domains</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 36, lineHeight: 1 }}>+17</div>
          <div style={{ fontSize: 12 }} className="text-muted">2 above DR 60</div>
        </div>
        <div className="card elev-sm" style={{ gap: 4, padding: "18px 20px" }}>
          <div className="card-kicker">Pages indexed</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 36, lineHeight: 1 }}>+24</div>
          <div style={{ fontSize: 12 }} className="text-muted">of 24 submitted</div>
        </div>
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
            {feedTop.map((f) => {
              const isUndone = !!undone[f.id];
              const tag = isUndone ? "Rolled back" : f.tag || "";
              const showTag = isUndone || f.tag;
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
                    background: f.fresh ? "var(--color-accent-100)" : f.k === "win" ? "var(--color-accent-2-100)" : "var(--color-bg)",
                    animation: f.fresh ? "slideIn .45s cubic-bezier(.2,.8,.2,1)" : "none",
                  }}
                >
                  <span style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }} className="text-muted">
                    {ago(f.m)}
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
                      <button className="btn btn-ghost" onClick={() => onUndo(f.id)} style={{ fontSize: 12, fontWeight: 600 }}>
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
            {paused ? "Paused — I will not touch anything until you resume." : "Crawling 2 competitor blogs and re-checking 14 rankings…"}
          </div>
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="card elev-sm" style={{ padding: 18, gap: 12 }}>
            <h4 style={{ margin: 0 }}>Before MADBOT → now</h4>
            {SCOREBOARD.map((s) => (
              <div key={s.label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
                  <span>{s.label}</span>
                  <span style={{ fontWeight: 700 }}>{s.delta}</span>
                </div>
                <div style={{ height: 9, borderRadius: 999, background: "var(--color-neutral-200)", position: "relative", overflow: "hidden" }}>
                  <span style={{ position: "absolute", left: 0, top: 0, height: 9, borderRadius: 999, background: "var(--color-neutral-400)", width: s.before }} />
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      height: 9,
                      borderRadius: 999,
                      background: "var(--color-accent)",
                      opacity: 0.9,
                      width: s.now,
                      transformOrigin: "left",
                      animation: "grow 1s cubic-bezier(.2,.8,.2,1)",
                    }}
                  />
                </div>
              </div>
            ))}
            <div className="text-muted" style={{ fontSize: 11.5 }}>
              Baseline is the 30 days before you connected. I never re-base it, so it can&apos;t flatter me.
            </div>
          </section>

          <section className="card elev-sm" style={{ padding: 18, gap: 9, background: "var(--color-neutral-100)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <h4 style={{ margin: 0 }}>Competitor watch</h4>
              <span className="tag tag-neutral" style={{ marginLeft: "auto" }}>3 tracked</span>
            </div>
            <div style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <span className="tag tag-accent-2" style={{ fontSize: 10, flex: "none" }}>new</span>
                <span>uptimekit.io shipped a pricing page. I&apos;m drafting a comparison — <a href="#draft">see the draft</a>.</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <span className="tag tag-neutral" style={{ fontSize: 10, flex: "none" }}>rank</span>
                <span>certwatch.dev slipped to #6 on &ldquo;tls monitoring&rdquo;. That gap is open for about two weeks.</span>
              </div>
            </div>
          </section>

          <section className="card elev-sm" style={{ padding: 18, gap: 9, background: "var(--color-accent-2-100)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <h4 style={{ margin: 0 }}>Friday digest</h4>
              <span className="tag tag-accent-2" style={{ marginLeft: "auto" }}>Slack + email</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--color-accent-2-900)" }}>
              &ldquo;6 posts out, 17 new links, 43 prospects, 2 things for you.&rdquo; Reads in 40 seconds.
            </p>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              <span className="tag tag-outline">Weekly</span>
              <span className="tag tag-neutral">Ping me for wins only</span>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
