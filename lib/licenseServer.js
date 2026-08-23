// Server-side licence enforcement. This is the gate that actually matters —
// the dashboard's greyed-out buttons are a courtesy, and anyone can call an API
// route directly.
//
// Identity comes from Google and the subscription comes from Firestore via the
// admin SDK. Neither is ever taken from the request body, because the caller is
// exactly the party with an interest in lying about both.

import { adminAvailable, adminDb } from "./firebaseAdmin";
import { featureAccess, activePlan } from "./entitlements";

/**
 * Resolves an ID token to a uid. Returns null for anything it can't verify.
 */
export async function verifiedUid(idToken) {
  if (!idToken) return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.users?.[0]?.localId || null;
  } catch {
    return null;
  }
}

/**
 * Reads a user's stored subscription. A missing user document is normal — it
 * just means nothing has been bought yet — and resolves to the trial tier.
 */
export async function subscriptionFor(uid) {
  if (!adminAvailable()) return { unavailable: true, subscription: null };
  try {
    const snap = await adminDb().collection("users").doc(uid).get();
    return { unavailable: false, subscription: snap.exists ? snap.data()?.subscription || null : null };
  } catch (err) {
    return { unavailable: true, subscription: null, error: String(err?.message || err) };
  }
}

/**
 * The one call an API route needs: verify the caller and check the licence.
 *
 * Returns { ok: true, uid, plan } or { ok: false, status, error, upgradeTo }.
 *
 * Fails closed. If the service account isn't configured the server cannot tell
 * a paying customer from anyone else, and guessing in the customer's favour
 * gives the whole product away.
 */
export async function authorize(idToken, feature) {
  const uid = await verifiedUid(idToken);
  if (!uid) return { ok: false, status: 401, error: "Could not verify your account." };

  // Core features are on every tier including trial, so there's nothing a
  // subscription lookup could change. Skip it rather than making the whole app
  // depend on the admin SDK.
  if (!feature) return { ok: true, uid, plan: null };

  const { unavailable, subscription } = await subscriptionFor(uid);
  if (unavailable) {
    return {
      ok: false,
      status: 503,
      error: "Licence checks are unavailable — the server's Firebase service account isn't configured.",
    };
  }

  const verdict = featureAccess(subscription, feature);
  if (!verdict.allowed) {
    return {
      ok: false,
      status: 402,
      error: verdict.reason,
      upgradeTo: verdict.upgradeTo,
      upgradeName: verdict.upgradeName,
    };
  }

  return { ok: true, uid, plan: activePlan(subscription), subscription };
}
