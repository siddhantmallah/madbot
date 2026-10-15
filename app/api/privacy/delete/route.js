import { NextResponse } from "next/server";
import { adminAuth, adminAvailable, adminDb } from "../../../../lib/firebaseAdmin";
import { membershipsOf, removeMember } from "../../../../lib/orgs";
import { fields, LIMITS, rateLimit, readJson, requireUser, z } from "../../../../lib/apiGuard";

const RECENT_SIGN_IN_SECONDS = 600;

const Body = z.object({ idToken: fields.idToken, confirm: fields.text(100).nullish() });

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

  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  const { idToken, confirm } = body.data;

  // A sign-in in the last ten minutes, not just a valid token. A token lives
  // an hour and is refreshed silently for as long as the browser stays signed
  // in, so on its own it proves somebody had the session, not that the owner
  // is the one asking for an irreversible deletion now.
  const who = await requireUser(idToken, { recentSeconds: RECENT_SIGN_IN_SECONDS });
  if (!who.ok) return who.response;
  const { uid } = who.user;

  const limited = await rateLimit({ scope: "privacy.delete", key: uid, rules: LIMITS.account });
  if (!limited.ok) return limited.response;

  if (String(confirm || "").trim().toUpperCase() !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { ok: false, error: `Type "${CONFIRM_PHRASE}" to confirm.`, confirmPhrase: CONFIRM_PHRASE },
      { status: 400 }
    );
  }

  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const deleted = { sites: 0, billing: 0, billingEvents: 0, organisations: 0, memberships: 0, profile: false, authAccount: false };

  // An organisation other people still use isn't this person's to erase.
  // Owning one with other members means handing it over first; everything
  // else they belong to, they simply leave.
  const memberships = await membershipsOf(db, uid);
  const orgDocs = await Promise.all(memberships.map((m) => db.collection("orgs").doc(m.id).get()));
  const blocking = orgDocs.filter((o) => o.exists && o.data().ownerUid === uid && (o.data().memberCount || 1) > 1);
  if (blocking.length) {
    return NextResponse.json(
      {
        ok: false,
        code: "owns_shared_org",
        error: `You own ${blocking.map((o) => `"${o.data().name}"`).join(", ")}, which other people use. Transfer ownership to one of them first, then delete your account.`,
      },
      { status: 409 }
    );
  }

  /** Erases one data root's sites, billing and event log. */
  async function eraseDataRoot(rootRef) {
    // recursiveDelete walks every subcollection, which a plain doc.delete()
    // does not — an orphaned subcollection would leave lead data behind.
    const siteDocs = await rootRef.collection("sites").get();
    for (const siteDoc of siteDocs.docs) {
      // eslint-disable-next-line no-await-in-loop
      await db.recursiveDelete(siteDoc.ref);
      deleted.sites += 1;
    }
    const [billing, billingEvents] = await Promise.all([rootRef.collection("billing").get(), rootRef.collection("billingEvents").get()]);
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
  }

  try {
    let ownDataRootSurvives = false;
    for (const o of orgDocs) {
      if (!o.exists) continue;
      if (o.data().ownerUid === uid) {
        // Theirs alone: the organisation and its work go with them.
        // eslint-disable-next-line no-await-in-loop
        await eraseDataRoot(db.collection("users").doc(o.id));
        // eslint-disable-next-line no-await-in-loop
        await db.recursiveDelete(o.ref);
        deleted.organisations += 1;
      } else {
        // eslint-disable-next-line no-await-in-loop
        await removeMember(db, { orgId: o.id, uid });
        deleted.memberships += 1;
        // Their old personal workspace, handed to someone else, keeps its
        // work, which lives under this same user id.
        if (o.id === uid) ownDataRootSurvives = true;
      }
    }

    if (ownDataRootSurvives) {
      // The profile goes; the subcollections the other owner now relies on
      // stay (a plain delete doesn't touch them).
      await userRef.delete();
    } else {
      await eraseDataRoot(userRef);
      await db.recursiveDelete(userRef);
    }
    deleted.profile = true;

    await adminAuth().deleteUser(uid);
    deleted.authAccount = true;

    return NextResponse.json({
      ok: true,
      deleted,
      retained: [
        {
          what: "A one-way hash of your email address in the free-trial ledger, with your address's domain, and a hash of that domain if it isn't a public mail service",
          why: "Stops one person, or one organisation, taking repeated free trials. Neither hash can be reversed into an address.",
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
    console.error("[privacy.delete]", err?.stack || err);
    return NextResponse.json(
      {
        ok: false,
        error: "Deletion stopped partway. Your sign-in still works, so you can try again; anything already removed stays removed.",
        partial: deleted,
      },
      { status: 500 }
    );
  }
}
