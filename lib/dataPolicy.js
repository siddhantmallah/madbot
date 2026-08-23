// What MADBOT is allowed to collect, about whom, and for how long.
//
// The core distinction, and the reason the lead engine is ordered the way it
// is: data about a company is not data about a person. A company name, its
// domain, its certificate, its DNS records and its published pricing are
// commercial facts. A named employee's email address is personal data, and
// processing it engages GDPR/UK GDPR whether or not it was easy to find.
//
// Three levels, with different rules, because treating them the same means
// either over-restricting harmless company research or under-protecting real
// people. Everything here is client-safe so the dashboard can show the same
// policy the server enforces.

export const LEVELS = {
  COMPANY: "company",
  ROLE_INBOX: "roleInbox",
  NAMED_PERSON: "namedPerson",
};

export const LEVEL_META = {
  [LEVELS.COMPANY]: {
    order: 1,
    label: "Company intelligence",
    personalData: false,
    examples: [
      "Company name, domain and sector",
      "Website content and technology",
      "TLS certificate, DNS and mail records",
      "Published pricing and job listings",
      "Public business registry entries",
    ],
    why: "Commercial facts about an organisation. Not personal data, so data-protection law is not engaged.",
  },
  [LEVELS.ROLE_INBOX]: {
    order: 2,
    label: "Business contact",
    // A generic inbox usually reaches a function rather than an individual, but
    // it is not automatically outside scope — a one-person company's info@ is
    // that person. Treated as personal data by default, which is the safe
    // reading rather than the convenient one.
    personalData: "sometimes",
    examples: ["hello@, info@, sales@, support@, security@"],
    why: "Reaches a function rather than a named individual — but at a very small company it may still identify someone, so it is treated as personal data by default.",
  },
  [LEVELS.NAMED_PERSON]: {
    order: 3,
    label: "Named individual",
    personalData: true,
    examples: ["A person's name, role, direct email, phone or profile"],
    why: "Personal data. Requires a lawful basis, transparency about where it came from, accuracy, a retention limit, and respect for any objection.",
  },
};

// What a policy can say about a level.
export const DECISIONS = {
  ALLOWED: "allowed",
  REVIEW: "review",
  NEVER: "never",
};

// Jurisdictions we distinguish, because the answer genuinely differs. Anything
// unrecognised is treated as EU/UK — the strictest option, so an unknown
// jurisdiction fails safe rather than permissively.
export const JURISDICTIONS = {
  EU: { label: "EU / EEA", regime: "GDPR", strict: true },
  UK: { label: "United Kingdom", regime: "UK GDPR", strict: true },
  US: { label: "United States", regime: "CAN-SPAM / state laws", strict: false },
  IN: { label: "India", regime: "DPDP Act", strict: true },
  CA: { label: "Canada", regime: "PIPEDA / CASL", strict: true },
  OTHER: { label: "Elsewhere", regime: "treated as GDPR", strict: true },
};

/**
 * The default policy. Deliberately conservative: company research runs freely,
 * anything touching a named individual goes to a human, and special-category
 * data is never collected at all — there is no legitimate-interest route to
 * health, religion, politics or the rest for cold sales, so the honest setting
 * is off with no toggle.
 */
export const DEFAULT_POLICY = {
  version: 1,
  levels: {
    [LEVELS.COMPANY]: { EU: DECISIONS.ALLOWED, UK: DECISIONS.ALLOWED, US: DECISIONS.ALLOWED, IN: DECISIONS.ALLOWED, CA: DECISIONS.ALLOWED, OTHER: DECISIONS.ALLOWED },
    [LEVELS.ROLE_INBOX]: { EU: DECISIONS.ALLOWED, UK: DECISIONS.ALLOWED, US: DECISIONS.ALLOWED, IN: DECISIONS.ALLOWED, CA: DECISIONS.REVIEW, OTHER: DECISIONS.REVIEW },
    [LEVELS.NAMED_PERSON]: { EU: DECISIONS.REVIEW, UK: DECISIONS.REVIEW, US: DECISIONS.REVIEW, IN: DECISIONS.REVIEW, CA: DECISIONS.NEVER, OTHER: DECISIONS.REVIEW },
  },
  // Not configurable. There is no lawful basis for collecting these for cold
  // outreach, so offering a switch would imply otherwise.
  specialCategory: DECISIONS.NEVER,
  automatedProfiling: DECISIONS.REVIEW,
  automatedOutreach: DECISIONS.REVIEW,
  retentionDays: {
    // A lead nobody acted on stops being useful long before it stops being a
    // liability.
    active: 90,
    rejected: 30,
    // A record that someone objected has to outlive the data it refers to —
    // deleting it would mean contacting them again.
    suppression: null,
  },
};

