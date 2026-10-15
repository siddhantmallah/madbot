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
    for: ["services"],
    fields: {
      tagline: { max: 100, label: "Tagline", required: true },
      description: { max: 1200, label: "Description", required: true },
    },
    assets: ["Logo", "Minimum project size", "Hourly rate"],
    note: "For agencies and service businesses, not products. Reviews are verified by phone interview.",
  },
  // ---------------------------------------------------------------------------
  // Local and industry directories (added 2026-10-15). Researched against each
  // directory's own help pages; a limit marked `confirmed: false` is one the
  // directory doesn't publish, so the copy is kept deliberately short and the
  // screen says so. `for` decides which businesses see it (relevantFor).
  // ---------------------------------------------------------------------------

  google_business: {
    id: "google_business",
    name: "Google Business Profile",
    kind: LISTING_KIND.DIRECTORY,
    url: "https://www.google.com/business/",
    submitUrl: "https://business.google.com/create",
    free: true,
    dofollow: false,
    for: ["local", "services", "products"],
    // https://support.google.com/business/answer/3039617 (750 characters, primary
    // category plus up to 9 more) and /answer/3038177 (the content rules).
    fields: {
      description: { max: 750, label: "From the business (description)", required: true },
      categories: { max: 10, label: "Categories (first is the primary)", required: true },
    },
    rules: [
      "No links of any kind and no HTML in the description.",
      "Don't lead with promotions, prices or sales.",
      "Categories say what the business is, not what it has; use as few as describe it.",
      "The business name must be your real-world name: no taglines, locations or keywords added.",
    ],
    assets: ["Exact business name as on your signage", "Address or service area", "Opening hours", "Photos"],
    note: "The most important local listing there is: it's what shows on Google Maps and in local results. Needs an address or a service area you serve in person.",
  },

  bing_places: {
    id: "bing_places",
    name: "Bing Places",
    kind: LISTING_KIND.DIRECTORY,
    url: "https://www.bing.com/forbusiness",
    submitUrl: "https://www.bing.com/forbusiness",
    free: true,
    dofollow: false,
    for: ["local", "services", "products"],
    fields: {
      description: { max: 750, label: "Description", required: true, confirmed: false },
    },
    assets: ["Address or service area", "Opening hours"],
    note: "Can import your Google Business Profile directly, so set that up first. Bing doesn't publish a description limit; this is kept to Google's 750.",
  },

  apple_business: {
    id: "apple_business",
    name: "Apple Business",
    kind: LISTING_KIND.DIRECTORY,
    url: "https://businessconnect.apple.com",
    submitUrl: "https://businessconnect.apple.com",
    free: true,
    dofollow: false,
    for: ["local"],
    fields: {
      description: { max: 500, label: "About", required: true, confirmed: false },
    },
    rules: ["The display name must match your storefront or website: no descriptions, symbols or brackets."],
    assets: ["Exact business name", "Address", "Opening hours", "Photos"],
    note: "How you appear in Apple Maps and Siri (formerly Business Connect). For a business with a physical location. Apple doesn't publish an About limit; kept short.",
  },

  facebook_page: {
    id: "facebook_page",
    name: "Facebook Page",
    kind: LISTING_KIND.DIRECTORY,
    url: "https://www.facebook.com/pages/create",
    submitUrl: "https://www.facebook.com/pages/create",
    free: true,
    dofollow: false,
    for: ["local", "services", "products", "software", "other"],
    fields: {
      bio: { max: 100, label: "Bio (intro)", required: true, confirmed: false },
    },
    rules: ["The Page name can't carry a tagline or description; that belongs in the bio."],
    assets: ["Profile picture", "Cover photo"],
    note: "Free, and where many people check a business is real. Facebook doesn't state a bio limit on its help pages; kept to 100 characters.",
  },

  linkedin_page: {
    id: "linkedin_page",
    name: "LinkedIn Page",
    kind: LISTING_KIND.DIRECTORY,
    url: "https://www.linkedin.com",
    submitUrl: "https://www.linkedin.com/company/setup/new/",
    free: true,
    dofollow: false,
    for: ["services", "products", "software", "other"],
    fields: {
      tagline: { max: 120, label: "Tagline", required: true, confirmed: false },
      overview: { max: 2000, label: "Overview", required: true, confirmed: false },
    },
    assets: ["Logo", "Cover image", "Industry", "Company size"],
    note: "Where B2B buyers and candidates look you up. The 120 and 2,000 limits come from LinkedIn Learning, not LinkedIn's Help Center.",
  },

  justdial: {
    id: "justdial",
    name: "Justdial",
    kind: LISTING_KIND.DIRECTORY,
    url: "https://www.justdial.com",
    submitUrl: "https://www.justdial.com/Free-Listing",
    free: true,
    dofollow: false,
    country: "IN",
    for: ["local", "services"],
    fields: {
      description: { max: 750, label: "About the business", required: true, confirmed: false },
      categories: { max: 5, label: "Categories", required: true, confirmed: false },
    },
    assets: ["Address", "Phone number", "Opening hours", "Photos"],
    note: "India's largest local search directory; the free listing is enough to be found. Justdial doesn't publish its form limits; copy is kept short.",
  },

  sulekha: {
    id: "sulekha",
    name: "Sulekha",
    kind: LISTING_KIND.DIRECTORY,
    url: "https://www.sulekha.com",
    submitUrl: "https://www.sulekha.com/list-your-business",
    free: true,
    dofollow: false,
    country: "IN",
    for: ["local", "services"],
    fields: {
      description: { max: 750, label: "About the business", required: true, confirmed: false },
    },
    assets: ["Services offered", "Areas served", "Phone number"],
    note: "Strong for local services in India: home services, tutors, events, repairs. Sulekha doesn't publish its form limits; copy is kept short.",
  },

  indiamart: {
    id: "indiamart",
    name: "IndiaMART",
    kind: LISTING_KIND.DIRECTORY,
    url: "https://www.indiamart.com",
    submitUrl: "https://seller.indiamart.com",
    free: true,
    dofollow: false,
    country: "IN",
    for: ["products"],
    fields: {
      description: { max: 750, label: "Company description", required: true, confirmed: false },
      categories: { max: 10, label: "Products you sell", required: true, confirmed: false },
    },
    assets: ["GST number (for a verified seller badge)", "Product photos", "Product specifications"],
    note: "India's biggest B2B marketplace, for manufacturers, wholesalers and traders. Products are reviewed within about 24 hours. IndiaMART doesn't publish its form limits; copy is kept short.",
  },

  tradeindia: {
    id: "tradeindia",
    name: "TradeIndia",
    kind: LISTING_KIND.DIRECTORY,
    url: "https://www.tradeindia.com",
    submitUrl: "https://www.tradeindia.com/join_now/verification.html",
    free: true,
    dofollow: false,
    country: "IN",
    for: ["products"],
    fields: {
      description: { max: 750, label: "Company description", required: true, confirmed: false },
      categories: { max: 10, label: "Products you sell", required: true, confirmed: false },
    },
    assets: ["Product photos", "Product specifications"],
    note: "B2B marketplace for Indian manufacturers and exporters. Check the free tier when you sign up; TradeIndia's free listing terms weren't confirmed. Limits not published; copy kept short.",
  },

  exportersindia: {
    id: "exportersindia",
    name: "ExportersIndia",
    kind: LISTING_KIND.DIRECTORY,
    url: "https://www.exportersindia.com",
    submitUrl: "https://www.exportersindia.com/register-business-online",
    free: true,
    dofollow: false,
    country: "IN",
    for: ["products"],
    fields: {
      description: { max: 750, label: "Company description", required: true, confirmed: false },
      categories: { max: 10, label: "Products you sell", required: true, confirmed: false },
    },
    assets: ["At least one product or service", "Product photos"],
    note: "For Indian businesses selling to buyers abroad. Registration is free and needs at least one product. Limits not published; copy kept short.",
  },

  yelp: {
    id: "yelp",
    name: "Yelp",
    kind: LISTING_KIND.REVIEW,
    url: "https://biz.yelp.com",
    submitUrl: "https://biz.yelp.com/claim",
    free: true,
    dofollow: false,
    needsReviews: true,
    notCountry: "IN",
    for: ["local"],
    // https://biz.yelp.com/support-center/article/What-are-the-guidelines-for-the-From-the-Business-information
    fields: {
      specialties: { max: 1500, label: "Specialties", required: true },
      history: { max: 1000, label: "History", required: false },
    },
    rules: ["Edits go live at once but moderators can reject them later.", "No keyword lists."],
    assets: ["Photos", "Opening hours"],
    note: "The local review site that matters in the US and some other markets; not used in India.",
  },

  trustpilot: {
    id: "trustpilot",
    name: "Trustpilot",
    kind: LISTING_KIND.REVIEW,
    url: "https://business.trustpilot.com",
    submitUrl: "https://business.trustpilot.com/signup",
    free: true,
    dofollow: false,
    needsReviews: true,
    for: ["products", "software"],
    fields: {
      description: { max: 500, label: "Company description", required: true, confirmed: false },
    },
    rules: ["The description must be accurate and not misleading, and the name must match your business."],
    assets: ["Logo", "Website address"],
    note: "Reviews buyers check before paying an online business, strongest in the UK and Europe. Claiming the profile is free; ranking needs reviews. Trustpilot doesn't publish a description limit; kept short.",
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
  "google_business",
  "bing_places",
  "apple_business",
  "facebook_page",
  "linkedin_page",
  "justdial",
  "sulekha",
  "indiamart",
  "tradeindia",
  "exportersindia",
  "yelp",
  "trustpilot",
];

