// The directories worth being on, and what each one demands.
//
// Client-safe: no server imports, no secrets.
//
// THESE FIELD LIMITS ARE CONFIGURATION, NOT FACT — the same warning that sits on
// the price table in aiModels.js, for the same reason. Directories change their
// forms without announcing it, and a stale limit here produces copy that gets
// truncated mid-sentence on someone else's website. Check a directory's live
// form before trusting its numbers, and fix them here rather than in a prompt.
//
// What this module is not: an auto-submitter. Almost none of these have a
// submission API, and the two or three that do gate it behind a partnership.
// MADBOT writes copy to each form's exact shape and tracks what has been sent
// where; a person pastes it in. Pretending otherwise would mean a queue of
// submissions that silently never happened.

export const LISTING_KIND = {
  DIRECTORY: "directory",
  REVIEW: "review",
  LAUNCH: "launch",
  REGISTRY: "registry",
};

export const DIRECTORIES = {
  product_hunt: {
    id: "product_hunt",
    name: "Product Hunt",
    kind: LISTING_KIND.LAUNCH,
    url: "https://www.producthunt.com",
    submitUrl: "https://www.producthunt.com/posts/new",
    free: true,
    // One shot. A launch can be scheduled and edited beforehand but not re-run,
    // so this is the one listing where "prepare, then wait" is the right advice
    // rather than "submit as soon as it is written".
    oneShot: true,
    dofollow: false,
    fields: {
      tagline: { max: 60, label: "Tagline", required: true },
      description: { max: 260, label: "Description", required: true },
      firstComment: { max: 2000, label: "Maker's first comment", required: false },
    },
    assets: ["Logo 240×240", "Gallery images 1270×760", "Optional demo video"],
    note: "Launches on the day you pick and cannot be re-launched. Write the maker's comment — it does more work than the description.",
  },

  g2: {
    id: "g2",
    name: "G2",
    kind: LISTING_KIND.REVIEW,
    url: "https://www.g2.com",
    submitUrl: "https://sell.g2.com/products/new",
    free: true,
    dofollow: false,
    // The listing is the easy half. G2 ranks on review volume and recency, so a
    // profile with no reviews is a page nobody sees.
    needsReviews: true,
    fields: {
      tagline: { max: 100, label: "Short description", required: true },
      description: { max: 1000, label: "Full description", required: true },
      categories: { max: 3, label: "Categories", required: true },
    },
    assets: ["Logo", "Screenshots", "Pricing page URL"],
    note: "Claiming the profile is free. Ranking needs reviews — plan how you will ask before you list.",
  },

  capterra: {
    id: "capterra",
    name: "Capterra",
    kind: LISTING_KIND.REVIEW,
    url: "https://www.capterra.com",
    submitUrl: "https://www.capterra.com/vendors",
    free: true,
    dofollow: false,
    needsReviews: true,
    // One submission propagates to the whole Gartner family, which is the main
    // reason to bother with a form this long.
    syndicatesTo: ["GetApp", "Software Advice"],
    fields: {
      tagline: { max: 120, label: "Tagline", required: true },
      description: { max: 2000, label: "Description", required: true },
      features: { max: 20, label: "Feature list", required: false },
    },
    assets: ["Logo 200×200", "At least 3 screenshots"],
    note: "One listing reaches GetApp and Software Advice too. Worth the long form for that alone.",
  },

  alternativeto: {
    id: "alternativeto",
    name: "AlternativeTo",
    kind: LISTING_KIND.DIRECTORY,
    url: "https://alternativeto.net",
    submitUrl: "https://alternativeto.net/manage/add-app/",
    free: true,
    dofollow: true,
    fields: {
      tagline: { max: 100, label: "Short description", required: true },
      description: { max: 1500, label: "Description", required: true },
    },
    assets: ["Icon", "Screenshots"],
    // The whole site is built on the comparison query, which is the query a
    // buyer types when they are ready to switch.
    note: "Ranks for 'alternative to <competitor>'. Name the competitors you genuinely displace.",
  },

  saashub: {
    id: "saashub",
    name: "SaaSHub",
    kind: LISTING_KIND.DIRECTORY,
    url: "https://www.saashub.com",
    submitUrl: "https://www.saashub.com/submit",
    free: true,
    dofollow: true,
    fields: {
      tagline: { max: 80, label: "Tagline", required: true },
      description: { max: 1000, label: "Description", required: true },
    },
    assets: ["Logo"],
    note: "Quick to submit and gives a followed link.",
  },

  crunchbase: {
    id: "crunchbase",
    name: "Crunchbase",
    kind: LISTING_KIND.REGISTRY,
    url: "https://www.crunchbase.com",
    submitUrl: "https://www.crunchbase.com/add-new",
    free: true,
    dofollow: false,
    fields: {
      tagline: { max: 120, label: "Short description", required: true },
      description: { max: 2500, label: "Full description", required: true },
    },
    assets: ["Logo", "Founded date", "Headquarters"],
    // Worth doing for a reason that has nothing to do with traffic.
    note: "Read by answer engines and by anyone checking you are a real company. Low traffic, high trust.",
  },

  betalist: {
    id: "betalist",
    name: "BetaList",
    kind: LISTING_KIND.LAUNCH,
    url: "https://betalist.com",
    submitUrl: "https://betalist.com/submit",
    free: true,
    oneShot: true,
    dofollow: true,
    fields: {
      tagline: { max: 60, label: "Tagline", required: true },
      description: { max: 600, label: "Description", required: true },
    },
    assets: ["Logo", "One screenshot"],
    note: "Early-stage products only. Free submission waits weeks; paid skips the queue.",
  },

  theresanaiforthat: {
    id: "theresanaiforthat",
    name: "There's An AI For That",
    kind: LISTING_KIND.DIRECTORY,
    url: "https://theresanaiforthat.com",
    submitUrl: "https://theresanaiforthat.com/submit/",
    free: true,
    dofollow: true,
    // Only relevant to some customers, so the UI filters on this rather than
    // recommending an AI directory to a plumber.
    onlyIf: "ai",
    fields: {
      tagline: { max: 100, label: "Tagline", required: true },
      description: { max: 800, label: "Description", required: true },
    },
    assets: ["Logo", "Screenshot"],
    note: "Only if the product is genuinely AI-facing. Free listing is slow; paid is immediate.",
  },

  clutch: {
    id: "clutch",
    name: "Clutch",
    kind: LISTING_KIND.REVIEW,
    url: "https://clutch.co",
    submitUrl: "https://clutch.co/get-listed",
    free: true,
    dofollow: false,
    needsReviews: true,
    onlyIf: "agency",
    fields: {
      tagline: { max: 100, label: "Tagline", required: true },
      description: { max: 1200, label: "Description", required: true },
    },
    assets: ["Logo", "Minimum project size", "Hourly rate"],
    note: "For agencies and service businesses, not products. Reviews are verified by phone interview.",
  },
};

