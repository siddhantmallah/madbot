"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  CATEGORIES,
  CATEGORY_ORDER,
  INVENTORY,
  MODELS,
  allOff,
  allOn,
  clearConsent,
  globalPrivacyControl,
  initialChoices,
  modelFor,
  onlyNecessaryInUse,
  readConsent,
  regimeFor,
  writeConsent,
} from "../../lib/consent";

/**
 * The consent banner, shaped by where the visitor is.
 *
 * Three things this does that a pasted-in banner does not:
 *
 *  - It asks the right question for the jurisdiction. Under the ePrivacy
 *    Directive nothing optional may run before a yes, and refusing has to be
 *    one click, exactly as prominent as accepting. Under most US state laws
 *    the lawful position is disclosure plus a standing opt-out, and putting a
 *    modal wall in front of that visitor is a worse product for no legal gain.
 *  - It honours Global Privacy Control before it renders anything. A browser
 *    sending that header has already made a legally recognised opt-out request
 *    in several US states, and asking again would be ignoring it.
 *  - It tells the truth. The panel lists what is actually stored, read from
 *    lib/consent.js, and where a category is empty it says so rather than
 *    implying tracking that is not happening.
 *
 * Reopened from anywhere by dispatching `madbot:open-consent` — the footer
 * link does exactly that.
 */
