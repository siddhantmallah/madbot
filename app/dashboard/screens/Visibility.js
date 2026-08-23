const ENGINES = ["ChatGPT", "Perplexity", "Google AI", "Claude", "Copilot", "Gemini"];

export default function Visibility({ domain }) {
  return (
    <section data-screen-label="AI visibility" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h2 style={{ margin: "0 0 3px" }}>When people ask an AI, do you come up?</h2>
        <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>
          Nothing measured yet for {domain}. Here&apos;s what this will track, and what it needs.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <section className="card elev-sm" style={{ padding: 20, gap: 13, border: "1px dashed var(--color-accent-400)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <h4 style={{ margin: 0 }}>Citation share by engine</h4>
            <span className="tag tag-accent" style={{ marginLeft: "auto" }}>No data yet</span>
          </div>
          {ENGINES.map((name) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
              <span style={{ width: 104, flex: "none" }} className="text-muted">{name}</span>
              <span style={{ flex: 1, height: 9, borderRadius: 999, background: "var(--color-neutral-200)" }} />
              <span style={{ width: 52, textAlign: "right", fontSize: 12.5 }} className="text-muted">—</span>
            </div>
          ))}
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }} className="text-muted">
            Measuring this means asking each engine your buying questions on a schedule and recording whether{" "}
            {domain} gets cited. That needs API access per engine, and a list of the questions your buyers actually ask.
          </p>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--color-accent-800)" }}>
            No numbers here until those runs actually happen.
          </p>
        </section>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <section className="card elev-sm" style={{ padding: 18, gap: 9, background: "var(--color-neutral-100)" }}>
            <h4 style={{ margin: 0 }}>Why this matters</h4>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }} className="text-muted">
              A growing share of buying research never reaches a search results page — someone asks an assistant and
              takes the answer. If you aren&apos;t in that answer, you aren&apos;t in the running, and no amount of
              traditional ranking fixes that.
            </p>
          </section>
          <section className="card elev-sm" style={{ padding: 18, gap: 9, background: "var(--color-neutral-100)" }}>
            <h4 style={{ margin: 0 }}>What tends to get cited</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }} className="text-muted">
              <div>Short, quotable definitions that answer one question directly.</div>
              <div>Pages marked up with schema so machines can parse the structure.</div>
              <div>Specific, checkable claims rather than marketing adjectives.</div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
