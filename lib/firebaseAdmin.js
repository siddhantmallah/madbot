// Server-only Firebase Admin. This bypasses every security rule, so it must
// never be imported from a client component — the credential lives in a
// non-NEXT_PUBLIC env var precisely so a stray import fails loudly.

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// A named app, not the default one — so anything reaching for admin services
// must go through the accessors below. Calling bare getAuth()/getFirestore()
// throws "the default Firebase app does not exist", which is the intent.
const APP_NAME = "madbot-admin";

function loadCredential() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (!b64) return null;
  try {
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export function adminAvailable() {
  return !!loadCredential();
}

/**
 * Returns the admin Firestore instance, or null when no service account is
 * configured. Callers must handle null rather than assuming admin access —
 * the app is designed to run without it, just without unattended scheduling.
 */
function adminApp() {
  const creds = loadCredential();
  if (!creds) return null;

  const existing = getApps().find((a) => a.name === APP_NAME);
  return existing
    ? getApp(APP_NAME)
    : initializeApp(
        {
          credential: cert({
            projectId: creds.project_id,
            clientEmail: creds.client_email,
            privateKey: creds.private_key,
          }),
          projectId: creds.project_id,
        },
        APP_NAME
      );
}

export function adminDb() {
  const app = adminApp();
  return app ? getFirestore(app) : null;
}

/**
 * Admin Auth, for looking up an account's email or uid. Bound to the named app
 * — a bare getAuth() would throw, since there's no default app.
 */
export function adminAuth() {
  const app = adminApp();
  return app ? getAuth(app) : null;
}

export function adminProjectId() {
  return loadCredential()?.project_id || null;
}
