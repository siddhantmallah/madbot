import { useMemo, useState } from "react";
import { DIRECTORIES, LISTING_STATUS, listingStatusStyle, priorityOf, relevantFor, validateListing } from "../../../lib/listings";

const STATUS_CHOICES = [
  { id: LISTING_STATUS.NOT_STARTED, label: "Not started" },
  { id: LISTING_STATUS.SUBMITTED, label: "Submitted" },
  { id: LISTING_STATUS.LIVE, label: "Live" },
  { id: LISTING_STATUS.REJECTED, label: "Rejected" },
  { id: LISTING_STATUS.SKIPPED, label: "Skipped" },
];

/** One field of listing copy, with the directory's own limit shown against it. */
function CopyField({ directory, field, value, onChange }) {
  const spec = directory.fields[field];
  const isList = Array.isArray(value);
  const length = isList ? value.length : String(value || "").length;
  const over = length > spec.max;

  return (
    <div className="field">
      <label style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>{spec.label}</span>
        <span className="text-muted" style={{ fontSize: 11.5, color: over ? "var(--color-accent-900)" : undefined }}>
          {length} / {spec.max}
          {isList ? " items" : ""}
        </span>
      </label>
      {isList ? (
        <input
          className="input"
          value={value.join(", ")}
          onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
          style={{ fontSize: 13 }}
        />
      ) : String(value || "").length > 120 || spec.max > 200 ? (
        <textarea
          className="input"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%", minHeight: 90, fontSize: 13, lineHeight: 1.6 }}
        />
      ) : (
        <input className="input" value={value || ""} onChange={(e) => onChange(e.target.value)} style={{ fontSize: 13 }} />
      )}
    </div>
  );
}

