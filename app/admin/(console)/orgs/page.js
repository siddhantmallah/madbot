"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAdmin } from "../../_components/AdminShell";
import { Empty, Loadable, PageHead, Pager, Pill, Table, api, day, useAction, useCursorPages, useNotice } from "../../_components/ui";

export default function AdminOrgs() {
  const admin = useAdmin();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const pages = useCursorPages(`/api/admin/orgs?limit=25&status=${status}${query ? `&q=${encodeURIComponent(query)}` : ""}`);
  const rows = pages.data?.orgs || [];
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", ownerEmail: "" });
  const notice = useNotice();
  const action = useAction(notice);

  async function create(e) {
    e.preventDefault();
    const out = await action.run(() => api("/api/admin/orgs", { method: "POST", body: form }), "Organisation created.");
    if (out?.orgId) router.push(`/admin/orgs/${out.orgId}`);
  }

  return (
    <>
      <PageHead title="Organisations" sub="Every organisation, its plan, seats and standing. Each account's own workspace is one too.">
        {admin.can("platform.orgs.write") ? (
          <button type="button" className="btn btn-primary" style={{ color: "var(--on-accent)" }} onClick={() => setCreating((v) => !v)}>
            {creating ? "Close" : "New organisation"}
          </button>
        ) : null}
      </PageHead>
      {notice.node}
      {creating ? (
        <form className="adm-card" onSubmit={create}>
          <h2>New organisation</h2>
          <div className="adm-form">
            <label>
              Name
              <input className="input" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Owner&apos;s email (an existing account)
              <input className="input" type="email" required value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} />
            </label>
            <button className="btn btn-primary" type="submit" disabled={action.busy} style={{ color: "var(--on-accent)" }}>
              {action.busy ? "Creating…" : "Create"}
            </button>
          </div>
          <p className="adm-note">It starts with no licence, on the free tier. Issue one from its page.</p>
        </form>
      ) : null}

      <form
        className="adm-toolbar"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
      >
        <label className="sr-only" htmlFor="org-q">
          Search organisations by name
        </label>
        <input id="org-q" className="input" type="search" placeholder="Name starts with…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="sr-only" htmlFor="org-status">
          Status
        </label>
        <select id="org-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ flex: "0 0 auto", width: "auto" }}>
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <button className="btn btn-secondary" type="submit">
          Search
        </button>
      </form>

      <Loadable state={pages} empty={!pages.loading && rows.length === 0 ? <Empty title="No organisations match." /> : null}>
        <Table caption="Organisations" head={["Name", "Status", "Plan", "Seats", "Licence ends", "Created"]}>
          {rows.map((o) => (
            <tr key={o.id}>
              <td>
                <Link href={`/admin/orgs/${o.id}`}>{o.name}</Link>
                {o.personal ? <div className="adm-note">Personal workspace</div> : null}
              </td>
              <td>
                <Pill value={o.status} />
              </td>
              <td>
                {o.planName}
                {o.licenceStatus && o.licenceStatus !== "active" ? <div className="adm-note">{o.licenceStatus.replace(/_/g, " ")}</div> : null}
              </td>
              <td className="adm-num">
                {o.memberCount} / {o.seats}
              </td>
              <td>{day(o.licenceEnds)}</td>
              <td>{day(o.createdAt)}</td>
            </tr>
          ))}
        </Table>
        <Pager pages={pages} />
      </Loadable>
    </>
  );
}
