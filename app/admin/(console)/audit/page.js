"use client";

import { Fragment, useState } from "react";
import { useAdmin } from "../../_components/AdminShell";
import { Empty, Loadable, PageHead, Pager, Table, useCursorPages, when } from "../../_components/ui";

const TARGETS = ["user", "org", "role", "admin", "flag", "settings"];
const EMPTY = { q: "", action: "", targetType: "", from: "", to: "" };

function queryOf(f) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  return p.toString();
}

export default function AdminAudit() {
  const admin = useAdmin();
  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [open, setOpen] = useState(null);
  const qs = queryOf(filters);
  const pages = useCursorPages(`/api/admin/audit?limit=40${qs ? `&${qs}` : ""}`);
  const rows = pages.data?.entries || [];

  return (
    <>
      <PageHead title="Audit log" sub="Every change made from this console: who, when, from where, and the values before and after. Entries can't be edited or deleted.">
        {admin.can("platform.audit.export") ? (
          <a className="btn btn-secondary" href={`/api/admin/audit/export${qs ? `?${qs}` : ""}`} download>
            Export CSV
          </a>
        ) : null}
      </PageHead>

      <form
        className="adm-toolbar"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({ ...draft, q: draft.q.trim(), action: draft.action.trim() });
        }}
      >
        <label className="sr-only" htmlFor="audit-q">
          Search
        </label>
        <input id="audit-q" className="input" type="search" placeholder="Search actor, target, note…" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} />
        <label className="sr-only" htmlFor="audit-action">
          Action
        </label>
        <input id="audit-action" className="input" placeholder="Action, e.g. license." value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} style={{ flex: "0 1 180px" }} />
        <label className="sr-only" htmlFor="audit-target">
          Target type
        </label>
        <select id="audit-target" className="input" value={draft.targetType} onChange={(e) => setDraft({ ...draft, targetType: e.target.value })} style={{ flex: "0 0 auto", width: "auto" }}>
          <option value="">Any target</option>
          {TARGETS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          From
          <input className="input" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} style={{ width: "auto" }} />
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          To
          <input className="input" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} style={{ width: "auto" }} />
        </label>
        <button className="btn btn-secondary" type="submit">
          Filter
        </button>
        {qs ? (
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              setDraft(EMPTY);
              setFilters(EMPTY);
            }}
          >
            Clear
          </button>
        ) : null}
      </form>

      <Loadable state={pages} empty={!pages.loading && rows.length === 0 ? <Empty title={qs ? "Nothing matches these filters." : "Nothing has been done from the console yet."} /> : null}>
        <Table caption="Audit log" head={["When", "Who", "Action", "Target", "Note", ""]}>
          {rows.map((r) => (
            <Fragment key={r.id}>
              <tr>
                <td style={{ whiteSpace: "nowrap" }}>{when(r.at)}</td>
                <td>
                  {r.actorEmail}
                  <div className="adm-note">{(r.actorRole || "").replace("platform_", "")}</div>
                </td>
                <td>
                  <code>{r.action}</code>
                </td>
                <td>
                  {r.targetLabel || r.targetId}
                  <div className="adm-note">{r.targetType}</div>
                </td>
                <td>{r.note || "—"}</td>
                <td>
                  <button type="button" className="btn btn-ghost" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                    {open === r.id ? "Hide" : "Details"}
                  </button>
                </td>
              </tr>
              {open === r.id ? (
                <tr>
                  <td colSpan={6}>
                    <div className="adm-grid-2">
                      <div>
                        <b style={{ fontSize: 12.5 }}>Before</b>
                        <pre className="adm-pre">{JSON.stringify(r.before, null, 2)}</pre>
                      </div>
                      <div>
                        <b style={{ fontSize: 12.5 }}>After</b>
                        <pre className="adm-pre">{JSON.stringify(r.after, null, 2)}</pre>
                      </div>
                    </div>
                    <p className="adm-note">
                      Target id {r.targetId} · actor {r.actorUid}
                      {r.ip ? ` · from ${r.ip}` : ""}
                    </p>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </Table>
        <Pager pages={pages} />
      </Loadable>
    </>
  );
}
