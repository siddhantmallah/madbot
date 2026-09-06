import { NextResponse } from "next/server";
import { authorize, verifiedUid } from "../../../../lib/licenseServer";
import { FEATURES } from "../../../../lib/plans";
import { adminAvailable, adminDb } from "../../../../lib/firebaseAdmin";
import { checkProvider, PROVIDER_FOR, connectionUsable } from "../../../../lib/publishSocial";
import { NETWORK_ORDER, readiness } from "../../../../lib/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDERS = ["linkedin", "x", "meta"];

function integrationRef(db, uid, siteId, provider) {
  return db.collection("users").doc(uid).collection("sites").doc(siteId).collection("integrations").doc(provider);
}

/**
 * Connects a site to a social account.
 *
 * The token is verified against the network before it is stored, the same way
 * the GitHub integration does it: a scope problem caught here is one sentence in
 * a dialog, and caught later it is a post that silently never went out.
 *
 * Tokens are write-only from the client's point of view. What comes back is the
 * account name and what it can post as — never the credential.
 */
export async function POST(request) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: "No service account configured." }, { status: 503 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { idToken, siteId, provider, token, authorUrn = null, pageId = null } = body || {};

  // Connecting writes a live posting credential, so it needs the plan that
  // sells posting. Reading and disconnecting deliberately stay on identity
  // alone: somebody who downgrades must still be able to see and remove a
  // connection they made.
  const auth = await authorize(idToken, FEATURES.SOCIAL);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, upgradeTo: auth.upgradeTo || null, upgradeName: auth.upgradeName || null },
      { status: auth.status }
    );
  }
  const uid = auth.uid;
  if (!uid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!siteId) return NextResponse.json({ ok: false, error: "No site given." }, { status: 400 });
  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json({ ok: false, error: `Unknown provider. One of: ${PROVIDERS.join(", ")}` }, { status: 400 });
  }
  if (!token) return NextResponse.json({ ok: false, error: "No token given." }, { status: 400 });

  const db = adminDb();
  // Ownership is enforced by reading the site through this uid's path rather
  // than trusting siteId — another account's site simply isn't found here.
  const siteSnap = await db.collection("users").doc(uid).collection("sites").doc(siteId).get();
  if (!siteSnap.exists) return NextResponse.json({ ok: false, error: "Site not found." }, { status: 404 });

  const check = await checkProvider(provider, { token });
  if (!check.ok) return NextResponse.json({ ok: false, error: check.error });

  let record = { token, connectedAt: new Date() };
  let summary = {};

  if (provider === "linkedin") {
    // Which identity posts is a choice, never a default. Defaulting to the
    // person would publish company announcements to someone's personal profile.
    const chosen = authorUrn || (check.organizations?.length === 1 ? check.organizations[0].urn : null) || null;
    record = {
      ...record,
      authorUrn: chosen,
      name: check.name || null,
      organizations: check.organizations || [],
    };
    summary = {
      name: check.name,
      organizations: check.organizations,
      authorUrn: chosen,
      needsAuthorChoice: !chosen,
    };
  }

  if (provider === "x") {
    record = { ...record, username: check.username || null, accountId: check.id || null, premium: !!check.premium };
    summary = { username: check.username, premium: check.premium, note: check.note };
  }

  if (provider === "meta") {
    const page = pageId ? (check.pages || []).find((p) => p.id === pageId) : check.pages?.length === 1 ? check.pages[0] : null;
    record = {
      ...record,
      // The Page's own token is what posts, not the user token that listed the
      // Pages. Storing the wrong one is the classic first failure here.
      pageToken: page?.pageToken || null,
      pageId: page?.id || null,
      pageName: page?.name || null,
      igUserId: page?.instagram?.id || null,
      igUsername: page?.instagram?.username || null,
      pages: (check.pages || []).map((p) => ({ id: p.id, name: p.name, hasInstagram: !!p.instagram })),
    };
    summary = {
      pages: record.pages,
      pageId: record.pageId,
      pageName: record.pageName,
      igUsername: record.igUsername,
      needsPageChoice: !page && (check.pages || []).length > 1,
      note: check.note,
    };
  }

  await integrationRef(db, uid, siteId, provider).set(record, { merge: true });

  return NextResponse.json({ ok: true, provider, ...summary });
}

/**
 * Connection state for every network, plus whether this deployment could use
 * them at all.
 *
 * Two different "no" answers, kept apart on purpose: `configured: false` means
 * nobody on this deployment can connect this network because the app
 * credentials were never set, and `connected: false` means this particular site
 * hasn't. Collapsing them into one flag makes a server-side setup gap look like
 * something the customer forgot to do.
 */
export async function GET(request) {
  if (!adminAvailable()) return NextResponse.json({ ok: false, error: "No service account configured." }, { status: 503 });

  const idToken = request.headers.get("x-id-token");
  const siteId = new URL(request.url).searchParams.get("siteId");
  const uid = await verifiedUid(idToken);
  if (!uid || !siteId) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const db = adminDb();
  const snaps = await Promise.all(PROVIDERS.map((p) => integrationRef(db, uid, siteId, p).get()));
  const stored = Object.fromEntries(PROVIDERS.map((p, i) => [p, snaps[i].exists ? snaps[i].data() : null]));

  const ready = readiness(process.env);

  const networks = NETWORK_ORDER.map((networkId) => {
    const provider = PROVIDER_FOR[networkId];
    const integration = stored[provider];
    const usable = connectionUsable(networkId, integration);

    return {
      networkId,
      provider,
      configured: ready[networkId].configured,
      missing: ready[networkId].missing,
      setupUrl: ready[networkId].setupUrl,
      setupNote: ready[networkId].setupNote,
      connected: !!integration,
      usable: usable.usable,
      reason: usable.usable ? null : usable.reason,
      // Whatever is safe to show. Never the token.
      account:
        networkId === "linkedin"
          ? integration?.name || null
          : networkId === "x"
          ? integration?.username || null
          : networkId === "instagram"
          ? integration?.igUsername || null
          : integration?.pageName || null,
      premium: networkId === "x" ? !!integration?.premium : undefined,
    };
  });

  return NextResponse.json({ ok: true, networks });
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
  if (!PROVIDERS.includes(body.provider)) return NextResponse.json({ ok: false, error: "Unknown provider." }, { status: 400 });

  await integrationRef(adminDb(), uid, body.siteId, body.provider).delete();
  return NextResponse.json({ ok: true });
}
