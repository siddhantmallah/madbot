"use client";

import { Fragment, useState } from "react";
import { Empty, Loadable, PageHead, Pager, Pill, Table, useCursorPages, when } from "../../_components/ui";

export default function AdminHealth() {
  const pages = useCursorPages("/api/admin/health?limit=25");
  const [open, setOpen] = useState(null);
  const d = pages.data;

  return (
    <>
      <PageHead title="System health" sub={d ? `Measured ${when(d.checkedAt)}, when this page loaded.` : "Measured when this page loads."}>
        <button type="button" className="btn btn-secondary" onClick={pages.reload} disabled={pages.loading}>
          {pages.loading ? "Checking…" : "Check again"}
        </button>
      </PageHead>
      <Loadable state={pages}>
        {d ? (
          <>
            <div className="adm-grid-2">
              <section className="adm-card" aria-labelledby="deps-h">
                <h2 id="deps-h">Configuration</h2>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  <li style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span>Firestore round trip</span>
                    <span>{d.firestore.ok ? <Pill value={`${d.firestore.ms} ms`} tone="is-good" /> : <Pill value="failing" tone="is-bad" />}</span>
                  </li>
                  {d.firestore.error ? <li className="adm-error">{d.firestore.error}</li> : null}
                  {d.configured.map((c) => (
                    <li key={c.key} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span>
                        {c.label}
                        {c.note && c.ok ? <div className="adm-note">{c.note}</div> : null}
                      </span>
                      <span>
                        <Pill value={c.ok ? "set" : "missing"} tone={c.ok ? "is-good" : "is-bad"} />
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="adm-note">“Set” means the setting is present. It doesn&apos;t prove a key is valid.</p>
              </section>

              <section className="adm-card" aria-labelledby="jobs-h">
                <h2 id="jobs-h">Scheduled jobs</h2>
                {d.jobs.map((j) => (
                  <div key={j.job} style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <b>{j.label}</b>
                      <span>
                        {j.lastAt === null ? (
                          <Pill value="never run" tone="is-warn" />
                        ) : (
                          <>
                            <Pill value={j.ok ? "ok" : "failed"} tone={j.ok ? "is-good" : "is-bad"} /> {j.late ? <Pill value="late" tone="is-warn" /> : null}
                          </>
                        )}
                      </span>
                    </div>
                    <span className="adm-note">
                      Every {j.everyHours} h · last finished {when(j.lastAt)}
                      {j.durationMs !== null ? ` in ${(j.durationMs / 1000).toFixed(1)} s` : ""}
                    </span>
                    {j.summary ? <pre className="adm-pre">{JSON.stringify(j.summary, null, 2)}</pre> : null}
                  </div>
                ))}
              </section>
            </div>

            <section className="adm-card" aria-labelledby="errors-h">
              <h2 id="errors-h">Recent server errors</h2>
              <p className="adm-note">Kept for 30 days. Messages are recorded as thrown; nothing is retried from here.</p>
              {d.errors.length === 0 ? (
                <Empty title="No errors recorded." />
              ) : (
                <Table caption="Recent server errors" head={["When", "Where", "Message", ""]}>
                  {d.errors.map((e) => (
                    <Fragment key={e.id}>
                      <tr>
                        <td style={{ whiteSpace: "nowrap" }}>{when(e.at)}</td>
                        <td>
                          <code>{e.where}</code>
                        </td>
                        <td>{e.message}</td>
                        <td>
                          {e.stack ? (
                            <button type="button" className="btn btn-ghost" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
                              {open === e.id ? "Hide" : "Stack"}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                      {open === e.id ? (
                        <tr>
                          <td colSpan={4}>
                            <pre className="adm-pre">{e.stack}</pre>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </Table>
              )}
              <Pager pages={pages} />
            </section>
          </>
        ) : null}
      </Loadable>
    </>
  );
}
