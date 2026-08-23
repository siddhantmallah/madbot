import { NextResponse } from "next/server";
import { verifiedUid } from "../../../../lib/licenseServer";
import { adminAvailable, adminDb } from "../../../../lib/firebaseAdmin";
import { checkConnection } from "../../../../lib/publishGithub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function integrationRef(db, uid, siteId) {
  return db.collection("users").doc(uid).collection("sites").doc(siteId).collection("integrations").doc("github");
}

/**
 * Connects a site to a GitHub repo for publish-by-PR.
 *
 * The token is validated before it's stored — checkConnection actually calls
 * GitHub, so a typo'd token or a repo the token can't see is caught here rather
 * than surfacing later as a failed publish with no way to tell which step
 * broke. Only whether it worked and what the repo can do comes back; the token
 * itself is never read back to the client once saved.
 */
export async function POST(request) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: "No service account configured." }, { status: 503 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { idToken, siteId, token, repo, contentPath } = body || {};
  const uid = await verifiedUid(idToken);
  if (!uid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!siteId) return NextResponse.json({ ok: false, error: "No site given." }, { status: 400 });
  if (!token || !repo) return NextResponse.json({ ok: false, error: "Both a token and a repository are required." }, { status: 400 });

  const check = await checkConnection({ token, repo });
  if (!check.ok) return NextResponse.json({ ok: false, error: check.error });
  if (!check.canWrite) {
    return NextResponse.json({ ok: false, error: `The token can read ${repo} but not push to it. Publishing needs write access.` });
  }

  const db = adminDb();
  // Ownership of the site is enforced by reading it through the same uid path
  // rather than trusting siteId alone — a site under a different account
  // simply won't be found here.
  const siteSnap = await db.collection("users").doc(uid).collection("sites").doc(siteId).get();
  if (!siteSnap.exists) return NextResponse.json({ ok: false, error: "Site not found." }, { status: 404 });

  await integrationRef(db, uid, siteId).set({
    token,
    repo: check.repo,
    defaultBranch: check.defaultBranch,
    contentPath: contentPath || null,
    connectedAt: new Date(),
  });

  return NextResponse.json({ ok: true, repo: check.repo, defaultBranch: check.defaultBranch });
}

/** Connection status only — never the token. */
export async function GET(request) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: "No service account configured." }, { status: 503 });
  const idToken = request.headers.get("x-id-token");
  const siteId = new URL(request.url).searchParams.get("siteId");
  const uid = await verifiedUid(idToken);
  if (!uid || !siteId) return NextResponse.json({ ok: false, connected: false });

  const snap = await integrationRef(adminDb(), uid, siteId).get();
  if (!snap.exists) return NextResponse.json({ ok: true, connected: false });
  const d = snap.data();
  return NextResponse.json({ ok: true, connected: true, repo: d.repo, defaultBranch: d.defaultBranch, contentPath: d.contentPath || null });
}

export async function DELETE(request) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: "No service account configured." }, { status: 503 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const uid = await verifiedUid(body.idToken);
  if (!uid || !body.siteId) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  await integrationRef(adminDb(), uid, body.siteId).delete();
  return NextResponse.json({ ok: true });
}
