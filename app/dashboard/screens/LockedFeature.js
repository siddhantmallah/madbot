import { PLANS } from "../../../lib/plans";

/**
 * Shown in place of a screen the current plan doesn't cover. Always names the
 * plan that would unlock it — a locked door with no key is worse than no door.
 */
export default function LockedFeature({ title, what, access, usage, onSeeBilling }) {
  const upgrade = access?.upgradeTo ? PLANS[access.upgradeTo] : null;
  const trialEnded = usage?.trialExpired;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2 style={{ margin: "0 0 3px" }}>{title}</h2>
        <p className="text-muted" style={{ margin: 0, fontSize: 13.5 }}>{what}</p>
      </div>

      <section
        className="card elev-sm"
        style={{ padding: 22, gap: 12, maxWidth: 620, borderLeft: "3px solid var(--color-accent)" }}
      >
        <h4 style={{ margin: 0 }}>{trialEnded ? "Your trial has ended" : "Not on your plan"}</h4>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
          {trialEnded ? "This was part of your trial. A plan brings it back — nothing you set up was lost." : access?.reason}
        </p>

        {upgrade ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{upgrade.name}</span>
              <span className="text-muted" style={{ fontSize: 12.5 }}>{upgrade.blurb}</span>
            </div>
            <span style={{ marginLeft: "auto", fontSize: 18, fontFamily: "var(--font-heading)" }}>
              ${upgrade.price}
              <span className="text-muted" style={{ fontSize: 12 }}>/mo</span>
            </span>
          </div>
        ) : null}

        <button className="btn btn-primary" onClick={onSeeBilling} style={{ width: "max-content" }}>
          See plans
        </button>
      </section>
    </section>
  );
}
