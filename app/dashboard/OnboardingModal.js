import { useEffect, useRef, useState } from "react";
import { createSite, addActivity } from "../../lib/sites";
import { baseActivitySeed, hostnameOf, shortSiteName } from "../../lib/seed";
import { MadbotMark, SiteIcon } from "../components/Brand";
import { bandInfo } from "../../lib/autonomyDial";
import { useModalDialog } from "./screens/useModalDialog";

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
  // The site this modal already created, and whether its first log entry was
  // written. A retry after a half-finished start picks up from here; it used
  // to call createSite again and leave a duplicate site behind.
  const created = useRef({ siteId: null, seeded: false });

  // Closing is safe at any point except once "Start marketing" is pressed:
  // from then the site is being written and the dashboard is about to switch
  // to it, and walking away mid-way would leave it half set up.
  const canClose = !!canSkip && !started;
  const { titleId, dialogProps } = useModalDialog({ onClose, canClose });

  const back = () => setStep((s) => Math.max(0, s - 1));

  // Each step replaces the last one's content, taking the focused button with
  // it. Move focus to the new step's heading so keyboard and screen reader
  // users land on what changed rather than at the top of the page.
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    document.getElementById(titleId)?.focus();
  }, [step, titleId]);

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
      if (!created.current.siteId) {
        created.current.siteId = await createSite(uid, {
          url: url.trim(),
          title,
          description,
          autonomy: aut,
          faviconUrl: siteInfo?.faviconUrl || null,
          audit: siteInfo?.audit ? { ...siteInfo.audit, ranAt: new Date().toISOString() } : null,
        });
      }
      const siteId = created.current.siteId;
      if (!created.current.seeded) {
        await Promise.all(baseActivitySeed(domain, { read: !!siteInfo }).map((entry) => addActivity(uid, siteId, entry)));
        created.current.seeded = true;
      }
      setTimeout(() => {
        // Leads need a confirmed buyer profile first, so "starting leads" here
        // was a promise the product then didn't keep.
        onFinish(siteId, url.trim(), `Connected ${domain}. Reading the full site now to build your opportunity map.`);
      }, 900);
    } catch (err) {
      setStarted(false);
      setReadError(err?.message || "Something went wrong creating your site. Try again.");
    }
  }

  return (
    <div
      {...dialogProps}
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
          <MadbotMark size={26} />
          <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 21, letterSpacing: "-.005em" }}>madbot</span>
          <span className="tag tag-neutral" style={{ marginLeft: 8 }}>Step {step + 1} of 4</span>
        </div>

        {step === 0 && (
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <h1 id={titleId} tabIndex={-1} style={{ margin: 0, fontSize: 50, maxWidth: 640, outline: "none" }}>Give me a website. That&apos;s the whole setup.</h1>
            <p className="text-muted" style={{ margin: 0, fontSize: 16, maxWidth: 520 }}>
              No tags to install, no keyword research, no 40-field form. I&apos;ll read the site myself and tell you
              what I found.
            </p>
            <form
              onSubmit={(e) => { e.preventDefault(); readSite(); }}
              style={{ display: "flex", gap: 10, width: "min(520px,100%)", marginTop: 6 }}
            >
              <label htmlFor="onboard-url" className="sr-only">Your website address</label>
              <input
                className="input"
                id="onboard-url"
                type="text"
                inputMode="url"
                autoComplete="url"
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
              <h2 id={titleId} tabIndex={-1} style={{ margin: "0 0 5px", fontSize: 36, outline: "none" }}>Right — here&apos;s what I found.</h2>
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
              <div className="grid-4" style={{ gap: 12 }}>
                {/* Each of these is something the product measures. "Keywords you
                    should own" and "places that link to rivals" were here; nothing
                    finds either. */}
                {[
                  "Pages you should have and don't",
                  "Technical issues costing you rank",
                  "Where AI assistants name rivals, not you",
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
              <h2 id={titleId} tabIndex={-1} style={{ margin: "0 0 5px", fontSize: 36, outline: "none" }}>Last question. How much rope?</h2>
              <p className="text-muted" style={{ margin: 0, fontSize: 14.5 }}>You can change this at any moment, and it&apos;s the only setting that really matters.</p>
            </div>
            <div className="grid-4" style={{ gap: 12, width: "100%" }}>
              {/* The descriptions come from the dial itself (lib/autonomyDial.js),
                  so this step can't promise what the dial doesn't do. It used to
                  say the upper bands published and spent on their own, and badged
                  one "most people" with no users to count. */}
              {[10, 40, 62, 92].map((v) => {
                const b = bandInfo(v);
                return { v, label: b.short, desc: b.desc };
              }).map((o) => (
                <button
                  key={o.v}
                  aria-pressed={aut === o.v}
                  onClick={() => setAut(o.v)}
                  style={{ textAlign: "left", border: `2px solid ${STEP_BORDER(aut === o.v)}`, background: "var(--color-bg)", borderRadius: 26, padding: 16, cursor: "pointer", fontFamily: "var(--font-body)" }}
                >
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, marginBottom: 4 }}>{o.label}</div>
                  <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.45 }}>{o.desc}</div>
                </button>
              ))}
            </div>
            <div className="card" style={{ width: "100%", padding: "16px 20px", gap: 6, background: "var(--color-accent-2-100)" }}>
              <div style={{ fontSize: 13, color: "var(--color-accent-2-900)" }}>
                <strong>Whatever you pick:</strong> I never make a claim you haven&apos;t approved, I never email a
                prospect myself — you send outreach from your own mail — and nothing reaches your site or your audience
                without you approving it first.
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => setStep(3)} style={{ minHeight: 50, paddingInline: 30 }}>I&apos;m ready</button>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>
            <h2 id={titleId} tabIndex={-1} style={{ margin: 0, fontSize: 40, maxWidth: 600, outline: "none" }}>
              {started ? "Off it goes." : "One button and I start working."}
            </h2>
            <p className="text-muted" style={{ margin: 0, fontSize: 15, maxWidth: 460 }}>
              {started
                ? "Setting up your dashboard now…"
                : "I'll read up to 20 pages of the site, not just the homepage, and use that to work out who you sell to, what's worth writing, and the companies worth reaching out to."}
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
              <span className="tag tag-neutral">Approval always required</span>
              <span className="tag tag-neutral">Nothing published without your rules</span>
            </div>
            {canSkip ? (
              <button className="btn btn-ghost" onClick={onClose} disabled={!canClose} style={{ fontSize: 13 }}>Cancel</button>
            ) : null}
          </div>
        )}
      </div>

      {/* A way out on every step, not just the last. Last in the markup so Tab
          reaches the step's own controls first. */}
      {canSkip ? (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onClose}
          disabled={!canClose}
          aria-label="Close setup"
          title="Close setup"
          style={{ position: "absolute", top: 18, right: 18, fontSize: 22, lineHeight: 1, paddingInline: 10 }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
