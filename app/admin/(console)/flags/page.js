"use client";

import { useAdmin } from "../../_components/AdminShell";
import { Loadable, PageHead, Pill, Table, api, useAction, useAdminData, useConfirm, useNotice, when } from "../../_components/ui";

export default function AdminFlags() {
  const admin = useAdmin();
  const state = useAdminData("/api/admin/flags");
  const confirm = useConfirm();
  const notice = useNotice();
  const action = useAction(notice);
  const canManage = admin.can("platform.flags.manage");

  async function toggle(f) {
    const turningOff = f.enabled;
    const ok = await confirm({
      title: `${turningOff ? "Turn off" : "Turn on"} ${f.label} for everyone?`,
      message: turningOff
        ? "Every organisation without its own override is refused this feature on the server, and the scheduler stops running it."
        : "Organisations whose licence includes it can use it again. Per-organisation overrides still win.",
      confirmLabel: turningOff ? "Turn off" : "Turn on",
      danger: turningOff,
    });
    if (!ok) return;
    const out = await action.run(() => api("/api/admin/flags", { method: "PUT", body: { key: f.key, enabled: !f.enabled } }), `${f.label} is now ${f.enabled ? "off" : "on"}.`);
    if (out) state.reload();
  }

  return (
    <>
      <PageHead
        title="Feature flags"
        sub="Global kill switches. A flag only takes a feature away; it never grants one a licence doesn't include. Override a single organisation from its own page."
      />
      {notice.node}
      <Loadable state={state}>
        <Table caption="Feature flags" head={["Feature", "State", "Last changed", ""]}>
          {(state.data?.flags || []).map((f) => (
            <tr key={f.key}>
              <td>
                {f.label}
                <div className="adm-note">
                  <code>{f.key}</code>
                </div>
              </td>
              <td>
                <Pill value={f.enabled ? "on" : "off"} tone={f.enabled ? "is-good" : "is-bad"} />
              </td>
              <td>{f.updatedAt ? when(f.updatedAt) : "Never (on by default)"}</td>
              <td>
                {canManage ? (
                  <button type="button" className="btn btn-secondary" disabled={action.busy} onClick={() => toggle(f)}>
                    {f.enabled ? "Turn off" : "Turn on"}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
        {state.data ? <p className="adm-note">Other server instances pick up a change within {state.data.propagationSeconds} seconds.</p> : null}
      </Loadable>
    </>
  );
}
