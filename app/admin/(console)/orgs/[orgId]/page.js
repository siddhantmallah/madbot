"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAdmin } from "../../../_components/AdminShell";
import { InviteButton, RoleSelect } from "../../../_components/forms";
import { Empty, Loadable, Meter, PageHead, Pill, Table, api, day, useAction, useAdminData, useConfirm, useNotice, when } from "../../../_components/ui";

const METER_LABELS = { credits: "Autonomous actions", leadCredits: "Lead credits", contentPieces: "Content pieces", socialPosts: "Social posts" };
const LIMIT_LABELS = {
  credits: "Autonomous actions / month",
  leadCredits: "Lead credits / month",
  contentPieces: "Content pieces / month",
  socialPosts: "Social posts / month",
  maxSites: "Sites",
  seats: "Seats",
  maxAutonomy: "Autonomy ceiling (0–100)",
};

const toDateInput = (iso) => (iso ? iso.slice(0, 10) : "");

export default function AdminOrg() {
  const { orgId } = useParams();
  const admin = useAdmin();
  const state = useAdminData(`/api/admin/orgs/${encodeURIComponent(orgId)}`);
  const confirm = useConfirm();
  const notice = useNotice();
  const action = useAction(notice);
  const d = state.data;
  const canWrite = admin.can("platform.orgs.write");
  const canLicence = canWrite && admin.can("platform.licenses.manage");
  const canFlags = canWrite && admin.can("platform.flags.manage");

  async function act(body, done) {
    const out = await action.run(() => api(`/api/admin/orgs/${encodeURIComponent(orgId)}`, { method: "POST", body }), done);
    if (out) state.reload();
    return out;
  }

  async function suspend() {
    const ok = await confirm({
      title: `Suspend ${d.org.name}?`,
      message: "Its members can still see it but nothing in it can change, no paid work runs, and the scheduler skips it until it's reinstated.",
      confirmLabel: "Suspend",
      danger: true,
      reason: true,
    });
    if (ok) act({ action: "suspend", reason: ok.note || undefined }, "Suspended.");
  }

  async function transfer(member) {
    const ok = await confirm({
      title: `Make ${member.email || member.uid} the owner?`,
      message: "The current owner becomes an admin of the organisation. Only an existing member can be given ownership.",
      confirmLabel: "Transfer ownership",
      typeToConfirm: d.org.name,
    });
    if (ok) act({ action: "transfer_ownership", toUid: member.uid }, "Ownership transferred.");
  }

  async function remove(member) {
    const ok = await confirm({ title: `Remove ${member.email || member.uid}?`, message: "They lose access at once and their seat is freed.", confirmLabel: "Remove", danger: true });
    if (ok) act({ action: "remove_member", uid: member.uid }, "Removed.");
  }

  async function withdraw(invite) {
    const ok = await confirm({ title: `Withdraw the invitation to ${invite.email}?`, message: "The link stops working and the seat it held is freed.", confirmLabel: "Withdraw", danger: true });
    if (ok) act({ action: "withdraw_invite", inviteId: invite.id }, "Invitation withdrawn.");
  }

  return (
    <>
      <PageHead title={d?.org?.name || "Organisation"} sub={d ? `Organisation ${d.org.id}${d.org.personal ? " · a personal workspace" : ""}` : null}>
        <Link href="/admin/orgs" className="btn btn-secondary">
          All organisations
        </Link>
      </PageHead>
      {notice.node}
      <Loadable state={state}>
        {d ? (
          <>
            <div className="adm-grid-2">
              <section className="adm-card" aria-labelledby="standing-h">
                <h2 id="standing-h">Standing</h2>
                <dl className="adm-dl">
                  <dt>Status</dt>
                  <dd>
                    <Pill value={d.org.status} />
                  </dd>
                  <dt>Owner</dt>
                  <dd>
                    <Link href={`/admin/users/${d.org.ownerUid}`}>{d.members.find((m) => m.uid === d.org.ownerUid)?.email || d.org.ownerUid}</Link>
                  </dd>
                  <dt>Members</dt>
                  <dd>
                    {d.org.memberCount} (seats in use, invitations included: {d.seatsUsed} of {d.effectivePlan.seats})
                  </dd>
                  <dt>Created</dt>
                  <dd>{when(d.org.createdAt)}</dd>
                </dl>
                {canWrite ? (
                  <div className="adm-actions">
                    <RenameForm key={d.org.name} name={d.org.name} busy={action.busy} onRename={(name) => act({ action: "rename", name }, "Renamed.")} />
                    {d.org.status === "active" ? (
                      <button type="button" className="btn btn-secondary" onClick={suspend} disabled={action.busy}>
                        Suspend
                      </button>
                    ) : (
                      <button type="button" className="btn btn-secondary" onClick={() => act({ action: "reactivate" }, "Reinstated.")} disabled={action.busy}>
                        Reinstate
                      </button>
                    )}
                  </div>
                ) : null}
              </section>

              <section className="adm-card" aria-labelledby="usage-h">
                <h2 id="usage-h">Usage this month ({d.usage.month})</h2>
                {d.usage.rows.every((r) => r.allowance === 0) ? (
                  <Empty title={`${d.effectivePlan.name} has no metered allowances.`} />
                ) : (
                  d.usage.rows
                    .filter((r) => r.allowance > 0)
                    .map((r) => (
                      <div key={r.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                          <span>{METER_LABELS[r.key]}</span>
                          <span className="adm-num">
                            {r.used.toLocaleString()} / {r.allowance.toLocaleString()}
                          </span>
                        </div>
                        <Meter used={r.used} allowance={r.allowance} />
                      </div>
                    ))
                )}
                <p className="adm-note">Recorded model cost this month: ${d.usage.costUsd}</p>
              </section>
            </div>

            <LicencePanel key={d.licence ? `${d.licence.updatedAt}:${d.licence.status}:${d.licence.plan}` : "none"} d={d} canEdit={canLicence} busy={action.busy} act={act} confirm={confirm} />

            <section className="adm-card" aria-labelledby="members-h">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h2 id="members-h">Members</h2>
                {admin.can("platform.users.write") ? <InviteButton orgId={d.org.id} onDone={state.reload} /> : null}
              </div>
              <Table caption="Members" head={["Member", "Role", "Joined", ""]}>
                {d.members.map((m) => (
                  <tr key={m.uid}>
                    <td>
                      <Link href={`/admin/users/${m.uid}`}>{m.email || m.uid}</Link>
                      {m.displayName ? <div className="adm-note">{m.displayName}</div> : null}
                    </td>
                    <td>
                      {canWrite && m.uid !== d.org.ownerUid ? (
                        <RoleSelect scope="org" excludeOwner value={m.roleId} onChange={(roleId) => act({ action: "set_member_role", uid: m.uid, roleId }, "Role changed.")} />
                      ) : (
                        <Pill value={m.uid === d.org.ownerUid ? "owner" : m.roleId.replace("org_", "")} tone="is-good" />
                      )}
                    </td>
                    <td>{day(m.joinedAt)}</td>
                    <td>
                      {canWrite && m.uid !== d.org.ownerUid ? (
                        <div className="adm-actions">
                          <button type="button" className="btn btn-ghost" onClick={() => transfer(m)}>
                            Make owner
                          </button>
                          <button type="button" className="btn btn-ghost" onClick={() => remove(m)}>
                            Remove
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </Table>
              {d.invites.length ? (
                <>
                  <h3 style={{ margin: "6px 0 0", fontSize: 14.5 }}>Pending invitations</h3>
                  <Table caption="Pending invitations" head={["Email", "Role", "Sent", "Expires", ""]}>
                    {d.invites.map((i) => (
                      <tr key={i.id}>
                        <td>{i.email}</td>
                        <td>{i.roleId.replace("org_", "")}</td>
                        <td>{day(i.createdAt)}</td>
                        <td>{day(i.expiresAt)}</td>
                        <td>
                          {canWrite ? (
                            <button type="button" className="btn btn-ghost" onClick={() => withdraw(i)}>
                              Withdraw
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </Table>
                </>
              ) : null}
            </section>

            <FlagsPanel d={d} canEdit={canFlags} act={act} />

            <div className="adm-grid-2">
              <section className="adm-card" aria-labelledby="sites-h">
                <h2 id="sites-h">Sites</h2>
                {d.sites.length === 0 ? (
                  <Empty title="No sites yet." />
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                    {d.sites.map((s) => (
                      <li key={s.id}>
                        {s.url} <span className="adm-note">added {day(s.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="adm-card" aria-labelledby="history-h">
                <h2 id="history-h">Licence history</h2>
                {d.history.length === 0 ? (
                  <Empty title="No licence changes recorded." />
                ) : (
                  <Table caption="Licence history" head={["When", "Change", "Plan", "Note"]}>
                    {d.history.map((h) => (
                      <tr key={h.id}>
                        <td style={{ whiteSpace: "nowrap" }}>{when(h.at)}</td>
                        <td>{h.action}</td>
                        <td>{h.before && h.before !== h.after ? `${h.before} → ${h.after || "—"}` : h.after || "—"}</td>
                        <td>{h.note || "—"}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </section>
            </div>
          </>
        ) : null}
      </Loadable>
    </>
  );
}

function RenameForm({ name, busy, onRename }) {
  // Keyed on the name by its parent, so a rename starts it afresh.
  const [value, setValue] = useState(name);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() && value.trim() !== name) onRename(value.trim());
      }}
      style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
    >
      <label className="sr-only" htmlFor="org-name">
        Organisation name
      </label>
      <input id="org-name" className="input" value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} style={{ minHeight: 38, width: "auto" }} />
      <button className="btn btn-secondary" type="submit" disabled={busy || !value.trim() || value.trim() === name}>
        Rename
      </button>
    </form>
  );
}

/** The licence: what's on it, what it resolves to, and changing it. */
function LicencePanel({ d, canEdit, busy, act, confirm }) {
  const plans = useAdminData(canEdit ? "/api/admin/plans" : null);
  const lic = d.licence;
  // Keyed on the licence by its parent, so a saved change starts it afresh.
  const [form, setForm] = useState(() => {
    const o = lic?.overrides || {};
    return {
      plan: lic?.plan && lic.plan !== "lapsed" ? lic.plan : "growth",
      startsAt: toDateInput(lic?.startsAt || lic?.currentPeriodStart) || new Date().toISOString().slice(0, 10),
      endsAt: toDateInput(lic?.currentPeriodEnd) || new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
      overrides: Object.fromEntries(Object.keys(LIMIT_LABELS).map((k) => [k, o[k] ?? ""])),
      featuresAdd: o.featuresAdd || [],
      featuresRemove: o.featuresRemove || [],
      note: "",
    };
  });

  function overridesPayload() {
    const out = {};
    for (const [k, v] of Object.entries(form.overrides)) if (v !== "" && v !== null) out[k] = Number(v);
    if (form.featuresAdd.length) out.featuresAdd = form.featuresAdd;
    if (form.featuresRemove.length) out.featuresRemove = form.featuresRemove;
    return Object.keys(out).length ? out : null;
  }

  async function save(e) {
    e.preventDefault();
    const payload = { plan: form.plan, startsAt: form.startsAt, endsAt: form.endsAt, overrides: overridesPayload(), note: form.note || undefined };
    if (!lic?.plan || ["revoked", "expired", "refunded"].includes(lic.status)) {
      await act({ action: "license_issue", ...payload }, "Licence issued.");
    } else {
      await act({ action: "license_update", ...payload }, "Licence updated.");
    }
  }

  async function revoke() {
    const ok = await confirm({
      title: "Revoke this licence?",
      message: "It ends now: the organisation drops to no plan at once and paid work stops. It can be issued again later.",
      confirmLabel: "Revoke",
      danger: true,
      reason: true,
    });
    if (ok) act({ action: "license_revoke", reason: ok.note || undefined }, "Licence revoked.");
  }

  const ep = d.effectivePlan;
  const allFeatures = plans.data ? Object.keys(plans.data.featureLabels) : [];
  const label = (f) => plans.data?.featureLabels?.[f] || f;

  return (
    <section className="adm-card" aria-labelledby="licence-h">
      <h2 id="licence-h">Licence</h2>
      <div className="adm-grid-2">
        <dl className="adm-dl">
          <dt>Plan on the licence</dt>
          <dd>{lic?.plan ? <>{lic.plan} <Pill value={lic.status} /></> : "None (free tier)"}</dd>
          <dt>Starts</dt>
          <dd>{day(lic?.startsAt || lic?.currentPeriodStart)}</dd>
          <dt>Ends</dt>
          <dd>{day(lic?.currentPeriodEnd)}</dd>
          <dt>Granted by</dt>
          <dd>{lic?.provider === "manual" ? "Hand (console)" : lic?.provider || "—"}</dd>
        </dl>
        <dl className="adm-dl">
          <dt>In force now</dt>
          <dd>
            {ep.name}
            {ep.overridden ? " (with overrides)" : ""}
          </dd>
          <dt>Seats / sites</dt>
          <dd>
            {ep.seats} / {ep.maxSites}
          </dd>
          <dt>Monthly</dt>
          <dd>
            {ep.credits.toLocaleString()} actions, {ep.contentPieces} pieces, {ep.socialPosts} posts, {ep.leadCredits} lead credits
          </dd>
        </dl>
      </div>

      {canEdit && form ? (
        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--color-divider)", paddingTop: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14.5 }}>{!lic?.plan || ["revoked", "expired", "refunded"].includes(lic?.status) ? "Issue a licence" : "Change the licence"}</h3>
          <div className="adm-form">
            <label>
              Plan
              <select className="input" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                {(plans.data?.plans || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Starts
              <input className="input" type="date" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            </label>
            <label>
              Ends
              <input className="input" type="date" required value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
            </label>
          </div>
          <details>
            <summary style={{ cursor: "pointer", fontSize: 13.5 }}>Overrides for this organisation (blank keeps the plan&apos;s value)</summary>
            <div className="adm-form" style={{ marginTop: 10 }}>
              {Object.entries(LIMIT_LABELS).map(([k, lbl]) => (
                <label key={k}>
                  {lbl}
                  <input
                    className="input"
                    type="number"
                    min={k === "seats" ? 1 : 0}
                    max={k === "maxAutonomy" ? 100 : undefined}
                    value={form.overrides[k]}
                    placeholder={String(plans.data?.plans?.find((p) => p.id === form.plan)?.[k] ?? "")}
                    onChange={(e) => setForm({ ...form, overrides: { ...form.overrides, [k]: e.target.value } })}
                  />
                </label>
              ))}
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: "12px 0 0" }}>
              <legend style={{ fontSize: 13 }}>Features beyond the plan</legend>
              <div className="adm-actions">
                {allFeatures.map((f) => (
                  <label key={f} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={form.featuresAdd.includes(f)}
                      onChange={(e) => setForm({ ...form, featuresAdd: e.target.checked ? [...form.featuresAdd, f] : form.featuresAdd.filter((x) => x !== f) })}
                    />
                    {label(f)}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset style={{ border: 0, padding: 0, margin: "12px 0 0" }}>
              <legend style={{ fontSize: 13 }}>Features taken away</legend>
              <div className="adm-actions">
                {allFeatures.map((f) => (
                  <label key={f} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={form.featuresRemove.includes(f)}
                      onChange={(e) => setForm({ ...form, featuresRemove: e.target.checked ? [...form.featuresRemove, f] : form.featuresRemove.filter((x) => x !== f) })}
                    />
                    {label(f)}
                  </label>
                ))}
              </div>
            </fieldset>
          </details>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 13 }}>
            Note (kept in the licence history and audit log)
            <input className="input" maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
          <div className="adm-actions">
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ color: "var(--on-accent)" }}>
              {busy ? "Saving…" : !lic?.plan || ["revoked", "expired", "refunded"].includes(lic?.status) ? "Issue licence" : "Save changes"}
            </button>
            {lic?.plan && !["revoked", "expired"].includes(lic.status) ? (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={revoke}>
                Revoke
              </button>
            ) : null}
          </div>
          <p className="adm-note">Enforced in the product, not just shown: allowances, seats, sites and features are all read from the licence on every request.</p>
        </form>
      ) : null}
    </section>
  );
}

/** Per-organisation switches over the global flags: on, off, or follow the global setting. */
function FlagsPanel({ d, canEdit, act }) {
  const global = useAdminData("/api/admin/flags");
  const flags = global.data?.flags || [];
  return (
    <section className="adm-card" aria-labelledby="flags-h">
      <h2 id="flags-h">Feature flags for this organisation</h2>
      <p className="adm-note">
        An override wins over the global switch. A flag only ever takes a feature away; it never grants one the licence doesn&apos;t include.
      </p>
      <Loadable state={global}>
        <Table caption="Feature flags for this organisation" head={["Feature", "Global", "Here"]}>
          {flags.map((f) => {
            const here = d.org.flags?.[f.key];
            const value = typeof here === "boolean" ? (here ? "on" : "off") : "inherit";
            return (
              <tr key={f.key}>
                <td>{f.label}</td>
                <td>
                  <Pill value={f.enabled ? "on" : "off"} tone={f.enabled ? "is-good" : "is-bad"} />
                </td>
                <td>
                  {canEdit ? (
                    <>
                      <label className="sr-only" htmlFor={`flag-${f.key}`}>
                        {f.label} for this organisation
                      </label>
                      <select
                        id={`flag-${f.key}`}
                        className="input"
                        value={value}
                        onChange={(e) => act({ action: "set_flags", flags: { [f.key]: e.target.value === "inherit" ? null : e.target.value === "on" } }, "Flag updated.")}
                        style={{ width: "auto", minHeight: 34 }}
                      >
                        <option value="inherit">Follow global</option>
                        <option value="on">On</option>
                        <option value="off">Off</option>
                      </select>
                    </>
                  ) : (
                    value
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      </Loadable>
    </section>
  );
}
