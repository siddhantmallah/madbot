import { useState } from "react";

const STEP_BORDER = (active) => (active ? "var(--color-accent)" : "var(--color-divider)");

export default function OnboardingModal({ onClose, onFinish, aut, setAut }) {
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState("certnotify.com");
  const [started, setStarted] = useState(false);

  const next = () => setStep((s) => Math.min(3, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  function startEngine() {
    setStarted(true);
    setTimeout(() => {
      onFinish("First 19 technical fixes are live, and “ssl expiry alert tool” is already moving.");
    }, 1100);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "radial-gradient(120% 90% at 50% -10%, var(--color-accent-100) 0%, var(--color-bg) 60%)",
        display: "grid",
        placeItems: "center",
        padding: 32,
        overflow: "auto",
      }}
    >
      <div style={{ width: "min(880px,100%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 22, animation: "rise .4s cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--color-accent)", display: "block" }} />
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 19 }}>MADBOT</span>
          <span className="tag tag-neutral" style={{ marginLeft: 8 }}>Step {step + 1} of 4</span>
        </div>

        {step === 0 && (
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <h1 style={{ margin: 0, fontSize: 50, maxWidth: 640 }}>Give me a website. That&apos;s the whole setup.</h1>
            <p className="text-muted" style={{ margin: 0, fontSize: 16, maxWidth: 520 }}>
              No tags to install, no keyword research, no 40-field form. I&apos;ll read the site myself and tell you
              what I found.
            </p>
            <div style={{ display: "flex", gap: 10, width: "min(520px,100%)", marginTop: 6 }}>
              <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="yourcompany.com" style={{ flex: 1, minHeight: 52, fontSize: 16, background: "var(--color-bg)" }} />
              <button className="btn btn-primary" onClick={next} style={{ minHeight: 52, paddingInline: 26 }}>Read my site</button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
              <span className="tag tag-neutral">Takes about 90 seconds</span>
              <span className="tag tag-neutral">Nothing published until you say so</span>
            </div>
          </div>
        )}

        {step === 1 && (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ textAlign: "center" }}>
              <h2 style={{ margin: "0 0 5px", fontSize: 36 }}>Right — here&apos;s what you actually are.</h2>
              <p className="text-muted" style={{ margin: 0, fontSize: 14.5 }}>Correct anything. I learn faster from a correction than from a form.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 13 }}>
              <div className="card elev-sm" style={{ padding: 17, gap: 5 }}>
                <div className="card-kicker">You sell</div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 17 }}>SSL &amp; TLS certificate monitoring</div>
                <div className="text-muted" style={{ fontSize: 12 }}>Self-serve SaaS, $19–$99/mo</div>
              </div>
              <div className="card elev-sm" style={{ padding: 17, gap: 5 }}>
                <div className="card-kicker">You sell to</div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 17 }}>Sysadmins &amp; platform teams</div>
                <div className="text-muted" style={{ fontSize: 12 }}>Companies of 20–200 people</div>
              </div>
              <div className="card elev-sm" style={{ padding: 17, gap: 5 }}>
                <div className="card-kicker">You compete with</div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 17 }}>certwatch.dev, uptimekit.io</div>
                <div className="text-muted" style={{ fontSize: 12 }}>Both outranking you on 31 terms</div>
              </div>
            </div>
            <div className="card" style={{ padding: 20, gap: 13, background: "var(--color-neutral-100)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h4 style={{ margin: 0 }}>And here&apos;s what I found lying around</h4>
                <span className="tag tag-accent" style={{ marginLeft: "auto" }}>83 opportunities</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
                <div style={{ background: "var(--color-bg)", borderRadius: 22, padding: 14 }}>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 26 }}>31</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>keywords you should own and don&apos;t</div>
                </div>
                <div style={{ background: "var(--color-bg)", borderRadius: 22, padding: 14 }}>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 26 }}>19</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>technical issues costing you rank</div>
                </div>
                <div style={{ background: "var(--color-bg)", borderRadius: 22, padding: 14 }}>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 26 }}>24</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>places that link to rivals, not you</div>
                </div>
                <div style={{ background: "var(--color-bg)", borderRadius: 22, padding: 14 }}>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 26 }}>43</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>companies with certs expiring soon</div>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="btn btn-secondary" onClick={back} style={{ fontWeight: 600 }}>Fix something</button>
              <button className="btn btn-primary" onClick={next}>That&apos;s us — carry on</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{ textAlign: "center" }}>
              <h2 style={{ margin: "0 0 5px", fontSize: 36 }}>Last question. How much rope?</h2>
              <p className="text-muted" style={{ margin: 0, fontSize: 14.5 }}>You can change this at any moment, and it&apos;s the only setting that really matters.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, width: "100%" }}>
              {[
                { v: 10, label: "Watch", desc: "I look, I report, I touch nothing." },
                { v: 40, label: "Suggest", desc: "A plan every morning. You press the buttons." },
                { v: 62, label: "Let it rip", desc: "I publish and prospect alone. I ask before spending.", badge: "most people" },
                { v: 92, label: "Full send", desc: "I spend too, inside your budget. You get receipts." },
              ].map((o) => (
                <button
                  key={o.v}
                  onClick={() => setAut(o.v)}
                  style={{ textAlign: "left", border: `2px solid ${STEP_BORDER(aut === o.v)}`, background: "var(--color-bg)", borderRadius: 26, padding: 16, cursor: "pointer", fontFamily: "var(--font-body)" }}
                >
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, marginBottom: 4 }}>{o.label}</div>
                  <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.45 }}>{o.desc}</div>
                  {o.badge ? <span className="tag tag-accent" style={{ fontSize: 10, marginTop: 8 }}>{o.badge}</span> : null}
                </button>
              ))}
            </div>
            <div className="card" style={{ width: "100%", padding: "16px 20px", gap: 6, background: "var(--color-accent-2-100)" }}>
              <div style={{ fontSize: 13, color: "var(--color-accent-2-900)" }}>
                <strong>Whatever you pick:</strong> I never make a claim you haven&apos;t approved, never email the
                same person twice in 30 days, and everything I do can be rolled back in one click.
              </div>
            </div>
            <button className="btn btn-primary" onClick={next} style={{ minHeight: 50, paddingInline: 30 }}>I&apos;m ready</button>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>
            <h2 style={{ margin: 0, fontSize: 40, maxWidth: 600 }}>
              {started ? "Off it goes." : "One button and I start working."}
            </h2>
            <p className="text-muted" style={{ margin: 0, fontSize: 15, maxWidth: 460 }}>
              {started
                ? "First fixes are already landing. Come back Friday, or watch it happen live."
                : "Nineteen fixes queued, four articles drafting, forty-three prospects scored. Nothing is published until I have your rules straight — and I do."}
            </p>
            <button
              onClick={startEngine}
              style={{
                position: "relative",
                width: 236,
                height: 236,
                borderRadius: "50%",
                border: 0,
                cursor: "pointer",
                background: "var(--color-accent)",
                color: "var(--color-bg)",
                fontFamily: "var(--font-heading)",
                fontSize: 26,
                lineHeight: 1.15,
                boxShadow: "var(--shadow-lg)",
                animation: "drift 4s ease-in-out infinite",
              }}
            >
              <span style={{ position: "absolute", inset: -14, borderRadius: "50%", border: "2px solid var(--color-accent-400)", animation: "pulseRing 2.4s ease-out infinite" }} />
              {started ? "Running" : "Start marketing"}
            </button>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "center", maxWidth: 520 }}>
              <span className="tag tag-neutral">19 fixes queued</span>
              <span className="tag tag-neutral">4 articles drafting</span>
              <span className="tag tag-neutral">43 prospects scored</span>
              <span className="tag tag-neutral">Rollback always on</span>
            </div>
            <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: 13 }}>Skip to the dashboard</button>
          </div>
        )}
      </div>
    </div>
  );
}
