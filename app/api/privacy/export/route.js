import { NextResponse } from "next/server";
import { adminAuth, adminAvailable, adminDb } from "../../../../lib/firebaseAdmin";
import { membershipsOf } from "../../../../lib/orgs";
import { failure, fields, LIMITS, rateLimit, readJson, requireUser, z } from "../../../../lib/apiGuard";

const Body = z.object({ idToken: fields.idToken });
import { COMPANY } from "../../../../lib/company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Subcollections under a site. Listed rather than discovered so the export is
// deterministic and a new collection has to be added here deliberately, which
// is a prompt to think about whether it holds personal data.
const SITE_SUBCOLLECTIONS = [
  "activity",
  "approvals",
  "leads",
  "content",
  "competitors",
  "jobs",
  "pages",
  "social",
  "listings",
  "usage",
];

// Never exported. Not withheld to be difficult: an OAuth token or a GitHub PAT
// in a downloaded file is a credential sitting in the Downloads folder, and the
// right of access covers personal data, not secrets the service holds on the
// customer's behalf. The Privacy Policy says this in the same words.
const REDACTED_SITE_SUBCOLLECTIONS = ["integrations"];

function plain(value) {
  // Firestore Timestamps, GeoPoints and DocumentReferences do not survive
  // JSON.stringify in any useful form.
  if (value === null || value === undefined) return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === "object") {
    if (typeof value._path?.segments?.join === "function") return value.path || null;
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

async function readCollection(ref) {
  const snap = await ref.get();
  return snap.docs.map((d) => ({ id: d.id, ...plain(d.data()) }));
}

/**
 * Everything MADBOT holds about the signed-in account, as one JSON file.
 *
 * This is the GDPR Article 15 / DPDP section 11 / CPRA right-to-know route, and
 * it is a real export rather than a summary: if a field is in Firestore under
 * this user, it is in this file, apart from the credentials noted above.
 *
 * A POST, with the token in the body. This was a GET with the token in the
 * query string so the browser could download it as a plain link, and that put
 * a live credential into browser history and the hosting provider's request
 * logs. The dashboard now saves the response as a file itself.
 */
export async function POST(request) {
  if (!adminAvailable()) {
    return NextResponse.json({ ok: false, error: "No service account configured." }, { status: 503 });
  }

  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  const who = await requireUser(body.data.idToken);
  if (!who.ok) return who.response;
  const { uid } = who.user;

  const limited = await rateLimit({ scope: "privacy.export", key: uid, rules: LIMITS.account });
  if (!limited.ok) return limited.response;

  const db = adminDb();
  const userRef = db.collection("users").doc(uid);

  try {
    const [account, userSnap] = await Promise.all([adminAuth().getUser(uid), userRef.get()]);

    async function readSites(rootRef) {
      const sites = [];
      const siteDocs = await rootRef.collection("sites").get();
      for (const siteDoc of siteDocs.docs) {
        const site = { id: siteDoc.id, ...plain(siteDoc.data()) };
        for (const name of SITE_SUBCOLLECTIONS) {
          // eslint-disable-next-line no-await-in-loop
          site[name] = await readCollection(siteDoc.ref.collection(name));
        }
        site._withheld = REDACTED_SITE_SUBCOLLECTIONS.map((n) => ({
          collection: n,
          reason: "Holds access tokens for services you connected. Withheld so a downloaded file is not a credential.",
        }));
        sites.push(site);
      }
      return sites;
    }

    // Every organisation this account belongs to, and in full the ones it
    // owns. An organisation someone else owns is theirs to export; this file
    // says which ones and in what role.
    const memberships = await membershipsOf(db, uid);
    const orgDocs = await Promise.all(memberships.map((m) => db.collection("orgs").doc(m.id).get()));
    const owned = orgDocs.filter((o) => o.exists && o.data().ownerUid === uid);
    // An account that hasn't signed in since organisations arrived has none
    // yet; its own data root is still its workspace.
    const roots = owned.length ? owned.map((o) => ({ id: o.id, name: o.data().name, licence: plain(o.data().subscription || null) })) : [{ id: uid, name: null, licence: null }];
    const organisations = [];
    for (const root of roots) {
      const rootRef = db.collection("users").doc(root.id);
      // eslint-disable-next-line no-await-in-loop
      const [sites, billing, billingEvents, usage] = await Promise.all([
        readSites(rootRef),
        readCollection(rootRef.collection("billing")),
        readCollection(rootRef.collection("billingEvents")),
        readCollection(rootRef.collection("usage")),
      ]);
      organisations.push({ ...root, billing, billingEvents, usage, sites });
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      about: {
        controller: COMPANY.legalName,
        service: COMPANY.product,
        note:
          "Everything MADBOT holds that relates to this account. Personal data about other people that you asked MADBOT to research sits inside the sites below, under 'leads'. For that data you are the controller and MADBOT is the processor.",
        notIncluded: [
          "Access tokens for services you connected (GitHub, Google, LinkedIn, X, Meta).",
          "The one-way hashes recording that this email address, and if it is on your own domain that domain, have used a free trial. They cannot be reversed to an address and are kept to stop repeat trials, which is a fraud-prevention purpose under legitimate interests.",
          "Suppression records for addresses that bounced or complained. Deleting those would mean contacting somebody again who asked not to be.",
        ],
      },
      account: {
        uid: account.uid,
        email: account.email || null,
        emailVerified: account.emailVerified,
        displayName: account.displayName || null,
        createdAt: account.metadata?.creationTime || null,
        lastSignInAt: account.metadata?.lastSignInTime || null,
        signInMethods: (account.providerData || []).map((p) => p.providerId),
      },
      profile: userSnap.exists ? plain(userSnap.data()) : null,
      memberships: memberships.map((m) => ({ organisation: m.id, name: m.name, role: m.roleId })),
      // The organisations this account owns, each with its sites, licence,
      // billing history and usage.
      organisations,
    };

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="madbot-data-export-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return failure("privacy.export", err, "The export couldn't be put together just now. Try again in a minute.");
  }
}