/**
 * Where a company sits, inferred from what's observable. Returns OTHER rather
 * than guessing when nothing indicates a country, and OTHER is strict.
 */
export function jurisdictionFor({ domain, registryCountry }) {
  if (registryCountry) {
    const c = registryCountry.toUpperCase();
    if (c === "GB" || c === "UK") return "UK";
    if (c === "US") return "US";
    if (c === "IN") return "IN";
    if (c === "CA") return "CA";
    if (EU_COUNTRIES.includes(c)) return "EU";
  }
  const tld = String(domain || "").toLowerCase().split(".").pop();
  if (tld === "uk") return "UK";
  if (tld === "in") return "IN";
  if (tld === "ca") return "CA";
  if (tld === "us") return "US";
  if (EU_TLDS.includes(tld)) return "EU";
  return "OTHER";
}

const EU_COUNTRIES = ["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE","IS","LI","NO"];
const EU_TLDS = ["eu","de","fr","nl","be","it","es","pt","ie","at","dk","se","fi","pl","cz","ro","gr","hu","sk","si","hr","bg","lt","lv","ee","lu","mt","cy","no","is"];

/**
 * May this level of data be collected for this company, under this policy?
 *
 * Returns the decision plus the reasoning, so a refusal or a review request can
 * explain itself rather than just blocking.
 */
export function policyCheck({ level, jurisdiction, policy = DEFAULT_POLICY }) {
  const j = JURISDICTIONS[jurisdiction] ? jurisdiction : "OTHER";
  const decision = policy.levels?.[level]?.[j] || DECISIONS.REVIEW;
  const meta = LEVEL_META[level];

  return {
    level,
    jurisdiction: j,
    decision,
    allowed: decision === DECISIONS.ALLOWED,
    needsReview: decision === DECISIONS.REVIEW,
    forbidden: decision === DECISIONS.NEVER,
    regime: JURISDICTIONS[j].regime,
    personalData: meta?.personalData ?? true,
    reason:
      decision === DECISIONS.NEVER
        ? `${meta?.label} is switched off for ${JURISDICTIONS[j].label}.`
        : decision === DECISIONS.REVIEW
        ? `${meta?.label} in ${JURISDICTIONS[j].label} needs a person to approve it under ${JURISDICTIONS[j].regime}.`
        : `${meta?.label} is permitted for ${JURISDICTIONS[j].label}.`,
  };
}

/**
 * The lawful basis being relied on, stated explicitly rather than assumed.
 *
 * For B2B prospecting this is legitimate interests, which is a real basis but
 * not a blank cheque: it requires the interest to be balanced against the
 * person's rights, and it grants an absolute right to object. Recording it means
 * the customer can answer the question if it's ever asked.
 */
