"use client";

import { useState } from "react";
import { useAdmin } from "../../_components/AdminShell";
import { Loadable, PageHead, api, useAction, useAdminData, useConfirm, useNotice } from "../../_components/ui";

const TEMPLATES = [
  { key: "welcome", label: "Welcome email", help: "Sent once, when a trial starts." },
  { key: "verify", label: "Email confirmation", help: "Sent when someone asks to confirm their address." },
];

export default function AdminSettings() {
  const state = useAdminData("/api/admin/settings");
  const notice = useNotice();
  return (
    <>
      <PageHead
        title="Settings"
        sub="Platform-wide switches and email wording. Company name, address and legal details aren't here: they live in lib/company.js, which the legal pages render from."
      />
      {notice.node}
      <Loadable state={state}>
        {state.data ? (
          // Keyed on what was loaded, so a saved change starts the form afresh.
          <SettingsForm key={JSON.stringify(state.data.settings)} saved={state.data.settings} propagationSeconds={state.data.propagationSeconds} notice={notice} reload={state.reload} />
        ) : null}
      </Loadable>
    </>
  );
}

function SettingsForm({ saved, propagationSeconds, notice, reload }) {
  const admin = useAdmin();
  const confirm = useConfirm();
  const action = useAction(notice);
  const [form, setForm] = useState(() => structuredClone(saved));
  const canManage = admin.can("platform.settings.manage");

  async function put(body, done) {
    const out = await action.run(() => api("/api/admin/settings", { method: "PUT", body }), done);
    if (out) reload();
  }

  async function toggleMaintenance() {
    const on = !form.maintenance.on;
    const ok = await confirm({
      title: on ? "Put MADBOT into maintenance?" : "End maintenance?",
      message: on
        ? "The dashboard shows the maintenance page and the product API refuses paid work until you end it. The public site and this console keep working."
        : "The site and the API open again for everyone.",
      confirmLabel: on ? "Start maintenance" : "End maintenance",
      danger: on,
    });
    if (ok) put({ maintenance: { on, message: form.maintenance.message } }, on ? "Maintenance is on." : "Maintenance is off.");
  }

  async function toggleSignup() {
    const open = !form.signupOpen;
    const ok = await confirm({
      title: open ? "Open sign-ups?" : "Close sign-ups?",
      message: open ? "New accounts can start a workspace again." : "Existing accounts carry on as normal. New accounts can't start a workspace or a trial until you open them again.",
      confirmLabel: open ? "Open sign-ups" : "Close sign-ups",
      danger: !open,
    });
    if (ok) put({ signupOpen: open }, open ? "Sign-ups are open." : "Sign-ups are closed.");
  }

  return (
    <>
      <div className="adm-grid-2">
        <section className="adm-card" aria-labelledby="signup-h">
          <h2 id="signup-h">Sign-ups</h2>
          <p style={{ margin: 0 }}>
            New accounts are <b>{form.signupOpen ? "welcome" : "turned away"}</b>.
          </p>
          {canManage ? (
            <div className="adm-actions">
              <button type="button" className="btn btn-secondary" disabled={action.busy} onClick={toggleSignup}>
                {form.signupOpen ? "Close sign-ups" : "Open sign-ups"}
              </button>
            </div>
          ) : null}
        </section>

        <section className="adm-card" aria-labelledby="maint-h">
          <h2 id="maint-h">Maintenance mode</h2>
          <p style={{ margin: 0 }}>
            The site is <b>{form.maintenance.on ? "in maintenance" : "open"}</b>.
          </p>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 13 }}>
            Message shown on the maintenance page
            <textarea
              className="input"
              rows={2}
              maxLength={500}
              disabled={!canManage}
              value={form.maintenance.message}
              onChange={(e) => setForm({ ...form, maintenance: { ...form.maintenance, message: e.target.value } })}
            />
          </label>
          {canManage ? (
            <div className="adm-actions">
              <button type="button" className="btn btn-secondary" disabled={action.busy} onClick={toggleMaintenance}>
                {form.maintenance.on ? "End maintenance" : "Start maintenance"}
              </button>
              {form.maintenance.on ? (
                <button type="button" className="btn btn-ghost" disabled={action.busy} onClick={() => put({ maintenance: form.maintenance }, "Message updated.")}>
                  Save message
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <form
        className="adm-card"
        aria-labelledby="tpl-h"
        onSubmit={(e) => {
          e.preventDefault();
          put({ emailTemplates: form.emailTemplates }, "Email wording saved.");
        }}
      >
        <h2 id="tpl-h">Email wording</h2>
        <p className="adm-note">Leave a field blank to use the built-in wording. The rest of each email (links, the legal footer) is fixed.</p>
        {TEMPLATES.map((t) => (
          <fieldset key={t.key} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <legend style={{ fontWeight: 600, fontSize: 14 }}>{t.label}</legend>
            <span className="adm-note">{t.help}</span>
            <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 13 }}>
              Subject
              <input
                className="input"
                maxLength={150}
                disabled={!canManage}
                value={form.emailTemplates[t.key].subject}
                onChange={(e) => setForm({ ...form, emailTemplates: { ...form.emailTemplates, [t.key]: { ...form.emailTemplates[t.key], subject: e.target.value } } })}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 13 }}>
              Opening paragraph
              <textarea
                className="input"
                rows={3}
                maxLength={1000}
                disabled={!canManage}
                value={form.emailTemplates[t.key].intro}
                onChange={(e) => setForm({ ...form, emailTemplates: { ...form.emailTemplates, [t.key]: { ...form.emailTemplates[t.key], intro: e.target.value } } })}
              />
            </label>
          </fieldset>
        ))}
        {canManage ? (
          <div className="adm-actions">
            <button className="btn btn-primary" type="submit" disabled={action.busy} style={{ color: "var(--on-accent)" }}>
              {action.busy ? "Saving…" : "Save wording"}
            </button>
          </div>
        ) : null}
      </form>
      <p className="adm-note">Other server instances pick up a change within {propagationSeconds} seconds.</p>
    </>
  );
}
