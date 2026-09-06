import { NextResponse } from "next/server";
import { verifiedUid, authorize } from "../../../../lib/licenseServer";
import { adminAvailable, adminDb } from "../../../../lib/firebaseAdmin";
import { FEATURES } from "../../../../lib/plans";
import { publishTo, providerFor } from "../../../../lib/publishSocial";
import { POST_STATUS } from "../../../../lib/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Publishes one already-approved post.
 *
 * The approval is re-read from the database rather than trusted from the
 * request. A client that could say "this one is approved" could publish anything
 * under the customer's name by calling this endpoint directly, which would make
 * the entire approvals queue decorative.
 */
export async function POST(request) {
  if (!adminAvailable()) {
    return NextResponse.json({ ok: false, error: "No service account configured." }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { idToken, siteId, postId } = body || {};
  if (!siteId || !postId) return NextResponse.json({ ok: false, error: "No post given." }, { status: 400 });

  const uid = await verifiedUid(idToken);
  if (!uid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const auth = await authorize(idToken, FEATURES.SOCIAL);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error, upgradeTo: auth.upgradeTo || null }, { status: auth.status });
  }

  const db = adminDb();
  const postRef = db.collection("users").doc(uid).collection("sites").doc(siteId).collection("social").doc(postId);
  const snap = await postRef.get();
  if (!snap.exists) return NextResponse.json({ ok: false, error: "Post not found." }, { status: 404 });

  const post = snap.data();

  // Publishing twice is the failure mode that matters here — a duplicate post is
  // visible to everyone who follows the account and cannot be un-seen.
  if (post.status === POST_STATUS.PUBLISHED) {
    return NextResponse.json({ ok: false, error: "That post has already gone out.", url: post.publishedUrl || null, code: "already_published" });
  }
  if (post.status !== POST_STATUS.APPROVED && post.status !== POST_STATUS.SCHEDULED) {
    return NextResponse.json(
      { ok: false, error: "That post hasn't been approved. Nothing publishes from this endpoint without an approval on the record.", code: "not_approved" },
      { status: 403 }
    );
  }

  const provider = providerFor(post.networkId);
  if (!provider) return NextResponse.json({ ok: false, error: `No publisher for ${post.networkId}.` }, { status: 400 });

  const intSnap = await db
    .collection("users")
    .doc(uid)
    .collection("sites")
    .doc(siteId)
    .collection("integrations")
    .doc(provider)
    .get();

  if (!intSnap.exists) {
    return NextResponse.json({ ok: false, error: `${post.networkId} isn't connected for this site.`, code: "not_connected" });
  }

  const result = await publishTo({
    networkId: post.networkId,
    integration: intSnap.data(),
    post: {
      text: post.text,
      imageUrl: post.imageUrl || null,
      imageUrn: post.imageUrn || null,
      altText: post.altText || null,
      firstComment: post.firstComment || null,
      link: post.link || null,
    },
  });

  // Recorded either way. A failure that leaves no trace is one the customer
  // rediscovers by noticing the post never appeared.
  await postRef.set(
    result.ok
      ? {
          status: POST_STATUS.PUBLISHED,
          publishedAt: new Date(),
          publishedId: result.id || null,
          publishedUrl: result.url || null,
          publishWarning: result.warning || null,
          lastError: null,
        }
      : {
          status: POST_STATUS.FAILED,
          failedAt: new Date(),
          lastError: result.error,
          lastErrorCode: result.code || null,
        },
    { merge: true }
  );

  await db
    .collection("users")
    .doc(uid)
    .collection("sites")
    .doc(siteId)
    .collection("activity")
    .add({
      // {k, text, why, result} — the shape the activity feed renders.
      k: "social",
      text: result.ok ? `Posted to ${post.networkId}` : `Failed to post to ${post.networkId}`,
      why: "You approved this post",
      result: result.ok ? result.url || "Posted" : result.error,
      undone: false,
      createdAt: new Date(),
    });

  return NextResponse.json(result.ok ? { ok: true, url: result.url, id: result.id, warning: result.warning || null } : { ok: false, error: result.error, code: result.code || null });
}
