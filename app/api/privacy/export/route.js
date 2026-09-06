import { NextResponse } from "next/server";
import { verifiedUid } from "../../../../lib/licenseServer";
import { adminAuth, adminAvailable, adminDb } from "../../../../lib/firebaseAdmin";
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
 * A GET so it can be a plain link the browser downloads. The id token travels
 * as a query parameter for that reason, which is a deliberate trade: the token
 * is short-lived, the request is over HTTPS, and the alternative is a POST that
 * cannot produce a file download without extra client machinery. It is never
 * logged by this route.
 */
export async function GET(request) {
  if (!adminAvailable()) {
    return NextResponse.json({ ok: false, error: "No service account configured." }, { status: 503 });
  }

  const idToken = new URL(request.url).searchParams.get("idToken");
  const uid = await verifiedUid(idToken);
  if (!uid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const db = adminDb();
  const userRef = db.collection("users").doc(uid);

  try {
    const [account, userSnap] = await Promise.all([adminAuth().getUser(uid), userRef.get()]);

    const sites = [];
    const siteDocs = await userRef.collection("sites").get();
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

    const [billing, billingEvents] = await Promise.all([
      readCollection(userRef.collection("billing")),
      readCollection(userRef.collection("billingEvents")),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      about: {
        controller: COMPANY.legalName,
        service: COMPANY.product,
        note:
          "Everything MADBOT holds that relates to this account. Personal data about other people that you asked MADBOT to research sits inside the sites below, under 'leads'. For that data you are the controller and MADBOT is the processor.",
        notIncluded: [
          "Access tokens for services you connected (GitHub, Google, LinkedIn, X, Meta).",
          "The one-way hash recording that this email address has used a free trial. It cannot be reversed to an address and is kept to stop repeat trials, which is a fraud-prevention purpose under legitimate interests.",
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
      billing,
      billingEvents,
      sites,
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
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
