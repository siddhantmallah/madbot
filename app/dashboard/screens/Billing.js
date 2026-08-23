import { PLANS, PLAN_ORDER, autonomyLabel, featuresLostOnDowngrade, FEATURE_LABELS } from "../../../lib/plans";
import { CONTACT_EMAIL } from "../../../lib/contact";
import { describeUsage } from "../../../lib/credits";

function money(minor, currency) {
  if (minor === null || minor === undefined) return "—";
  const v = (minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency === "INR" ? "₹" : currency === "USD" ? "$" : `${currency} `}${v}`;
}

function when(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function Billing({ usage, billing = [], siteCount, metered }) {
  const {
    plan,
    status,
    maxSites,
    overSiteLimit,
    renewsAt,
    cancelAtPeriodEnd,
    grantedManually,
    trialing,
    trialDaysLeft,
    trialExpired,
    intendedPlan,
  } = usage;
  const unlicensed = plan.id === "trial";

  // What they'd lose by settling on the plan they originally picked. Shown
  // during the trial so the end of it isn't a nasty surprise.
  const losing = trialing && intendedPlan ? featuresLostOnDowngrade(plan.id, intendedPlan.id) : [];

  return (
    <section data-screen-label="Billing" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h2 style={{ margin: "0 0 3px" }}>Your licence</h2>
        <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>
          What you&apos;re entitled to, what you&apos;re using, and every payment on record.
        </p>
      </div>

      {trialing ? (
        <section
          className="card elev-sm"
          style={{ padding: 18, gap: 10, borderLeft: "3px solid var(--color-accent)", background: "var(--color-accent-100)" }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <h4 style={{ margin: 0 }}>
              Free trial — {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left
            </h4>
            <span className="text-muted" style={{ fontSize: 12, marginLeft: "auto" }}>
              ends {when(renewsAt)}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            You have <strong>everything MADBOT does</strong>, across up to <strong>{maxSites} sites</strong>, whichever
            plan you picked — so you can see the whole thing working, including running several client sites at once,
            before paying for it. No card was taken and nothing renews automatically.
          </p>
          {intendedPlan ? (
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }} className="text-muted">
              You chose <strong>{intendedPlan.name}</strong> (${intendedPlan.price}/mo).
              {losing.length ? (
                <>
                  {" "}
                  On that plan you&apos;d no longer have:{" "}
                  {losing.map((f) => FEATURE_LABELS[f] || f).join(", ")}.
                </>
              ) : (
                " That covers everything you're using now."
              )}
            </p>
          ) : null}
        </section>
      ) : null}

      {trialExpired ? (
        <section
          className="card elev-sm"
          style={{ padding: 18, gap: 8, borderLeft: "3px solid var(--color-accent)" }}
        >
          <h4 style={{ margin: 0 }}>Your trial has ended</h4>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            Your sites and everything MADBOT found are still here. Audits and the opportunity map keep working;
            writing, lead discovery and AI visibility need a plan.
          </p>
        </section>
      ) : null}

      {/* What's actually been used this month. The allowances mean nothing to a
          customer who can't see their own consumption until they hit a wall. */}
      {metered ? (
        <section className="card elev-sm" style={{ padding: 20, gap: 13 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
            <h4 style={{ margin: 0 }}>This month on this site</h4>
            <span className="text-muted" style={{ fontSize: 12, marginLeft: "auto" }}>{metered.period}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {[
              { label: "Autonomous actions", used: metered.credits || 0, allowance: plan.credits },
              { label: "Lead credits", used: metered.leadCredits || 0, allowance: plan.leadCredits },
              { label: "Content pieces", used: metered.contentPieces || 0, allowance: plan.contentPieces },
              { label: "Outreach emails", used: metered.emails || 0, allowance: plan.emails },
            ].map((row) => {
              const d = describeUsage({ used: row.used, allowance: row.allowance });
              return (
                <div key={row.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13 }}>
                    <span style={{ flex: 1 }}>{row.label}</span>
                    <span
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        color: d.exhausted ? "var(--color-accent-800)" : d.nearlyOut ? "var(--color-accent-700)" : undefined,
                        fontWeight: d.exhausted || d.nearlyOut ? 700 : 400,
                      }}
                    >
                      {d.text}
                    </span>
                  </div>
                  <span style={{ height: 6, borderRadius: 999, background: "var(--color-neutral-200)", overflow: "hidden" }}>
                    <span
                      style={{
                        display: "block",
                        height: 6,
                        width: `${d.pct}%`,
                        borderRadius: 999,
                        background: d.exhausted
                          ? "var(--color-accent-400)"
                          : d.nearlyOut
                          ? "var(--color-accent)"
                          : "var(--color-accent-2-500)",
                      }}
                    />
                  </span>
                  {d.exhausted && row.allowance ? (
                    <span style={{ fontSize: 11.5, color: "var(--color-accent-800)" }}>
                      Used up. MADBOT has paused this kind of work until next month, or top up to carry on.
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }} className="text-muted">
            An action is one piece of work MADBOT does on its own. Bigger jobs use more than one, because they cost
            more to run — a full AI visibility check is the most expensive single thing it does.
          </p>
        </section>
      ) : null}

      <div className="split-2" style={{ gap: 16 }}>
        <section className="card elev-sm" style={{ padding: 20, gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 22 }}>{plan.name}</h3>
            {unlicensed ? (
              <span className="tag tag-neutral" style={{ fontSize: 10.5 }}>no plan</span>
            ) : (
              <span className="tag tag-accent-2" style={{ fontSize: 10.5 }}>{status}</span>
            )}
            {cancelAtPeriodEnd ? (
              <span className="tag tag-outline" style={{ fontSize: 10.5 }}>ends {when(renewsAt)}</span>
            ) : null}
          </div>

          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }} className="text-muted">
            {plan.blurb}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13 }}>
            <Row
              label="Sites"
              value={`${siteCount} of ${maxSites}`}
              warn={overSiteLimit}
              note={overSiteLimit ? "over the limit — existing sites keep working, new ones are blocked" : null}
            />
            <Row label="Autonomy ceiling" value={autonomyLabel(plan.maxAutonomy)} />
            <Row label={cancelAtPeriodEnd ? "Access until" : "Renews"} value={unlicensed ? "—" : when(renewsAt)} />
          </div>

          {grantedManually ? (
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }} className="text-muted">
              Granted directly rather than through a payment provider.
            </p>
          ) : null}
        </section>

        <section className="card elev-sm" style={{ padding: 20, gap: 10 }}>
          <h4 style={{ margin: 0 }}>What each plan covers</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {PLAN_ORDER.filter((id) => PLANS[id].purchasable).map((id) => {
              const p = PLANS[id];
              const current = p.id === plan.id;
              return (
                <div
                  key={id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "9px 12px",
                    borderRadius: 10,
                    border: current ? "1px solid var(--color-accent)" : "1px solid var(--color-divider)",
                    background: current ? "var(--color-accent-100)" : "transparent",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{p.name}</span>
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    {p.maxSites} site{p.maxSites === 1 ? "" : "s"}
                  </span>
                  <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>${p.price}/mo</span>
                  {current ? <span className="tag tag-accent-2" style={{ fontSize: 9.5 }}>current</span> : null}
                </div>
              );
            })}
          </div>

          {/* No checkout button, because there is no checkout. A button that
              looked like it took payment and didn't would be worse than
              saying so. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7, paddingTop: 4 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>To start or change a plan</div>
            {CONTACT_EMAIL ? (
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }} className="text-muted">
                Card checkout isn&apos;t live yet. Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with
                the plan you want and we&apos;ll set it up and send payment details. Your licence activates as soon as
                payment clears.
              </p>
            ) : (
              // No monitored address configured. Saying nothing beats printing
              // one that reaches nobody — a customer writing into a black hole
              // concludes the product is abandoned.
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: "var(--color-accent-800)" }}>
                Card checkout isn&apos;t live yet, and no contact address is configured — set
                NEXT_PUBLIC_CONTACT_EMAIL so customers can reach you to buy.
              </p>
            )}
          </div>
        </section>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <h4 style={{ margin: 0, fontSize: 16 }}>Payment history</h4>
        {billing.length === 0 ? (
          <div className="card" style={{ padding: "16px 18px", gap: 5, border: "1px dashed var(--color-divider)" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Nothing on record</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55 }} className="text-muted">
              No payment has been recorded against this account. Entries appear here once a payment is processed —
              this list is written by the server and can&apos;t be edited from the app.
            </div>
          </div>
        ) : (
          <div className="card elev-sm" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 620 }}>
              <thead>
                <tr style={{ textAlign: "left", background: "var(--color-neutral-100)" }}>
                  <Th>Date</Th>
                  <Th>Document</Th>
                  <Th>Plan</Th>
                  <Th>Period</Th>
                  <Th style={{ textAlign: "right" }}>Amount</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {billing.map((b) => (
                  <tr key={b.id} style={{ borderTop: "1px solid var(--color-divider)" }}>
                    <Td>{when(b.issuedAt)}</Td>
                    <Td>
                      {b.documentLabel || "Receipt"}
                      {b.kind === "refund" ? " (refund)" : ""}
                    </Td>
                    <Td>{PLANS[b.plan]?.name || b.plan || "—"}</Td>
                    <Td>
                      {when(b.periodStart)} – {when(b.periodEnd)}
                    </Td>
                    <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {b.kind === "refund" ? "−" : ""}
                      {money(b.amountMinor, b.currency)}
                    </Td>
                    <Td>
                      {b.invoiceUrl ? (
                        <a href={b.invoiceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
                          View
                        </a>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {billing.some((b) => b.taxInvoiceBy && b.taxInvoiceBy !== "you") ? (
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55 }} className="text-muted">
            Some of these were sold through a merchant of record, which is the legal seller and issues the tax invoice
            itself — use the View link for that document.
          </p>
        ) : null}
        {billing.some((b) => b.provider === "manual") ? (
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55 }} className="text-muted">
            Entries marked as receipts are records of payment, not tax invoices.
          </p>
        ) : null}
      </section>
    </section>
  );
}

function Row({ label, value, warn, note }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="text-muted" style={{ flex: 1 }}>{label}</span>
        <span style={{ fontWeight: 700, color: warn ? "var(--color-accent-800)" : undefined }}>{value}</span>
      </div>
      {note ? (
        <span style={{ fontSize: 11.5, color: "var(--color-accent-800)" }}>{note}</span>
      ) : null}
    </div>
  );
}

const Th = ({ children, style }) => (
  <th style={{ padding: "9px 14px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 700, ...style }}>
    {children}
  </th>
);

const Td = ({ children, style }) => <td style={{ padding: "10px 14px", ...style }}>{children}</td>;
