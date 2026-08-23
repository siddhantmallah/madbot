import { NextResponse } from "next/server";
import { executeJob } from "../../../../lib/jobRunner";
import { JOB_STATUS, JOB_TYPES, JOB_FEATURE } from "../../../../lib/jobTypes";
import { authorize } from "../../../../lib/licenseServer";
import { reserve, record } from "../../../../lib/costControl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// What each job type spends, in customer-facing credits, plus the internal AI
// job it maps to for cost estimation. A job absent from here spends nothing and
// runs without metering — crawling and auditing are cheap enough to be free.
const METERED = {
  [JOB_TYPES.CRAWL_SITE]: { action: "CRAWL_PAGE" },
  [JOB_TYPES.AUDIT_SITE]: { action: "AUDIT_SITE" },
  [JOB_TYPES.COMPETITOR_SCAN]: { action: "COMPETITOR_SNAPSHOT" },
  [JOB_TYPES.AI_VISIBILITY]: { action: "VISIBILITY_CHECK", job: "visibility_answer" },
};

/**
 * Runs one job's work and returns the outcome plus the writes to apply. The
 * caller (the signed-in client, holding its own Firestore permissions) commits
 * them — which is what lets this work without handing the browser admin
 * credentials. The cron sweep calls the same executor with admin rights.
 *
 * Order matters: identity, then licence, then budget, then work. Each is
 * cheaper than the one after it, and the expensive one never starts until the
 * cheap checks have passed.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { idToken, job } = body || {};
  if (!idToken) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!job?.type) return NextResponse.json({ ok: false, error: "No job supplied." }, { status: 400 });

  // Identity and licence in one step. The feature comes from the job type, not
  // from the request — the caller doesn't get to nominate which permission it's
  // asking for.
  const auth = await authorize(idToken, JOB_FEATURE[job.type] || null);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, upgradeTo: auth.upgradeTo || null, upgradeName: auth.upgradeName || null },
      { status: auth.status }
    );
  }
  if (job.uid && job.uid !== auth.uid) {
    return NextResponse.json({ ok: false, error: "That job belongs to another account." }, { status: 403 });
  }

  const meter = METERED[job.type];
  const siteId = job.siteId;
  let hold = null;

  if (meter && siteId) {
    const gate = await reserve({
      uid: auth.uid,
      siteId,
      subscription: auth.subscription,
      action: meter.action,
      job: meter.job,
    });
    if (!gate.ok) {
      // 429 rather than 402: they have a valid plan, they've used this period's
      // allowance. The difference matters to the message the UI shows.
      return NextResponse.json(
        {
          ok: false,
          error: gate.reason,
          code: gate.code,
          used: gate.used ?? null,
          allowance: gate.allowance ?? null,
          exhausted: true,
        },
        { status: 429 }
      );
    }
    hold = gate.hold;
  }

  const outcome = await executeJob(job);

  // Replace the reservation's estimate with what it actually cost. A failed job
  // refunds its credits — the customer shouldn't pay for work they didn't get.
  if (hold) {
    const u = outcome.result?.usage || outcome.writes?.site?.aiVisibility?.usage || {};
    await record(hold, {
      inputTokens: u.inputTokens || 0,
      outputTokens: u.outputTokens || 0,
      webSearches: u.webSearches || 0,
      failed: outcome.status !== JOB_STATUS.COMPLETED,
    });
  }

  return NextResponse.json({
    ok: outcome.status === JOB_STATUS.COMPLETED,
    outcome,
  });
}
