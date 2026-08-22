import { ENGINE_DATA } from "../data";

export default function Visibility() {
  return (
    <section data-screen-label="AI visibility" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h2 style={{ margin: "0 0 3px" }}>When people ask an AI, do you come up?</h2>
        <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>
          Four of nine answer engines cite you now. Six weeks ago it was one.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <section className="card elev-sm" style={{ padding: 20, gap: 13 }}>
          <h4 style={{ margin: 0 }}>Citation share by engine</h4>
          {ENGINE_DATA.map((e) => {
            const color = e.val > 50 ? "var(--color-accent)" : e.val > 25 ? "var(--color-accent-400)" : "var(--color-accent-300)";
            return (
              <div key={e.name} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
                <span style={{ width: 104, flex: "none" }}>{e.name}</span>
                <span style={{ flex: 1, height: 9, borderRadius: 999, background: "var(--color-neutral-200)", overflow: "hidden" }}>
                  <span style={{ display: "block", height: 9, borderRadius: 999, background: color, width: `${e.val}%`, transformOrigin: "left", animation: "grow .9s cubic-bezier(.2,.8,.2,1)" }} />
                </span>
                <span style={{ width: 52, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12.5 }}>{e.val}%</span>
                <span className="tag tag-accent-2" style={{ fontSize: 10, width: 44, justifyContent: "center" }}>{e.delta}</span>
              </div>
            );
          })}
          <div className="text-muted" style={{ fontSize: 11.5 }}>
            Measured by asking each engine your 40 buying questions, weekly, from three regions.
          </div>
        </section>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <section className="card elev-sm" style={{ padding: 18, gap: 9, background: "var(--color-accent-100)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <h4 style={{ margin: 0 }}>Your public health badge</h4>
              <span className="tag tag-accent" style={{ marginLeft: "auto" }}>Live</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 13, background: "var(--color-bg)", borderRadius: 24, padding: 14 }}>
              <div style={{ width: 66, height: 66, borderRadius: "50%", background: "conic-gradient(var(--color-accent-2-500) 0 84%, var(--color-neutral-300) 84% 100%)", display: "grid", placeItems: "center", flex: "none" }}>
                <span style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--color-bg)", display: "grid", placeItems: "center", fontFamily: "var(--font-heading)", fontSize: 18 }}>84</span>
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 15 }}>Site health: strong</div>
                <div className="text-muted" style={{ fontSize: 12 }}>Speed, structure, schema, accessibility. Embeddable on your site.</div>
              </div>
            </div>
            <div style={{ font: "12px ui-monospace,Menlo,monospace", background: "var(--color-neutral-900)", color: "var(--color-neutral-200)", borderRadius: 16, padding: "11px 13px", overflow: "auto" }}>
              &lt;script src=&quot;madbot.com/badge.js&quot; data-site=&quot;certnotify&quot;&gt;&lt;/script&gt;
            </div>
          </section>
          <section className="card elev-sm" style={{ padding: 18, gap: 9, background: "var(--color-neutral-100)" }}>
            <h4 style={{ margin: 0 }}>You got cited for</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
              <div style={{ background: "var(--color-bg)", borderRadius: 18, padding: "10px 13px" }}>
                &ldquo;What tools alert you before an SSL certificate expires?&rdquo; <span className="tag tag-accent-2" style={{ fontSize: 10 }}>2nd of 5</span>
              </div>
              <div style={{ background: "var(--color-bg)", borderRadius: 18, padding: "10px 13px" }}>
                &ldquo;Cheap cert monitoring for small teams&rdquo; <span className="tag tag-accent-2" style={{ fontSize: 10 }}>1st of 4</span>
              </div>
              <div style={{ background: "var(--color-bg)", borderRadius: 18, padding: "10px 13px" }}>
                &ldquo;How to avoid TLS outages&rdquo; <span className="tag tag-neutral" style={{ fontSize: 10 }}>not cited</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
