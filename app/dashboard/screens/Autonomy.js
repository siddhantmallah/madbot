import { useState } from "react";
import { autInfo } from "../data";

function dialValFromEvent(e) {
  const r = e.currentTarget.getBoundingClientRect();
  let a = (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  a = (a - 135 + 720) % 360;
  if (a > 270) a = a < 315 ? 270 : 0;
  return Math.round((a / 270) * 100);
}

function thrValFromEvent(e) {
  const r = e.currentTarget.getBoundingClientRect();
  return Math.max(0, Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 100)));
}

export default function Autonomy({ aut, setAut, onCommitAut, thr, setThr, onCommitThr, rules, setRules, voice, setVoice, brandName }) {
  const [drag, setDrag] = useState(null);
  const [draftRule, setDraftRule] = useState("");

  const info = autInfo(aut);
  const ang = ((135 + aut * 2.7) * Math.PI) / 180;
  const knobX = Math.round(152 * Math.cos(ang));
  const knobY = Math.round(152 * Math.sin(ang));
  const arc = `${(716 * aut) / 100} 955`;
  const permsOn = aut >= 48;
  const spendOn = aut >= 80;

  const perms = [
    { text: "Technical SEO fixes · auto", bg: "var(--color-accent-2-100)", fg: "var(--color-accent-2-800)" },
    { text: permsOn ? "Publishing content · auto" : "Publishing content · ask me", bg: permsOn ? "var(--color-accent-2-100)" : "var(--color-accent-100)", fg: permsOn ? "var(--color-accent-2-800)" : "var(--color-accent-800)" },
    { text: "Directory listings · auto", bg: "var(--color-accent-2-100)", fg: "var(--color-accent-2-800)" },
    { text: permsOn ? "Outreach email · auto, 40/day" : "Outreach email · ask me", bg: permsOn ? "var(--color-accent-2-100)" : "var(--color-accent-100)", fg: permsOn ? "var(--color-accent-2-800)" : "var(--color-accent-800)" },
    { text: spendOn ? "Anything with a price tag · auto under budget" : "Anything with a price tag · ask me", bg: spendOn ? "var(--color-accent-2-100)" : "var(--color-accent-100)", fg: spendOn ? "var(--color-accent-2-800)" : "var(--color-accent-800)" },
    { text: "Big public claims · always ask me", bg: "var(--color-neutral-100)", fg: "var(--color-neutral-800)" },
  ];

  function addRuleNow() {
    const t = draftRule.trim();
    if (!t) return;
    setRules((r) => [...r, { id: "r" + r.length + "-" + t.slice(0, 4), text: t }]);
    setDraftRule("");
  }

  return (
    <section data-screen-label="Autonomy" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 348px", gap: 24, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <h2 style={{ margin: 0, textAlign: "center" }}>How much rope do I get?</h2>
        <p className="text-muted" style={{ fontSize: 13.5, margin: "0 0 4px", textAlign: "center", maxWidth: 440 }}>
          One dial. Turn it up when you trust me, down when you don&apos;t. Everything else in MADBOT follows it.
        </p>
        <div
          onPointerDown={(e) => {
            setDrag("dial");
            setAut(dialValFromEvent(e));
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag === "dial") setAut(dialValFromEvent(e));
          }}
          onPointerUp={() => { setDrag(null); onCommitAut(); }}
          style={{ position: "relative", width: 404, height: 404, display: "grid", placeItems: "center", touchAction: "none", cursor: "grab", userSelect: "none" }}
        >
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--color-surface)", boxShadow: "var(--shadow-lg)" }} />
          <div style={{ position: "absolute", inset: 28, borderRadius: "50%", background: "var(--color-bg)", border: "1px solid var(--color-divider)" }} />
          <svg viewBox="0 0 404 404" style={{ position: "absolute", inset: 0, width: 404, height: 404, pointerEvents: "none" }}>
            <circle cx="202" cy="202" r="152" fill="none" stroke="#2A2636" strokeWidth="16" strokeLinecap="round" strokeDasharray="716 955" transform="rotate(135 202 202)" />
            <circle cx="202" cy="202" r="152" fill="none" stroke="#FF6A1A" strokeWidth="16" strokeLinecap="round" strokeDasharray={arc} transform="rotate(135 202 202)" />
          </svg>
          <div style={{ position: "absolute", width: 34, height: 34, borderRadius: "50%", background: "var(--color-bg)", border: "5px solid var(--color-accent)", boxShadow: "var(--shadow-md)", pointerEvents: "none", transform: `translate(${knobX}px,${knobY}px)` }} />
          <div style={{ textAlign: "center", position: "relative", pointerEvents: "none", padding: "0 56px" }}>
            <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>Autonomy</div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 44, lineHeight: 1.05, margin: "3px 0 5px" }}>{info.label}</div>
            <div className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>{info.desc}</div>
          </div>
          <span style={{ position: "absolute", left: 34, bottom: 48, fontSize: 11.5, fontWeight: 600, color: "var(--color-neutral-600)", pointerEvents: "none" }}>Watch</span>
          <span style={{ position: "absolute", left: 8, top: 152, fontSize: 11.5, fontWeight: 600, color: "var(--color-neutral-600)", pointerEvents: "none" }}>Suggest</span>
          <span style={{ position: "absolute", right: 6, top: 152, fontSize: 11.5, fontWeight: 600, color: "var(--color-neutral-600)", pointerEvents: "none" }}>Let it rip</span>
          <span style={{ position: "absolute", right: 26, bottom: 48, fontSize: 11.5, fontWeight: 600, color: "var(--color-neutral-600)", pointerEvents: "none" }}>Full send</span>
        </div>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "center", maxWidth: 600 }}>
          {perms.map((p) => (
            <span key={p.text} className="tag" style={{ background: p.bg, color: p.fg, fontSize: 11.5 }}>{p.text}</span>
          ))}
        </div>
        <div className="card elev-sm" style={{ width: "100%", maxWidth: 600, marginTop: 4, padding: "17px 20px", gap: 14, flexDirection: "row", alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 15, marginBottom: 2 }}>Effort throttle</div>
            <div className="text-muted" style={{ fontSize: 12 }}>
              ~{Math.round(6 + thr * 0.5)} actions a day · about ${60 + thr * 2}/mo in credits
            </div>
          </div>
          <div
            onPointerDown={(e) => {
              setDrag("thr");
              setThr(thrValFromEvent(e));
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (drag === "thr") setThr(thrValFromEvent(e));
            }}
            onPointerUp={() => { setDrag(null); onCommitThr(); }}
            style={{ flex: 1.15, height: 26, display: "flex", alignItems: "center", touchAction: "none", cursor: "pointer" }}
          >
            <div style={{ width: "100%", height: 10, borderRadius: 999, background: "var(--color-neutral-200)", position: "relative" }}>
              <span style={{ display: "block", height: 10, borderRadius: 999, background: "var(--color-accent-2-500)", width: `${thr}%` }} />
              <span style={{ position: "absolute", top: -6, left: `${thr}%`, width: 22, height: 22, borderRadius: "50%", background: "var(--color-bg)", border: "4px solid var(--color-accent-2-600)", transform: "translateX(-50%)", boxShadow: "var(--shadow-sm)" }} />
            </div>
          </div>
        </div>
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
            <span className="tag tag-accent" style={{ marginLeft: "auto" }}>{voice === "a" ? 91 : 88}% you</span>
          </div>
          <p className="card-body" style={{ margin: 0 }}>
            I read your pages when you connected. Tell me which of these two sounds more like you and I get sharper.
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
            {voice === "a" ? "Noted — short, blunt, no corporate throat-clearing." : "Pick one and I recalibrate every draft in the queue."}
          </div>
        </section>
        <section className="card elev-sm" style={{ padding: 18, gap: 9, background: "var(--color-neutral-100)" }}>
          <h4 style={{ margin: 0 }}>How I reach you</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>Friday digest<span className="tag tag-accent-2" style={{ marginLeft: "auto", fontSize: 10 }}>Slack + email</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>A win lands<span className="tag tag-accent-2" style={{ marginLeft: "auto", fontSize: 10 }}>Slack</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>Something needs you<span className="tag tag-accent" style={{ marginLeft: "auto", fontSize: 10 }}>Slack, right away</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>Everything else<span className="tag tag-neutral" style={{ marginLeft: "auto", fontSize: 10 }}>Silence</span></div>
          </div>
        </section>
      </aside>
    </section>
  );
}
