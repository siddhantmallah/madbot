import { NextResponse } from "next/server";
import { executeJob } from "../../../../lib/jobRunner";
import { JOB_STATUS } from "../../../../lib/jobTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Verifies the caller owns the account whose job is being run. Identity comes
// from Google, never from the request body.
async function verifiedUid(idToken) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.users?.[0]?.localId || null;
}

/**
 * Runs one job's work and returns the outcome plus the writes to apply. The
 * caller (the signed-in client, holding its own Firestore permissions) commits
 * them — which is what lets this work today without a service account. A
 * cron-driven sweep will call the same executor with admin credentials.
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

  const uid = await verifiedUid(idToken);
  if (!uid) return NextResponse.json({ ok: false, error: "Could not verify your account." }, { status: 401 });
  if (job.uid && job.uid !== uid) {
    return NextResponse.json({ ok: false, error: "That job belongs to another account." }, { status: 403 });
  }

  const outcome = await executeJob(job);

  return NextResponse.json({
    ok: outcome.status === JOB_STATUS.COMPLETED,
    outcome,
  });
}
