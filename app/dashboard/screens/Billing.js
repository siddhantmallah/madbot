import { PLANS, PLAN_ORDER, autonomyLabel } from "../../../lib/plans";

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

export default function Billing({ usage, billing = [], siteCount }) {
  const { plan, status, maxSites, overSiteLimit, renewsAt, cancelAtPeriodEnd, grantedManually } = usage;
  const unlicensed = plan.id === "trial";

  return (
    <section data-screen-label="Billing" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h2 style={{ margin: "0 0 3px" }}>Your licence</h2>
        <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>
          What you&apos;re entitled to, what you&apos;re using, and every payment on record.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
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