export const DIRECTORY_ORDER = [
  "product_hunt",
  "g2",
  "capterra",
  "alternativeto",
  "saashub",
  "crunchbase",
  "betalist",
  "theresanaiforthat",
  "clutch",
];

export const LISTING_STATUS = {
  NOT_STARTED: "not_started",
  DRAFTED: "drafted",
  SUBMITTED: "submitted",
  LIVE: "live",
  REJECTED: "rejected",
  SKIPPED: "skipped",
};

export function listingStatusStyle(status) {
  switch (status) {
    case LISTING_STATUS.LIVE:
      return { label: "Live", bg: "var(--color-accent-2-100)", fg: "var(--color-accent-2-800)" };
    case LISTING_STATUS.SUBMITTED:
      return { label: "Submitted", bg: "var(--color-accent-100)", fg: "var(--color-accent-800)" };
    case LISTING_STATUS.DRAFTED:
      return { label: "Copy ready", bg: "var(--color-neutral-200)", fg: "var(--color-neutral-800)" };
    case LISTING_STATUS.REJECTED:
      return { label: "Rejected", bg: "var(--color-accent-200)", fg: "var(--color-accent-900)" };
    case LISTING_STATUS.SKIPPED:
      return { label: "Skipped", bg: "var(--color-neutral-100)", fg: "var(--color-neutral-800)" };
    default:
      return { label: "Not started", bg: "var(--color-neutral-100)", fg: "var(--color-neutral-800)" };
  }
}

export function directoryById(id) {
  return DIRECTORIES[id] || null;
}

/**
 * The directories worth suggesting to one particular business.
 *
 * `onlyIf` keeps an AI-tools directory away from a business that sells
 * plumbing. Recommending all nine to everyone would make the screen look
 * thorough and be useless — and a rejected submission costs the customer
 * standing with that directory, not just time.
 */
export function relevantFor({ isAI = false, isAgency = false, isEarlyStage = false } = {}) {
  return DIRECTORY_ORDER.map((id) => DIRECTORIES[id]).filter((d) => {
    if (d.onlyIf === "ai" && !isAI) return false;
    if (d.onlyIf === "agency" && !isAgency) return false;
    // Not a hard filter: an established product submitted to BetaList is
    // rejected, so it is worth hiding rather than merely deprioritising.
    if (d.id === "betalist" && !isEarlyStage) return false;
    return true;
  });
}

/**
 * Everything wrong with a set of listing copy, per field. Same shape as the
 * social validator and used the same way — once when the copy is written, and
 * again before it is marked ready, because a person may have edited it between.
 */
export function validateListing(directoryId, copy = {}) {
  const dir = DIRECTORIES[directoryId];
  if (!dir) return [`${directoryId} is not a directory MADBOT knows.`];

  const problems = [];
  for (const [field, spec] of Object.entries(dir.fields)) {
    const value = copy[field];

    if (spec.required && !value) {
      problems.push(`${dir.name} requires ${spec.label.toLowerCase()}.`);
      continue;
    }
    if (!value) continue;

    // Categories and features are counted as items; everything else as text.
    if (Array.isArray(value)) {
      if (value.length > spec.max) problems.push(`${spec.label}: ${value.length} given, ${dir.name} allows ${spec.max}.`);
    } else if (String(value).length > spec.max) {
      problems.push(`${spec.label} is ${String(value).length - spec.max} characters over ${dir.name}'s ${spec.max} limit.`);
    }
  }
  return problems;
}

/** A rough ordering hint for which to do first, given nothing else to go on. */
export function priorityOf(directory) {
  if (directory.dofollow && directory.free) return 1;
  if (directory.kind === LISTING_KIND.REVIEW) return 2;
  if (directory.kind === LISTING_KIND.LAUNCH) return 3;
  return 4;
}
