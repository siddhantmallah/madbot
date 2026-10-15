// Platform-wide settings and feature flags, set from /admin. Server-only.
//
//   platform/settings   signupOpen, maintenance { on, message },
//                       emailTemplates { welcome, verify } (subject and intro)
//   platform/flags      { [feature]: { enabled } }   the global switch
//   orgs/{id}.flags     { [feature]: true | false }  a per-organisation override
//
// Flags are kill switches over the features in lib/plans.js, enforced where
// the licence is (licenseServer.authorize), so turning one off stops the work
// on the server, not just a button. A flag can only take a feature away; it
// never grants one the licence doesn't include.
//
// Read on nearly every request, so cached per instance for CACHE_MS. A change
// in /admin is therefore live everywhere within that time, not instantly,
// and the console says so.

import { adminAvailable, adminDb } from "./firebaseAdmin";
import { FEATURES } from "./plans";

export const CACHE_MS = 30_000;

export const DEFAULT_SETTINGS = {
  signupOpen: true,
  maintenance: { on: false, message: "" },
  emailTemplates: {
    welcome: { subject: "", intro: "" },
    verify: { subject: "", intro: "" },
  },
};

let cache = { at: 0, settings: null, flags: null };

/** Drops the cache, so a write in /admin is seen by this instance at once. */
export function invalidatePlatformCache() {
  cache = { at: 0, settings: null, flags: null };
}

async function load() {
  if (cache.settings && Date.now() - cache.at < CACHE_MS) return cache;
  if (!adminAvailable()) return { settings: DEFAULT_SETTINGS, flags: {} };
  const db = adminDb();
  const [s, f] = await Promise.all([db.collection("platform").doc("settings").get(), db.collection("platform").doc("flags").get()]);
  const stored = s.exists ? s.data() : {};
  cache = {
    at: Date.now(),
    settings: {
      ...DEFAULT_SETTINGS,
      ...stored,
      maintenance: { ...DEFAULT_SETTINGS.maintenance, ...(stored.maintenance || {}) },
      emailTemplates: {
        welcome: { ...DEFAULT_SETTINGS.emailTemplates.welcome, ...(stored.emailTemplates?.welcome || {}) },
        verify: { ...DEFAULT_SETTINGS.emailTemplates.verify, ...(stored.emailTemplates?.verify || {}) },
      },
    },
    flags: f.exists ? f.data() : {},
  };
  return cache;
}

export async function platformSettings() {
  try {
    return (await load()).settings;
  } catch (err) {
    // Settings that can't be read fall back to the defaults: the product keeps
    // working with signups open and no maintenance banner.
    console.error("[platform.settings]", err?.message || err);
    return DEFAULT_SETTINGS;
  }
}

export async function platformFlags() {
  try {
    return (await load()).flags;
  } catch (err) {
    console.error("[platform.flags]", err?.message || err);
    return {};
  }
}

/**
 * Is `feature` switched on for this organisation? Pure, so it is testable: a
 * per-organisation override wins over the global flag, and anything not set
 * is on.
 */
export function featureEnabled(flags, orgFlags, feature) {
  if (orgFlags && typeof orgFlags[feature] === "boolean") return orgFlags[feature];
  const global = flags?.[feature];
  if (global && typeof global.enabled === "boolean") return global.enabled;
  return true;
}

export const FLAGGABLE = Object.values(FEATURES);
