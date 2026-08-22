import { APPR_DATA } from "../data";

export default function Approvals({ appr, setAppr, goAutonomy }) {
  const pending = APPR_DATA.filter((a) => !appr[a.id]).length;
  const headline = pending === 0 ? "Queue clear. Go do something else." : `${pending} ${pending === 1 ? "thing needs" : "things need"} a human`;

  return (
    <section data-screen-label="Approvals" style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 900 }}>
      <div>
        <h2 style={{ margin: "0 0 3px" }}>{headline}</h2>
        <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>
          Only three things ever reach this queue: money, public claims, and anything I&apos;m under 60% sure about.
        </p>
      </div>
      {APPR_DATA.map((a) => {
        const status = appr[a.id];
        const kindStyle =
          a.kind === "Spend"
            ? { bg: "var(--color-accent-200)", fg: "var(--color-accent-800)" }
            : a.kind === "Low confidence"
            ? { bg: "var(--color-neutral-200)", fg: "var(--color-neutral-800)" }
            : { bg: "var(--color-accent-2-200)", fg: "var(--color-accent-2-800)" };
        return (
          <div
            key={a.id}
            className="card elev-sm"
            style={{ padding: 20, gap: 12, background: status ? "var(--color-neutral-100)" : "var(--color-surface)", opacity: status ? 0.6 : 1 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span className="tag" style={{ background: kindStyle.bg, color: kindStyle.fg, fontSize: 10.5 }}>{a.kind}</span>
              <span className="text-muted" style={{ fontSize: 11.5 }}>{a.when}</span>
              <span className="tag tag-neutral" style={{ marginLeft: "auto", fontSize: 10.5 }}>
                {status === "yes" ? "Approved" : status === "no" ? "Declined" : "Waiting on you"}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 208px", gap: 18, alignItems: "start" }}>
              <div>
                <h4 style={{ margin: "0 0 5px" }}>{a.title}</h4>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }} className="text-muted">{a.body}</p>
              </div>
              <div style={{ background: "var(--color-bg)", borderRadius: 22, padding: 13, fontSize: 12 }}>
                <div className="card-kicker" style={{ marginBottom: 3 }}>Forecast</div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 15, lineHeight: 1.2, marginBottom: 3 }}>{a.forecast}</div>
                <div className="text-muted">{a.conf}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={() => setAppr((p) => ({ ...p, [a.id]: "yes" }))} style={{ fontSize: 13 }}>
                {a.yes}
              </button>
              <button className="btn btn-secondary" style={{ fontWeight: 600, fontSize: 13 }}>Change it first</button>
              <button className="btn btn-ghost" onClick={() => setAppr((p) => ({ ...p, [a.id]: "no" }))} style={{ fontSize: 13 }}>
                No thanks
              </button>
              <span className="text-muted" style={{ fontSize: 11.5, marginLeft: "auto" }}>{a.rule}</span>
            </div>
          </div>
        );
      })}
      <div className="card" style={{ padding: 18, gap: 6, background: "var(--color-neutral-100)" }}>
        <h5 style={{ margin: 0 }}>Tired of approving this kind of thing?</h5>
        <p style={{ margin: 0, fontSize: 12.5 }} className="text-muted">
          Give me a standing budget and I&apos;ll stop asking about spends under it. You can pull it back any time.
        </p>
        <div style={{ display: "flex", gap: 9, paddingTop: 4 }}>
          <button className="btn btn-secondary" onClick={goAutonomy} style={{ fontWeight: 600, fontSize: 13 }}>
            Set a standing budget
          </button>
        </div>
      </div>
    </section>
  );
}