function DirectoryCard({ directory, listing, onWrite, onSave, onStatus, writing, aiConfigured }) {
  const [open, setOpen] = useState(false);
  const [copy, setCopy] = useState(listing?.copy || null);

  const current = copy || listing?.copy || null;
  const status = listing?.status || LISTING_STATUS.NOT_STARTED;
  const style = listingStatusStyle(current && status === LISTING_STATUS.NOT_STARTED ? LISTING_STATUS.DRAFTED : status);
  const problems = useMemo(() => (current ? validateListing(directory.id, current) : []), [current, directory.id]);

  return (
    <div className="card elev-sm" style={{ padding: 17, gap: 10, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 14 }}>{directory.name}</strong>
        <span className="tag" style={{ fontSize: 10.5, background: style.bg, color: style.fg }}>
          {style.label}
        </span>
        {directory.dofollow ? <span className="tag tag-outline" style={{ fontSize: 10 }}>Followed link</span> : null}
        {directory.needsReviews ? <span className="tag tag-outline" style={{ fontSize: 10 }}>Ranks on reviews</span> : null}
        {directory.oneShot ? <span className="tag tag-outline" style={{ fontSize: 10 }}>One shot</span> : null}

        <div style={{ marginLeft: "auto", display: "flex", gap: 7 }}>
          <a href={directory.submitUrl} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ fontSize: 12.5 }}>
            Open form
          </a>
          <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : current ? "Show copy" : "Details"}
          </button>
        </div>
      </div>

      <p className="text-muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
        {directory.note}
      </p>

      {directory.syndicatesTo?.length ? (
        <p className="text-muted" style={{ margin: 0, fontSize: 12 }}>
          Also appears on {directory.syndicatesTo.join(" and ")}.
        </p>
      ) : null}

      {open ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 11, paddingTop: 4 }}>
          <div style={{ background: "var(--color-bg)", borderRadius: 14, padding: 11, fontSize: 12.5 }}>
            <div className="card-kicker" style={{ marginBottom: 4 }}>What the form needs</div>
            <ul style={{ margin: 0, paddingLeft: 17 }} className="text-muted">
              {Object.entries(directory.fields).map(([f, spec]) => (
                <li key={f}>
                  {spec.label} — up to {spec.max}
                  {spec.required ? "" : ", optional"}
                </li>
              ))}
              {directory.assets.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>

          {current ? (
            <>
              {Object.keys(directory.fields).map((field) => (
                <CopyField
                  key={field}
                  directory={directory}
                  field={field}
                  value={current[field]}
                  onChange={(v) => setCopy({ ...current, [field]: v })}
                />
              ))}

              {problems.length ? (
                <ul style={{ margin: 0, paddingLeft: 17, fontSize: 12.5, lineHeight: 1.6, color: "var(--color-accent-900)" }}>
                  {problems.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              ) : null}

              {listing?.claims?.length ? (
                <div style={{ background: "var(--color-bg)", borderRadius: 14, padding: 11, fontSize: 12.5 }}>
                  <div className="card-kicker" style={{ marginBottom: 3 }}>Claims this copy makes</div>
                  <ul style={{ margin: 0, paddingLeft: 17 }} className="text-muted">
                    {listing.claims.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12.5 }}
              disabled={writing || !aiConfigured}
              onClick={() => onWrite(directory.id)}
              title={aiConfigured ? undefined : "No Anthropic API key on the server."}
            >
              {writing ? "Writing…" : current ? "Rewrite" : "Write the copy"}
            </button>
            {current ? (
              <button className="btn btn-primary" style={{ fontSize: 12.5 }} onClick={() => onSave(directory.id, { copy: current })}>
                Save
              </button>
            ) : null}

            <select
              className="input"
              value={status}
              onChange={(e) => onStatus(directory.id, e.target.value)}
              style={{ fontSize: 12.5, marginLeft: "auto", width: "auto" }}
              aria-label={`${directory.name} status`}
            >
              {STATUS_CHOICES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function Listings({ listings = [], site, aiConfigured, aiMessage = null, onWrite, onSave, onStatus, writingId }) {
  // What the crawl already worked out about the business decides which
  // directories are worth showing. Offering an AI-tools directory to a plumber
  // wastes their afternoon and costs them standing with that directory when the
  // submission is rejected.
  const [showAll, setShowAll] = useState(false);

  const relevant = useMemo(() => {
    const intel = site?.intelligence || {};
    const text = `${intel.business?.name || ""} ${intel.business?.summary || site?.description || ""}`.toLowerCase();
    return relevantFor({
      isAI: /\b(ai|llm|machine learning|gpt|model)\b/.test(text),
      isAgency: /\b(agency|consultanc|studio|freelance)\b/.test(text),
      isEarlyStage: !site?.launchedBefore,
    }).sort((a, b) => priorityOf(a) - priorityOf(b));
  }, [site]);

  const shown = showAll ? Object.values(DIRECTORIES) : relevant;
  const byId = Object.fromEntries(listings.map((l) => [l.id, l]));

  const live = listings.filter((l) => l.status === LISTING_STATUS.LIVE).length;
  const submitted = listings.filter((l) => l.status === LISTING_STATUS.SUBMITTED).length;

  return (
    <section data-screen-label="Listings" style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 900 }}>
      <div>
        <h2 style={{ margin: "0 0 3px" }}>Directory listings</h2>
        <p className="text-muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
          MADBOT writes each listing to that directory&apos;s exact form and tracks where you&apos;ve got to. It does not submit
          them — almost none of these have an API, and a queue of submissions that silently never happened would be worse
          than no queue at all.
        </p>
      </div>

      {!aiConfigured ? (
        <p className="text-muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
          Writing the copy is off. {aiMessage || "The server can't reach a model right now."} The checklist, the field
          rules and the submission tracking all still work — you can write the copy yourself and record it here.
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
        <span className="tag tag-neutral" style={{ fontSize: 11.5 }}>{live} live</span>
        <span className="tag tag-neutral" style={{ fontSize: 11.5 }}>{submitted} submitted</span>
        <span className="tag tag-neutral" style={{ fontSize: 11.5 }}>{shown.length} worth doing</span>
        <button className="btn btn-ghost" style={{ fontSize: 12.5, marginLeft: "auto" }} onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Only the relevant ones" : "Show every directory"}
        </button>
      </div>

      {shown.map((d) => (
        <DirectoryCard
          key={d.id}
          directory={d}
          listing={byId[d.id] || null}
          onWrite={onWrite}
          onSave={onSave}
          onStatus={onStatus}
          writing={writingId === d.id}
          aiConfigured={aiConfigured}
        />
      ))}
    </section>
  );
}
