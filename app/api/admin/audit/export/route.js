import { NextResponse } from "next/server";
import { adminDb } from "../../../../../lib/firebaseAdmin";
import { adminRoute } from "../../../../../lib/adminApi";
import { CSV_COLUMNS, auditFilters, csvCell, readAudit } from "../../../../../lib/auditQuery";
import { recordAdminAction } from "../../../../../lib/adminAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 10_000;

/**
 * The audit log as CSV, with the same filters as the list. Exporting is itself
 * recorded, because a copy of the log leaving the system is worth knowing
 * about.
 */
export const GET = adminRoute("platform.audit.export", async ({ request, admin }) => {
  const { searchParams } = new URL(request.url);
  const filters = auditFilters(searchParams);
  const db = adminDb();

  const rows = [];
  let cursor = null;
  do {
    // eslint-disable-next-line no-await-in-loop
    const page = await readAudit(db, filters, { limit: Math.min(500, MAX_ROWS - rows.length), cursorId: cursor });
    rows.push(...page.rows);
    cursor = page.next;
  } while (cursor && rows.length < MAX_ROWS);

  const csv = [CSV_COLUMNS.join(","), ...rows.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c])).join(","))].join("\r\n");
  await recordAdminAction({
    admin,
    request,
    action: "audit.export",
    targetType: "audit",
    targetLabel: `${rows.length} entries`,
    after: { filters: Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), rows: rows.length, truncated: rows.length >= MAX_ROWS },
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="madbot-admin-audit-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
