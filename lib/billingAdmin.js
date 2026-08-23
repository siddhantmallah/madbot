// The one place a subscription changes. A manual grant and a future provider
// webhook both land here, so entitlement state can only ever be written one
// way and there's a single record of why it changed.

import { FieldValue } from "firebase-admin/firestore";
import { adminAvailable, adminDb } from "./firebaseAdmin";
import { PLANS } from "./plans";

// Where the money came from. "manual" covers a bank transfer reconciled by
// hand — which is how the first customers get served before a payment provider
// is connected.
export const PROVIDERS = ["manual", "paddle", "lemonsqueezy", "razorpay", "stripe"];

// A Merchant of Record is the legal seller, so it issues the tax invoice and
// MADBOT must not issue a second one for the same sale.
export const MERCHANT_OF_RECORD = ["paddle", "lemonsqueezy"];

export function isMerchantOfRecord(provider) {
  return MERCHANT_OF_RECORD.includes(provider);
}

/**
 * What MADBOT is entitled to call the document it shows the customer.
 *
 * Only a registered seller charging its own tax can issue a tax invoice. An
 * MoR sale already has one from the provider, and a bank transfer taken by an
 * unregistered business has none — calling either a "tax invoice" would be a
 * false document, so both are labelled receipts.
 */
export function documentKind(provider) {
  if (isMerchantOfRecord(provider)) return { kind: "receipt", label: "Receipt", taxInvoiceBy: provider };
  if (provider === "manual") return { kind: "receipt", label: "Receipt", taxInvoiceBy: null };
  return { kind: "invoice", label: "Invoice", taxInvoiceBy: "you" };
}

function addMonths(from, months) {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Applies one billing event. Idempotent on eventId: providers retry webhooks,
 * and a retry must not extend a subscription twice or duplicate a receipt.
 *
 * event = {
 *   eventId, uid, type, plan, provider,
 *   amountMinor, currency, months,
 *   providerCustomerId, providerSubscriptionId, providerInvoiceId, invoiceUrl,
 *   note, actorUid
 * }
 */
export async function applyBillingEvent(event) {
  if (!adminAvailable()) throw new Error("No service account configured.");

  const {
    eventId,
    uid,
    type,
    plan,
    provider,
    amountMinor = null,
    currency = "USD",
    months = 1,
    providerCustomerId = null,
    providerSubscriptionId = null,
    providerInvoiceId = null,
    invoiceUrl = null,
    note = null,
    actorUid = null,
  } = event || {};

  if (!uid) throw new Error("No uid.");
  if (!PROVIDERS.includes(provider)) throw new Error(`Unknown provider "${provider}".`);
  if (!["activate", "renew", "cancel", "expire", "refund"].includes(type)) {
    throw new Error(`Unknown event type "${type}".`);
  }
  if (["activate", "renew"].includes(type) && !PLANS[plan]) {
    throw new Error(`Unknown plan "${plan}".`);
  }

  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const eventRef = userRef.collection("billingEvents").doc(eventId || db.collection("_").doc().id);

  return db.runTransaction(async (tx) => {
    const existing = await tx.get(eventRef);
    if (existing.exists) return { applied: false, reason: "already processed", eventId: eventRef.id };

    const userSnap = await tx.get(userRef);
    const current = userSnap.exists ? userSnap.data()?.subscription || null : null;
    const now = new Date();

    let subscription;
    if (type === "activate" || type === "renew") {
      // Renewing mid-term extends from the existing end date so nobody loses
      // paid-for days by paying early.
      const base =
        type === "renew" && current?.currentPeriodEnd
          ? new Date(Math.max(toMillis(current.currentPeriodEnd), now.getTime()))
          : now;
      subscription = {
        plan,
        status: "active",
        provider,
        providerCustomerId,
        providerSubscriptionId,
        currentPeriodStart: type === "renew" ? current?.currentPeriodStart || now : now,
        currentPeriodEnd: addMonths(base, months),
        cancelAtPeriodEnd: false,
        grantedBy: provider === "manual" ? actorUid : null,
        note,
        updatedAt: now,
      };
    } else if (type === "cancel") {
      // Cancelling ends at the period boundary — they paid through it.
      subscription = { ...(current || {}), cancelAtPeriodEnd: true, updatedAt: now };
    } else if (type === "expire") {
      subscription = { ...(current || {}), status: "expired", updatedAt: now };
    } else {
      subscription = { ...(current || {}), status: "refunded", currentPeriodEnd: now, updatedAt: now };
    }

    tx.set(userRef, { subscription }, { merge: true });
    tx.set(eventRef, {
      type,
      plan: plan || current?.plan || null,
      provider,
      amountMinor,
      currency,
      months,
      providerInvoiceId,
      invoiceUrl,
      note,
      actorUid,
      appliedAt: FieldValue.serverTimestamp(),
    });

    // The customer-facing billing history. Only money movements get a line;
    // a cancellation isn't a transaction.
    if (["activate", "renew", "refund"].includes(type) && amountMinor !== null) {
      const doc = documentKind(provider);
      tx.set(userRef.collection("billing").doc(eventRef.id), {
        kind: type === "refund" ? "refund" : "payment",
        documentKind: doc.kind,
        documentLabel: doc.label,
        taxInvoiceBy: doc.taxInvoiceBy,
        plan: plan || current?.plan || null,
        amountMinor,
        currency,
        provider,
        providerInvoiceId,
        invoiceUrl,
        periodStart: subscription.currentPeriodStart || null,
        periodEnd: subscription.currentPeriodEnd || null,
        note,
        issuedAt: FieldValue.serverTimestamp(),
      });
    }

    return { applied: true, eventId: eventRef.id, subscription };
  });
}

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  const p = Date.parse(ts);
  return Number.isNaN(p) ? 0 : p;
}

/** Whether a uid is allowed to grant licences by hand. */
export function isAdmin(uid) {
  const raw = process.env.ADMIN_UIDS || "";
  const admins = raw.split(",").map((s) => s.trim()).filter(Boolean);
  // No configured admins means nobody is an admin, not everybody.
  return admins.length > 0 && admins.includes(uid);
}
