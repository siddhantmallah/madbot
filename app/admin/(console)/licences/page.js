"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, Loadable, PageHead, Pager, Pill, Table, day, useAdminData, useCursorPages } from "../../_components/ui";

// Prices are a table per region (lib/plans.js); India and the US show the range.
const money = (p) => (!p ? "—" : p.US === 0 ? "Free" : `₹${p.IN.toLocaleString("en-IN")} · $${p.US} /mo`);

export default function AdminLicences() {
  const plans = useAdminData("/api/admin/plans");
  const [status, setStatus] = useState("all");
  const pages = useCursorPages(`/api/admin/orgs?limit=25&status=${status}`);
  const rows = pages.data?.orgs || [];
  const labels = plans.data?.featureLabels || {};

  return (
    <>
      <PageHead
        title="Licences & plans"
        sub="Plans are defined in code and published on the pricing page, so what's sold and what's enforced can't drift. A licence puts one organisation on a plan, for a period, with optional overrides."
      />

      <section className="adm-card" aria-labelledby="plans-h">
        <h2 id="plans-h">Plans</h2>
        <Loadable state={plans}>
          <Table caption="Plans" head={["Plan", "Price", "Sites", "Seats", "Actions / mo", "Content / mo", "Posts / mo", "Lead credits / mo", "Autonomy ceiling", "Features"]}>
            {(plans.data?.plans || []).map((p) => (
              <tr key={p.id}>
                <td>
                  <b>{p.name}</b>
                  <div className="adm-note">{p.id}</div>
                </td>
                <td>{money(p.price)}</td>
                <td className="adm-num">{p.maxSites}</td>
                <td className="adm-num">{p.seats}</td>
                <td className="adm-num">{p.credits.toLocaleString()}</td>
                <td className="adm-num">{p.contentPieces}</td>
                <td className="adm-num">{p.socialPosts}</td>
                <td className="adm-num">{p.leadCredits}</td>
                <td className="adm-num">{p.maxAutonomy}</td>
                <td style={{ minWidth: 200 }}>{p.features.length ? p.features.map((f) => labels[f] || f).join(", ") : "—"}</td>
              </tr>
            ))}
          </Table>
          <p className="adm-note">To change a plan itself, edit lib/plans.js and deploy; the pricing page reads the same file.</p>
        </Loadable>
      </section>

      <section className="adm-card" aria-labelledby="lic-h">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 id="lic-h">Organisations and their licences</h2>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            Status
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: "auto" }}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
        </div>
        <Loadable state={pages} empty={!pages.loading && rows.length === 0 ? <Empty title="No organisations yet." /> : null}>
          <Table caption="Licences" head={["Organisation", "Plan in force", "Licence", "Seats used", "Ends", ""]}>
            {rows.map((o) => (
              <tr key={o.id}>
                <td>
                  {o.name}
                  {o.status !== "active" ? (
                    <div>
                      <Pill value={o.status} />
                    </div>
                  ) : null}
                </td>
                <td>{o.planName}</td>
                <td>{o.licenceStatus ? <Pill value={o.licenceStatus.replace(/_/g, " ")} /> : <span className="adm-note">None</span>}</td>
                <td className="adm-num">
                  {o.memberCount} / {o.seats}
                </td>
                <td>{day(o.licenceEnds)}</td>
                <td>
                  <Link href={`/admin/orgs/${o.id}`}>Manage</Link>
                </td>
              </tr>
            ))}
          </Table>
          <Pager pages={pages} />
        </Loadable>
      </section>
    </>
  );
}
