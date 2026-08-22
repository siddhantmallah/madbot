import { useState } from "react";
import { DAY_DATA } from "../data";

export default function Content() {
  const [view, setView] = useState("week");

  return (
    <section data-screen-label="Content" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 3px" }}>What&apos;s going out, and when</h2>
          <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>
            Nine pieces this week. Drag anything to move it. Open anything to rewrite it.
          </p>
        </div>
        <div className="seg" style={{ marginLeft: "auto", background: "var(--color-bg)" }}>
          {["week", "month", "backlog"].map((v) => (
            <label key={v} className="seg-opt">
              <input type="radio" name="cv" checked={view === v} onChange={() => setView(v)} />
              {v[0].toUpperCase() + v.slice(1)}
            </label>
          ))}
        </div>
        <button className="btn btn-secondary" style={{ fontWeight: 600, fontSize: 13 }}>Ask for a piece</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 10 }}>
        {DAY_DATA.map((d) => (
          <div key={d.name} style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 270, background: d.items.length ? "var(--color-neutral-100)" : "transparent", border: "1px solid var(--color-divider)", borderRadius: 24, padding: "12px 10px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "0 4px" }}>
              <span style={{ fontFamily: "var(--font-heading)", fontSize: 14 }}>{d.name}</span>
              <span className="text-muted" style={{ fontSize: 11, marginLeft: "auto" }}>{d.date}</span>
            </div>
            {d.items.map((c, i) => {
              const forYou = c.meta.indexOf("you") > -1;
              return (
                <div key={i} style={{ background: "var(--color-bg)", borderRadius: 16, padding: "9px 10px", boxShadow: "var(--shadow-sm)", cursor: "grab" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.3, marginBottom: 4 }}>{c.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                    <span className="tag" style={{ fontSize: 9.5, padding: "1px 7px", background: forYou ? "var(--color-accent-100)" : "var(--color-accent-2-100)", color: forYou ? "var(--color-accent-800)" : "var(--color-accent-2-800)" }}>
                      {c.kind}
                    </span>
                    <span className="text-muted" style={{ fontSize: 9.5 }}>{c.meta}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 16 }}>
        <section className="card elev-sm" style={{ padding: 20, gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span className="tag tag-accent">Draft · in your voice</span>
            <span className="text-muted" style={{ fontSize: 11.5, marginLeft: "auto" }}>1,840 words · reading level 9</span>
          </div>
          <h3 style={{ margin: 0 }}>SSL expiry alerts: the 2026 guide</h3>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }} className="text-muted">
            Certificates don&apos;t fail politely. They fail at 3am on a Sunday, and the first person to notice is a
            customer on Twitter. Here&apos;s how teams that never have that morning set things up…
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 4 }}>
            <span className="tag tag-accent-2">4 internal links</span>
            <span className="tag tag-accent-2">FAQ schema</span>
            <span className="tag tag-accent-2">Targets 2 keywords</span>
            <span className="tag tag-outline">Sounds 88% like you</span>
          </div>
          <div style={{ display: "flex", gap: 9, paddingTop: 4 }}>
            <button className="btn btn-primary">Publish now</button>
            <button className="btn btn-secondary" style={{ fontWeight: 600, fontSize: 13 }}>Rewrite it</button>
            <button className="btn btn-ghost" style={{ fontSize: 13 }}>Preview</button>
          </div>
        </section>
        <section className="card elev-sm" style={{ padding: 20, gap: 10, background: "var(--color-neutral-100)" }}>
          <h4 style={{ margin: 0 }}>What each piece is for</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12.5 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--color-accent-200)", flex: "none", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 11 }}>×4</span>
              <span><strong>Pillar &amp; supporting</strong> — own &ldquo;certificate expiry monitoring&rdquo; end to end.</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--color-accent-2-200)", flex: "none", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 11 }}>×2</span>
              <span><strong>Comparison</strong> — catch people already shopping competitors.</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--color-neutral-300)", flex: "none", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 11 }}>×3</span>
              <span><strong>Answer-engine bait</strong> — short, quotable, schema-marked definitions.</span>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
