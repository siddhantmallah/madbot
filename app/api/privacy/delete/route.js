import { NextResponse } from "next/server";
import { verifiedUid } from "../../../../lib/licenseServer";
import { adminAuth, adminAvailable, adminDb } from "../../../../lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Typed by the customer to confirm. A dialog you can dismiss by pressing Enter
// is not informed consent to an irreversible deletion.
const CONFIRM_PHRASE = "DELETE MY ACCOUNT";

/**
 * Erasure. GDPR Article 17, DPDP section 12(3), CPRA right to delete.
 *
 * Deletes, in this order:
 *   1. every site and all of its subcollections, including the integration
 *      credentials that are deliberately excluded from the export
 *   2. billing history and the billing event log
 *   3. the user document
 *   4. the Firebase Authentication account itself
 *
 * Two things survive on purpose, and both are named in the response and in the
 * Privacy Policy rather than being quietly retained:
 *
 *   - The trial ledger row. It is a one-way hash of the email address with no
 *     other personal data attached, kept to stop one person taking repeated
 *     free trials. That is a legitimate interest in preventing fraud, and it is
 *     the minimum possible data to serve it. Erasing it would turn the right to
 *     be forgotten into a way to farm free trials.
 *   - Suppression records for addresses that bounced or complained. Deleting a
 *     suppression means emailing somebody again who asked not to be emailed,
 *     which is the opposite of what erasure is for.
 *
 * Authentication is deleted last. If an earlier step fails the account still
 * exists, so the customer can sign in and try again rather than being locked
 * out of half-deleted data.
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

  const { idToken, confirm } = body || {};
  const uid = await verifiedUid(idToken);
  if (!uid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  if (String(confirm || "").trim().toUpperCase() !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { ok: false, error: `Type "${CONFIRM_PHRASE}" to confirm.`, confirmPhrase: CONFIRM_PHRASE },
      { status: 400 }
    );
  }

  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const deleted = { sites: 0, billing: 0, billingEvents: 0, profile: false, authAccount: false };

  try {
    // recursiveDelete walks every subcollection, which a plain doc.delete()
    // does not — an orphaned subcollection would leave lead data behind.
    const siteDocs = await userRef.collection("sites").get();
    for (const siteDoc of siteDocs.docs) {
      // eslint-disable-next-line no-await-in-loop
      await db.recursiveDelete(siteDoc.ref);
      deleted.sites += 1;
    }

    const [billing, billingEvents] = await Promise.all([
      userRef.collection("billing").get(),
      userRef.collection("billingEvents").get(),
    ]);
    // Billing records have an 8-year statutory retention under Indian company
    // law while an account is live and a real payment exists. Nothing here has
    // taken a card payment yet, so there is no book of account to preserve and
    // the honest thing is to delete. Revisit this the day checkout goes live.
    for (const d of billing.docs) {
      // eslint-disable-next-line no-await-in-loop
      await d.ref.delete();
      deleted.billing += 1;
    }
    for (const d of billingEvents.docs) {
      // eslint-disable-next-line no-await-in-loop
      await d.ref.delete();
      deleted.billingEvents += 1;
    }

    await db.recursiveDelete(userRef);
    deleted.profile = true;

    await adminAuth().deleteUser(uid);
    deleted.authAccount = true;

    return NextResponse.json({
      ok: true,
      deleted,
      retained: [
        {
          what: "A one-way hash of your email address in the free-trial ledger",
          why: "Stops one person taking repeated free trials. It cannot be reversed into an address and has no other data attached.",
          basis: "Legitimate interests, fraud prevention",
        },
        {
          what: "Suppression records, if any of your addresses ever bounced or reported spam",
          why: "Deleting one would mean contacting someone again who asked not to be contacted.",
          basis: "Legal obligation and legitimate interests",
        },
      ],
      note: "Backups held by our hosting and database providers roll off on their own schedule, normally within 30 days.",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err?.message || err), partial: deleted },
      { status: 500 }
    );
  }
}
