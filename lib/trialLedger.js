// One free trial per person, not per account.
//
// The old check was "does this user document already have a subscription".
// That stops the same account taking two trials and nothing else: sign out,
// sign up with a second address, and you have another fourteen days. Since a
// trial runs at Growth level and spends real money on model calls, that is a
// standing invitation.
//
// So the record of "this person has had their trial" has to outlive the
// account. It is keyed on the email address, which is the only identifier that
// survives deleting an account and making a new one.
//
// Two decisions worth knowing about:
//
// 1. The address is normalised before hashing. gmail treats mallah@gmail.com,
//    m.a.l.l.a.h@gmail.com and mallah+trial2@gmail.com as one inbox, so the
//    ledger has to as well or the whole thing is defeated by a full stop.
//
// 2. Only a hash is stored. The ledger would otherwise be a plain list of
//    every email address that ever signed up, sitting in a collection whose
//    entire purpose is to be kept forever. A hash answers the only question
//    the ledger is asked ("have we seen this address") without being a
//    readable mailing list, which is data minimisation doing actual work
//    rather than appearing in a policy.
//
// Server-only: imports node:crypto and firebase-admin.

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin";

export const LEDGER_COLLECTION = "trialLedger";

// Providers that ignore dots in the local part. Everyone else is left alone,
// because for some hosts a dot is genuinely a different mailbox.
const DOT_INSENSITIVE = ["gmail.com", "googlemail.com"];

/**
 * The canonical form of an address for ledger purposes.
 *
 * Returns null for anything that is not a plausible address, and the caller
 * treats null as "cannot check", which fails closed at the call site.
 */
export function normaliseEmail(email) {
  const raw = String(email || "").trim().toLowerCase();
  if (!raw || raw.indexOf("@") < 1) return null;

  const at = raw.lastIndexOf("@");
  let local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  if (!local || !domain || !domain.includes(".")) return null;

  // Sub-addressing. Nearly every provider that supports "+tag" routes it to the
  // same inbox, so it cannot be allowed to mint new identities.
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);

  if (DOT_INSENSITIVE.includes(domain)) local = local.split(".").join("");

  return local && domain ? `${local}@${domain}` : null;
}

/**
 * The ledger key.
 *
 * TRIAL_LEDGER_PEPPER is optional but wanted in production. Without it the
 * hash is a plain SHA-256, which still means the collection is not a readable
 * address list, but somebody who already had both the ledger and a guess at an
 * address could confirm the guess. The pepper removes that. It must never be
 * rotated once trials exist, or every past trial is forgotten.
 */
export function ledgerKey(email) {
  const normalised = normaliseEmail(email);
  if (!normalised) return null;
  const pepper = process.env.TRIAL_LEDGER_PEPPER || "";
  return createHash("sha256").update(`${pepper}:${normalised}`).digest("hex");
}

/**
 * Has this address had a trial already, and if so was it this account?
 *
 * Reads only. The claim itself happens inside the trial transaction so two
 * simultaneous signups cannot both pass the check.
 */
export async function trialHistoryFor(email, uid) {
  const key = ledgerKey(email);
  if (!key) return { key: null, used: false, sameAccount: false, record: null };

  const snap = await adminDb().collection(LEDGER_COLLECTION).doc(key).get();
  if (!snap.exists) return { key, used: false, sameAccount: false, record: null };

  const record = snap.data();
  const uids = Array.isArray(record?.uids) ? record.uids : [];
  return { key, used: true, sameAccount: uids.includes(uid), record };
}

/**
 * Reads the ledger inside a transaction. Must be called before any write in
 * that transaction, which is a Firestore rule, not a style preference.
 */
export async function readLedgerInTx(tx, key) {
  if (!key) return null;
  const ref = adminDb().collection(LEDGER_COLLECTION).doc(key);
  const snap = await tx.get(ref);
  return { ref, exists: snap.exists, data: snap.exists ? snap.data() : null };
}

/** Records the claim. Called inside the same transaction that grants the trial. */
export function claimInTx(tx, ref, { uid, emailDomain }) {
  tx.set(
    ref,
    {
      firstTrialAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp(),
      uids: FieldValue.arrayUnion(uid),
      attempts: FieldValue.increment(1),
      // The domain is kept in the clear on purpose. It is not personal data on
      // its own, and it is what makes a burst of trials from one throwaway mail
      // host visible without ever unmasking an address.
      emailDomain: emailDomain || null,
    },
    { merge: true }
  );
}

/** Records a refused attempt, so repeated attempts are visible. */
export function recordAttemptInTx(tx, ref, { uid }) {
  tx.set(
    ref,
    {
      lastSeenAt: FieldValue.serverTimestamp(),
      attempts: FieldValue.increment(1),
      refusedUids: FieldValue.arrayUnion(uid),
    },
    { merge: true }
  );
}

export function domainOf(email) {
  const n = normaliseEmail(email);
  return n ? n.split("@")[1] : null;
}
