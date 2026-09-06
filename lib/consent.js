// Cookie and storage consent, decided by where the visitor is.
//
// Three things had to be true for this to be worth building rather than
// pasting a banner in:
//
// 1. The inventory below is the real one. Every entry is something the code
//    actually writes, verifiable by grepping for its key. Nothing is listed
//    "just in case", and a category with no entries says so on screen rather
//    than implying tracking that isn't happening.
// 2. The consent model follows the visitor's law, not the strictest one
//    everywhere. An opt-in wall shown to someone in California is not
//    compliance, it is a worse product for no legal gain.
// 3. Refusing has to actually do something. `allows()` is the single gate
//    every non-essential script must pass through, so a rejection is enforced
//    in code rather than recorded and ignored.
//
// Client-safe. No server imports.

export const CONSENT_VERSION = 2;
export const STORAGE_KEY = "madbot-consent";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const CATEGORIES = {
  NECESSARY: "necessary",
  PREFERENCES: "preferences",
  ANALYTICS: "analytics",
  MARKETING: "marketing",
};

/**
 * What MADBOT actually stores in a browser, category by category.
 *
 * `items` is the truth. If you add a script that writes anything, add it here
 * in the same commit — the Cookie Policy page and the preferences panel both
 * render straight from this object, so an omission here is a false statement
 * published on the site.
 */
export const INVENTORY = {
  [CATEGORIES.NECESSARY]: {
    label: "Strictly necessary",
    description:
      "Keeps you signed in and remembers the choices you make on this banner. The site cannot work without these, so they are not optional and no consent is required for them.",
    required: true,
    items: [
      {
        key: "firebase:authUser:*",
        kind: "Local storage / IndexedDB",
        purpose: "Keeps you signed in between visits.",
        retention: "Until you sign out",
        party: "Firebase Authentication (Google)",
      },
      {
        key: STORAGE_KEY,
        kind: "Local storage",
        purpose: "Remembers your answer to this banner so you are not asked again.",
        retention: "12 months",
        party: "MADBOT",
      },
    ],
  },

  [CATEGORIES.PREFERENCES]: {
    label: "Preferences",
    description:
      "Remembers how you like the site set up. Refusing these costs you nothing except having to set them again each visit.",
    required: false,
    items: [
      {
        key: "madbot-theme",
        kind: "Local storage",
        purpose: "Remembers light or dark mode.",
        retention: "Until cleared",
        party: "MADBOT",
      },
      {
        key: "madbot-region",
        kind: "Local storage",
        purpose: "Remembers which currency you asked to see prices in.",
        retention: "Until cleared",
        party: "MADBOT",
      },
    ],
  },

  [CATEGORIES.ANALYTICS]: {
    label: "Analytics",
    description:
      "Measuring how the site is used, so it can be improved. MADBOT does not currently run any analytics — this category exists so that if one is ever added, it is switched off until you say otherwise.",
    required: false,
    // Empty on purpose. See the note at the top of this file: listing a vendor
    // that is not loaded would be a false disclosure, and adding one later
    // without listing it here would be a worse one.
    items: [],
  },

  [CATEGORIES.MARKETING]: {
    label: "Advertising",
    description:
      "Building a profile of you to target advertising, on this site or elsewhere. MADBOT does not do this, and has no plans to. The category is listed so the answer is on the record.",
    required: false,
    items: [],
  },
};

export const CATEGORY_ORDER = [
  CATEGORIES.NECESSARY,
  CATEGORIES.PREFERENCES,
  CATEGORIES.ANALYTICS,
  CATEGORIES.MARKETING,
];

/** Categories that currently have anything in them. */
export function activeCategories() {
  return CATEGORY_ORDER.filter((c) => INVENTORY[c].items.length > 0);
}

/** True when nothing beyond strictly-necessary storage is in use. */
export function onlyNecessaryInUse() {
  return CATEGORY_ORDER.filter((c) => c !== CATEGORIES.NECESSARY).every(
    (c) => INVENTORY[c].items.length === 0
  );
}

// ---------------------------------------------------------------------------
// Consent models by jurisdiction
// ---------------------------------------------------------------------------

// OPT_IN     nothing non-essential may run until the visitor agrees, refusing
//            must be as easy as agreeing, and silence is not consent.
// OPT_OUT    non-essential may run, but the visitor must be told and given a
//            standing, easy way to stop it — including an automated browser
//            signal.
// NOTICE     disclosure required, consent not required for ordinary analytics.
export const MODELS = {
  OPT_IN: "optIn",
  OPT_OUT: "optOut",
  NOTICE: "notice",
};

// EEA. ePrivacy Directive Article 5(3) puts consent on the *storage*, whatever
// the data is, which is why this is stricter than GDPR alone.
const EEA = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "IS", "LI", "NO",
];

// Elsewhere with a prior-consent rule of its own.
const OPT_IN_ELSEWHERE = [
  "GB", // UK GDPR + PECR
  "CH", // revFADP
  "BR", // LGPD
  "ZA", // POPIA
  "TR", // KVKK
  "KR", // PIPA — among the strictest anywhere
  "TH", // PDPA
  "AE", // UAE PDPL (federal), plus DIFC and ADGM regimes
  "SA", // Saudi PDPL
  "QA", "BH", "OM", "KW", // GCC, consent-based
  "IN", // DPDP Act 2023: notice and consent, with a right to withdraw
  "NG", "KE", // NDPA, Kenya DPA
  "CA", // PIPEDA, and Quebec Law 25 which is stricter still
];

