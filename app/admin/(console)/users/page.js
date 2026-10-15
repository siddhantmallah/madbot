"use client";

import Link from "next/link";
import { useState } from "react";
import { useAdmin } from "../../_components/AdminShell";
import { Empty, Loadable, PageHead, Pager, Pill, Table, day, useCursorPages, when } from "../../_components/ui";
import { InviteButton } from "../../_components/forms";

export default function AdminUsers() {
  const admin = useAdmin();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const pages = useCursorPages(`/api/admin/users?limit=25&status=${status}${query ? `&q=${encodeURIComponent(query)}` : ""}`);
  const rows = pages.data?.users || [];

  return (
    <>
      <PageHead title="Users" sub="Every account. Search by email; an exact address finds that account directly.">
        {admin.can("platform.users.write") ? <InviteButton onDone={pages.reload} /> : null}
      </PageHead>

      <form
        className="adm-toolbar"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
      >
        <label className="sr-only" htmlFor="user-q">
          Search users by email
        </label>
        <input id="user-q" className="input" type="search" placeholder="Email or the start of one" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="sr-only" htmlFor="user-status">
          Status
        </label>
        <select id="user-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ flex: "0 0 auto", width: "auto" }}>
          <option value="all">All</option>
          <option value="suspended">Suspended</option>
          <option value="deleted">Deleted</option>
        </select>
        <button className="btn btn-secondary" type="submit">
          Search
        </button>
      </form>

      <Loadable state={pages} empty={!pages.loading && rows.length === 0 ? <Empty title="No users match." /> : null}>
        <Table caption="Users" head={["Email", "Name", "Status", "Orgs", "Joined", "Last sign-in"]}>
          {rows.map((u) => (
            <tr key={u.uid}>
              <td>
                <Link href={`/admin/users/${u.uid}`}>{u.email || u.uid}</Link>
                {!u.emailVerified && u.inAuth ? <div className="adm-note">Email not confirmed</div> : null}
              </td>
              <td>{u.displayName || "—"}</td>
              <td>
                <Pill value={u.status} />
              </td>
              <td className="adm-num">{u.orgCount}</td>
              <td>{day(u.createdAt)}</td>
              <td>{when(u.lastSignInAt)}</td>
            </tr>
          ))}
        </Table>
        <Pager pages={pages} />
      </Loadable>
    </>
  );
}
