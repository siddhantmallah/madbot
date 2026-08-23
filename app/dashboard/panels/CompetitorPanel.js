import { useState } from "react";
import { ago, minutesAgo } from "../data";
import { hostnameOf } from "../../../lib/seed";

// ago() already returns "just now" for fresh timestamps, so only the older
// buckets want an "ago" suffix.
function relative(ts) {
  const label = ago(minutesAgo(ts));
  return label === "just now" ? label : `${label} ago`;
}

export default function CompetitorPanel({ competitors, onAdd, onCheck, onRemove, busyId, adding }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    const url = draft.trim();
    if (!url) return;
    setError("");
    const res = await onAdd(url);
    if (res?.error) setError(res.error);
    else setDraft("");
  }

  return (
    <section className="card elev-sm" style={{ padding: 18, gap: 11, background: "var(--color-neutral-100)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h4 style={{ margin: 0 }}>Competitor watch</h4>
        <span className={competitors.length ? "tag tag-accent-2" : "tag tag-neutral"} style={{ marginLeft: "auto" }}>
          {competitors.length ? `${competitors.length} tracked` : "None yet"}
        </span>
      </div>

      {competitors.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }} className="text-muted">
          Add a rival&apos;s URL and I&apos;ll snapshot their page. On every check after that I compare against the
          last snapshot and tell you exactly what they changed — new pages, rewritten titles, added copy, new schema.
        </p>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {competitors.map((c) => {
          const changes = c.changes || [];
          const checking = busyId === c.id;
          return (
            <div key={c.id} style={{ background: "var(--color-bg)", borderRadius: 18, padding: "11px 13px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: changes.length ? 7 : 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {hostnameOf(c.url)}
                </span>
                <span className="text-muted" style={{ fontSize: 11, flex: "none" }}>
                  {c.lastCheckedAt ? `checked ${relative(c.lastCheckedAt)}` : "not checked"}
                </span>
                <button
                  className="btn btn-ghost"
                  onClick={() => onCheck(c)}
                  disabled={checking}
                  style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 600, flex: "none" }}
                >
                  {checking ? "Checking…" : "Check now"}
                </button>
                <button className="btn btn-ghost" onClick={() => onRemove(c.id)} style={{ fontSize: 11.5, paddingInline: 4, flex: "none" }}>
                  Remove
                </button>
              </div>

              {c.snapshot?.title ? (
                <div className="text-muted" style={{ fontSize: 11.5, marginBottom: changes.length ? 7 : 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  “{c.snapshot.title}”
                </div>
              ) : null}

              {changes.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {changes.slice(0, 4).map((ch, i) => (
                    <div key={i} style={{ display: "flex", gap: 7, fontSize: 12.5, lineHeight: 1.45 }}>
                      <span className="tag tag-accent-2" style={{ fontSize: 9.5, flex: "none", height: 17 }}>{ch.kind}</span>
                      <span>{ch.text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {c.lastCheckedAt ? "No changes since the last check." : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={submit} style={{ display: "flex", gap: 8 }}>
        <input
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="competitor.com"
          style={{ background: "var(--color-bg)", fontSize: 12.5 }}
        />
        <button className="btn btn-primary" type="submit" disabled={adding} style={{ fontSize: 13, flex: "none" }}>
          {adding ? "Reading…" : "Track"}
        </button>
      </form>

      {error ? (
        <div style={{ fontSize: 12, color: "var(--color-accent-700)" }}>{error}</div>
      ) : (
        <p style={{ margin: 0, fontSize: 11.5 }} className="text-muted">
          Detects changes to their public pages. Rank movements need a paid ranking source — not included.
        </p>
      )}
    </section>
  );
}
