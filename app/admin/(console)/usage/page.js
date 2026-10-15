"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, Loadable, Meter, PageHead, Pager, Pill, Table, useCursorPages } from "../../_components/ui";

const METER_LABELS = { credits: "Actions", leadCredits: "Lead credits", contentPieces: "Content", socialPosts: "Posts" };

export default function AdminUsage() {
  const [alerts, setAlerts] = useState(false);
  const pages = useCursorPages(`/api/admin/usage?limit=50${alerts ? "&alerts=1" : ""}`);
  const d = pages.data;
  const rows = d?.rows || [];

  return (
    <>
      <PageHead
        title="Usage & billing"
        sub={`Each organisation's metered use this month${d ? ` (${d.month})` : ""} against its licence. There is no payment integration yet, so nothing here charges anyone; licences are issued by hand.`}
      />
      <div className="adm-toolbar">
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5 }}>
          <input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} />
          Only organisations at {d ? Math.round(d.alertAt * 100) : 80}% or more of an allowance
        </label>
      </div>
      <Loadable state={pages} empty={!pages.loading && rows.length === 0 ? <Empty title={alerts ? "Nobody is near an allowance on this page." : "No organisations yet."} /> : null}>
        <Table caption="Usage by organisation" head={["Organisation", "Plan", "Allowances", "Model cost", "Daily cap", ""]}>
          {rows.map((r) => (
            <tr key={r.orgId}>
              <td>
                <Link href={`/admin/orgs/${r.orgId}`}>{r.name}</Link>
                {r.status !== "active" ? (
                  <div>
                    <Pill value={r.status} />
                  </div>
                ) : null}
              </td>
              <td>{r.plan}</td>
              <td style={{ minWidth: 220 }}>
                {r.meters.length === 0 ? (
                  <span className="adm-note">No metered allowances</span>
                ) : (
                  r.meters.map((m) => (
                    <div key={m.key} style={{ display: "grid", gridTemplateColumns: "90px 1fr auto", gap: 8, alignItems: "center", fontSize: 12.5, marginBottom: 4 }}>
                      <span>{METER_LABELS[m.key]}</span>
                      <Meter used={m.used} allowance={m.allowance} />
                      <span className="adm-num">
                        {m.used.toLocaleString()}/{m.allowance.toLocaleString()}
                      </span>
                    </div>
                  ))
                )}
              </td>
              <td className="adm-num">${r.costUsd}</td>
              <td className="adm-num">{r.dailyCapUsd ? `$${r.dailyCapUsd}` : "—"}</td>
              <td>{r.alert ? <Pill value={r.alert === "exhausted" ? "used up" : "near limit"} tone={r.alert === "exhausted" ? "is-bad" : "is-warn"} /> : null}</td>
            </tr>
          ))}
        </Table>
        <Pager pages={pages} />
        {alerts ? <p className="adm-note">The filter applies within each page of {50} organisations, so use Next to look further.</p> : null}
      </Loadable>
    </>
  );
}
