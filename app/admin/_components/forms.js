"use client";

import { useEffect, useState } from "react";
import { api, useAction, useNotice } from "./ui";

/** Roles of one scope, from the server, so custom roles appear alongside the built-in ones. */
export function RoleSelect({ scope, value, onChange, excludeOwner = false, id }) {
  const [roles, setRoles] = useState([]);
  useEffect(() => {
    let alive = true;
    api("/api/admin/roles")
      .then((d) => alive && setRoles(d.roles.filter((r) => r.scope === scope && !(excludeOwner && /_owner$/.test(r.id)))))
      .catch(() => alive && setRoles([]));
    return () => {
      alive = false;
    };
  }, [scope, excludeOwner]);
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {roles.length === 0 ? <option value={value}>{value}</option> : null}
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
          {r.builtIn ? "" : " (custom)"}
        </option>
      ))}
    </select>
  );
}

/** Invite someone into an organisation, from the Users page or an organisation's own page. */
export function InviteButton({ onDone, orgId = null }) {
  const [open, setOpen] = useState(false);
  const notice = useNotice();
  const action = useAction(notice);
  const [form, setForm] = useState({ email: "", orgId: orgId || "", roleId: "org_member" });

  async function submit(e) {
    e.preventDefault();
    const out = await action.run(() => api("/api/admin/invites", { method: "POST", body: form }), (r) => `Invitation sent to ${r.emailed}.`);
    if (out) {
      setForm({ email: "", orgId: orgId || "", roleId: "org_member" });
      onDone?.();
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" style={{ color: "var(--on-accent)" }} onClick={() => setOpen(true)}>
        Invite someone
      </button>
    );
  }
  return (
    <form className="adm-card" onSubmit={submit} style={{ margin: 0, minWidth: "min(100%, 520px)" }}>
      <h2>Invite to an organisation</h2>
      {notice.node}
      <div className="adm-form">
        <label>
          Email
          <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        {!orgId ? (
          <label>
            Organisation id
            <input className="input" required value={form.orgId} onChange={(e) => setForm({ ...form, orgId: e.target.value.trim() })} placeholder="From the organisation's page" />
          </label>
        ) : null}
        <label>
          Role
          <RoleSelect scope="org" value={form.roleId} onChange={(roleId) => setForm({ ...form, roleId })} excludeOwner />
        </label>
      </div>
      <p className="adm-note">The invitation holds a seat until it&apos;s accepted or withdrawn, and expires in 14 days.</p>
      <div className="adm-actions">
        <button className="btn btn-primary" type="submit" disabled={action.busy} style={{ color: "var(--on-accent)" }}>
          {action.busy ? "Sending…" : "Send invitation"}
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </form>
  );
}