export default function CookieConsent() {
  const [country, setCountry] = useState(undefined); // undefined = still asking
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [choices, setChoices] = useState(null);
  const [decided, setDecided] = useState(true);

  // Where they are. Only used to pick the consent model and name the regime;
  // the answer is cached at the edge and no IP address reaches this component.
  useEffect(() => {
    let alive = true;
    fetch("/api/region")
      .then((r) => r.json())
      .then((d) => alive && setCountry(d?.country || null))
      .catch(() => alive && setCountry(null));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (country === undefined) return;

    const stored = readConsent();
    if (stored) {
      setChoices(stored.choices);
      setDecided(true);
      return;
    }

    // GPC is an opt-out signal, so it answers the question without asking it.
    if (globalPrivacyControl()) {
      const rec = writeConsent({
        choices: { ...allOff(), [CATEGORIES.PREFERENCES]: true },
        model: modelFor(country),
        country,
        method: "gpc",
      });
      setChoices(rec.choices);
      setDecided(true);
      return;
    }

    setChoices(initialChoices(country));
    setDecided(false);
    setOpen(true);
  }, [country]);

  // The footer link, and the legal index page.
  useEffect(() => {
    const reopen = () => {
      setChoices(readConsent()?.choices || initialChoices(country));
      setExpanded(true);
      setOpen(true);
    };
    window.addEventListener("madbot:open-consent", reopen);
    return () => window.removeEventListener("madbot:open-consent", reopen);
  }, [country]);

  const save = useCallback(
    (next, method) => {
      writeConsent({ choices: next, model: modelFor(country), country, method });
      setChoices(next);
      setDecided(true);
      setOpen(false);
      setExpanded(false);
    },
    [country]
  );

  if (!open || !choices || country === undefined) return null;

  const model = modelFor(country);
  const optIn = model === MODELS.OPT_IN;
  const nothingOptional = onlyNecessaryInUse();
  const regime = regimeFor(country);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie and storage preferences"
      className="marketing"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 90,
        padding: "0 12px 12px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          pointerEvents: "auto",
          maxWidth: expanded ? 760 : 1180,
          margin: "0 auto",
          background: "var(--color-surface)",
          border: "1px solid var(--color-divider)",
          borderRadius: 8,
          boxShadow: "0 24px 70px rgba(0,0,0,.42)",
          maxHeight: "min(82vh, 720px)",
          overflowY: "auto",
          animation: "rise .35s cubic-bezier(.2,.8,.2,1)",
        }}
      >
        <div style={{ padding: "clamp(16px, 2.4vw, 22px)" }}>
          <div className="kicker-row mono" style={{ marginBottom: 12 }}>
            <span>Cookies and storage</span>
            <span>{optIn ? "Your consent is required" : "You can opt out"}</span>
          </div>

          <div
            style={{
              display: "flex",
              gap: "14px 26px",
              flexWrap: "wrap",
              alignItems: expanded ? "flex-start" : "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ flex: "1 1 380px", minWidth: 0 }}>
              <p style={{ margin: "0 0 8px", fontSize: 14.5, lineHeight: 1.6, color: "var(--fg-80)" }}>
                {nothingOptional ? (
                  <>
                    MADBOT stores only what it needs to keep you signed in and to remember your settings. There is no
                    analytics and no advertising here, so there is nothing being tracked and nothing being shared.
                  </>
                ) : (
                  <>
                    MADBOT uses storage to keep you signed in, remember your settings, and understand how the site is
                    used. You choose what beyond the essentials is allowed.
                  </>
                )}{" "}
                {optIn ? (
                  <>Under {regime} we ask before anything optional runs.</>
                ) : (
                  <>Under {regime} you can switch any of it off, at any time.</>
                )}{" "}
                <Link href="/legal/cookies" style={{ color: "var(--color-accent)" }}>
                  Cookie Policy
                </Link>
              </p>
            </div>

            {!expanded ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: "0 0 auto" }}>
                {/* Refusing is the same size and weight as accepting. Under the
                    ePrivacy Directive a "reject" that is harder to find than
                    "accept" is not valid consent. */}
                <button type="button" className="btn btn-secondary" onClick={() => setExpanded(true)} style={{ fontWeight: 600, color: "var(--fg)", borderColor: "var(--color-divider)", minHeight: 42 }}>
                  Choose
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => save(allOff(), "reject-all")} style={{ fontWeight: 600, color: "var(--fg)", borderColor: "var(--color-divider)", minHeight: 42 }}>
                  Reject optional
                </button>
                <button type="button" className="btn btn-primary" onClick={() => save(allOn(), "accept-all")} style={{ color: "var(--on-accent)", minHeight: 42 }}>
                  Accept all
                </button>
              </div>
            ) : null}
          </div>

          {expanded ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "18px 0 16px" }}>
                {CATEGORY_ORDER.map((c) => {
                  const cat = INVENTORY[c];
                  const on = cat.required || choices[c] === true;
                  return (
                    <div key={c} style={{ border: "1px solid var(--color-divider)", borderRadius: 6, padding: "13px 15px", background: "var(--color-bg)" }}>
                      <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: cat.required ? "default" : "pointer" }}>
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={cat.required}
                          onChange={(e) => setChoices({ ...choices, [c]: e.target.checked })}
                          style={{ marginTop: 3, width: 17, height: 17, flex: "none", accentColor: "var(--color-accent)" }}
                        />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                            <b style={{ fontSize: 14.5 }}>{cat.label}</b>
                            {cat.required ? <span className="tag tag-neutral" style={{ fontSize: 9.5 }}>Always on</span> : null}
                            {!cat.required && cat.items.length === 0 ? (
                              <span className="tag tag-neutral" style={{ fontSize: 9.5 }}>Nothing in use</span>
                            ) : null}
                          </span>
                          <span style={{ display: "block", fontSize: 13, lineHeight: 1.55, color: "var(--fg-60)" }}>{cat.description}</span>
                          {cat.items.length ? (
                            <span style={{ display: "block", marginTop: 8, fontSize: 12, lineHeight: 1.6, color: "var(--fg-45)" }}>
                              {cat.items.map((it) => (
                                <span key={it.key} style={{ display: "block" }}>
                                  <code style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11.5 }}>{it.key}</code> — {it.purpose} Kept {it.retention.toLowerCase()}.
                                </span>
                              ))}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-primary" onClick={() => save(choices, "saved-preferences")} style={{ color: "var(--on-accent)", minHeight: 44 }}>
                  Save my choices
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => save(allOff(), "reject-all")} style={{ fontWeight: 600, color: "var(--fg)", borderColor: "var(--color-divider)", minHeight: 44 }}>
                  Reject optional
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => save(allOn(), "accept-all")} style={{ fontWeight: 600, color: "var(--fg)", borderColor: "var(--color-divider)", minHeight: 44 }}>
                  Accept all
                </button>
                {decided ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      clearConsent();
                      setChoices(initialChoices(country));
                      setDecided(false);
                    }}
                    style={{ color: "var(--fg-45)", minHeight: 44 }}
                  >
                    Clear my answer
                  </button>
                ) : null}
              </div>

              <p style={{ margin: "14px 0 0", fontSize: 12, lineHeight: 1.6, color: "var(--fg-45)" }}>
                Your answer is stored in this browser only and never leaves it. Changing it later is one click from the
                footer of any page. Read the <Link href="/legal/cookies" style={{ color: "var(--color-accent)" }}>Cookie Policy</Link> or the{" "}
                <Link href="/legal/privacy" style={{ color: "var(--color-accent)" }}>Privacy Policy</Link>.
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
