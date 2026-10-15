"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAdmin } from "../../../_components/AdminShell";
import { RoleSelect } from "../../../_components/forms";
import { Empty, Loadable, PageHead, Pill, Table, api, useAction, useAdminData, useConfirm, useNotice, when } from "../../../_components/ui";

export default function AdminUser() {
  const { uid } = useParams();
  const admin = useAdmin();
  const state = useAdminData(`/api/admin/users/${encodeURIComponent(uid)}`);
  const confirm = useConfirm();
  const notice = useNotice();
  const action = useAction(notice);
  const [addTo, setAddTo] = useState({ orgId: "", roleId: "org_member" });
  const u = state.data?.user;
  const canWrite = admin.can("platform.users.write");

  async function act(body, done) {
    const out = await action.run(() => api(`/api/admin/users/${encodeURIComponent(uid)}`, { method: "POST", body }), done);
    if (out) state.reload();
  }

  async function suspend() {
    const ok = await confirm({
      title: "Suspend this account?",
      message: `${u.email} is signed out everywhere and can't sign in again until reactivated. Nothing is deleted.`,
      confirmLabel: "Suspend",
      danger: true,
      reason: true,
    });
    if (ok) act({ action: "suspend", reason: ok.note || undefined }, "Suspended and signed out everywhere.");
  }
  async function softDelete() {
    const ok = await confirm({
      title: "Delete this account?",
      message:
        "This is a soft delete: the account is disabled and marked deleted, and everything it owns is kept, so it can be reactivated. Erasing data is the person's own right, from their dashboard.",
      confirmLabel: "Delete account",
      danger: true,
      typeToConfirm: u.email || uid,
    });
    if (ok) act({ action: "delete", confirm: u.email || uid }, "Marked deleted and signed out.");
  }
  async function resetPassword() {
    const ok = await confirm({
      title: "Force a password reset?",
      message: `${u.email} is signed out everywhere and emailed a link to set a new password.`,
      confirmLabel: "Reset password",
    });
    if (ok) act({ action: "reset_password" }, (r) => `Signed out, and a reset link was emailed to ${r.emailed}.`);
  }
  async function removeFrom(m) {
    const ok = await confirm({ title: `Remove from ${m.name}?`, message: "They lose access to that organisation at once.", confirmLabel: "Remove", danger: true });
    if (ok) act({ action: "remove_from_org", orgId: m.id }, `Removed from ${m.name}.`);
  }

  return (
    <>
      <PageHead title={u?.email || "User"} sub={u ? `Account ${u.uid}` : null}>
        <Link href="/admin/users" className="btn btn-secondary">
          All users
        </Link>
      </PageHead>
      {notice.node}
      <Loadable state={state}>
        {u ? (
          <>
            <div className="adm-grid-2">
              <section className="adm-card" aria-labelledby="profile-h">
                <h2 id="profile-h">Profile</h2>
                <dl className="adm-dl">
                  <dt>Status</dt>
                  <dd>
                    <Pill value={u.status} />
                  </dd>
                  <dt>Name</dt>
                  <dd>{u.displayName || "—"}</dd>
                  <dt>Email confirmed</dt>
                  <dd>{u.emailVerified ? "Yes" : "No"}</dd>
                  <dt>Signs in with</dt>
                  <dd>{u.providers.length ? u.providers.join(", ") : "—"}</dd>
                  <dt>Joined</dt>
                  <dd>{when(u.createdAt)}</dd>
                  <dt>Last sign-in</dt>
                  <dd>{when(u.lastSignInAt)}</dd>
                  <dt>Last active</dt>
                  <dd>{when(u.lastRefreshAt)}</dd>
                  <dt>Platform role</dt>
                  <dd>{u.platformRole ? `${u.platformRole.roleId.replace("platform_", "")}${u.platformRole.source === "env" ? " (ADMIN_UIDS)" : ""}` : "None"}</dd>
                </dl>
              </section>

              {canWrite ? (
                <section className="adm-card" aria-labelledby="actions-h">
                  <h2 id="actions-h">Actions</h2>
                  <p className="adm-note">Each is recorded in the audit log with who did it and the values before and after.</p>
                  <div className="adm-actions">
                    {u.status === "active" ? (
                      <button type="button" className="btn btn-secondary" disabled={action.busy} onClick={suspend}>
                        Suspend
                      </button>
                    ) : (
                      <button type="button" className="btn btn-secondary" disabled={action.busy} onClick={() => act({ action: "reactivate" }, "Reactivated.")}>
                        Reactivate
                      </button>
                    )}
                    <button type="button" className="btn btn-secondary" disabled={action.busy || !u.providers.includes("password")} onClick={resetPassword}>
                      Force password reset
                    </button>
                    {u.status !== "deleted" ? (
                      <button type="button" className="btn btn-secondary" disabled={action.busy} onClick={softDelete}>
                        Delete
                      </button>
                    ) : null}
                  </div>
                  {!u.providers.includes("password") ? <p className="adm-note">This account has no MADBOT password to reset; it signs in with Google or GitHub.</p> : null}
                </section>
              ) : null}
            </div>

            <section className="adm-card" aria-labelledby="orgs-h">
              <h2 id="orgs-h">Organisations</h2>
              {state.data.memberships.length === 0 ? (
                <Empty title="Not a member of any organisation." />
              ) : (
                <Table caption="Organisations this user belongs to" head={["Organisation", "Status", "Role", ""]}>
                  {state.data.memberships.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <Link href={`/admin/orgs/${m.id}`}>{m.name}</Link>
                      </td>
                      <td>
                        <Pill value={m.status} />
                      </td>
                      <td>
                        {canWrite && m.roleId !== "org_owner" ? (
                          <RoleSelect
                            scope="org"
                            excludeOwner
                            value={m.roleId}
                            onChange={(roleId) => act({ action: "set_org_role", orgId: m.id, roleId }, `Role in ${m.name} changed.`)}
                          />
                        ) : (
                          m.roleId.replace("org_", "")
                        )}
                      </td>
                      <td>
                        {canWrite && m.roleId !== "org_owner" ? (
                          <button type="button" className="btn btn-ghost" onClick={() => removeFrom(m)}>
                            Remove
                          </button>
                        ) : m.roleId === "org_owner" ? (
                          <span className="adm-note">Owner: transfer ownership on the organisation&apos;s page</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
              {canWrite ? (
                <form
                  className="adm-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act({ action: "add_to_org", ...addTo }, "Added to the organisation.");
                  }}
                >
                  <label>
                    Add to organisation (id)
                    <input className="input" required value={addTo.orgId} onChange={(e) => setAddTo({ ...addTo, orgId: e.target.value.trim() })} />
                  </label>
                  <label>
                    Role
                    <RoleSelect scope="org" excludeOwner value={addTo.roleId} onChange={(roleId) => setAddTo({ ...addTo, roleId })} />
                  </label>
                  <button className="btn btn-secondary" type="submit" disabled={action.busy}>
                    Add
                  </button>
                </form>
              ) : null}
            </section>

            <section className="adm-card" aria-labelledby="activity-h">
              <h2 id="activity-h">What the console has done to this account</h2>
              {state.data.activity.length === 0 ? (
                <Empty title="Nothing yet." />
              ) : (
                <Table caption="Admin actions on this account" head={["When", "Action", "By", "Note"]}>
                  {state.data.activity.map((a) => (
                    <tr key={a.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{when(a.at)}</td>
                      <td>{a.action}</td>
                      <td>{a.actorEmail}</td>
                      <td>{a.note || "—"}</td>
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