// The software directories above (Product Hunt to Clutch) carry no `for`; they
// suit software products only.
const SOFTWARE_ONLY = new Set(["product_hunt", "g2", "capterra", "alternativeto", "saashub", "crunchbase", "betalist", "theresanaiforthat"]);

/**
 * What kind of business a site is, for choosing directories, from what the
 * crawl found: its category, its locations, its currency and its domain.
 * Returns { type, country } where type is one of local, services, products,
 * software or other.
 */
export function businessKind(site) {
  const intel = site?.intelligence || {};
  const category = String(intel.business?.category || "").toLowerCase();
  const text = `${intel.business?.name || ""} ${intel.business?.category || ""} ${intel.business?.description || site?.description || ""}`.toLowerCase();
  const type = /local business/.test(category)
    ? "local"
    : /software|saas/.test(category) || /\b(saas|software|app|platform|api)\b/.test(text)
    ? "software"
    : /products|e-commerce/.test(category)
    ? "products"
    : /services/.test(category)
    ? "services"
    : "other";
  const domain = String(intel.domain || site?.url || "");
  const prices = (intel.commercial?.prices || []).join(" ");
  const indianCities = /\b(mumbai|delhi|bangalore|bengaluru|hyderabad|chennai|pune|kolkata|ahmedabad)\b/i;
  const india =
    /\.in(\/|$)/i.test(domain) || /₹|\bRs\.?|\bINR\b/.test(prices) || (intel.geography?.locations || []).some((c) => indianCities.test(c));
  return { type, country: india ? "IN" : null };
}

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
export function relevantFor({ isAI = false, isAgency = false, isEarlyStage = false, type = null, country = null } = {}) {
  return DIRECTORY_ORDER.map((id) => DIRECTORIES[id]).filter((d) => {
    // Software directories for software; the rest by the kinds of business
    // they serve. With no type known (an old site, no crawl), only the
    // software set shows, as it always did.
    if (type) {
      if (SOFTWARE_ONLY.has(d.id) && type !== "software") return false;
      if (d.for && !d.for.includes(type)) return false;
    } else if (d.for && !SOFTWARE_ONLY.has(d.id) && d.id !== "clutch") {
      return false;
    }
    if (d.country && d.country !== country) return false;
    if (d.notCountry && d.notCountry === country) return false;
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

    // An empty array is truthy, so a required list field with nothing in it
    // used to pass. G2 requires a category and rejects submissions without
    // one, so the copy was marked ready and the customer found out on G2.
    const empty = value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
    if (spec.required && empty) {
      problems.push(`${dir.name} requires ${spec.label.toLowerCase()}.`);
      continue;
    }
    if (empty) continue;

    // Categories and features are counted as items; everything else as text.
    if (Array.isArray(value)) {
      if (value.length > spec.max) problems.push(`${spec.label}: ${value.length} given, ${dir.name} allows ${spec.max}.`);
    } else if (String(value).length > spec.max) {
      const over = String(value).length - spec.max;
      problems.push(`${spec.label} is ${over} ${over === 1 ? "character" : "characters"} over ${dir.name}'s ${spec.max} limit.`);
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
