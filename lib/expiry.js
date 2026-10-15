// Deletes rows whose `expiresAt` has passed, in the collections that carry
// one. Server-only.
//
// Firestore can do this itself with a TTL policy, but TTL needs billing on the
// project and madbot-256aa is on the free Spark plan (found 2026-10-15), so
// the daily retention cron does it instead. If billing is ever turned on, TTL
// policies on the same field make this a no-op: it will find nothing left.
//
// Never add adminAudit here. The audit log is permanent on purpose and its
// rows have no expiresAt.

// One row per (scope, caller, window) for rateLimits, one per server error,
// one per cron run.
export const EXPIRING = ["rateLimits", "errorLog", "systemRuns"];

const PAGE = 400;

/**
 * Deletes expired rows from each collection in turn, oldest expiry first,
 * until none are left, `maxDeletes` have gone, or `budgetMs` has passed.
 * Each delete is a Firestore write, and the free plan allows 20,000 a day, so
 * the cap keeps the sweep from spending the product's quota; what's left is
 * picked up on the next run.
 *
 * Returns { deleted: { [collection]: n }, total, done } where done is false if
 * the cap or the budget stopped it with rows still due.
 */
export async function sweepExpired(db, { now = new Date(), collections = EXPIRING, maxDeletes = 5000, budgetMs = 20_000 } = {}) {
  const started = Date.now();
  const deleted = Object.fromEntries(collections.map((c) => [c, 0]));
  let total = 0;
  let done = true;

  for (const name of collections) {
    for (;;) {
      if (total >= maxDeletes || Date.now() - started > budgetMs) {
        done = false;
        break;
      }
      // A single-field range on expiresAt: served by Firestore's automatic
      // index, so it needs no index deploy. (Don't exempt expiresAt from
      // indexing while this is how expiry works.)
      const want = Math.min(PAGE, maxDeletes - total);
      const page = await db
        .collection(name)
        .where("expiresAt", "<=", now)
        .orderBy("expiresAt")
        .limit(want)
        .select()
        .get();
      if (page.empty) break;
      const batch = db.batch();
      for (const doc of page.docs) batch.delete(doc.ref);
      await batch.commit();
      deleted[name] += page.size;
      total += page.size;
      if (page.size < want) break;
    }
    if (!done) break;
  }
  return { deleted, total, done };
}