// Disclosure-and-refuse rather than prior consent.
const OPT_OUT = [
  "US", // CPRA/VCDPA/CPA/CTDPA/UCPA and the rest; GPC must be honoured
  "JP", // APPI
  "SG", // PDPA — deemed consent with a withdrawal right
  "AU", "NZ", // Privacy Act 1988, Privacy Act 2020
  "MY", "ID", "PH", "VN", // PDPA, PDP Law, DPA, PDPD
  "IL", "MX", "CL", "AR",
];

/**
 * Which model applies to a visitor in this country.
 *
 * An unknown or missing country gets OPT_IN. That fails safe: the cost of
 * asking someone who did not need to be asked is a click, and the cost of not
 * asking someone who did is a regulator.
 */
export function modelFor(country) {
  if (!country) return MODELS.OPT_IN;
  const c = String(country).toUpperCase();
  if (EEA.includes(c) || OPT_IN_ELSEWHERE.includes(c)) return MODELS.OPT_IN;
  if (OPT_OUT.includes(c)) return MODELS.OPT_OUT;
  return MODELS.OPT_IN;
}

/** The framework to name on screen, so the notice says why it is being shown. */
export function regimeFor(country) {
  const c = String(country || "").toUpperCase();
  if (EEA.includes(c)) return "the GDPR and the ePrivacy Directive";
  if (c === "GB") return "the UK GDPR and PECR";
  if (c === "CH") return "the Swiss Federal Act on Data Protection";
  if (c === "IN") return "the Digital Personal Data Protection Act, 2023";
  if (c === "AE") return "the UAE Personal Data Protection Law";
  if (c === "SA") return "the Saudi Personal Data Protection Law";
  if (c === "BR") return "the LGPD";
  if (c === "CA") return "PIPEDA";
  if (c === "US") return "US state privacy laws";
  if (c === "SG") return "the Singapore PDPA";
  if (c === "JP") return "the APPI";
  if (c === "AU") return "the Privacy Act 1988";
  return "applicable data protection law";
}

// ---------------------------------------------------------------------------
// The stored decision
// ---------------------------------------------------------------------------

function defaults(model) {
  // Under opt-out the optional categories start on, because the law permits it
  // and the visitor can switch them off. Under opt-in they start off.
  const on = model === MODELS.OPT_OUT;
  return {
    [CATEGORIES.NECESSARY]: true,
    [CATEGORIES.PREFERENCES]: on,
    [CATEGORIES.ANALYTICS]: on,
    [CATEGORIES.MARKETING]: false, // never on by default, in any jurisdiction
  };
}

/**
 * Global Privacy Control. A browser sending this is making a legally
 * recognised opt-out request in California, Colorado and Connecticut among
 * others, so it is honoured before any banner is shown and it overrides an
 * opt-out default.
 */
export function globalPrivacyControl() {
  if (typeof navigator === "undefined") return false;
  return navigator.globalPrivacyControl === true;
}

export function readConsent() {
  if (typeof window === "undefined") return null;
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private window or storage blocked. Treated as "not asked yet", which
    // means nothing optional runs.
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    // A change to the inventory or the categories invalidates an old answer —
    // consent has to be to something specific to mean anything.
    if (parsed?.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeConsent({ choices, model, country, method }) {
  const record = {
    version: CONSENT_VERSION,
    choices: { ...choices, [CATEGORIES.NECESSARY]: true },
    model,
    country: country || null,
    // How the answer was given, kept because "consent" that was never actually
    // given is the thing an audit looks for.
    method, // "accept-all" | "reject-all" | "saved-preferences" | "gpc"
    at: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Nothing to do; the banner will ask again next visit, which is the safe
    // failure.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("madbot:consent", { detail: record }));
  }
  return record;
}

export function clearConsent() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing stored, nothing to clear */
  }
}

/**
 * The one gate. Any code that writes non-essential storage or loads a
 * third-party script must call this first and do nothing when it returns false.
 *
 *   if (allows(CATEGORIES.ANALYTICS)) loadAnalytics();
 *
 * Defaults to false when no answer has been recorded, so a script added
 * without a consent check fails closed rather than open.
 */
export function allows(category) {
  if (category === CATEGORIES.NECESSARY) return true;
  if (globalPrivacyControl() && category !== CATEGORIES.PREFERENCES) return false;
  const stored = readConsent();
  if (!stored) return false;
  return stored.choices?.[category] === true;
}

/** The state a banner should open in for this visitor. */
export function initialChoices(country) {
  const model = modelFor(country);
  if (globalPrivacyControl()) {
    return { ...defaults(MODELS.OPT_IN), [CATEGORIES.PREFERENCES]: true };
  }
  return defaults(model);
}

export function allOn() {
  return CATEGORY_ORDER.reduce((acc, c) => ({ ...acc, [c]: true }), {});
}

export function allOff() {
  return CATEGORY_ORDER.reduce(
    (acc, c) => ({ ...acc, [c]: c === CATEGORIES.NECESSARY }),
    {}
  );
}
