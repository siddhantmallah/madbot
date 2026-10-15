import { adminDb } from "../../../../lib/firebaseAdmin";
import { adminRoute, ok, pageSize } from "../../../../lib/adminApi";
import { auditFilters, readAudit } from "../../../../lib/auditQuery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The admin audit log, newest first, a page at a time.
 *
 *   ?q=           text in the actor, target, action or note
 *   ?action=      an action prefix, e.g. "license." or "user.suspend"
 *   ?targetType=  user | org | role | admin | flag | settings
 *   ?from= ?to=   YYYY-MM-DD, inclusive
 *   ?cursor=      from the previous page's `next`
 *
 * There is no way to change or delete an entry: no route offers one, and the
 * Firestore rules refuse every client.
 */
export const GET = adminRoute("platform.audit.read", async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const filters = auditFilters(searchParams);
  const { rows, next } = await readAudit(adminDb(), filters, { limit: pageSize(searchParams, 40), cursorId: searchParams.get("cursor") });
  return ok({ entries: rows, next });
});
