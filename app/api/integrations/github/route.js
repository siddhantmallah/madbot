import { NextResponse } from "next/server";
import { authorize } from "../../../../lib/licenseServer";
import { adminAvailable, adminDb } from "../../../../lib/firebaseAdmin";
import { checkConnection } from "../../../../lib/publishGithub";
import { fields, LIMITS, rateLimit, readJson, z } from "../../../../lib/apiGuard";
import { SITE_ID } from "../../../../lib/siteLimits";

const SiteBody = z.object({ idToken: fields.idToken, siteId: fields.siteId });

const ConnectBody = SiteBody.extend({
  token: z.string({ error: "Both a token and a repository are required." }).min(1, "Both a token and a repository are required.").max(500),
  repo: z
    .string({ error: "Both a token and a repository are required." })
    .min(1, "Both a token and a repository are required.")
    .max(200)
    .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "The repository should look like owner/name."),
  contentPath: fields.text(300, "The content folder").regex(/^[A-Za-z0-9_./-]*$/, "The content folder can only contain letters, numbers, - _ . and /.").nullish(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function integrationRef(db, orgId, siteId) {
  return db.collection("users").doc(orgId).collection("sites").doc(siteId).collection("integrations").doc("github");
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

  const body = await readJson(request, ConnectBody);
  if (!body.ok) return body.response;
  const { idToken, siteId, token, repo, contentPath } = body.data;
  // Connecting stores a credential every member's publishing will use, so it
  // needs the role that manages connections, not just membership.
  const auth = await authorize(idToken, null, { permission: "integrations.manage" });
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error, code: auth.code }, { status: auth.status });
  const orgId = auth.orgId;

  // Each attempt calls GitHub with the token it was given.
  const limited = await rateLimit({ scope: "integrations.github", key: auth.uid, rules: LIMITS.account });
  if (!limited.ok) return limited.response;

  const check = await checkConnection({ token, repo });
  if (!check.ok) return NextResponse.json({ ok: false, error: check.error });
  if (!check.canWrite) {
    return NextResponse.json({ ok: false, error: `The token can read ${repo} but not push to it. Publishing needs write access.` });
  }

  const db = adminDb();
  // The site is read through the organisation's own path rather than trusting
  // siteId alone — a site in a different organisation simply won't be found.
  const siteSnap = await db.collection("users").doc(orgId).collection("sites").doc(siteId).get();
  if (!siteSnap.exists) return NextResponse.json({ ok: false, error: "Site not found." }, { status: 404 });

  await integrationRef(db, orgId, siteId).set({
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
  if (!siteId || !SITE_ID.test(siteId)) return NextResponse.json({ ok: false, connected: false }, { status: 400 });
  const auth = await authorize(idToken, null, { permission: "sites.read" });
  if (!auth.ok) return NextResponse.json({ ok: false, connected: false });

  const snap = await integrationRef(adminDb(), auth.orgId, siteId).get();
  if (!snap.exists) return NextResponse.json({ ok: true, connected: false });
  const d = snap.data();
  return NextResponse.json({ ok: true, connected: true, repo: d.repo, defaultBranch: d.defaultBranch, contentPath: d.contentPath || null });
}

export async function DELETE(request) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: "No service account configured." }, { status: 503 });
  const body = await readJson(request, SiteBody);
  if (!body.ok) return body.response;
  const auth = await authorize(body.data.idToken, null, { permission: "integrations.manage" });
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error, code: auth.code }, { status: auth.status });
  await integrationRef(adminDb(), auth.orgId, body.data.siteId).delete();
  return NextResponse.json({ ok: true });
}
