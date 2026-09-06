import { useState } from "react";

import DataRules from "./DataRules";
import AutonomyDial from "../../components/AutonomyDial";

export default function Autonomy({ aut, setAut, onCommitAut, rules, setRules, voice, setVoice, brandName, dataPolicy, onDataPolicyChange }) {
  const [draftRule, setDraftRule] = useState("");

  // What the dial actually changes today, stated rather than promised.
  //
  // The previous list said "Publishing content · auto" and "Anything with a
  // price tag · auto under budget" above certain settings. Nothing read the
  // dial server-side, and nothing publishes or spends unattended — an article
  // is a pull request you merge, a social post waits for approval, outreach is
  // never sent. The one thing the setting gates is whether the scheduled AI
  // visibility re-check, which costs money, may run without you (lib/scheduler.js).
  const TONE = {
    on: { bg: "var(--color-accent-2-100)", fg: "var(--color-accent-2-800)" },
    ask: { bg: "var(--color-accent-100)", fg: "var(--color-accent-800)" },
    always: { bg: "var(--color-neutral-100)", fg: "var(--color-neutral-800)" },
  };
  const perms = [
    { text: "Audits, crawls, competitor snapshots · scheduled, read-only", tone: "on" },
    aut >= 48
      ? { text: "Weekly AI visibility re-check · allowed when switched on", tone: "on" }
      : { text: "Weekly AI visibility re-check · off below Let it rip", tone: "ask" },
    { text: "Articles · live only through a pull request you merge", tone: "always" },
    { text: "Social posts · always held for your approval", tone: "always" },
    { text: "Outreach email · always drafted, you press send", tone: "always" },
  ].map((p) => ({ ...p, ...TONE[p.tone] }));

  function addRuleNow() {
    const t = draftRule.trim();
    if (!t) return;
    setRules((r) => [...r, { id: "r" + r.length + "-" + t.slice(0, 4), text: t }]);
    setDraftRule("");
  }

  return (
    <section data-screen-label="Autonomy" className="split-side" style={{ "--side": "348px", gap: 24, alignItems: "start" }}>
      <div className="dial-column" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <h2 style={{ margin: 0, textAlign: "center" }}>How much rope do I get?</h2>
        <p className="text-muted" style={{ fontSize: 13.5, margin: "0 0 4px", textAlign: "center", maxWidth: 440 }}>
          One dial. Turn it up when you trust me, down when you don&apos;t. What it changes today is listed under it.
        </p>
        {/* The same dial the landing page shows, so the two can never drift.
            The backdrop discs are this screen's dressing; everything that
            moves lives in the shared component. */}
        {/* Sized by the column rather than a fixed 404px, so it fits a phone
            without the column scrolling sideways. The corner labels are in
            percentages for the same reason. */}
        <div style={{ position: "relative", width: "min(404px, 100%)", aspectRatio: "1", containerType: "inline-size" }}>
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--color-surface)", boxShadow: "var(--shadow-lg)" }} />
          <div aria-hidden="true" style={{ position: "absolute", inset: "7%", borderRadius: "50%", background: "var(--color-bg)", border: "1px solid var(--color-divider)" }} />
          <AutonomyDial value={aut} onChange={setAut} onCommit={onCommitAut}>
            <span style={{ position: "absolute", left: "8.5%", bottom: "12%", fontSize: 11.5, fontWeight: 600, color: "var(--color-neutral-600)", pointerEvents: "none" }}>Watch</span>
            <span style={{ position: "absolute", left: "2%", top: "37.5%", fontSize: 11.5, fontWeight: 600, color: "var(--color-neutral-600)", pointerEvents: "none" }}>Suggest</span>
            <span style={{ position: "absolute", right: "1.5%", top: "37.5%", fontSize: 11.5, fontWeight: 600, color: "var(--color-neutral-600)", pointerEvents: "none" }}>Let it rip</span>
            <span style={{ position: "absolute", right: "6.5%", bottom: "12%", fontSize: 11.5, fontWeight: 600, color: "var(--color-neutral-600)", pointerEvents: "none" }}>Full send</span>
          </AutonomyDial>
        </div>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "center", maxWidth: 600 }}>
          {perms.map((p) => (
            <span key={p.text} className="tag" style={{ background: p.bg, color: p.fg, fontSize: 11.5 }}>{p.text}</span>
          ))}
        </div>
        <p className="text-muted" style={{ margin: "2px 0 0", fontSize: 12, lineHeight: 1.55, textAlign: "center", maxWidth: 560 }}>
          Everything public waits for you at every setting — by design, not as a limit of your plan. Higher settings
          are where unattended publishing will land as it ships.
        </p>
        {/* The "Effort throttle" that sat here — "~N actions a day · about $X/mo"
            — was a slider nothing read, with numbers made up on the spot. The
            real spend limits are the plan's monthly allowances and the daily cap
            in lib/costControl.js, both shown on the Billing screen. */}
      </div>

      <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <section className="card elev-sm" style={{ padding: 18, gap: 10, background: "var(--color-accent-2-100)" }}>
          <h4 style={{ margin: 0 }}>My rules, in plain English</h4>
          {rules.map((r) => (
            <div key={r.id} style={{ display: "flex", gap: 9, alignItems: "center", background: "var(--color-bg)", borderRadius: 18, padding: "10px 13px", fontSize: 12.5 }}>
              <span style={{ flex: 1 }}>{r.text}</span>
              <button className="btn btn-ghost" onClick={() => setRules((list) => list.filter((x) => x.id !== r.id))} style={{ fontSize: 11.5, paddingInline: 4 }}>
                Remove
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              value={draftRule}
              onChange={(e) => setDraftRule(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addRuleNow(); }}
              placeholder="Never mention a customer by name"
              style={{ background: "var(--color-bg)", fontSize: 12.5 }}
            />
            <button className="btn btn-primary" onClick={addRuleNow} style={{ fontSize: 13, flex: "none" }}>Add</button>
          </div>
        </section>
        <section className="card elev-sm" style={{ padding: 18, gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h4 style={{ margin: 0 }}>Brand voice trainer</h4>
            <span className="tag tag-accent" style={{ marginLeft: "auto" }}>{voice === "a" ? "Short & direct" : "Thorough & formal"}</span>
          </div>
          <p className="card-body" style={{ margin: 0 }}>
            Tell me which of these two sounds more like you. Every new draft — articles, social posts, outreach — is
            written in that voice.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              onClick={() => setVoice("a")}
              style={{ textAlign: "left", border: "1px solid var(--color-divider)", background: voice === "a" ? "var(--color-accent-100)" : "var(--color-bg)", borderRadius: 20, padding: "12px 14px", font: "13px/1.5 var(--font-body)", cursor: "pointer" }}
            >
              &ldquo;{brandName} does the thing. Simply. We tell you when it matters.&rdquo;
            </button>
            <button
              onClick={() => setVoice("b")}
              style={{ textAlign: "left", border: "1px solid var(--color-divider)", background: voice === "b" ? "var(--color-accent-100)" : "var(--color-bg)", borderRadius: 20, padding: "12px 14px", font: "13px/1.5 var(--font-body)", cursor: "pointer" }}
            >
              &ldquo;{brandName} provides a comprehensive, enterprise-grade solution for modern organisations.&rdquo;
            </button>
          </div>
          <div className="text-muted" style={{ fontSize: 11.5 }}>
            {voice === "a" ? "Short, blunt, no corporate throat-clearing." : "Thorough and formal, never padded."} Applies to
            drafts written from now on — nothing already written is changed.
          </div>
        </section>
        {/* What actually exists. This used to promise Slack alerts and a Friday
            digest. There is no Slack integration and the digest is sent when
            you press the button, so it now says exactly that. */}
        <section className="card elev-sm" style={{ padding: 18, gap: 9, background: "var(--color-neutral-100)" }}>
          <h4 style={{ margin: 0 }}>How I reach you</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>Digest<span className="tag tag-accent-2" style={{ marginLeft: "auto", fontSize: 10 }}>Email, when you ask</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>Something needs you<span className="tag tag-accent" style={{ marginLeft: "auto", fontSize: 10 }}>Approvals badge</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>Every action taken<span className="tag tag-neutral" style={{ marginLeft: "auto", fontSize: 10 }}>Activity log</span></div>
          </div>
          <p className="text-muted" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }}>
            No Slack, no push notifications, no scheduled email yet. The digest is one button on the Growth screen.
          </p>
        </section>
      </aside>

      {/* Full width, below both columns: the data rules are as important as the
          dial and don't belong squeezed into a sidebar. */}
      <div style={{ gridColumn: "1 / -1" }}>
        <DataRules policy={dataPolicy} onChange={onDataPolicyChange} />
      </div>
    </section>
  );
}
