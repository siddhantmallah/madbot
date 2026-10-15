// When each legal document last changed, in one place.
//
// The page shows it ("Last updated …") and the sitemap sends it as
// <lastmod>, so the two can't disagree. Change a policy, change its date here.
// The sitemap used to stamp every URL with the time of the request, which
// tells a search engine nothing, and teaches it to ignore the field.

export const LEGAL_UPDATED = {
  "/legal": "2026-09-06",
  "/legal/terms": "2026-10-14",
  "/legal/privacy": "2026-10-14",
  "/legal/cookies": "2026-09-15",
  "/legal/refunds": "2026-10-14",
  "/legal/acceptable-use": "2026-09-06",
  "/legal/dpa": "2026-09-06",
  "/legal/subprocessors": "2026-10-14",
  "/legal/security": "2026-10-15",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "14 October 2026", the way the documents write dates. */
export function updatedOn(path) {
  const iso = LEGAL_UPDATED[path];
  if (!iso) throw new Error(`No date for ${path} in lib/legalDates.js`);
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
