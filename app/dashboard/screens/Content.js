import { useState } from "react";

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const KINDS = ["Pillar", "Support", "Compare", "Answer", "Outreach"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function AskDialog({ onSubmit, onClose, busy }) {
  const [topic, setTopic] = useState("");
  const [kind, setKind] = useState("Support");
  const [day, setDay] = useState(5);
  const [angle, setAngle] = useState("");

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(4,3,7,.78)", backdropFilter: "blur(5px)", display: "grid", placeItems: "center", padding: 24 }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <form
        className="card elev-lg"
        onSubmit={(e) => {
          e.preventDefault();
          if (!topic.trim()) return;
          onSubmit({ topic: topic.trim(), kind, day, angle: angle.trim() });
        }}
        style={{ width: "min(500px,100%)", padding: 26, gap: 14, background: "var(--color-bg)", border: "1px solid var(--color-divider)", animation: "rise .3s cubic-bezier(.2,.8,.2,1)" }}
      >
        <h3 style={{ margin: 0, fontSize: 22 }}>Ask for a piece</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }} className="text-muted">
          Tell me what to cover and I&apos;ll add it to the plan with your angle attached.
        </p>

        <div className="field">
          <label htmlFor="ask-topic">What should it cover?</label>
          <input
            className="input"
            id="ask-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="How to choose the right fabric"
            required
            autoFocus
            style={{ fontSize: 14 }}
          />
        </div>

        <div className="field">
          <label htmlFor="ask-angle">Any particular angle? (optional)</label>
          <input
            className="input"
            id="ask-angle"
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            placeholder="Aimed at first-time buyers, no jargon"
            style={{ fontSize: 14 }}
          />
        </div>

        <div className="field">
          <label>What kind of piece?</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {KINDS.map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => setKind(k)}
                className={kind === k ? "tag" : "tag tag-neutral"}
                style={{ fontSize: 12, cursor: "pointer", background: kind === k ? "var(--color-accent)" : undefined, color: kind === k ? "#0A0810" : undefined }}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Which day?</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DAYS.map((d, i) => (
              <button
                type="button"
                key={d}
                onClick={() => setDay(i)}
                className={day === i ? "tag" : "tag tag-neutral"}
                style={{ fontSize: 12, cursor: "pointer", background: day === i ? "var(--color-accent)" : undefined, color: day === i ? "#0A0810" : undefined }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 9, paddingTop: 2 }}>
          <button className="btn btn-primary" type="submit" disabled={busy || !topic.trim()}>
            {busy ? "Adding…" : "Add it to the plan"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

export default function Content({ items, onPublish, onRewrite, onAskForPiece, asking }) {
  const [view, setView] = useState("week");
  const [previewId, setPreviewId] = useState(null);
  const [askOpen, setAskOpen] = useState(false);

  const visible = view === "backlog" ? items.filter((c) => c.status !== "published") : items;
  const byDay = DAY_ORDER.map((name, i) => ({
    name,
    date: visible.find((c) => c.day === i)?.date || String(12 + i),
    items: visible.filter((c) => c.day === i),
  }));

  const selected = items.find((c) => c.id === previewId) || items.find((c) => c.status === "draft") || items[0];
  const previewItem = items.find((c) => c.id === previewId);

  return (
    <section data-screen-label="Content" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 3px" }}>What&apos;s going out, and when</h2>
          <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>
            {items.length} piece{items.length === 1 ? "" : "s"}. Click one to preview it below.
          </p>
        </div>
        <div className="seg" style={{ marginLeft: "auto", background: "var(--color-bg)" }}>
          {["week", "backlog"].map((v) => (
            <label key={v} className="seg-opt">
              <input type="radio" name="cv" checked={view === v} onChange={() => setView(v)} />
              {v[0].toUpperCase() + v.slice(1)}
            </label>
          ))}
        </div>
        <button className="btn btn-secondary" onClick={() => setAskOpen(true)} style={{ fontWeight: 600, fontSize: 13 }}>Ask for a piece</button>
      </div>

      {askOpen ? (
        <AskDialog
          busy={asking}
          onClose={() => setAskOpen(false)}
          onSubmit={async (spec) => {
            await onAskForPiece(spec);
            setAskOpen(false);
          }}
        />
      ) : null}

      <div className="card" style={{ padding: "13px 16px", gap: 4, border: "1px dashed var(--color-accent-400)", background: "var(--color-accent-100)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-accent-800)" }}>
          These are planned topics, not written articles.
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--color-accent-900)" }}>
          Each card holds a title and a one-line angle. Writing the actual page needs a content-generation model
          connected, and putting it live needs access to your CMS — neither is wired up yet, so
          <strong> nothing is published to your site</strong>. Marking a piece published only updates its status here.
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 10 }}>
        {byDay.map((d) => (
          <div key={d.name} style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 270, background: d.items.length ? "var(--color-neutral-100)" : "transparent", border: "1px solid var(--color-divider)", borderRadius: 24, padding: "12px 10px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "0 4px" }}>
              <span style={{ fontFamily: "var(--font-heading)", fontSize: 14 }}>{d.name}</span>
              <span className="text-muted" style={{ fontSize: 11, marginLeft: "auto" }}>{d.date}</span>
            </div>
            {d.items.map((c) => {
              const forYou = c.meta.indexOf("you") > -1;
              const isSelected = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setPreviewId(c.id)}
                  style={{
                    background: isSelected ? "var(--color-accent-100)" : "var(--color-bg)",
                    border: isSelected ? "1px solid var(--color-accent-400)" : "1px solid transparent",
                    borderRadius: 16,
                    padding: "9px 10px",
                    boxShadow: "var(--shadow-sm)",
                    textAlign: "left",
                    opacity: c.status === "published" ? 0.6 : 1,
                  }}
                >
                  <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.3, marginBottom: 4 }}>{c.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                    <span className="tag" style={{ fontSize: 9.5, padding: "1px 7px", background: forYou ? "var(--color-accent-100)" : "var(--color-accent-2-100)", color: forYou ? "var(--color-accent-800)" : "var(--color-accent-2-800)" }}>
                      {c.kind}
                    </span>
                    <span className="text-muted" style={{ fontSize: 9.5 }}>{c.status === "published" ? "published" : c.meta}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {selected ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 16 }}>
          <section className="card elev-sm" style={{ padding: 20, gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span className="tag tag-accent">{selected.status === "published" ? "Marked published" : "Planned topic"}</span>
              <span className="text-muted" style={{ fontSize: 11.5, marginLeft: "auto" }}>{selected.meta}</span>
            </div>
            <h3 style={{ margin: 0 }}>{selected.title}</h3>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }} className="text-muted">
              {selected.body}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 4 }}>
              <span className="tag tag-accent-2">{selected.kind}</span>
              <span className="tag tag-outline">Outline only</span>
              {selected.rewriteCount ? <span className="tag tag-neutral">Rewritten ×{selected.rewriteCount}</span> : null}
            </div>
            <div style={{ display: "flex", gap: 9, paddingTop: 4 }}>
              <button className="btn btn-primary" disabled={selected.status === "published"} onClick={() => onPublish(selected.id)}>
                {selected.status === "published" ? "Marked published" : "Mark as published"}
              </button>
              <button className="btn btn-secondary" onClick={() => onRewrite(selected.id)} style={{ fontWeight: 600, fontSize: 13 }}>Try another angle</button>
              <button className="btn btn-ghost" onClick={() => setPreviewId(selected.id === previewItem?.id ? null : selected.id)} style={{ fontSize: 13 }}>
                {previewItem ? "Close preview" : "Preview"}
              </button>
            </div>
          </section>
          <section className="card elev-sm" style={{ padding: 20, gap: 10, background: "var(--color-neutral-100)" }}>
            <h4 style={{ margin: 0 }}>What each piece is for</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12.5 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--color-accent-200)", flex: "none", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 11 }}>×4</span>
                <span><strong>Pillar &amp; supporting</strong> — own your highest-value search terms end to end.</span>
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
      ) : (
        <div className="text-muted" style={{ fontSize: 13 }}>Nothing here yet.</div>
      )}
    </section>
  );
}
