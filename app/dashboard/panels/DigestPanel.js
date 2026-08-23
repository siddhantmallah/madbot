export default function DigestPanel({ digest, onSend, sending, lastSentTo }) {
  return (
    <section className="card elev-sm" style={{ padding: 18, gap: 11, background: "var(--color-accent-2-100)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h4 style={{ margin: 0 }}>Your digest, right now</h4>
        <span className="tag tag-accent-2" style={{ marginLeft: "auto" }}>Live</span>
      </div>

      <div style={{ background: "var(--color-bg)", borderRadius: 18, padding: "13px 15px", display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 15 }}>This week on {digest.domain}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {digest.lines.map((l) => (
            <div key={l.label} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5 }}>
              <span className="text-muted" style={{ flex: 1 }}>{l.label}</span>
              <strong style={{ flex: "none" }}>{l.value}</strong>
              {l.delta ? (
                <span style={{ flex: "none", fontSize: 11, fontWeight: 700, color: l.delta.startsWith("-") ? "#FF8A6B" : "#7ED957" }}>
                  {l.delta}
                </span>
              ) : null}
            </div>
          ))}
        </div>

        {digest.competitorChanges.length ? (
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 8 }}>
            <div className="card-kicker" style={{ marginBottom: 4 }}>Competitors moved</div>
            {digest.competitorChanges.slice(0, 3).map((c, i) => (
              <div key={i} style={{ fontSize: 12, lineHeight: 1.5 }} className="text-muted">
                <strong style={{ color: "#fff" }}>{c.competitor}</strong> — {c.text}
              </div>
            ))}
          </div>
        ) : null}

        {digest.pending.length ? (
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 8 }}>
            <div className="card-kicker" style={{ marginBottom: 4 }}>Needs you</div>
            {digest.pending.slice(0, 3).map((a) => (
              <div key={a.id} style={{ fontSize: 12, lineHeight: 1.5 }} className="text-muted">{a.title}</div>
            ))}
          </div>
        ) : null}
      </div>

      {!digest.hasSearch ? (
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--color-accent-2-900)" }}>
          Connect Search Console above and real traffic numbers join this digest automatically.
        </p>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button className="btn btn-secondary" onClick={onSend} disabled={sending} style={{ fontWeight: 600, fontSize: 13 }}>
          {sending ? "Sending…" : "Email this to me"}
        </button>
        {lastSentTo ? (
          <span className="text-muted" style={{ fontSize: 11.5 }}>Sent to {lastSentTo}</span>
        ) : null}
      </div>
    </section>
  );
}
