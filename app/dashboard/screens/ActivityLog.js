import { useState } from "react";
import { ago, minutesAgo } from "../data";

export default function ActivityLog({ feedAll, onToggleUndo }) {
  const [filt, setFilt] = useState("all");
  const rows = feedAll.filter((f) => filt === "all" || f.undone);

  return (
    <section data-screen-label="Activity log" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 3px" }}>Everything I&apos;ve ever done here</h2>
          <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>{feedAll.length} actions, each one reversible. Nothing happens off the record.</p>
        </div>
        <div className="seg" style={{ marginLeft: "auto", background: "var(--color-bg)" }}>
          <label className="seg-opt">
            <input type="radio" name="lg" checked={filt === "all"} onChange={() => setFilt("all")} />
            All
          </label>
          <label className="seg-opt">
            <input type="radio" name="lg" checked={filt === "undo"} onChange={() => setFilt("undo")} />
            Rolled back
          </label>
        </div>
        <button className="btn btn-secondary" style={{ fontWeight: 600, fontSize: 13 }}>Export CSV</button>
      </div>
      <div className="card" style={{ padding: "8px 14px", background: "var(--color-neutral-100)" }}>
        <table className="table">
          <thead>
            <tr><th>When</th><th>What I did</th><th>Why</th><th>Result</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="text-muted" style={{ fontSize: 13, padding: "14px 8px" }}>Nothing here yet.</td></tr>
            ) : null}
            {rows.map((f) => {
              const u = !!f.undone;
              return (
                <tr key={f.id} style={{ opacity: u ? 0.55 : 1 }}>
                  <td style={{ whiteSpace: "nowrap", fontSize: 12 }} className="text-muted">{ago(minutesAgo(f.createdAt))}</td>
                  <td style={{ fontSize: 13 }}><span style={{ textDecoration: u ? "line-through" : "none" }}>{f.text}</span></td>
                  <td style={{ fontSize: 12 }} className="text-muted">{f.why || "—"}</td>
                  <td><span className="tag" style={{ background: u ? "var(--color-neutral-100)" : "var(--color-accent-2-100)", color: u ? "var(--color-neutral-800)" : "var(--color-accent-2-800)", fontSize: 10.5 }}>{u ? "Rolled back" : f.result || "Done"}</span></td>
                  <td style={{ textAlign: "right" }}>
                    {f.undo ? (
                      <button className="btn btn-ghost" onClick={() => onToggleUndo(f.id, !u)} style={{ fontSize: 12, fontWeight: 600 }}>
                        {u ? "Restore" : "Roll back"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
