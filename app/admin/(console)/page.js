"use client";

import Link from "next/link";
import { Empty, Loadable, PageHead, Pill, Stat, Table, useAdminData, when } from "../_components/ui";

export default function AdminDashboard() {
  const state = useAdminData("/api/admin/overview");
  const d = state.data;
  const max = d ? Math.max(1, ...d.signups.map((s) => s.count)) : 1;

  return (
    <>
      <PageHead title="Dashboard" sub="Counted from the database when this page loaded. Nothing here is estimated or cached." />
      <Loadable state={state}>
        {d ? (
          <>
            <div className="adm-stats">
              <Stat label="Users" value={d.counts.users.toLocaleString()} />
              <Stat label="Organisations" value={d.counts.orgs.toLocaleString()} />
              <Stat label="Active licences" value={d.counts.activeLicences.toLocaleString()} />
              <Stat label="Signups, 30 days" value={d.counts.signupsLast30Days.toLocaleString()} />
            </div>

            <div className="adm-grid-2">
              <section className="adm-card" aria-labelledby="signups-h">
                <h2 id="signups-h">Signups per day</h2>
                {d.counts.signupsLast30Days === 0 ? (
                  <Empty title="No signups in the last 30 days." />
                ) : (
                  <>
                    <div className="adm-bars" role="img" aria-label={`Signups per day over 30 days, ${d.counts.signupsLast30Days} in total, most in one day ${max}.`}>
                      {d.signups.map((s) => (
                        <span key={s.day} title={`${s.day}: ${s.count}`} style={{ height: `${(s.count / max) * 100}%`, opacity: s.count ? 1 : 0.18 }} />
                      ))}
                    </div>
                    <p className="adm-note">
                      {d.signups[0].day} to {d.signups[d.signups.length - 1].day}. Busiest day: {max}.
                    </p>
                  </>
                )}
              </section>

              <section className="adm-card" aria-labelledby="usage-h">
                <h2 id="usage-h">Bot usage this month ({d.usage.month})</h2>
                {d.usage.credits === 0 ? (
                  <Empty title="Nothing metered yet this month." />
                ) : (
                  <dl className="adm-dl">
                    <dt>Autonomous actions</dt>
                    <dd>{d.usage.credits.toLocaleString()}</dd>
                    <dt>Content pieces</dt>
                    <dd>{d.usage.contentPieces.toLocaleString()}</dd>
                    <dt>Social posts</dt>
                    <dd>{d.usage.socialPosts.toLocaleString()}</dd>
                    <dt>Lead credits</dt>
                    <dd>{d.usage.leadCredits.toLocaleString()}</dd>
                    <dt>Model cost (recorded)</dt>
                    <dd>${d.usage.costUsd.toLocaleString()}</dd>
                    <dt>Organisations using it</dt>
                    <dd>
                      {d.usage.activeOrgs} of {d.usage.orgsCounted}
                    </dd>
                  </dl>
                )}
                <Link href="/admin/usage" style={{ fontSize: 13 }}>
                  Usage by organisation →
                </Link>
              </section>
            </div>

            <section className="adm-card" aria-labelledby="errors-h">
              <h2 id="errors-h">Recent errors</h2>
              {d.recentErrors.length === 0 ? (
                <Empty title="No server errors recorded." />
              ) : (
                <Table caption="Recent server errors" head={["When", "Where", "Message"]}>
                  {d.recentErrors.map((e) => (
                    <tr key={e.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{when(e.at)}</td>
                      <td>{e.where}</td>
                      <td>{e.message}</td>
                    </tr>
                  ))}
                </Table>
              )}
              <Link href="/admin/health" style={{ fontSize: 13 }}>
                System health →
              </Link>
            </section>

            <section className="adm-card" aria-labelledby="runs-h">
              <h2 id="runs-h">Scheduled runs</h2>
              {d.recentRuns.length === 0 ? (
                <Empty title="No scheduled run has been recorded yet.">Runs are recorded from this release on.</Empty>
              ) : (
                <Table caption="Recent scheduled runs" head={["When", "Job", "Result", "Took"]}>
                  {d.recentRuns.map((r) => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{when(r.at)}</td>
                      <td>{r.job}</td>
                      <td>
                        <Pill value={r.ok ? "ok" : "failed"} />
                      </td>
                      <td className="adm-num">{r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </section>
          </>
        ) : null}
      </Loadable>
    </>
  );
}
