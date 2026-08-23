import { useState } from "react";
import { ago, minutesAgo } from "../data";

export default function Approvals({ approvals, onApprove, onDecline, onEdit, goAutonomy }) {
  const [editingId, setEditingId] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");

  const pending = approvals.filter((a) => a.status === "pending").length;
  const headline =
    approvals.length === 0
      ? "Nothing waiting yet."
      : pending === 0
      ? "Queue clear. Go do something else."
      : `${pending} ${pending === 1 ? "thing needs" : "things need"} a human`;

  function startEdit(a) {
    setEditingId(a.id);
    setDraftTitle(a.title);
    setDraftBody(a.body);
  }
  function saveEdit(id) {
    onEdit(id, { title: draftTitle, body: draftBody, edited: true });
    setEditingId(null);
  }

  return (
    <section data-screen-label="Approvals" style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 900 }}>
      <div>
        <h2 style={{ margin: "0 0 3px" }}>{headline}</h2>
        <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>
          Only three things ever reach this queue: money, public claims, and anything I&apos;m under 60% sure about.
        </p>
      </div>
      {approvals.map((a) => {
        const status = a.status === "pending" ? null : a.status;
        const isEditing = editingId === a.id;
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
              <span className="text-muted" style={{ fontSize: 11.5 }}>waiting {ago(minutesAgo(a.createdAt))}</span>
              {a.edited ? <span className="tag tag-outline" style={{ fontSize: 10 }}>Edited by you</span> : null}
              <span className="tag tag-neutral" style={{ marginLeft: "auto", fontSize: 10.5 }}>
                {status === "yes" ? "Approved" : status === "no" ? "Declined" : "Waiting on you"}
              </span>
            </div>
            {isEditing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input className="input" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} style={{ fontSize: 14, fontWeight: 700 }} />
                <textarea
                  className="input"
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  style={{ width: "100%", minHeight: 80, fontSize: 13, lineHeight: 1.6 }}
                />
              </div>
            ) : (
              <div className="split-side" style={{ "--side": "208px", gap: 18, alignItems: "start" }}>
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
            )}
            <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
              {isEditing ? (
                <>
                  <button className="btn btn-primary" onClick={() => saveEdit(a.id)} style={{ fontSize: 13 }}>Save changes</button>
                  <button className="btn btn-ghost" onClick={() => setEditingId(null)} style={{ fontSize: 13 }}>Cancel</button>
                </>
              ) : (
                <>
                  <button className="btn btn-primary" disabled={!!status} onClick={() => onApprove(a.id)} style={{ fontSize: 13 }}>
                    {a.yes}
                  </button>
                  <button className="btn btn-secondary" disabled={!!status} onClick={() => startEdit(a)} style={{ fontWeight: 600, fontSize: 13 }}>Change it first</button>
                  <button className="btn btn-ghost" disabled={!!status} onClick={() => onDecline(a.id)} style={{ fontSize: 13 }}>
                    No thanks
                  </button>
                  <span className="text-muted" style={{ fontSize: 11.5, marginLeft: "auto" }}>{a.rule}</span>
                </>
              )}
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
