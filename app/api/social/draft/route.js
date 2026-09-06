import { NextResponse } from "next/server";
import { angles, writePosts } from "../../../../lib/socialPipeline";
import { authorize } from "../../../../lib/licenseServer";
import { FEATURES } from "../../../../lib/plans";
import { reserve, record } from "../../../../lib/costControl";
import { NETWORK_ORDER, readiness } from "../../../../lib/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Angles, then a draft and a guardrail check per network. Four networks is nine
// model calls, most of them small.
export const maxDuration = 300;

/**
 * Which networks this deployment could publish to.
 *
 * Deliberately does not report whether drafting works. A present key can still
 * be revoked or out of credit, and answering that question honestly needs a live
 * call — /api/ai-status makes one and caches it. Reporting `!!process.env.
 * ANTHROPIC_API_KEY` here would put a second, wronger answer next to that one.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    networks: readiness(process.env),
    aiStatusAt: "/api/ai-status",
  });
}

export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { ok: false, notConfigured: true, error: "Social drafting isn't switched on — no Anthropic API key is configured on the server." },
      { status: 200 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { idToken, siteId, site, source, link, networkIds, angleIndex = null, audience = null } = body || {};
  if (!idToken) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!siteId) return NextResponse.json({ ok: false, error: "No site given." }, { status: 400 });
  if (!source || String(source).trim().length < 40) {
    return NextResponse.json(
      { ok: false, error: "Not enough source material. Give it an article, a page, or a paragraph about what happened." },
      { status: 400 }
    );
  }

  const wanted = (networkIds || []).filter((n) => NETWORK_ORDER.includes(n));
  if (!wanted.length) return NextResponse.json({ ok: false, error: "Pick at least one network." }, { status: 400 });

  const auth = await authorize(idToken, FEATURES.SOCIAL);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, upgradeTo: auth.upgradeTo || null, upgradeName: auth.upgradeName || null },
      { status: auth.status }
    );
  }

  // One post per network held up front. A run that drafts four and publishes one
  // still consumed four drafts' worth of model time, and holding only what is
  // eventually published would meter the wrong thing.
  const gate = await reserve({
    uid: auth.uid,
    siteId,
    subscription: auth.subscription,
    action: "SOCIAL_SET",
    job: "social_draft",
    socialPosts: wanted.length,
  });
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.reason, code: gate.code, used: gate.used ?? null, allowance: gate.allowance ?? null },
      { status: 429 }
    );
  }

  const siteContext = {
    name: site?.name || site?.domain || "this site",
    summary: site?.summary || site?.description || "",
    audience,
  };
  const voice =
    site?.voice === "a"
      ? "Short, direct sentences. Plain words. No corporate throat-clearing."
      : "Professional and thorough, never padded or vague.";

  try {
    const found = await angles({ source, siteContext, audience });

    if (!found.angles?.length) {
      await record(gate.hold, { ...found.usage, failed: true });
      return NextResponse.json({
        ok: false,
        error: "Nothing in that source is worth posting about on its own. Give it something with a specific finding in it.",
        unsupported: found.unsupported || [],
      });
    }

    // The caller can pick an angle on a second pass. On the first, take the one
    // the model put first — it orders them by what it thinks lands.
    const chosen = found.angles[angleIndex ?? 0] || found.angles[0];

    const written = await writePosts({
      networkIds: wanted,
      angle: chosen,
      siteContext,
      voice,
      rules: site?.rules || [],
      link: link || null,
      source,
    });

    await record(gate.hold, {
      inputTokens: (found.usage?.inputTokens || 0) + (written.usage?.inputTokens || 0),
      outputTokens: (found.usage?.outputTokens || 0) + (written.usage?.outputTokens || 0),
      webSearches: (found.usage?.webSearches || 0) + (written.usage?.webSearches || 0),
    });

    return NextResponse.json({
      ok: true,
      angles: found.angles,
      chosenAngle: chosen,
      // Surfaced rather than dropped. This is the list of things the model
      // wanted to say and could not support, which is worth a person's eyes.
      unsupported: found.unsupported || [],
      posts: written.posts,
    });
  } catch (err) {
    await record(gate.hold, { failed: true });
    if (err?.code === "refused") return NextResponse.json({ ok: false, error: err.message });
    if (err?.code === "empty") return NextResponse.json({ ok: false, error: "The model returned nothing usable. Try again." });
    return NextResponse.json({ ok: false, error: `Drafting failed: ${String(err?.message || err).slice(0, 200)}` }, { status: 200 });
  }
}
