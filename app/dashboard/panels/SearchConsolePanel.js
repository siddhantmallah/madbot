function Delta({ now, before }) {
  if (!before) return null;
  const d = ((now - before) / before) * 100;
  const up = d >= 0;
  return (
    <span style={{ fontSize: 11.5, fontWeight: 700, color: up ? "var(--ok)" : "#FF8A6B" }}>
      {up ? "▲" : "▼"} {Math.abs(d).toFixed(0)}%
    </span>
  );
}

function Sparkline({ series }) {
  if (!series || series.length < 2) return null;
  const vals = series.map((s) => s.clicks);
  const max = Math.max(...vals, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 34, marginTop: 8 }}>
      {vals.map((v, i) => (
        <span
          key={i}
          title={`${series[i].date}: ${v} clicks`}
          style={{
            flex: 1,
            minWidth: 2,
            height: `${Math.max(4, (v / max) * 100)}%`,
            background: v === max ? "var(--color-accent)" : "var(--color-accent-400)",
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

export default function SearchConsolePanel({ state, onConnect, onPickProperty, onRefresh, domain }) {
  const { status, error, properties, siteUrl, data, needsReconnect } = state;

  // Not connected yet.
  if (status === "idle" || status === "connecting") {
    return (
      <section className="card elev-sm" style={{ padding: 18, gap: 10, border: "1px dashed var(--color-accent-400)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h4 style={{ margin: 0 }}>Traffic &amp; rankings</h4>
          <span className="tag tag-accent" style={{ marginLeft: "auto" }}>Not connected</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }} className="text-muted">
          Connect Google Search Console and real clicks, impressions, average position and your top queries for{" "}
          {domain} appear here — pulled straight from Google, not estimated.
        </p>
        {error ? (
          <div style={{ fontSize: 12.5, color: "var(--color-accent-700)", background: "var(--color-accent-100)", borderRadius: 12, padding: "9px 12px" }}>
            {error}
          </div>
        ) : null}
        <button className="btn btn-primary" onClick={onConnect} disabled={status === "connecting"} style={{ fontSize: 13, alignSelf: "flex-start" }}>
          {status === "connecting" ? "Waiting for Google…" : "Connect Search Console"}
        </button>
        <p style={{ margin: 0, fontSize: 11.5 }} className="text-muted">
          Read-only access. MADBOT can see your search performance, nothing else.
        </p>
      </section>
    );
  }

  // Connected, needs a property chosen.
  if (status === "choosing") {
    return (
      <section className="card elev-sm" style={{ padding: 18, gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h4 style={{ margin: 0 }}>Pick your property</h4>
          <span className="tag tag-accent-2" style={{ marginLeft: "auto" }}>Connected</span>
        </div>
        {properties.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }} className="text-muted">
            That Google account doesn&apos;t have any verified Search Console properties. Add and verify {domain} in
            Search Console first, then reconnect.
          </p>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 12.5 }} className="text-muted">
              {properties.length} propert{properties.length === 1 ? "y" : "ies"} on this Google account.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {properties.map((p) => (
                <button
                  key={p.siteUrl}
                  onClick={() => onPickProperty(p.siteUrl)}
                  className="btn btn-secondary"
                  style={{ justifyContent: "flex-start", fontSize: 12.5, fontWeight: 600, color: "var(--fg)", borderColor: "var(--color-divider)" }}
                >
                  {p.siteUrl}
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    );
  }

  if (status === "loading") {
    return (
      <section className="card elev-sm" style={{ padding: 18, gap: 10 }}>
        <h4 style={{ margin: 0 }}>Traffic &amp; rankings</h4>
        <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13 }} className="text-muted">
          <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--color-accent-300)", borderTopColor: "var(--color-accent)", animation: "sweep 1s linear infinite", display: "block" }} />
          Pulling the last 28 days from Google…
        </div>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="card elev-sm" style={{ padding: 18, gap: 10, border: "1px dashed var(--color-accent-400)" }}>
        <h4 style={{ margin: 0 }}>Traffic &amp; rankings</h4>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--color-accent-800)" }}>{error}</p>
        <button className="btn btn-secondary" onClick={onConnect} style={{ fontSize: 13, fontWeight: 600, alignSelf: "flex-start" }}>
          {needsReconnect ? "Reconnect Search Console" : "Try again"}
        </button>
      </section>
    );
  }

  // Real data.
  const c = data.current;
  const p = data.previous || {};
  return (
    <section className="card elev-sm" style={{ padding: 18, gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0 }}>Traffic &amp; rankings</h4>
        <span className="tag tag-accent-2" style={{ marginLeft: "auto" }}>Live from Google</span>
      </div>
      <div style={{ fontSize: 11.5 }} className="text-muted">
        {siteUrl} · {data.range.from} to {data.range.to}
      </div>

      <div className="grid-2" style={{ gap: 12 }}>
        <div>
          <div className="card-kicker">Clicks</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span style={{ fontFamily: "var(--font-heading)", fontSize: 28, lineHeight: 1 }}>{c.clicks.toLocaleString()}</span>
            <Delta now={c.clicks} before={p.clicks} />
          </div>
        </div>
        <div>
          <div className="card-kicker">Impressions</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span style={{ fontFamily: "var(--font-heading)", fontSize: 28, lineHeight: 1 }}>{c.impressions.toLocaleString()}</span>
            <Delta now={c.impressions} before={p.impressions} />
          </div>
        </div>
        <div>
          <div className="card-kicker">Click-through rate</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, lineHeight: 1 }}>{(c.ctr * 100).toFixed(1)}%</div>
        </div>
        <div>
          <div className="card-kicker">Average position</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, lineHeight: 1 }}>{c.position ? c.position.toFixed(1) : "—"}</div>
        </div>
      </div>

      <Sparkline series={data.series} />

      {data.topQueries?.length ? (
        <div>
          <div className="card-kicker" style={{ marginBottom: 6 }}>Top queries, last 28 days</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {data.topQueries.slice(0, 6).map((q) => (
              <div key={q.query} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.query}</span>
                <span className="text-muted" style={{ flex: "none", fontVariantNumeric: "tabular-nums" }}>{q.clicks} clicks</span>
                <span className="tag tag-neutral" style={{ fontSize: 10, flex: "none" }}>#{q.position.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 12.5 }} className="text-muted">
          Google reported no query data for this range yet — new or low-traffic properties often show nothing for a while.
        </p>
      )}

      <button className="btn btn-ghost" onClick={onRefresh} style={{ fontSize: 12.5, fontWeight: 600, alignSelf: "flex-start" }}>
        Refresh
      </button>
    </section>
  );
}
