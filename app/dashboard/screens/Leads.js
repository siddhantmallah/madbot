import { useState } from "react";

const FIT_STYLE = {
  Hot: { bg: "var(--color-accent-200)", fg: "var(--color-accent-800)" },
  Warm: { bg: "var(--color-accent-2-200)", fg: "var(--color-accent-2-800)" },
  Cool: { bg: "var(--color-neutral-200)", fg: "var(--color-neutral-800)" },
};

const STATUS_LABEL = { queued: "Draft ready", sent: "Sent", declined: "Declined" };

export default function Leads({ leads, onSend, onDecline, onSaveDraft }) {
  const [view, setView] = useState("hot");
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");

  const rows =
    view === "hot" ? leads.filter((l) => l.fit === "Hot" && l.status !== "declined") :
    view === "sent" ? leads.filter((l) => l.status === "sent") :
    leads;

  const selected = leads.find((l) => l.id === selectedId) || rows[0] || leads[0];

  function startEdit() {
    setDraftText(selected.draft || "");
    setEditing(true);
  }
  function saveEdit() {
    onSaveDraft(selected.id, draftText);
    setEditing(false);
  }

  return (
    <section data-screen-label="Leads" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 3px" }}>People who have your problem right now</h2>
          <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>
            The idea: companies surfaced from public signals — hiring posts, forum questions, public news. Never
            bought lists.
          </p>
        </div>
        <div className="seg" style={{ marginLeft: "auto", background: "var(--color-bg)" }}>
          {["hot", "all", "sent"].map((v) => (
            <label key={v} className="seg-opt">
              <input type="radio" name="lv" checked={view === v} onChange={() => setView(v)} />
              {v[0].toUpperCase() + v.slice(1)}
            </label>
          ))}
        </div>
      </div>
      <div className="card" style={{ padding: "13px 16px", gap: 4, border: "1px dashed var(--color-accent-400)", background: "var(--color-accent-100)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-accent-800)" }}>
          These are example companies, not real prospects.
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--color-accent-900)" }}>
          Real lead discovery needs a company-data source connected, and sending outreach needs verified sender
          setup. Until both are wired up, nothing here has a real email address and <strong>no message is ever
          delivered</strong> — the buttons below only move a card&apos;s status in your own dashboard.
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <div className="card" style={{ padding: 8, background: "var(--color-neutral-100)" }}>
          <table className="table">
            <thead>
              <tr><th>Company</th><th>Why now</th><th>Fit</th><th></th></tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={4} className="text-muted" style={{ fontSize: 13, padding: "14px 8px" }}>Nothing in this view yet.</td></tr>
              ) : null}
              {rows.map((l) => {
                const fit = FIT_STYLE[l.fit] || FIT_STYLE.Cool;
                const isSelected = selected?.id === l.id;
                return (
                  <tr
                    key={l.id}
                    onClick={() => { setSelectedId(l.id); setEditing(false); }}
                    style={{ cursor: "pointer", background: isSelected ? "rgba(255,255,255,.04)" : undefined, opacity: l.status === "declined" ? 0.5 : 1 }}
                  >
                    <td style={{ fontWeight: 700 }}>
                      {l.co}
                      <div className="text-muted" style={{ fontSize: 11, fontWeight: 400 }}>{l.meta}</div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>{l.why}</td>
                    <td><span className="tag" style={{ background: fit.bg, color: fit.fg, fontSize: 10.5 }}>{l.fit}</span></td>
                    <td style={{ textAlign: "right" }}><span className="tag tag-neutral" style={{ fontSize: 10.5 }}>{STATUS_LABEL[l.status] || l.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {selected ? (
            <section className="card elev-sm" style={{ padding: 18, gap: 9 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="tag tag-accent">Outreach draft · {selected.co}</span>
                <span className="text-muted" style={{ fontSize: 11, marginLeft: "auto" }}>
                  {selected.status === "sent" ? "marked sent · not delivered" : selected.status === "declined" ? "declined" : "draft only"}
                </span>
              </div>
              <div style={{ background: "var(--color-bg)", borderRadius: 20, padding: 14, fontSize: 13, lineHeight: 1.55 }}>
                {editing ? (
                  <textarea
                    className="input"
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    style={{ width: "100%", minHeight: 90, background: "var(--color-surface)", color: "#fff", fontSize: 13, lineHeight: 1.55 }}
                  />
                ) : (
                  <p style={{ margin: "0 0 8px" }} className="text-muted">{selected.draft}</p>
                )}
                <span className="tag tag-outline" style={{ fontSize: 10 }}>No pricing, no pressure — per your rules</span>
              </div>
              <div style={{ display: "flex", gap: 9 }}>
                {editing ? (
                  <>
                    <button className="btn btn-primary" onClick={saveEdit} style={{ fontSize: 13 }}>Save</button>
                    <button className="btn btn-ghost" onClick={() => setEditing(false)} style={{ fontSize: 13 }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-primary" disabled={selected.status !== "queued"} onClick={() => onSend(selected.id)} style={{ fontSize: 13 }}>
                      {selected.status === "sent" ? "Marked sent" : "Mark as sent"}
                    </button>
                    <button className="btn btn-secondary" disabled={selected.status !== "queued"} onClick={startEdit} style={{ fontWeight: 600, fontSize: 13 }}>Edit</button>
                    <button className="btn btn-ghost" disabled={selected.status === "declined"} onClick={() => onDecline(selected.id)} style={{ fontSize: 13 }}>Never this company</button>
                  </>
                )}
              </div>
            </section>
          ) : null}
          <section className="card elev-sm" style={{ padding: 18, gap: 8, background: "var(--color-accent-2-100)" }}>
            <h4 style={{ margin: 0 }}>How scoring would work</h4>
            <div style={{ fontSize: 12.5, color: "var(--color-accent-2-900)", display: "flex", flexDirection: "column", gap: 5 }}>
              <div>Signal freshness — a signal from this week beats one from six months ago.</div>
              <div>Shape of the company — weighted toward whatever size you actually close.</div>
              <div>Whether someone at your end already knows them.</div>
              <div style={{ opacity: 0.75, paddingTop: 2 }}>Needs your real win/loss history to calibrate.</div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