export function lawfulBasisFor({ level, jurisdiction }) {
  if (level === LEVELS.COMPANY) {
    return {
      basis: "not-personal-data",
      note: "Information about an organisation rather than an identified person, so no lawful basis is required.",
      objectionRight: false,
    };
  }
  const strict = JURISDICTIONS[jurisdiction]?.strict;
  return {
    basis: "legitimate-interests",
    note: strict
      ? `Business-to-business contact under ${JURISDICTIONS[jurisdiction]?.regime}. Balanced against the recipient's interests, limited to their professional capacity, and subject to an absolute right to object.`
      : `Business-to-business contact. Every message must identify the sender and offer a way to stop.`,
    objectionRight: true,
    // The three things legitimate interests actually requires you to have
    // thought about, recorded so the answer exists before anyone asks.
    balancingTest: {
      purpose: "Contacting an organisation about a product relevant to its publicly observable circumstances.",
      necessity: "Only a role inbox or a single named contact is used, and only after the company itself qualified.",
      safeguards: "No special-category data, no profiling of individuals, retention limited, objection honoured immediately and permanently.",
    },
  };
}

/**
 * When this record must be gone. Storage limitation is not advisory — holding
 * prospect data indefinitely is a breach on its own, regardless of how it was
 * collected.
 */
export function retentionFor({ status, policy = DEFAULT_POLICY, from = new Date() }) {
  const days =
    status === "rejected" || status === "declined"
      ? policy.retentionDays.rejected
      : status === "suppressed"
      ? policy.retentionDays.suppression
      : policy.retentionDays.active;

  if (days === null) return { retentionUntil: null, days: null, note: "Kept indefinitely: a record of an objection has to outlive the data it refers to." };

  const until = new Date(from.getTime() + days * 86400000);
  return {
    retentionUntil: until.toISOString(),
    days,
    note: `Deleted automatically after ${days} days unless something happens with it.`,
  };
}

/**
 * The full record attached to every lead. The point is that
 * "why do we have this?" has an answer that was written down at collection
 * time, rather than reconstructed later from memory.
 */
export function buildProvenance({
  level,
  domain,
  source,
  sourceUrl,
  registryCountry = null,
  enrichmentSource = null,
  status = "active",
  policy = DEFAULT_POLICY,
  collectedAt = new Date(),
}) {
  const jurisdiction = jurisdictionFor({ domain, registryCountry });
  const check = policyCheck({ level, jurisdiction, policy });
  const basis = lawfulBasisFor({ level, jurisdiction });
  const retention = retentionFor({ status, policy, from: collectedAt });

  return {
    level,
    jurisdiction,
    regime: check.regime,
    personalData: check.personalData,
    source,
    sourceUrl: sourceUrl || null,
    // null means MADBOT observed it directly; a value means a third party
    // supplied it, which is a materially different answer to give someone.
    enrichmentSource,
    collectedAt: collectedAt.toISOString(),
    lastVerifiedAt: collectedAt.toISOString(),
    lawfulBasis: basis.basis,
    lawfulBasisNote: basis.note,
    balancingTest: basis.basis === "legitimate-interests" ? basis.balancingTest : null,
    objectionRight: basis.objectionRight,
    consentStatus: "not-required",
    optOutStatus: "none",
    retentionUntil: retention.retentionUntil,
    retentionNote: retention.note,
    policyVersion: policy.version,
  };
}

/**
 * The plain-English answer to "why do we have this?", assembled from the record
 * rather than written by hand — so it cannot drift from what was actually
 * recorded.
 */
export function explainProvenance(p) {
  if (!p) return ["No provenance was recorded for this. Treat it as unverified."];
  const lines = [];
  const when = p.collectedAt ? new Date(p.collectedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "an unrecorded date";

  if (p.enrichmentSource) lines.push(`Obtained from ${p.enrichmentSource} on ${when}.`);
  else if (p.sourceUrl) lines.push(`Collected from ${p.sourceUrl} on ${when}.`);
  else lines.push(`${p.source || "Observed"} on ${when}.`);

  lines.push(
    p.personalData === false
      ? "This is information about an organisation, not an identified person, so no lawful basis is required."
      : p.lawfulBasisNote
  );

  if (p.retentionUntil) {
    lines.push(`It will be deleted automatically on ${new Date(p.retentionUntil).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}.`);
  } else if (p.optOutStatus === "objected") {
    lines.push("Only a suppression record is kept, so this contact is never approached again.");
  }

  if (p.objectionRight) lines.push("If they object, contact stops immediately and permanently.");
  return lines;
}
