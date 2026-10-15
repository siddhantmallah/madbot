"use client";

import { useState } from "react";
import { useAdmin } from "../../_components/AdminShell";
import { RoleSelect } from "../../_components/forms";
import { Loadable, PageHead, Pill, Table, api, useAction, useAdminData, useConfirm, useNotice, when } from "../../_components/ui";

export default function AdminAdmins() {
  const admin = useAdmin();
  const state = useAdminData("/api/admin/admins");
  const confirm = useConfirm();
  const notice = useNotice();
  const action = useAction(notice);
  const [form, setForm] = useState({ email: "", roleId: "platform_support" });
  const canManage = admin.can("platform.admins.manage");
  const isOwner = admin.roleId === "platform_owner";

  async function post(body, done) {
    const out = await action.run(() => api("/api/admin/admins", { method: "POST", body }), done);
    if (out) state.reload();
    return out;
  }

  async function revoke(a) {
    const ok = await confirm({
      title: `Revoke console access for ${a.email}?`,
      message: "They're signed out everywhere and can't open the console again. Their MADBOT account itself is untouched.",
      confirmLabel: "Revoke access",
      danger: true,
      typeToConfirm: a.email,
    });
    if (ok) post({ action: "revoke", uid: a.uid }, "Access revoked.");
  }

  async function resetMfa(a) {
    const ok = await confirm({
      title: `Reset ${a.email}'s authenticator?`,
      message: "They're signed out everywhere, and must set up an authenticator app again on their next sign-in.",
      confirmLabel: "Reset authenticator",
      danger: true,
    });
    if (ok) post({ action: "reset_mfa", uid: a.uid }, "Authenticator reset.");
  }

  return (
    <>
      <PageHead title="Admins" sub="Who can open this console, and with which role. Owners are set by ADMIN_UIDS on the server and can't be changed here." />
      {notice.node}

      {canManage ? (
        <form
          className="adm-card"
          onSubmit={async (e) => {
            e.preventDefault();
            const out = await post({ action: "grant", ...form }, `Access granted to ${form.email}. They set up an authenticator on first sign-in.`);
            if (out) setForm({ email: "", roleId: form.roleId });
          }}
        >
          <h2>Grant access</h2>
          <div className="adm-form">
            <label>
              Email of an existing account
              <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label>
              Role
              <RoleSelect scope="platform" excludeOwner value={form.roleId} onChange={(roleId) => setForm({ ...form, roleId })} />
            </label>
            <button className="btn btn-primary" type="submit" disabled={action.busy} style={{ color: "var(--on-accent)" }}>
              Grant
            </button>
          </div>
          <p className="adm-note">Granting again to someone who already has access changes their role.</p>
        </form>
      ) : null}

      <Loadable state={state}>
        <Table caption="Admins" head={["Account", "Role", "Status", "Authenticator", "Last console sign-in", ""]}>
          {(state.data?.admins || []).map((a) => {
            const self = a.uid === admin.uid;
            const owner = a.source === "env";
            return (
              <tr key={a.uid}>
                <td>
                  {a.email || a.uid}
                  {self ? <div className="adm-note">You</div> : null}
                </td>
                <td>
                  {(a.roleId || "—").replace("platform_", "")}
                  {owner ? <div className="adm-note">ADMIN_UIDS</div> : null}
                </td>
                <td>
                  <Pill value={a.status} />
                </td>
                <td>{a.mfaEnrolled ? <Pill value="set up" tone="is-good" /> : <Pill value="not yet" tone="is-warn" />}</td>
                <td>{when(a.lastSignInAt)}</td>
                <td>
                  {canManage && !self ? (
                    <div className="adm-actions">
                      {!owner && a.status === "active" ? (
                        <button type="button" className="btn btn-ghost" disabled={action.busy} onClick={() => revoke(a)}>
                          Revoke
                        </button>
                      ) : null}
                      {a.mfaEnrolled && (!owner || isOwner) ? (
                        <button type="button" className="btn btn-ghost" disabled={action.busy} onClick={() => resetMfa(a)}>
                          Reset authenticator
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </Table>
      </Loadable>
    </>
  );
}
