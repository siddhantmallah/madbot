// What each social network will actually accept, and what MADBOT is allowed to
// do with it.
//
// Client-safe: no server imports, no secrets. The dashboard reads this to render
// character counters and connection state, and the publishers import the same
// constants, so a limit can't say one thing in the composer and another at the
// moment of posting.
//
// The constraints below are the ones that break a post rather than merely
// shorten it. Instagram refusing text-only posts is the sharpest: a pipeline
// that treats every network as "text with a length cap" produces Instagram
// drafts that can never be published, and you find out at publish time.

export const NETWORKS = {
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    // The documented ugcPost limit. Posts run long here and long posts do well,
    // so this is a real ceiling rather than a style guide.
    maxChars: 3000,
    // Where the post lands. Organisation pages need the customer to grant the
    // app an admin role on the page; a personal profile only needs the sign-in.
    targets: ["organization", "member"],
    imageRequired: false,
    imageSupported: true,
    maxImages: 9,
    // LinkedIn's own guidance, and it matches what performs: a wall of tags
    // reads as spam to both the ranker and the reader.
    hashtags: { max: 5, advised: 3 },
    // Links are first-class here — LinkedIn renders a card and does not
    // meaningfully punish outbound links the way some networks do.
    linksOk: true,
    envKeys: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    setupUrl: "https://www.linkedin.com/developers/apps",
    // Said plainly because it decides whether this is a week of work or a month.
    setupNote:
      "Create a LinkedIn app, verify it against a Company Page, and request the Community Management API. Approval is routine but not instant.",
  },

  x: {
    id: "x",
    label: "X",
    // The free-tier limit. Premium accounts get 25,000, but drafting to the
    // larger number and discovering the account is not Premium at publish time
    // is the wrong way round, so the composer holds everyone to 280 unless the
    // connection says otherwise.
    maxChars: 280,
    maxCharsPremium: 25000,
    targets: ["member"],
    imageRequired: false,
    imageSupported: true,
    maxImages: 4,
    hashtags: { max: 2, advised: 1 },
    linksOk: true,
    // A t.co link is always this long whatever the URL, and it counts against
    // the 280. Getting this wrong means drafts that are 279 characters by our
    // count and rejected by theirs.
    linkCharCost: 23,
    envKeys: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
    setupUrl: "https://developer.x.com/en/portal/dashboard",
    setupNote:
      "Posting needs a paid API tier — the free tier is read-mostly and will not accept writes. Budget for Basic at minimum.",
  },

  instagram: {
    id: "instagram",
    label: "Instagram",
    maxChars: 2200,
    targets: ["organization"],
    // The constraint that shapes the whole pipeline. There is no text-only post
    // on Instagram: the Content Publishing API takes a media container first and
    // a caption second. A draft without an image is not a short post, it is an
    // impossible one.
    imageRequired: true,
    imageSupported: true,
    maxImages: 10,
    hashtags: { max: 30, advised: 8 },
    // Captions do not render clickable links, so putting one in is a URL the
    // reader has to retype. The pipeline moves it to the profile instead.
    linksOk: false,
    envKeys: ["META_APP_ID", "META_APP_SECRET"],
    setupUrl: "https://developers.facebook.com/apps",
    setupNote:
      "Needs a Meta Business app, an Instagram Business account linked to a Facebook Page, and App Review for content publishing. The heaviest setup of the three.",
  },

  facebook: {
    id: "facebook",
    label: "Facebook",
    maxChars: 63206,
    targets: ["organization"],
    imageRequired: false,
    imageSupported: true,
    maxImages: 10,
    hashtags: { max: 3, advised: 1 },
    linksOk: true,
    envKeys: ["META_APP_ID", "META_APP_SECRET"],
    setupUrl: "https://developers.facebook.com/apps",
    setupNote: "Same Meta app as Instagram, plus pages_manage_posts on the Page you are posting to.",
  },
};

export const NETWORK_ORDER = ["linkedin", "x", "instagram", "facebook"];

export function networkById(id) {
  return NETWORKS[id] || null;
}

// Post lifecycle. A post is never published straight from `drafted` — it has to
// pass through the approvals queue, because everything here is public and
// carries the customer's name.
export const POST_STATUS = {
  DRAFTED: "drafted",
  WAITING_APPROVAL: "waiting_approval",
  APPROVED: "approved",
  SCHEDULED: "scheduled",
  PUBLISHED: "published",
  FAILED: "failed",
  DECLINED: "declined",
};

export const POST_TERMINAL = [POST_STATUS.PUBLISHED, POST_STATUS.DECLINED];

