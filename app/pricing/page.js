"use client";

import Link from "next/link";
import { useState } from "react";
import { MadbotMark } from "../components/Brand";
import ThemeToggle from "../components/ThemeToggle";
import { PLANS, PLAN_ORDER, REGIONS, formatPrice, priceFor, highlightsFor } from "../../lib/plans";
import { TOPUPS } from "../../lib/credits";
import { useRegion } from "../../lib/useRegion";

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const { region, pending, detected, choose } = useRegion();
  const plans = PLAN_ORDER.map((id) => PLANS[id]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", fontSize: 16 }}>
      <header style={{ borderBottom: "1px solid var(--color-divider)" }}>
        <div className="nav pad-responsive" style={{ maxWidth: 1180, margin: "0 auto", padding: "15px 28px" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 11, textDecoration: "none", color: "var(--fg)", marginRight: "auto" }}>
            <MadbotMark size={29} />
            <span style={{ fontFamily: "var(--font-body)", fontSize: 21, color: "var(--fg)" }}>madbot</span>
          </Link>
          <ThemeToggle compact />
          <Link className="btn btn-primary" href="/login" style={{ color: "var(--on-accent)" }}>
            Sign in
          </Link>
        </div>
      </header>

      <main className="pad-responsive" style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 28px 90px" }}>
        <h1 style={{ margin: "0 0 12px", fontSize: "clamp(29px,7vw,50px)", maxWidth: "20em" }}>
          Pay for the work, not the seats
        </h1>
        <p className="text-muted" style={{ margin: "0 0 26px", maxWidth: "44em", fontSize: 16.5, lineHeight: 1.6 }}>
          Every plan includes the whole engine. What changes is how much of it is allowed to run each month.
        </p>

        {/* Region and billing cycle. The region is a guess until someone says
            otherwise, so it's a visible control rather than a silent decision. */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 30 }}>
          <div className="seg" role="group" aria-label="Billing period">
            {[
              { k: false, label: "Monthly" },
              { k: true, label: "Annual · 2 months free" },
            ].map((o) => (
              <label key={String(o.k)} className="seg-opt">
                <input type="radio" name="cycle" checked={annual === o.k} onChange={() => setAnnual(o.k)} />
                {o.label}
              </label>
            ))}
          </div>

          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span className="text-muted">Prices in</span>
            <select
              className="input"
              value={region}
              onChange={(e) => choose(e.target.value)}
              style={{ width: "auto", minHeight: 34, paddingBlock: 0 }}
            >
              {Object.entries(REGIONS).map(([code, r]) => (
                <option key={code} value={code}>
                  {r.label} ({r.currency})
                </option>
              ))}
            </select>
          </label>

          {detected ? (
            <span className="text-muted" style={{ fontSize: 12 }}>
              Set from where you seem to be. Change it if that&apos;s wrong.
            </span>
          ) : null}
        </div>

        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14, alignItems: "start" }}>
          {plans.map((p) => {
            const amount = priceFor(p, region, annual ? "annual" : "monthly");
            const monthly = annual && amount ? Math.round(amount / 12) : amount;
            return (
              <section
                key={p.id}
                className="card elev-sm"
                style={{
                  padding: 20,
                  gap: 11,
                  border: p.featured ? "1px solid var(--color-accent)" : "1px solid var(--color-divider)",
                  background: p.featured ? "var(--color-accent-100)" : "var(--color-surface)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <h2 style={{ margin: 0, fontSize: 21 }}>{p.name}</h2>
                  {p.featured ? (
                    <span className="tag" style={{ fontSize: 10, background: "var(--color-accent)", color: "var(--on-accent)" }}>
                      ★ Most popular
                    </span>
                  ) : null}
                </div>

                <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(26px,4.4vw,36px)", lineHeight: 1 }}>
                    {/* Dashes until the region resolves, rather than a price
                        that changes under the reader. */}
                    {pending ? "—" : formatPrice(annual ? monthly : amount, region)}
                  </span>
                  {amount ? (
                    <span className="text-muted" style={{ fontSize: 12.5 }}>/mo</span>
                  ) : null}
                </div>
                {annual && amount ? (
                  <span className="text-muted" style={{ fontSize: 11.5 }}>
                    {formatPrice(amount, region)} billed yearly
                  </span>
                ) : null}

                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, minHeight: "2.8em" }} className="text-muted">
                  {p.blurb}
                </p>

                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
                  {highlightsFor(p).map((h) => (
                    <li key={h} style={{ display: "flex", gap: 7 }}>
                      <span style={{ color: "var(--color-accent)", flex: "none" }} aria-hidden="true">→</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  className={p.featured ? "btn btn-primary btn-block" : "btn btn-secondary btn-block"}
                  href={`/login?mode=signup&plan=${p.id}`}
                  style={p.featured ? { color: "var(--on-accent)" } : undefined}
                >
                  {p.id === "free" ? "Start free" : `Start with ${p.name}`}
                </Link>
              </section>
            );
          })}
        </div>

        {/* Top-ups. Hitting a limit mid-month should be a purchase, not a wall. */}
        <section style={{ marginTop: 44 }}>
          <h2 style={{ margin: "0 0 6px", fontSize: "clamp(21px,4vw,28px)" }}>Need more part-way through a month?</h2>
          <p className="text-muted" style={{ margin: "0 0 18px", maxWidth: "42em", fontSize: 14.5 }}>
            Buy what you need without moving plan. Top-ups don&apos;t expire while your plan is active.
          </p>
          <div className="grid-4" style={{ gap: 12 }}>
            {Object.entries(TOPUPS).map(([id, t]) => (
              <div key={id} className="card elev-sm" style={{ padding: 16, gap: 4 }}>
                <span className="card-kicker">{t.label}</span>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 22, lineHeight: 1 }}>
                  {pending ? "—" : formatPrice(t.price[region] ?? t.price.US, region)}
                  {t.recurring ? <span className="text-muted" style={{ fontSize: 12 }}>/mo</span> : null}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 44, maxWidth: "46em" }}>
          <h2 style={{ margin: "0 0 6px", fontSize: "clamp(21px,4vw,28px)" }}>What&apos;s an autonomous action?</h2>
          <p className="text-muted" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65 }}>
            One piece of work MADBOT does on its own — reading a page, analysing a competitor&apos;s move, writing an
            article, checking whether an AI assistant names you. Bigger jobs use more than one, because they cost more
            to run. Your Billing screen shows what&apos;s been used and on what, so nothing is a mystery at the end of
            the month.
          </p>
        </section>

        <p className="text-muted" style={{ marginTop: 36, fontSize: 12.5 }}>
          Card checkout isn&apos;t live yet — starting a plan gets you a 14-day trial and we&apos;ll be in touch with
          payment details. Prices exclude any tax that applies where you are.
        </p>
      </main>
    </div>
  );
}
