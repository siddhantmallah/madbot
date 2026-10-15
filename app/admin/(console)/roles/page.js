"use client";

import { useState } from "react";
import { useAdmin } from "../../_components/AdminShell";
import { Loadable, PageHead, Pill, api, useAction, useAdminData, useConfirm, useNotice } from "../../_components/ui";

const SCOPE_LABEL = { platform: "Console (platform)", org: "Inside an organisation" };
const blank = (scope) => ({ id: null, scope, name: "", description: "", permissions: [] });

export default function AdminRoles() {
  const admin = useAdmin();
  const state = useAdminData("/api/admin/roles");
  const confirm = useConfirm();
  const notice = useNotice();
  const action = useAction(notice);
  const [editing, setEditing] = useState(null);
  const canManage = admin.can("platform.roles.manage");
  const roles = state.data?.roles || [];
  const catalogue = state.data?.permissions || {};

  async function save(e) {
    e.preventDefault();
    const body = { name: editing.name, description: editing.description, permissions: editing.permissions };
    const out = editing.id
      ? await action.run(() => api(`/api/admin/roles/${encodeURIComponent(editing.id)}`, { method: "PATCH", body }), "Role saved. It applies at once to everyone who holds it.")
      : await action.run(() => api("/api/admin/roles", { method: "POST", body: { ...body, scope: editing.scope } }), "Role created.");
    if (out) {
      setEditing(null);
      state.reload();
    }
  }

  async function remove(role) {
    const ok = await confirm({
      title: `Delete the role “${role.name}”?`,
      message: "Only possible when nobody holds it. This can't be undone.",
      confirmLabel: "Delete role",
      danger: true,
      typeToConfirm: role.name,
    });
    if (!ok) return;
    const out = await action.run(() => api(`/api/admin/roles/${encodeURIComponent(role.id)}`, { method: "DELETE" }), "Role deleted.");
    if (out) state.reload();
  }

  return (
    <>
      <PageHead title="Roles & permissions" sub="A role is a set of permission keys from one scope. Built-in roles are fixed; custom ones can be made from the same keys.">
        {canManage && !editing ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(blank("org"))}>
              New organisation role
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(blank("platform"))}>
              New console role
            </button>
          </>
        ) : null}
      </PageHead>
      {notice.node}

      {editing ? (
        <form className="adm-card" onSubmit={save} aria-labelledby="role-edit-h">
          <h2 id="role-edit-h">{editing.id ? `Edit “${editing.name}”` : `New ${editing.scope === "org" ? "organisation" : "console"} role`}</h2>
          <div className="adm-form">
            <label>
              Name
              <input className="input" required maxLength={60} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label style={{ flex: "2 1 320px" }}>
              Description
              <input className="input" maxLength={300} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </label>
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 13.5, marginBottom: 8 }}>Permissions</legend>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
              {Object.entries(catalogue[editing.scope] || {}).map(([key, label]) => (
                <label key={key} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={editing.permissions.includes(key)}
                    onChange={(e) =>
                      setEditing({ ...editing, permissions: e.target.checked ? [...editing.permissions, key] : editing.permissions.filter((p) => p !== key) })
                    }
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    {label}
                    <br />
                    <code className="adm-note">{key}</code>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="adm-actions">
            <button className="btn btn-primary" type="submit" disabled={action.busy} style={{ color: "var(--on-accent)" }}>
              {action.busy ? "Saving…" : editing.id ? "Save role" : "Create role"}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <Loadable state={state}>
        {["platform", "org"].map((scope) => (
          <section key={scope} className="adm-card" aria-labelledby={`scope-${scope}`}>
            <h2 id={`scope-${scope}`}>{SCOPE_LABEL[scope]}</h2>
            {roles
              .filter((r) => r.scope === scope)
              .map((r) => (
                <article key={r.id} style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <h3 style={{ margin: 0, fontSize: 15 }}>
                      {r.name} <Pill value={r.builtIn ? "built-in" : "custom"} tone={r.builtIn ? "" : "is-good"} />
                    </h3>
                    {canManage && !r.builtIn ? (
                      <div className="adm-actions">
                        <button type="button" className="btn btn-ghost" onClick={() => setEditing({ ...r })}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => remove(r)}>
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {r.description ? <p className="adm-note" style={{ margin: 0 }}>{r.description}</p> : null}
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                    {r.permissions.length === 0 ? <li>No permissions</li> : r.permissions.map((p) => <li key={p}>{catalogue[scope]?.[p] || p}</li>)}
                  </ul>
                </article>
              ))}
          </section>
        ))}
      </Loadable>
    </>
  );
}