export function postStatusStyle(status) {
  switch (status) {
    case POST_STATUS.PUBLISHED:
      return { label: "Published", bg: "var(--color-accent-2-100)", fg: "var(--color-accent-2-800)" };
    case POST_STATUS.SCHEDULED:
      return { label: "Scheduled", bg: "var(--color-accent-100)", fg: "var(--color-accent-800)" };
    case POST_STATUS.APPROVED:
      return { label: "Approved", bg: "var(--color-accent-100)", fg: "var(--color-accent-800)" };
    case POST_STATUS.WAITING_APPROVAL:
      return { label: "Waiting on you", bg: "var(--color-accent-100)", fg: "var(--color-accent-800)" };
    case POST_STATUS.FAILED:
      return { label: "Failed", bg: "var(--color-accent-200)", fg: "var(--color-accent-900)" };
    case POST_STATUS.DECLINED:
      return { label: "Declined", bg: "var(--color-neutral-100)", fg: "var(--color-neutral-800)" };
    default:
      return { label: "Draft", bg: "var(--color-neutral-100)", fg: "var(--color-neutral-800)" };
  }
}

/**
 * How long a post actually is on a given network, which is not the same as its
 * string length. X bills every link at a flat 23 characters however long the
 * URL is, so a draft with three long links can be well under 280 by
 * `String.length` and still be rejected.
 */
export function effectiveLength(text, networkId) {
  const net = NETWORKS[networkId];
  const raw = String(text || "");
  if (!net?.linkCharCost) return raw.length;

  const urls = raw.match(/https?:\/\/\S+/g) || [];
  const urlChars = urls.reduce((sum, u) => sum + u.length, 0);
  return raw.length - urlChars + urls.length * net.linkCharCost;
}

export function charLimitFor(networkId, { premium = false } = {}) {
  const net = NETWORKS[networkId];
  if (!net) return 0;
  return premium && net.maxCharsPremium ? net.maxCharsPremium : net.maxChars;
}

/**
 * Everything wrong with a draft for one network, as plain sentences a person can
 * act on. Returns [] for a publishable draft.
 *
 * This runs in the composer and again on the server immediately before
 * publishing. Validating twice is deliberate: the first is a courtesy, the
 * second is the one that has to hold, because a draft can be edited in the
 * approvals queue after it was checked.
 */
export function validatePost({ networkId, text, images = [], premium = false }) {
  const net = NETWORKS[networkId];
  if (!net) return [`${networkId} is not a network MADBOT knows how to post to.`];

  const problems = [];
  const body = String(text || "").trim();
  const limit = charLimitFor(networkId, { premium });
  const length = effectiveLength(body, networkId);

  // An image-only post is a real post anywhere that supports images, not
  // just where one is required. This used to exempt Instagram alone and
  // called a perfectly good LinkedIn, X or Facebook image post empty.
  if (!body && !(net.imageSupported && images.length)) {
    problems.push("The post is empty.");
  }
  if (length > limit) {
    const over = length - limit;
    const chars = over === 1 ? "character" : "characters";
    problems.push(
      net.linkCharCost && /https?:\/\//.test(body)
        ? `${over} ${chars} over ${net.label}'s ${limit} limit — every link counts as ${net.linkCharCost} there, whatever its length.`
        : `${over} ${chars} over ${net.label}'s ${limit} limit.`
    );
  }
  if (net.imageRequired && images.length === 0) {
    problems.push(`${net.label} has no text-only post. This needs at least one image before it can go anywhere.`);
  }
  if (images.length > net.maxImages) {
    problems.push(`${net.label} takes at most ${net.maxImages} images; this has ${images.length}.`);
  }

  const tags = body.match(/#[\p{L}\p{N}_]+/gu) || [];
  if (tags.length > net.hashtags.max) {
    problems.push(`${tags.length} hashtags — ${net.label} tolerates ${net.hashtags.max}.`);
  }
  if (!net.linksOk && /https?:\/\//.test(body)) {
    problems.push(`${net.label} does not render links in captions, so this URL would reach the reader as text to retype.`);
  }

  return problems;
}

/**
 * Which networks this deployment could publish to at all, based on whether the
 * app credentials exist. Server-side callers pass `process.env`; the dashboard
 * gets the answer from /api/social/status rather than guessing.
 *
 * Reporting a network as unavailable is the honest outcome here. The
 * alternative — showing a Connect button that opens an OAuth screen for an app
 * that was never registered — spends the customer's time to reach the same
 * wall.
 */
export function readiness(env = {}) {
  const out = {};
  for (const id of NETWORK_ORDER) {
    const net = NETWORKS[id];
    const missing = net.envKeys.filter((k) => !env[k]);
    out[id] = {
      id,
      label: net.label,
      configured: missing.length === 0,
      missing,
      setupUrl: net.setupUrl,
      setupNote: net.setupNote,
    };
  }
  return out;
}

/** True when at least one network could be published to. */
export function anyNetworkConfigured(env = {}) {
  return NETWORK_ORDER.some((id) => NETWORKS[id].envKeys.every((k) => env[k]));
}
