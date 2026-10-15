import { FieldPath } from "firebase-admin/firestore";
import { adminDb } from "../../../../lib/firebaseAdmin";
import { adminRoute, ok, pageOf, pageSize } from "../../../../lib/adminApi";
import { activePlan } from "../../../../lib/entitlements";
import { DAILY_USD_CAP } from "../../../../lib/costControl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The share of an allowance at which an organisation is flagged.
const ALERT_AT = 0.8;

function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Each organisation's usage this month against its licence, a page at a time.
 * Read-only: there is no billing integration yet, so nothing here charges.
 * An organisation at or past ALERT_AT of any allowance is flagged; past 100%
 * it has been refused further work (costControl.reserve).
 *
 *   ?alerts=1   only the flagged ones (within each page)
 */
export const GET = adminRoute("platform.usage.read", async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const db = adminDb();
  const month = monthKey();
  const { docs, next } = await pageOf(db.collection("orgs").where("status", "in", ["active", "suspended"]).orderBy(FieldPath.documentId()), {
    limit: pageSize(searchParams, 50),
    cursor: searchParams.get("cursor"),
    toCursorValues: (d) => [d.id],
  });
  const ledgers = docs.length ? await db.getAll(...docs.map((o) => db.collection("users").doc(o.id).collection("usage").doc(month))) : [];

  const rows = docs.map((o, i) => {
    const plan = activePlan(o.data().subscription);
    const used = ledgers[i].exists ? ledgers[i].data() : {};
    const meters = ["credits", "leadCredits", "contentPieces", "socialPosts"]
      .filter((k) => plan[k] > 0)
      .map((k) => ({ key: k, used: used[k] || 0, allowance: plan[k], share: (used[k] || 0) / plan[k] }));
    const worst = meters.reduce((m, x) => Math.max(m, x.share), 0);
    return {
      orgId: o.id,
      name: o.data().name,
      status: o.data().status,
      plan: plan.name,
      meters,
      costUsd: Math.round((used.costUsd || 0) * 100) / 100,
      dailyCapUsd: DAILY_USD_CAP[plan.id] ?? 0,
      alert: worst >= 1 ? "exhausted" : worst >= ALERT_AT ? "near" : null,
    };
  });
  return ok({ month, alertAt: ALERT_AT, rows: searchParams.get("alerts") === "1" ? rows.filter((r) => r.alert) : rows, next });
});
