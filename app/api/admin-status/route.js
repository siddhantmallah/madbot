import { NextResponse } from "next/server";
import { adminDb, adminAvailable, adminProjectId } from "../../../lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deployment diagnostic: confirms whether unattended scheduling can work at
 * all. Reports capability only, never any document contents.
 *
 * Behind the same shared secret as the cron endpoints. It used to be open, and
 * although it reads no user data it did hand any anonymous caller the Firebase
 * project id, the total number of customer sites and whether the scheduler was
 * configured. None of that is catastrophic and all of it is reconnaissance, so
 * it is not worth giving away. A bearer token keeps it to one curl line.
 */
function authorised(request) {
  const secret = process.env.CRON_SECRET;
  // Unset means nobody, not everybody — the same rule the cron endpoints use.
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorised(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: process.env.CRON_SECRET ? "Unauthorized." : "CRON_SECRET is not configured.",
      },
      { status: 401 }
    );
  }

  if (!adminAvailable()) {
    return NextResponse.json({
      ok: true,
      admin: false,
      reason: "FIREBASE_SERVICE_ACCOUNT_B64 is not set — scheduled runs are disabled.",
      cronSecretSet: !!process.env.CRON_SECRET,
    });
  }

  try {
    const db = adminDb();
    // A collection-group count proves the credential is accepted and Firestore
    // is reachable, without reading any document contents.
    const snap = await db.collectionGroup("sites").count().get();
    return NextResponse.json({
      ok: true,
      admin: true,
      projectId: adminProjectId(),
      sitesVisible: snap.data().count,
      cronSecretSet: !!process.env.CRON_SECRET,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      admin: true,
      error: String(err?.message || err).slice(0, 300),
      hint: "The service account is present but Firestore refused it. Check the key hasn't been revoked.",
    });
  }
}
