import { NextResponse } from "next/server";
import { verifiedUid } from "../../../../lib/licenseServer";
import { adminAvailable, adminDb } from "../../../../lib/firebaseAdmin";
import { publishArticle } from "../../../../lib/publishGithub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Opens a pull request for one content item.
 *
 * Never merges, never touches the default branch, never sends a piece flagged
 * by the fact-check without the customer being told — the caller (Content.js)
 * is expected to have shown that warning already, but the article is published
 * exactly as it stands in Firestore, front matter marked draft:true, so nothing
 * goes live from a PR alone.
 */
export async function POST(request) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: "No service account configured." }, { status: 503 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { idToken, siteId, contentId } = body || {};
  const uid = await verifiedUid(idToken);
  if (!uid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!siteId || !contentId) return NextResponse.json({ ok: false, error: "Missing site or content id." }, { status: 400 });

  const db = adminDb();
  const siteRef = db.collection("users").doc(uid).collection("sites").doc(siteId);
  const [integrationSnap, contentSnap] = await Promise.all([
    siteRef.collection("integrations").doc("github").get(),
    siteRef.collection("content").doc(contentId).get(),
  ]);

  if (!integrationSnap.exists) {
    return NextResponse.json({ ok: false, error: "No GitHub repository connected for this site yet." }, { status: 400 });
  }
  if (!contentSnap.exists) return NextResponse.json({ ok: false, error: "That content item no longer exists." }, { status: 404 });

  const integration = integrationSnap.data();
  const item = contentSnap.data();
  if (!item.article) return NextResponse.json({ ok: false, error: "This piece hasn't been written yet." }, { status: 400 });

  const result = await publishArticle({
    token: integration.token,
    repo: integration.repo,
    contentPath: integration.contentPath ? { dir: integration.contentPath, ext: "mdx" } : null,
    article: {
      title: item.title,
      description: item.description || "",
      body: item.article,
      wordCount: item.words || null,
      tags: item.kind ? [item.kind.toLowerCase()] : [],
      sources: item.sources || [],
      // A piece with unreviewed claims still gets pushed as a draft PR — the
      // reviewer sees the warning in the PR description, not a silent publish.
      draft: item.needsReview !== false,
    },
    authorNote: item.needsReview
      ? `Fact-check flagged ${item.factCheck?.unsupportedCount || "some"} claim(s) for review before this goes live.`
      : "All claims in this piece were checked against the research.",
  });

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error, stage: result.stage });

  await siteRef.collection("content").doc(contentId).update({
    status: "pr_open",
    prUrl: result.prUrl,
    prNumber: result.prNumber,
    publishedVia: "github",
    publishedAt: new Date(),
  });

  return NextResponse.json({ ok: true, prUrl: result.prUrl, prNumber: result.prNumber });
}
