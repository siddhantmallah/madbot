import { UNMEASURED_ENGINES } from "../../../lib/aiVisibilityClient";

function Bar({ pct, color }) {
  return (
    <span style={{ flex: 1, height: 9, borderRadius: 999, background: "var(--color-neutral-200)", overflow: "hidden" }}>
      <span style={{ display: "block", height: 9, borderRadius: 999, background: color, width: `${Math.max(pct, 1.5)}%`, transformOrigin: "left", animation: "grow .9s cubic-bezier(.2,.8,.2,1)" }} />
    </span>
  );
}

export default function Visibility({
  domain,
  visibility,
  plan,
  planning,
  planError,
  onPlan,
  onRunCheck,
  running,
  writingEnabled,
  hasCrawl,
  autoOn,
  onToggleAuto,
}) {
  const v = visibility;
  const pct = v ? Math.round(v.mentionRate * 100) : null;
  const color = pct === null ? "var(--color-neutral-400)" : pct >= 50 ? "#7ED957" : pct > 0 ? "var(--color-accent)" : "var(--color-accent-400)";
  const usable = writingEnabled && hasCrawl;
  const questions = plan?.questions || [];

  return (
    <section data-screen-label="AI visibility" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 3px" }}>When people ask an AI, do you come up?</h2>
          <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>
            {v
              ? `Last checked ${new Date(v.ranAt).toLocaleString()} — ${v.questionsAsked} unbranded buyer questions put to Claude with web search on.`
              : `Nothing measured yet for ${domain}.`}
          </p>
        </div>
        {usable ? (
          questions.length ? (
            <button className="btn btn-primary" onClick={onRunCheck} disabled={running} style={{ marginLeft: "auto" }}>
              {running ? "Asking…" : `Ask Claude these ${questions.length}`}
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={onPlan} disabled={planning} style={{ marginLeft: "auto" }}>
              {planning ? "Working it out…" : v ? "Plan a re-check" : "Work out the questions"}
            </button>
          )
        ) : null}
      </div>

      {!writingEnabled ? (
        <div className="card" style={{ padding: "13px 16px", gap: 4, border: "1px dashed var(--color-accent-400)", background: "var(--color-accent-100)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-accent-800)" }}>Needs an API key to measure</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--color-accent-900)" }}>
            Measuring this means actually asking an assistant your buyers&apos; questions and reading the answer. That
            needs an Anthropic API key set on the server.
          </div>
        </div>
      ) : !hasCrawl ? (
        <div className="card" style={{ padding: "13px 16px", gap: 4, border: "1px dashed var(--color-accent-400)", background: "var(--color-accent-100)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-accent-800)" }}>Crawl the site first</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--color-accent-900)" }}>
            The questions come from what the crawl learned about what you sell and where. Without it, MADBOT would be
            asking generic questions that tell you nothing.
          </div>
        </div>
      ) : null}

      {planError ? (
        <div className="card" style={{ padding: "13px 16px", gap: 4, border: "1px dashed var(--color-accent-400)", background: "var(--color-accent-100)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-accent-800)" }}>Couldn&apos;t plan the check</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--color-accent-900)" }}>{planError}</div>
        </div>
      ) : null}

      {questions.length ? (
        <section className="card elev-sm" style={{ padding: 18, gap: 10, borderLeft: "3px solid var(--color-accent)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <h4 style={{ margin: 0 }}>What MADBOT will ask</h4>
            {plan.category ? (
              <span className="tag tag-neutral" style={{ fontSize: 10.5 }}>
                category: {plan.category}
                {plan.city ? ` · ${plan.city}` : ""}
              </span>
            ) : null}
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 5, fontSize: 13 }}>
            {questions.map((q) => (
              <li key={q.id}>{q.question}</li>
            ))}
          </ol>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55 }} className="text-muted">
            None of these name your business — a branded question would guarantee a mention and measure nothing. Each
            one is a real model call with live web search, so a run takes a couple of minutes and costs money.
          </p>
        </section>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <section className="card elev-sm" style={{ padding: 20, gap: 13 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <h4 style={{ margin: 0 }}>Mention rate by engine</h4>
            <span className={v ? "tag tag-accent-2" : "tag tag-neutral"} style={{ marginLeft: "auto" }}>
              {v ? "Measured" : "No data yet"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
            <span style={{ width: 104, flex: "none" }}>Claude</span>
            <Bar pct={pct ?? 0} color={color} />
            <span style={{ width: 52, textAlign: "right", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
              {pct === null ? "—" : `${pct}%`}
            </span>
          </div>

          {UNMEASURED_ENGINES.map((name) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, opacity: 0.5 }}>
              <span style={{ width: 104, flex: "none" }} className="text-muted">{name}</span>
              <Bar pct={0} color="var(--color-neutral-400)" />
              <span style={{ width: 52, textAlign: "right", fontSize: 11 }} className="text-muted">n/a</span>
            </div>
          ))}

          <p style={{ margin: 0, fontSize: 12 }} className="text-muted">
            Only Claude is measured — it&apos;s the engine MADBOT has API access to. The others need their own API
            keys, so they&apos;re shown as unmeasured rather than guessed at.
          </p>
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {v ? (
            <section className="card elev-sm" style={{ padding: 18, gap: 9 }}>
              <h4 style={{ margin: 0 }}>What that means</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12.5 }}>
                <div>
                  <div className="card-kicker">Named in</div>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 22 }}>{v.mentions} / {v.questionsAsked}</div>
                </div>
                <div>
                  <div className="card-kicker">Linked to</div>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 22 }}>{v.citations} / {v.questionsAsked}</div>
                </div>
              </div>
              {v.mentions === 0 ? (
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--color-accent-800)" }}>
                  You weren&apos;t named once. When someone asks an assistant about what you sell, they&apos;re being
                  sent to whoever is below — that&apos;s the gap worth closing.
                </p>
              ) : null}
            </section>
          ) : null}

          {v?.topRivals?.length ? (
            <section className="card elev-sm" style={{ padding: 18, gap: 9, background: "var(--color-neutral-100)" }}>
              <h4 style={{ margin: 0 }}>Who it named instead</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {v.topRivals.map((r) => (
                  <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    <span className="tag tag-neutral" style={{ fontSize: 10, flex: "none" }}>{r.count}×</span>
                  </div>
                ))}
              </div>
              <p style={{ margin: 0, fontSize: 11.5 }} className="text-muted">
                Extracted from the answers — treat as a rough competitive set, not a verified list.
              </p>
            </section>
          ) : null}

          <section className="card elev-sm" style={{ padding: 18, gap: 9, background: "var(--color-neutral-100)" }}>
            <h4 style={{ margin: 0 }}>What tends to get cited</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }} className="text-muted">
              <div>Short, quotable definitions that answer one question directly.</div>
              <div>Pages marked up with schema so machines can parse the structure.</div>
              <div>Specific, checkable claims rather than marketing adjectives.</div>
            </div>
          </section>

          {usable ? (
            <section className="card elev-sm" style={{ padding: 18, gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h4 style={{ margin: 0, flex: 1 }}>Re-check weekly</h4>
                <button
                  className={autoOn ? "btn btn-primary" : "btn btn-secondary"}
                  onClick={() => onToggleAuto(!autoOn)}
                  style={{ fontSize: 12.5, padding: "5px 12px" }}
                >
                  {autoOn ? "On" : "Off"}
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55 }} className="text-muted">
                Off by default because each run spends real money. With it on, MADBOT re-asks these questions weekly so
                you can see the trend rather than a single snapshot.
              </p>
            </section>
          ) : null}
        </div>
      </div>

      {v?.results?.length ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <h4 style={{ margin: 0, fontSize: 16 }}>Question by question</h4>
          {v.results.map((r) => (
            <div key={r.id} className="card elev-sm" style={{ padding: 16, gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, flex: 1, minWidth: 220 }}>{r.question}</span>
                {r.skipped ? (
                  <span className="tag tag-neutral" style={{ fontSize: 10 }}>skipped</span>
                ) : (
                  <>
                    <span className="tag" style={{ fontSize: 10, background: r.mentioned ? "var(--color-accent-2-100)" : "var(--color-accent-100)", color: r.mentioned ? "var(--color-accent-2-800)" : "var(--color-accent-800)" }}>
                      {r.mentioned ? "named you" : "didn't name you"}
                    </span>
                    {r.cited ? <span className="tag tag-outline" style={{ fontSize: 10 }}>linked you</span> : null}
                    {r.searched ? <span className="tag tag-neutral" style={{ fontSize: 10 }}>searched the web</span> : null}
                  </>
                )}
              </div>
              {r.answerExcerpt ? (
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }} className="text-muted">
                  {r.answerExcerpt}{r.answerExcerpt.length >= 600 ? "…" : ""}
                </p>
              ) : null}
              {r.error ? <p style={{ margin: 0, fontSize: 12, color: "var(--color-accent-800)" }}>{r.error}</p> : null}
            </div>
          ))}
        </section>
      ) : null}
    </section>
  );
}
