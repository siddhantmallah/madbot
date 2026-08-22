import { useState } from "react";

const FIT_STYLE = {
  Hot: { bg: "var(--color-accent-200)", fg: "var(--color-accent-800)" },
  Warm: { bg: "var(--color-accent-2-200)", fg: "var(--color-accent-2-800)" },
  Cool: { bg: "var(--color-neutral-200)", fg: "var(--color-neutral-800)" },
};

export default function Leads({ leadData }) {
  const [view, setView] = useState("hot");
  const rows = view === "hot" ? leadData.filter((l) => l.fit === "Hot") : view === "replied" ? leadData.filter((l) => l.state.toLowerCase().includes("repl")) : leadData;

  return (
    <section data-screen-label="Leads" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 3px" }}>People who have your problem right now</h2>
          <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>
            Found in public signals — hiring posts, forum questions, public news. Never bought lists.
          </p>
        </div>
        <div className="seg" style={{ marginLeft: "auto", background: "var(--color-bg)" }}>
          {["hot", "all", "replied"].map((v) => (
            <label key={v} className="seg-opt">
              <input type="radio" name="lv" checked={view === v} onChange={() => setView(v)} />
              {v[0].toUpperCase() + v.slice(1)}
            </label>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <div className="card" style={{ padding: 8, background: "var(--color-neutral-100)" }}>
          <table className="table">
            <thead>
              <tr><th>Company</th><th>Why now</th><th>Fit</th><th></th></tr>
            </thead>
            <tbody>
              {(rows.length ? rows : leadData).map((l) => {
                const fit = FIT_STYLE[l.fit] || FIT_STYLE.Cool;
                return (
                  <tr key={l.co}>
                    <td style={{ fontWeight: 700 }}>
                      {l.co}
                      <div className="text-muted" style={{ fontSize: 11, fontWeight: 400 }}>{l.meta}</div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>{l.why}</td>
                    <td><span className="tag" style={{ background: fit.bg, color: fit.fg, fontSize: 10.5 }}>{l.fit}</span></td>
                    <td style={{ textAlign: "right" }}><span className="tag tag-neutral" style={{ fontSize: 10.5 }}>{l.state}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <section className="card elev-sm" style={{ padding: 18, gap: 9 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="tag tag-accent">Outreach draft</span>
              <span className="text-muted" style={{ fontSize: 11, marginLeft: "auto" }}>goes out 9:10am, unless you stop it</span>
            </div>
            <div style={{ background: "var(--color-bg)", borderRadius: 20, padding: 14, fontSize: 13, lineHeight: 1.55 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>A signal matching your ideal customer</div>
              <p style={{ margin: "0 0 8px" }} className="text-muted">
                Hi — noticed something that suggests you have this problem right now. Not selling you anything
                today: here&apos;s something genuinely useful first…
              </p>
              <span className="tag tag-outline" style={{ fontSize: 10 }}>No pricing, no pressure — per your rules</span>
            </div>
            <div style={{ display: "flex", gap: 9 }}>
              <button className="btn btn-primary" style={{ fontSize: 13 }}>Send it</button>
              <button className="btn btn-secondary" style={{ fontWeight: 600, fontSize: 13 }}>Edit</button>
              <button className="btn btn-ghost" style={{ fontSize: 13 }}>Never this company</button>
            </div>
          </section>
          <section className="card elev-sm" style={{ padding: 18, gap: 8, background: "var(--color-accent-2-100)" }}>
            <h4 style={{ margin: 0 }}>How I score them</h4>
            <div style={{ fontSize: 12.5, color: "var(--color-accent-2-900)", display: "flex", flexDirection: "column", gap: 5 }}>
              <div>Signal freshness — a signal from this week beats one from 6 months ago.</div>
              <div>Shape of the company — you close 4× faster under 200 people.</div>
              <div>Whether a human at your end already knows them.</div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
