import { NextResponse } from "next/server";
import { adminDb, adminAvailable, adminProjectId } from "../../../lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deployment diagnostic: confirms whether unattended scheduling can work at
// all. Reports capability only — never any user data.
export async function GET() {
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
