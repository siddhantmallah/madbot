// What happened to mail after it left.
//
// Sending is not delivering. Right now a welcome email that hard-bounces looks
// identical to one that landed — the send returns 200 either way, and the
// bounce is reported to the webhook nobody was listening on. That matters
// twice: a customer who never got their welcome is silently stuck, and
// repeatedly mailing dead addresses is how a sending domain's reputation gets
// destroyed, which then costs delivery for everyone else.

import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminAvailable, adminDb } from "./firebaseAdmin";

// Resend's event names, mapped to the state a message is in. Ordered, because
// webhooks arrive out of order surprisingly often — an "opened" can land before
// the "delivered" that preceded it, and the later state must not be overwritten
// by the earlier one.
const STATE_RANK = {
  queued: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
  // Failure states outrank engagement: a message that bounced after an open
  // (possible with some providers) is still a delivery problem.
  delayed: 5,
  complained: 6,
  bounced: 7,
  failed: 8,
};

const EVENT_STATE = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.delivery_delayed": "delayed",
  "email.complained": "complained",
  "email.bounced": "bounced",
  "email.failed": "failed",
};

// A hard bounce or a spam complaint means stop. A soft bounce (delayed) does
// not — the provider will retry and it often succeeds.
const SUPPRESSING = new Set(["bounced", "complained", "failed"]);

export function stateForEvent(type) {
  return EVENT_STATE[type] || null;
}

export function isSuppressing(state) {
  return SUPPRESSING.has(state);
}

/**
 * Verifies a Resend webhook, which is signed with Svix.
 *
 * Fails closed. An unverified webhook can set a suppression that stops mail to
 * a real customer, so an unsigned or unconfigured endpoint must refuse rather
 * than trust the body.
 */
export function verifySignature({ secret, id, timestamp, signature, body }) {
  if (!secret) return { ok: false, reason: "RESEND_WEBHOOK_SECRET is not configured." };
  if (!id || !timestamp || !signature) return { ok: false, reason: "Missing Svix headers." };

  // Reject anything older than five minutes, so a captured request can't be
  // replayed later.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return { ok: false, reason: "Timestamp outside the accepted window." };

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");

  // The header carries a space-separated list of versioned signatures.
  const provided = String(signature)
    .split(" ")
    .map((p) => p.split(",")[1])
    .filter(Boolean);

  const match = provided.some((p) => {
    const a = Buffer.from(p);
    const b = Buffer.from(expected);
    // Constant time, so a wrong signature can't be narrowed down by timing.
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });

  return match ? { ok: true } : { ok: false, reason: "Signature did not match." };
}

function emailKey(email) {
  // A document id, not a hash — support needs to be able to look one up by
  // address, and these are the addresses of people who asked us to mail them.
  return String(email).toLowerCase().trim().replace(/[/#?\[\]]/g, "_").slice(0, 400);
}

/**
 * Applies one event. Idempotent on (messageId, event, timestamp): Svix retries
 * until it gets a 2xx, so the same delivery arrives more than once as a matter
 * of course.
 */
export async function applyMailEvent({ type, messageId, to, subject, at, raw }) {
  if (!adminAvailable()) throw new Error("No service account configured.");
  const state = stateForEvent(type);
  if (!state) return { applied: false, reason: `Unhandled event type "${type}".` };
  if (!messageId) return { applied: false, reason: "No message id on the event." };

  const db = adminDb();
  const ref = db.collection("mail").doc(messageId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data() : null;
    const currentRank = STATE_RANK[current?.state] ?? -1;
    const incomingRank = STATE_RANK[state] ?? -1;

    const events = { ...(current?.events || {}), [state]: at || new Date().toISOString() };

    // Out-of-order webhooks are normal. Record that the event happened, but
    // only advance the headline state if this one is genuinely later.
    const nextState = incomingRank >= currentRank ? state : current.state;

    tx.set(
      ref,
      {
        messageId,
        to: to || current?.to || null,
        subject: subject || current?.subject || null,
        state: nextState,
        events,
        // Kept for support: "what exactly did the provider tell us" is the only
        // way to settle a delivery argument.
        lastRaw: raw ? JSON.stringify(raw).slice(0, 4000) : current?.lastRaw || null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { state: nextState, advanced: incomingRank >= currentRank };
  });

  // A bounce or complaint stops future sends to that address.
  if (to && isSuppressing(state)) {
    await db.collection("suppressions").doc(emailKey(to)).set(
      {
        email: String(to).toLowerCase().trim(),
        reason: state,
        detail: raw?.data?.reason || raw?.data?.bounce?.type || null,
        messageId,
        // Recorded so support can explain it and, if it was wrong, lift it.
        suppressedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return { applied: true, ...result, suppressed: isSuppressing(state) };
}

/**
 * Whether an address must not be mailed. Checked before every send.
 *
 * Fails OPEN, deliberately, and this is the one place that's right: if the
 * lookup breaks, not sending a password reset or a receipt is worse than
 * sending one more message to a dead mailbox.
 */
export async function isSuppressed(email) {
  if (!email || !adminAvailable()) return null;
  try {
    const snap = await adminDb().collection("suppressions").doc(emailKey(email)).get();
    return snap.exists ? snap.data() : null;
  } catch {
    return null;
  }
}
