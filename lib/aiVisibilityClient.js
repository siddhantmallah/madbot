// Client-safe half of the AI visibility feature. Kept apart from
// lib/aiVisibility.js because that file imports the Anthropic SDK, which has no
// business in a browser bundle.

// The engine MADBOT can genuinely measure.
export const MEASURED_ENGINE = "Claude";

// Engines we cannot measure without their own API keys. Listed explicitly so
// the UI can say "not measured" instead of quietly implying full coverage.
export const UNMEASURED_ENGINES = ["ChatGPT", "Perplexity", "Google AI", "Copilot", "Gemini"];

// Words that show up in a site title but aren't part of the brand, so
// "Sofaalay - Custom Sofa Makers Mumbai" yields "Sofaalay" rather than treating
// the whole tagline as the name.
const TAGLINE_WORDS =
  /^(the|and|for|custom|best|top|official|home|welcome|makers|manufacturers|suppliers|services|service|company|shop|store|online|india|usa|uk|ltd|limited|llp|inc|pvt|private|co|group|solutions|solution|agency|studio|works|india's|leading|premium|quality|cheap|affordable|buy|sale)$/i;

/**
 * The strings that count as "this business was named". Includes the full title,
 * the leading brand segment, and the domain root — an assistant might write any
 * of them.
 */
export function brandCandidates({ brandName, domain }) {
  const out = new Set();
  const add = (s) => {
    const t = (s || "").trim();
    if (t.length >= 3) out.add(t);
  };

  const bare = (domain || "").replace(/^www\./, "");
  add(bare);
  const root = bare.split(".")[0];
  if (root && root.length >= 4) add(root);

  if (brandName) {
    add(brandName);
    // A site title is usually "Brand - what we do" or "Brand | Tagline".
    const lead = brandName.split(/[-|–—:·»]/)[0].trim();
    add(lead);
    // And the distinctive word inside that lead segment.
    const distinctive = lead
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !TAGLINE_WORDS.test(w))
      .sort((a, b) => b.length - a.length)[0];
    add(distinctive);
  }

  return [...out];
}

/**
 * A rough one-line description of what will be asked, for the UI to show before
 * anything is spent. The real questions are model-generated server-side —
 * a deterministic template can't tell a brand name from a product category, and
 * a branded question guarantees a mention and measures nothing.
 */
export function visibilityReadiness(intel) {
  if (!intel) return { ready: false, why: "This site hasn't been crawled yet." };
  if (!intel.business?.description && !intel.structure?.topPages?.length) {
    return { ready: false, why: "The crawl found too little to tell what this site sells." };
  }
  return { ready: true, why: null };
}
