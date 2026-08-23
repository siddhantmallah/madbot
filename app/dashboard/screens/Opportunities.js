export default function Opportunities({ pendingCount, zoom, setZoom, sel, setSel, taken, dismissed, onTake, onDismiss, nodeData, oppData, siteName }) {
  const opp = oppData[sel] || oppData.kw;

  return (
    <section data-screen-label="Opportunities" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 342px", gap: 20, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: "0 0 3px" }}>83 ways to grow, mapped</h2>
            <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>
              Bigger circle, bigger prize. Closer to the middle, easier for me. Click one.
            </p>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btn btn-secondary btn-icon" onClick={() => setZoom((z) => Math.max(0.7, z - 0.15))} aria-label="Zoom out">–</button>
            <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", width: 38, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
            <button className="btn btn-secondary btn-icon" onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))} aria-label="Zoom in">+</button>
          </div>
        </div>
        <div style={{ position: "relative", height: 600, borderRadius: 34, overflow: "hidden", background: "radial-gradient(85% 78% at 34% 24%, var(--color-accent-2-100) 0%, var(--color-bg) 62%)", border: "1px solid var(--color-divider)" }}>
          <div style={{ position: "absolute", inset: 0, transform: `scale(${zoom})`, transition: "transform .35s cubic-bezier(.2,.8,.2,1)" }}>
            <div style={{ position: "absolute", left: "50%", top: "50%", width: 540, height: 540, borderRadius: "50%", border: "1px dashed var(--color-neutral-300)", transform: "translate(-50%,-50%)" }} />
            <div style={{ position: "absolute", left: "50%", top: "50%", width: 360, height: 360, borderRadius: "50%", border: "1px dashed var(--color-neutral-300)", transform: "translate(-50%,-50%)" }} />
            <div style={{ position: "absolute", left: "50%", top: "50%", width: 180, height: 180, borderRadius: "50%", border: "1px dashed var(--color-neutral-300)", transform: "translate(-50%,-50%)" }} />
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%,-50%)",
                width: 124,
                height: 124,
                borderRadius: "50%",
                background: "var(--color-surface)",
                boxShadow: "var(--shadow-md)",
                display: "grid",
                placeItems: "center",
                textAlign: "center",
              }}
            >
              <div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, lineHeight: 1.1 }}>{siteName}</div>
                <div className="text-muted" style={{ fontSize: 10.5 }}>your site</div>
              </div>
            </div>
            {nodeData.map((n) => {
              const active = sel === n.id;
              const isTaken = !!taken[n.id];
              const isDismissed = !!dismissed[n.id];
              return (
                <button
                  key={n.id}
                  onClick={() => setSel(n.id)}
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
                    opacity: isDismissed ? 0.35 : 1,
                    boxShadow: active ? "var(--shadow-lg)" : "var(--shadow-sm)",
                    fontFamily: "var(--font-body)",
                    animation: n.id === "kw" && !isDismissed ? "drift 7s ease-in-out infinite" : "none",
                    transition: "transform .2s",
                  }}
                >
                  <span style={{ fontSize: n.fs, fontWeight: 700, lineHeight: 1.15 }}>{n.label}</span>
                </button>
              );
            })}
          </div>
          <div className="card elev-lg" style={{ position: "absolute", right: 16, top: 16, width: 262, padding: 15, gap: 6, background: "var(--color-bg)", animation: "pop .25s ease-out" }}>
            <div className="card-kicker">If I take this</div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, lineHeight: 1.2 }}>{opp.f}</div>
            <div className="text-muted" style={{ fontSize: 12 }}>{opp.fm}</div>
            <div style={{ height: 44, display: "flex", alignItems: "flex-end", gap: 3, marginTop: 4 }}>
              {[16, 22, 31, 48, 64, 82, 100].map((h, i) => (
                <span key={i} style={{ flex: 1, height: `${h}%`, background: h >= 100 ? "var(--color-accent)" : h >= 48 ? "var(--color-accent-400)" : h >= 31 ? "var(--color-accent-300)" : "var(--color-neutral-300)", borderRadius: 2 }} />
              ))}
            </div>
            <div className="text-muted" style={{ fontSize: 10.5 }}>Modelled on 41 sites like yours. Week 1 → 7.</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="tag tag-neutral">Ranked by expected value</span>
          <span className="text-muted" style={{ fontSize: 12 }}>54 auto-queued · 27 waiting · {pendingCount} need you</span>
        </div>
      </div>

      <aside style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 0 }}>
        <div className="card elev-sm" style={{ padding: 18, gap: 9 }}>
          <div className="card-kicker">Selected opportunity</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, lineHeight: 1.15 }}>{opp.title}</div>
          <p className="card-body" style={{ margin: 0, fontSize: 13 }}>{opp.body}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, fontSize: 12.5, paddingTop: 2 }}>
            <div><div className="text-muted" style={{ fontSize: 10.5 }}>Expected value</div><strong>{opp.v}</strong></div>
            <div><div className="text-muted" style={{ fontSize: 10.5 }}>Difficulty</div><strong>{opp.d}</strong></div>
            <div><div className="text-muted" style={{ fontSize: 10.5 }}>Confidence</div><strong>{opp.c}</strong></div>
            <div><div className="text-muted" style={{ fontSize: 10.5 }}>Needs approval</div><strong>{opp.a}</strong></div>
          </div>
          <button className="btn btn-primary btn-block" disabled={!!taken[sel]} onClick={() => onTake(sel)}>
            {taken[sel] ? "Queued — I am on it" : "Go get it"}
          </button>
          <button className="btn btn-ghost" disabled={!!dismissed[sel]} onClick={() => onDismiss(sel)} style={{ alignSelf: "center", fontSize: 12.5 }}>
            {dismissed[sel] ? "Noted — won't suggest this again" : "Not for us — and remember why"}
          </button>
        </div>
        <section style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <h5 style={{ margin: 0 }}>My plan, in order</h5>
          {opp.plan.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", background: "var(--color-surface)", borderRadius: 20, padding: "10px 13px", fontSize: 12.5 }}>
              <span style={{ fontFamily: "var(--font-heading)", color: "var(--color-accent)" }}>{i + 1}</span>
              {t}
            </div>
          ))}
        </section>
      </aside>
    </section>
  );
}
