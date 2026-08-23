import { useEffect, useRef, useState } from "react";
import { createSite, addActivity, addApproval, addLead, addContentItem } from "../../lib/sites";
import { baseActivitySeed, approvalSeeds, leadSeeds, contentSeeds, hostnameOf, shortSiteName } from "../../lib/seed";
import { MadbotMark, SiteIcon } from "../components/Brand";

const STEP_BORDER = (active) => (active ? "var(--color-accent)" : "var(--color-divider)");

export default function OnboardingModal({ uid, canSkip, initialUrl, onClose, onFinish }) {
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState(initialUrl || "");
  const [aut, setAut] = useState(62);
  const [started, setStarted] = useState(false);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [siteInfo, setSiteInfo] = useState(null);
  const autoReadDone = useRef(false);

  const back = () => setStep((s) => Math.max(0, s - 1));

  useEffect(() => {
    if (initialUrl && !autoReadDone.current) {
      autoReadDone.current = true;
      readSite();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);

  async function readSite() {
    if (!url.trim()) return;
    setReading(true);
    setReadError("");
    try {
      // Full audit rather than just the title/description read — the findings
      // become the opportunity map, so they're worth capturing once here.
      const res = await fetch(`/api/audit?url=${encodeURIComponent(url.trim())}`);
      const data = await res.json();
      if (data.ok) {
        setSiteInfo({
          title: data.title,
          description: data.description,
          faviconUrl: data.faviconUrl,
          audit: { score: data.score, counts: data.counts, findings: data.findings, stats: data.stats },
        });
      } else {
        setSiteInfo(null);
        setReadError(data.error || "Couldn't read that site automatically — that's fine, I'll still set it up.");
      }
    } catch {
      setSiteInfo(null);
      setReadError("Couldn't read that site automatically — that's fine, I'll still set it up.");
    } finally {
      setReading(false);
      setStep(1);
    }
  }

  async function startEngine() {
    setStarted(true);
    const domain = hostnameOf(url.trim());
    const title = siteInfo?.title || domain;
    const description = siteInfo?.description || "";
    const name = shortSiteName({ title, url: url.trim() });
    try {
      const siteId = await createSite(uid, {
        url: url.trim(),
        title,
        description,
        autonomy: aut,
        faviconUrl: siteInfo?.faviconUrl || null,
        audit: siteInfo?.audit ? { ...siteInfo.audit, ranAt: new Date().toISOString() } : null,
      });
      const siteForSeeds = { title, url: url.trim() };
      await Promise.all([
        ...baseActivitySeed(domain).map((entry) => addActivity(uid, siteId, entry)),
        ...approvalSeeds(domain, name).map((entry) => addApproval(uid, siteId, entry)),
        ...leadSeeds(siteForSeeds).map((entry) => addLead(uid, siteId, entry)),
        ...contentSeeds(siteForSeeds).map((entry) => addContentItem(uid, siteId, entry)),
      ]);
      setTimeout(() => {
        onFinish(siteId, `Connected ${domain}. I read the homepage and set up a starting plan for you to review.`);
      }, 900);
    } catch (err) {
      setStarted(false);
      setReadError(err?.message || "Something went wrong creating your site. Try again.");
    }
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
          <MadbotMark size={26} stroke={1.6} />
          <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 21, letterSpacing: "-.005em" }}>madbot</span>
          <span className="tag tag-neutral" style={{ marginLeft: 8 }}>Step {step + 1} of 4</span>
        </div>

        {step === 0 && (
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <h1 style={{ margin: 0, fontSize: 50, maxWidth: 640 }}>Give me a website. That&apos;s the whole setup.</h1>
            <p className="text-muted" style={{ margin: 0, fontSize: 16, maxWidth: 520 }}>
              No tags to install, no keyword research, no 40-field form. I&apos;ll read the site myself and tell you
              what I found.
            </p>
            <form
              onSubmit={(e) => { e.preventDefault(); readSite(); }}
              style={{ display: "flex", gap: 10, width: "min(520px,100%)", marginTop: 6 }}
            >
              <input
                className="input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="yourcompany.com"
                required
                style={{ flex: 1, minHeight: 52, fontSize: 16, background: "var(--color-bg)" }}
              />
              <button className="btn btn-primary" type="submit" disabled={reading} style={{ minHeight: 52, paddingInline: 26 }}>
                {reading ? "Reading…" : "Read my site"}
              </button>
            </form>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
              <span className="tag tag-neutral">Takes about 10 seconds</span>
              <span className="tag tag-neutral">Nothing published until you say so</span>
            </div>
          </div>
        )}

        {step === 1 && (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ textAlign: "center" }}>
              <h2 style={{ margin: "0 0 5px", fontSize: 36 }}>Right — here&apos;s what I found.</h2>
              <p className="text-muted" style={{ margin: 0, fontSize: 14.5 }}>
                {readError || "Correct anything later from the dashboard — corrections teach me faster than forms do."}
              </p>
            </div>
            <div className="card elev-sm" style={{ padding: 20, gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SiteIcon site={{ ...siteInfo, url }} size={16} />
                <div className="card-kicker">{hostnameOf(url)}</div>
              </div>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 22 }}>{siteInfo?.title || hostnameOf(url)}</div>
              <div className="text-muted" style={{ fontSize: 13.5 }}>
                {siteInfo?.description || "No description found — I'll learn your voice from the pages as I go."}
              </div>
            </div>
            <div className="card" style={{ padding: 20, gap: 13, background: "var(--color-neutral-100)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h4 style={{ margin: 0 }}>Here&apos;s what I&apos;ll start looking for</h4>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
                {[
                  "Keywords you should own and don't",
                  "Technical issues costing you rank",
                  "Places that link to rivals, not you",
                  "Companies who fit your ideal customer",
                ].map((t) => (
                  <div key={t} style={{ background: "var(--color-bg)", borderRadius: 22, padding: 14, fontSize: 12.5, lineHeight: 1.5 }} className="text-muted">
                    {t}
                  </div>
                ))}
              </div>
              <div className="text-muted" style={{ fontSize: 11.5 }}>
                Counts appear once the data sources behind each are connected.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="btn btn-secondary" onClick={back} style={{ fontWeight: 600 }}>Fix something</button>
              <button className="btn btn-primary" onClick={() => setStep(2)}>That&apos;s us — carry on</button>
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
            <button className="btn btn-primary" onClick={() => setStep(3)} style={{ minHeight: 50, paddingInline: 30 }}>I&apos;m ready</button>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>
            <h2 style={{ margin: 0, fontSize: 40, maxWidth: 600 }}>
              {started ? "Off it goes." : "One button and I start working."}
            </h2>
            <p className="text-muted" style={{ margin: 0, fontSize: 15, maxWidth: 460 }}>
              {started
                ? "Setting up your dashboard now…"
                : "I'll set up your workspace with a starting plan: topics worth covering, plays worth considering, and the first few things I'd want your sign-off on."}
            </p>
            <button
              onClick={startEngine}
              disabled={started}
              style={{
                position: "relative",
                width: 236,
                height: 236,
                borderRadius: "50%",
                border: 0,
                cursor: started ? "default" : "pointer",
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
            {readError && started === false ? (
              <div style={{ fontSize: 13, color: "var(--color-accent-700)" }}>{readError}</div>
            ) : null}
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "center", maxWidth: 520 }}>
              <span className="tag tag-neutral">Rollback always on</span>
              <span className="tag tag-neutral">Nothing published without your rules</span>
            </div>
            {canSkip ? (
              <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: 13 }}>Cancel</button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
