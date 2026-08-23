"use client";

import { useState } from "react";

const FIT = {
  Hot: { bg: "var(--color-accent-100)", fg: "var(--color-accent-800)" },
  Warm: { bg: "var(--color-accent-2-100)", fg: "var(--color-accent-2-800)" },
  Cold: { bg: "var(--color-neutral-100)", fg: "var(--color-neutral-800)" },
};

/**
 * Three states, in order: no buyer profile, profile awaiting confirmation, and
 * running. The gate is the point — nothing spends a lead credit until the
 * customer has agreed with who MADBOT thinks buys from them.
 */
export default function Leads({
  leads = [],
  profile,
  onBuildProfile,
  onSaveProfile,
  onDiscover,
  onQualify,
  onDraftOutreach,
  onDecline,
  busy,
  buildingProfile,
  profileError,
  hasCrawl,
  aiReady,
  leadSearch,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("qualified");

  const confirmed = profile && !profile.needsConfirmation;
  const shortlisted = leads.filter((l) => l.stage === "shortlisted");
  const qualified = leads.filter((l) => l.stage === "qualified");

  const rows =
    view === "qualified" ? qualified : view === "shortlisted" ? shortlisted : leads;
  const selected = leads.find((l) => l.id === selectedId) || rows[0] || null;

  function beginEdit() {
    setDraft({
      sells: profile?.sells || "",
      buyerType: profile?.buyerType || "",
      sectors: (profile?.sectors || []).join(", "),
      geography: profile?.geography || "",
      triggers: (profile?.triggers || []).join("\n"),
      disqualifiers: (profile?.disqualifiers || []).join("\n"),
      searchQueries: (profile?.searchQueries || []).join("\n"),
    });
    setEditing(true);
  }

  function save() {
    onSaveProfile({
      ...profile,
      sells: draft.sells.trim(),
      buyerType: draft.buyerType.trim(),
      sectors: splitList(draft.sectors, ","),
      geography: draft.geography.trim(),
      triggers: splitList(draft.triggers, "\n"),
      disqualifiers: splitList(draft.disqualifiers, "\n"),
      searchQueries: splitList(draft.searchQueries, "\n"),
      needsConfirmation: false,
      confirmedAt: new Date().toISOString(),
    });
    setEditing(false);
  }

  // ---- gate 1: nothing to work from ----
  if (!hasCrawl) {
    return (
      <Shell title="Lead discovery" sub="Companies that look like they need what you sell.">
        <Notice title="Crawl the site first">
          The buyer profile is worked out from what your own site says you sell. Without a crawl there&apos;s nothing
          to infer it from.
        </Notice>
      </Shell>
    );
  }

  // ---- gate 2: no profile yet ----
  if (!profile) {
    return (
      <Shell title="Lead discovery" sub="Companies that look like they need what you sell.">
        <section className="card elev-sm" style={{ padding: 20, gap: 12, maxWidth: 620 }}>
          <h4 style={{ margin: 0 }}>Who buys from you?</h4>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }} className="text-muted">
            MADBOT will read your site and propose a buyer profile — what you sell, who to, and what makes a company
            worth approaching. You&apos;ll see it and correct it before anything is searched for, because everything
            after this depends on it being right.
          </p>
          {profileError ? (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--color-accent-800)" }}>{profileError}</p>
          ) : null}
          <button
            className="btn btn-primary"
            onClick={onBuildProfile}
            disabled={buildingProfile || !aiReady}
            style={{ width: "max-content" }}
          >
            {buildingProfile ? "Reading your site…" : "Work out my buyer profile"}
          </button>
          {!aiReady ? (
            <p style={{ margin: 0, fontSize: 12 }} className="text-muted">
              Needs a working AI key on the server.
            </p>
          ) : null}
        </section>
      </Shell>
    );
  }

  return (
    <Shell
      title="Lead discovery"
      sub={
        confirmed
          ? `Searching for ${profile.buyerType || "companies"}. Nothing is emailed without you pressing send.`
          : "Check this profile before anything is searched for."
      }
    >
      {/* ---- the profile, and the confirmation gate ---- */}
      <section
        className="card elev-sm"
        style={{
          padding: 18,
          gap: 11,
          borderLeft: confirmed ? "3px solid var(--color-accent-2-500)" : "3px solid var(--color-accent)",
          background: confirmed ? undefined : "var(--color-accent-100)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
          <h4 style={{ margin: 0 }}>Your buyer profile</h4>
          <span className={confirmed ? "tag tag-accent-2" : "tag tag-accent"} style={{ fontSize: 10 }}>
            {confirmed ? "confirmed" : "needs your check"}
          </span>
          {!editing ? (
            <button className="btn btn-ghost" onClick={beginEdit} style={{ marginLeft: "auto", fontSize: 12.5 }}>
              Edit
            </button>
          ) : null}
        </div>

        {!confirmed && !editing ? (
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: "var(--color-accent-900)" }}>
            MADBOT inferred this from your site. It&apos;s a guess — a website says what you sell, rarely who to. Get
            it wrong and every lead credit is spent on the wrong companies, so it&apos;s worth thirty seconds now.
          </p>
        ) : null}

        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="You sell" value={draft.sells} onChange={(v) => setDraft({ ...draft, sells: v })} />
            <Field label="To this kind of organisation" value={draft.buyerType} onChange={(v) => setDraft({ ...draft, buyerType: v })} />
            <Field label="Sectors (comma separated)" value={draft.sectors} onChange={(v) => setDraft({ ...draft, sectors: v })} />
            <Field label="Where their buyers are" value={draft.geography} onChange={(v) => setDraft({ ...draft, geography: v })} />
            <Field
              label="Signs a company needs this now (one per line)"
              value={draft.triggers}
              onChange={(v) => setDraft({ ...draft, triggers: v })}
              multiline
            />
            <Field
              label="Reasons a company is not a buyer (one per line)"
              value={draft.disqualifiers}
              onChange={(v) => setDraft({ ...draft, disqualifiers: v })}
              multiline
            />
            <Field
              label="Searches MADBOT will run to find them (one per line)"
              value={draft.searchQueries}
              onChange={(v) => setDraft({ ...draft, searchQueries: v })}
              multiline
            />
            <div style={{ display: "flex", gap: 9 }}>
              <button className="btn btn-primary" onClick={save}>Save and confirm</button>
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            <Row k="Sells" v={profile.sells} />
            <Row k="Buyer" v={profile.buyerType} />
            <Row k="Sectors" v={(profile.sectors || []).join(", ")} />
            <Row k="Geography" v={profile.geography || "anywhere"} />
            {(profile.triggers || []).length ? <Row k="Buying signals" v={profile.triggers.join(" · ")} /> : null}
            {(profile.searchQueries || []).length ? (
              <Row k="Will search for" v={profile.searchQueries.join(" · ")} />
            ) : null}
          </div>
        )}

        {!confirmed && !editing ? (
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={() => onSaveProfile({ ...profile, needsConfirmation: false, confirmedAt: new Date().toISOString() })}>
              That&apos;s right — start searching
            </button>
            <button className="btn btn-secondary" onClick={beginEdit}>Not quite, let me fix it</button>
          </div>
        ) : null}
      </section>

      {/* ---- running it ---- */}
      {confirmed ? (
        <section className="card elev-sm" style={{ padding: 18, gap: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <h4 style={{ margin: 0 }}>Find and qualify</h4>
            {leadSearch ? (
              <span className="text-muted" style={{ fontSize: 12, marginLeft: "auto" }}>
                last search found {leadSearch.discovered}, shortlisted {leadSearch.shortlisted}
              </span>
            ) : null}
          </div>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }} className="text-muted">
            Searching is cheap and wide. Qualifying reads each company&apos;s own pages and costs one lead credit per
            company, so it runs on the shortlist only — and only when you ask.
          </p>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={onDiscover} disabled={!!busy || !aiReady}>
              {busy === "discover" ? "Searching…" : "Search for companies"}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => onQualify(shortlisted)}
              disabled={!!busy || !shortlisted.length || !aiReady}
            >
              {busy === "qualify"
                ? "Reading their sites…"
                : shortlisted.length
                ? `Qualify ${shortlisted.length} shortlisted · ${shortlisted.length} lead credit${shortlisted.length === 1 ? "" : "s"}`
                : "Nothing shortlisted yet"}
            </button>
          </div>
          {leadSearch?.droppedReasons?.length ? (
            <details style={{ fontSize: 12 }}>
              <summary className="text-muted" style={{ cursor: "pointer" }}>
                Why {leadSearch.droppedReasons.length} were dropped before any paid analysis
              </summary>
              <ul style={{ margin: "7px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }} className="text-muted">
                {leadSearch.droppedReasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      {/* ---- the queue ---- */}
      {leads.length ? (
        <div className="split-2" style={{ "--l": "1.35fr", gap: 16, alignItems: "start" }}>
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="seg" role="group" aria-label="Filter">
              {[
                { k: "qualified", label: `Qualified ${qualified.length}` },
                { k: "shortlisted", label: `Shortlisted ${shortlisted.length}` },
                { k: "all", label: `All ${leads.length}` },
              ].map((o) => (
                <label key={o.k} className="seg-opt">
                  <input type="radio" name="leadview" checked={view === o.k} onChange={() => setView(o.k)} />
                  {o.label}
                </label>
              ))}
            </div>

            <div className="card elev-sm" style={{ padding: 0, overflow: "hidden" }}>
              {rows.length === 0 ? (
                <p style={{ margin: 0, padding: 18, fontSize: 13 }} className="text-muted">
                  Nothing here yet.
                </p>
              ) : (
                rows.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSelectedId(l.id)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "13px 16px",
                      borderTop: "1px solid var(--color-divider)",
                      background: selected?.id === l.id ? "var(--wash-2)" : "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>{l.co || l.domain}</span>
                      <span className="text-muted" style={{ fontSize: 11.5 }}>{l.domain}</span>
                    </span>
                    {l.score !== null && l.score !== undefined ? (
                      <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }} className="text-muted">
                        {l.score}
                      </span>
                    ) : null}
                    {l.fit ? (
                      <span className="tag" style={{ fontSize: 10, ...(FIT[l.fit] ? { background: FIT[l.fit].bg, color: FIT[l.fit].fg } : {}) }}>
                        {l.fit}
                      </span>
                    ) : (
                      <span className="tag tag-neutral" style={{ fontSize: 10 }}>not assessed</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </section>

          <aside style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {selected ? <Detail lead={selected} onDraftOutreach={onDraftOutreach} onDecline={onDecline} busy={busy} /> : null}
          </aside>
        </div>
      ) : null}
    </Shell>
  );
}

function Detail({ lead, onDraftOutreach, onDecline, busy }) {
  return (
    <section className="card elev-sm" style={{ padding: 18, gap: 10 }}>
      <div>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 19, lineHeight: 1.2 }}>{lead.co || lead.domain}</div>
        <a href={`https://${lead.domain}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5 }}>
          {lead.domain}
        </a>
      </div>

      {lead.stage === "shortlisted" ? (
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }} className="text-muted">
          Shortlisted from a homepage read. Not assessed yet — qualifying reads their whole site and costs a lead
          credit.
        </p>
      ) : null}

      {lead.problemYouSolve ? (
        <div>
          <div className="card-kicker">The problem they appear to have</div>
          <p style={{ margin: "3px 0 0", fontSize: 13, lineHeight: 1.55 }}>{lead.problemYouSolve}</p>
        </div>
      ) : null}

      {lead.why ? (
        <div>
          <div className="card-kicker">Why</div>
          <p style={{ margin: "3px 0 0", fontSize: 12.5, lineHeight: 1.55 }} className="text-muted">
            {lead.why}
          </p>
        </div>
      ) : null}

      {(lead.intentSignals || []).length ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {lead.intentSignals.map((s) => (
            <span key={s} className="tag tag-neutral" style={{ fontSize: 10.5 }}>{s}</span>
          ))}
        </div>
      ) : null}

      {lead.pagesRead ? (
        <span className="text-muted" style={{ fontSize: 11.5 }}>
          Read {lead.pagesRead} of their pages.
        </span>
      ) : null}

      {/* Contact provenance is shown, not hidden. Under GDPR a customer may be
          asked where an address came from and has to be able to answer. */}
      {lead.contactEmail ? (
        <div style={{ padding: "10px 12px", borderRadius: 9, background: "var(--wash-1)", display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 13 }}>{lead.contactEmail}</span>
          <span className="text-muted" style={{ fontSize: 11.5 }}>
            {lead.contactIsGeneric ? "A company inbox, not a named person. " : ""}
            {lead.contactProvenance}
          </span>
        </div>
      ) : lead.stage === "qualified" ? (
        <p style={{ margin: 0, fontSize: 12 }} className="text-muted">
          No published address on their site. MADBOT doesn&apos;t guess addresses or buy them from a broker.
        </p>
      ) : null}

      {lead.openingLine ? (
        <div>
          <div className="card-kicker">Opening line</div>
          <p style={{ margin: "3px 0 0", fontSize: 13, lineHeight: 1.55, fontStyle: "italic" }}>
            &ldquo;{lead.openingLine}&rdquo;
          </p>
        </div>
      ) : null}

      {lead.stage === "qualified" && lead.contactEmail ? (
        <>
          <button
            className="btn btn-primary btn-block"
            onClick={() => onDraftOutreach(lead)}
            disabled={busy === "outreach" || lead.status === "drafted"}
          >
            {lead.status === "drafted" ? "Draft is in Approvals" : busy === "outreach" ? "Writing…" : "Draft an email for approval"}
          </button>
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }} className="text-muted">
            MADBOT never sends outreach itself, at any autonomy level. The draft goes to Approvals and you press send.
          </p>
        </>
      ) : null}

      <button className="btn btn-ghost" onClick={() => onDecline(lead.id)} style={{ alignSelf: "center", fontSize: 12.5 }}>
        {lead.status === "declined" ? "Declined" : "Not for us"}
      </button>
    </section>
  );
}

function Shell({ title, sub, children }) {
  return (
    <section data-screen-label="Leads" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2 style={{ margin: "0 0 3px" }}>{title}</h2>
        <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>{sub}</p>
      </div>
      {children}
    </section>
  );
}

function Notice({ title, children }) {
  return (
    <div className="card" style={{ padding: "13px 16px", gap: 4, border: "1px dashed var(--color-accent-400)", background: "var(--color-accent-100)", maxWidth: 620 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-accent-800)" }}>{title}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--color-accent-900)" }}>{children}</div>
    </div>
  );
}

function Row({ k, v }) {
  if (!v) return null;
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <span className="text-muted" style={{ minWidth: 108, flex: "none", fontSize: 12.5 }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function Field({ label, value, onChange, multiline }) {
  return (
    <label className="field" style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, marginBottom: 4 }} className="text-muted">{label}</span>
      {multiline ? (
        <textarea className="input" rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

function splitList(s, sep) {
  return String(s || "")
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);
}
