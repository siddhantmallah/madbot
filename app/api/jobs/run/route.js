import { NextResponse } from "next/server";
import { executeJob } from "../../../../lib/jobRunner";
import { JOB_STATUS, JOB_FEATURE } from "../../../../lib/jobTypes";
import { authorize } from "../../../../lib/licenseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Runs one job's work and returns the outcome plus the writes to apply. The
 * caller (the signed-in client, holding its own Firestore permissions) commits
 * them — which is what lets this work without handing the browser admin
 * credentials. The cron sweep calls the same executor with admin rights.
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

  // Identity and licence in one step, before any work is done. The feature
  // comes from the job type, not from the request — the caller doesn't get to
  // nominate which permission it's asking for.
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

  const outcome = await executeJob(job);

  return NextResponse.json({
    ok: outcome.status === JOB_STATUS.COMPLETED,
    outcome,
  });
}
