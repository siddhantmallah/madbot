// Server-only Firebase Admin. This bypasses every security rule, so it must
// never be imported from a client component — the credential lives in a
// non-NEXT_PUBLIC env var precisely so a stray import fails loudly.

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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
export function adminDb() {
  const creds = loadCredential();
  if (!creds) return null;

  const existing = getApps().find((a) => a.name === APP_NAME);
  const app = existing
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

  return getFirestore(app);
}

export function adminProjectId() {
  return loadCredential()?.project_id || null;
}
