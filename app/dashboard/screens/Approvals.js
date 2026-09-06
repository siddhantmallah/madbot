import { useState } from "react";
import { ago, minutesAgo } from "../data";

/**
 * Builds the mailto: link that "Approve" opens.
 *
 * This is the send path, deliberately. The draft opens in the customer's own
 * mail client, from their own address, and they press send. MADBOT never puts a
 * cold email on the wire itself — the reputation risk of doing that from a
 * shared sending domain lands on every other customer, and a complaint would be
 * ours to answer rather than theirs.
 *
 * CRLF line breaks, because a fair number of clients drop bare LFs from a
 * mailto body and hand you one long paragraph.
 */
function mailtoFor(a) {
  const body = String(a.body || "").replace(/\r?\n/g, "\r\n");
  return `mailto:${encodeURIComponent(a.to || "")}?subject=${encodeURIComponent(a.subject || a.title || "")}&body=${encodeURIComponent(body)}`;
}

const KIND_LABEL = { outreach: "Outreach email", spend: "Spend", claim: "Public claim" };

export default function Approvals({ approvals, onApprove, onDecline, onEdit, socialWaiting = 0, goSocial }) {
  const [editingId, setEditingId] = useState(null);
  const [draftSubject, setDraftSubject] = useState("");
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
    setDraftSubject(a.subject || a.title || "");
    setDraftBody(a.body || a.detail || "");
  }
  function saveEdit(id) {
    onEdit(id, { subject: draftSubject, body: draftBody, edited: true });
    setEditingId(null);
  }

  return (
    <section data-screen-label="Approvals" style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 900 }}>
      <div>
        <h2 style={{ margin: "0 0 3px" }}>{headline}</h2>
        <p className="text-muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
          Nothing here sends itself. Approving an email opens it in your own mail app, from your own address, and you
          press send.
        </p>
      </div>

      {socialWaiting > 0 ? (
        <button
          onClick={goSocial}
          className="card"
          style={{ padding: "13px 16px", gap: 4, textAlign: "left", cursor: "pointer", border: "1px solid var(--color-accent-2-400)", background: "var(--color-accent-2-100)" }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-accent-2-800)" }}>
            {socialWaiting} social post{socialWaiting === 1 ? "" : "s"} waiting for you on the Social screen →
          </div>
          <div style={{ fontSize: 12, color: "var(--color-accent-2-900)" }}>
            Posts are approved where they were drafted, next to their character counts and rule checks.
          </div>
        </button>
      ) : null}

      {approvals.map((a) => {
        const status = a.status === "pending" ? null : a.status;
        const isEditing = editingId === a.id;
        const subject = a.subject || a.title || "";
        const body = a.body || a.detail || "";
        const conf = typeof a.confidence === "number" ? Math.round(a.confidence * 100) : null;
        const shaky = conf !== null && conf < 60;

        return (
          <div
            key={a.id}
            className="card elev-sm"
            style={{ padding: 20, gap: 12, background: status ? "var(--color-neutral-100)" : "var(--color-surface)", opacity: status ? 0.62 : 1 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span className="tag" style={{ fontSize: 10.5, background: "var(--color-accent-2-200)", color: "var(--color-accent-2-800)" }}>
                {KIND_LABEL[a.kind] || a.kind || "Approval"}
              </span>
              {shaky ? (
                <span className="tag" style={{ fontSize: 10.5, background: "var(--color-accent-100)", color: "var(--color-accent-800)" }}>
                  {conf}% sure — read it closely
                </span>
              ) : conf !== null ? (
                <span className="text-muted" style={{ fontSize: 11.5 }}>{conf}% sure of the claims</span>
              ) : null}
              <span className="text-muted" style={{ fontSize: 11.5 }}>waiting {ago(minutesAgo(a.createdAt))}</span>
              {a.edited ? <span className="tag tag-outline" style={{ fontSize: 10 }}>Edited by you</span> : null}
              <span className="tag tag-neutral" style={{ marginLeft: "auto", fontSize: 10.5 }}>
                {status === "yes" ? "Approved" : status === "no" ? "Declined" : "Waiting on you"}
              </span>
            </div>

            {/* Who it goes to, and where that address came from. "Why do we have
                this?" is a question a customer can be asked under GDPR, so the
                answer sits next to the address rather than three screens away. */}
            {a.to ? (
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", fontSize: 12.5 }}>
                <span className="text-muted">To</span>
                <span style={{ fontWeight: 600 }}>{a.to}</span>
                {a.provenance?.sourceUrl ? (
                  <span className="text-muted" style={{ fontSize: 11.5 }}>
                    — published at{" "}
                    <a href={a.provenance.sourceUrl} target="_blank" rel="noopener noreferrer">
                      {a.provenance.sourceUrl.replace(/^https?:\/\//, "")}
                    </a>
                  </span>
                ) : null}
              </div>
            ) : null}

            {isEditing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input className="input" value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} style={{ fontSize: 14, fontWeight: 700 }} placeholder="Subject" />
                <textarea
                  className="input"
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  style={{ width: "100%", minHeight: 200, fontSize: 13, lineHeight: 1.6 }}
                />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <h4 style={{ margin: 0 }}>{subject}</h4>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap" }} className="text-muted">
                  {body}
                </p>
              </div>
            )}

            {a.claims?.length ? (
              <details style={{ fontSize: 12 }}>
                <summary className="text-muted" style={{ cursor: "pointer" }}>
                  {a.claims.length} claim{a.claims.length === 1 ? "" : "s"} this makes about them
                </summary>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }} className="text-muted">
                  {a.claims.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </details>
            ) : null}

            {a.why ? (
              <p className="text-muted" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }}>
                Why this company: {a.why}
              </p>
            ) : null}

            <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
              {isEditing ? (
                <>
                  <button className="btn btn-primary" onClick={() => saveEdit(a.id)} style={{ fontSize: 13 }}>Save changes</button>
                  <button className="btn btn-ghost" onClick={() => setEditingId(null)} style={{ fontSize: 13 }}>Cancel</button>
                </>
              ) : (
                <>
                  {a.to ? (
                    <a
                      className="btn btn-primary"
                      href={status ? undefined : mailtoFor({ ...a, subject, body })}
                      onClick={() => { if (!status) onApprove(a.id); }}
                      aria-disabled={!!status}
                      style={{ fontSize: 13, pointerEvents: status ? "none" : undefined, opacity: status ? 0.6 : 1 }}
                    >
                      {status === "yes" ? "Approved" : "Approve & open in your mail app"}
                    </a>
                  ) : (
                    <button className="btn btn-primary" disabled={!!status} onClick={() => onApprove(a.id)} style={{ fontSize: 13 }}>
                      {status === "yes" ? "Approved" : "Approve"}
                    </button>
                  )}
                  <button className="btn btn-secondary" disabled={!!status} onClick={() => startEdit(a)} style={{ fontWeight: 600, fontSize: 13 }}>
                    Change it first
                  </button>
                  <button className="btn btn-ghost" disabled={!!status} onClick={() => onDecline(a.id)} style={{ fontSize: 13 }}>
                    No thanks
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}

      <div className="card" style={{ padding: 18, gap: 6, background: "var(--color-neutral-100)" }}>
        <h5 style={{ margin: 0 }}>What ends up here</h5>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }} className="text-muted">
          Outreach emails, always — MADBOT never sends one on its own, at any autonomy level. Social posts are approved
          on the Social screen. Articles go live only through a pull request you merge.
        </p>
      </div>
    </section>
  );
}
