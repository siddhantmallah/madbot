// Lead intelligence, built rather than bought.
//
//              COMPANY DATA        PUBLIC SIGNALS
//                      \              /
//                       ICP ENGINE
//                            │
//                      INTENT ENGINE
//                            │
//                   COMPANY OPPORTUNITY
//                      /            \
//        COMPANY-LEVEL          PERSON-LEVEL
//        QUALIFICATION          (only if justified)
//                      \            /
//                      HUMAN / AI REVIEW
//                            │
//                        OUTREACH
//
// Two principles hold the whole thing up.
//
// LEGAL: a company is not a person. Company name, website, sector, tech stack
// and public hiring signals are not personal data, so the qualification stages
// carry no GDPR exposure. Only the last step before review touches a named
// human, it only runs when the company already qualified, and it only ever
// reads what the company itself published — never a scraped social profile.
// That ordering is the compliance story, not a nicety.
//
// ECONOMIC: cheap filters run first. Sending every discovered company through a
// deep model is how the margin dies — 500 companies at $0.024 each is $12 to
// find perhaps 20 worth anything. Discovery and shortlisting use search and
// crawling; the expensive analysis only sees what survived.

import Anthropic from "@anthropic-ai/sdk";
import { modelFor } from "./aiModels";
import { crawlSite } from "./crawler";
import { safeFetch } from "./urlGuard";

const CLASSIFY_MODEL = modelFor("lead_classify").id;
const ANALYSE_MODEL = modelFor("lead_analyse").id;

// ---------------------------------------------------------------------------
// Stage 0 — the buyer profile, derived from the customer's own site
// ---------------------------------------------------------------------------

const ICP_SCHEMA = {
  type: "object",
  properties: {
    sells: { type: "string", description: "What this business sells, in plain words." },
    buyerType: { type: "string", description: "The kind of organisation that buys it." },
    buyerSize: { type: "string", enum: ["solo", "small", "mid", "large", "any"] },
    sectors: { type: "array", items: { type: "string" } },
    geography: { type: "string", description: "Where its buyers are, or empty if it sells anywhere." },
    triggers: {
      type: "array",
      description: "Observable, public events that mean an organisation probably needs this now.",
      items: { type: "string" },
    },
    disqualifiers: {
      type: "array",
      description: "Observable reasons an organisation is not a buyer.",
      items: { type: "string" },
    },
    searchQueries: {
      type: "array",
      description: "Web searches that would surface organisations matching this profile.",
      items: { type: "string" },
    },
    confident: { type: "boolean" },
  },
  required: ["sells", "buyerType", "buyerSize", "sectors", "geography", "triggers", "disqualifiers", "searchQueries", "confident"],
  additionalProperties: false,
};

/**
 * Works out who buys from this customer, from what their own site says.
 *
 * The crawl can't reveal this on its own — a website says what it sells, rarely
 * who to. Anything inferred here is a hypothesis the customer should correct,
 * which is why `confident` can come back false and the profile is stored as
 * editable rather than treated as fact.
 */
export async function buildBuyerProfile({ intel }) {
  requireKey();
  const client = new Anthropic();

  const profile = [
    `Domain: ${intel?.domain}`,
    `Title: ${intel?.business?.name || ""}`,
    intel?.business?.description ? `Description: ${intel.business.description}` : null,
    intel?.business?.category ? `Category: ${intel.business.category}` : null,
    intel?.geography?.locations?.length ? `Places named: ${intel.geography.locations.join(", ")}` : null,
    intel?.structure?.topPages?.length
      ? `Pages: ${intel.structure.topPages.map((p) => `${p.path} (${p.title || ""})`).join(" | ")}`
      : null,
    intel?.commercial?.prices?.length ? `Prices: ${intel.commercial.prices.slice(0, 8).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await client.messages.parse({
    model: CLASSIFY_MODEL,
    max_tokens: 3000,
    output_config: { effort: "low", format: { type: "json_schema", schema: ICP_SCHEMA } },
    system: [
      "You infer who buys from a business, given only what its own website says.",
      "",
      "Triggers and disqualifiers must be things a person could verify by looking at a public website — 'hiring for a compliance role', 'no pricing page', 'runs on Shopify'. Not 'recently raised funding' unless a site would say so, and never anything about an individual.",
      "Search queries should find organisations, not people.",
      "If the site is too thin to tell who buys, set confident false and keep the rest brief.",
    ].join("\n"),
    messages: [{ role: "user", content: `Infer the buyer profile for this business.\n\n${profile}` }],
  });

  if (res.stop_reason === "refusal") throw Object.assign(new Error("Declined to build a buyer profile."), { code: "refused" });
  const p = res.parsed_output;
  if (!p) throw Object.assign(new Error("No buyer profile returned."), { code: "empty" });

  return {
    ...p,
    source: "inferred-from-site",
    // Explicitly a hypothesis. The UI asks the customer to confirm or edit it,
    // because getting this wrong wastes every lead credit downstream.
    needsConfirmation: true,
    builtAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Stage 1 — discovery. Web search only, no personal data, no scraping.
// ---------------------------------------------------------------------------

const DISCOVERY_SCHEMA = {
  type: "object",
  properties: {
    companies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          website: { type: "string", description: "Root domain only, no path." },
          why: { type: "string", description: "One line on why this looked like a match." },
        },
        required: ["name", "website", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["companies"],
  additionalProperties: false,
};

/**
 * Finds candidate organisations using web search. Deliberately shallow — the
 * job here is a wide net of names and domains, not analysis. Everything
 * expensive happens later, to far fewer companies.
 */
export async function discoverCompanies({ profile, max = 30, onProgress }) {
  requireKey();
  const client = new Anthropic();
  const queries = (profile.searchQueries || []).slice(0, 4);
  if (!queries.length) throw Object.assign(new Error("No search queries in the buyer profile."), { code: "no_queries" });

  const seen = new Map();
  let usage = { inputTokens: 0, outputTokens: 0, webSearches: 0 };

  for (const q of queries) {
    if (seen.size >= max) break;
    try {
      const res = await client.messages.parse({
        model: CLASSIFY_MODEL,
        max_tokens: 4000,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 2 }],
        output_config: { effort: "low", format: { type: "json_schema", schema: DISCOVERY_SCHEMA } },
        system:
          "Find real organisations matching a description, using web search. Return the organisation's own website domain. Never return a person, a directory page, a marketplace listing, or a social profile.",
        messages: [{ role: "user", content: `Find organisations matching: ${q}` }],
      });
      usage.inputTokens += res.usage?.input_tokens || 0;
      usage.outputTokens += res.usage?.output_tokens || 0;
      usage.webSearches += res.content?.filter?.((b) => b.type === "web_search_tool_result").length || 0;

      for (const c of res.parsed_output?.companies || []) {
        const domain = normaliseDomain(c.website);
        if (!domain || seen.has(domain)) continue;
        seen.set(domain, { name: c.name, domain, why: c.why, foundVia: q });
        if (seen.size >= max) break;
      }
      if (onProgress) onProgress({ found: seen.size, query: q });
    } catch {
      // One dud query shouldn't lose the others.
    }
  }

  return { companies: [...seen.values()], usage };
}

function normaliseDomain(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const h = u.hostname.replace(/^www\./, "").toLowerCase();
    // Anything on a platform host is a listing, not a company site.
    if (/(linkedin|facebook|twitter|x|instagram|crunchbase|glassdoor|indeed|yelp|justdial|amazon|flipkart)\./.test(h)) return null;
    if (!h.includes(".")) return null;
    return h;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stage 2 — cheap shortlisting. No model at all.
// ---------------------------------------------------------------------------

/**
 * Reads each candidate's own homepage and keeps the ones worth paying to
 * analyse. This is the stage that protects the margin: it costs an HTTP request
 * per company instead of a model call, and it is where most of them are
 * dropped.
 *
 * Returns { shortlisted, rejected } so the UI can show what was filtered and
 * why — a lead engine that silently discards things is impossible to trust.
 */
export async function shortlist({ companies, profile, max = 12, onProgress }) {
  const shortlisted = [];
  const rejected = [];
  const sectors = (profile.sectors || []).map((s) => s.toLowerCase());

  for (const c of companies) {
    if (shortlisted.length >= max) {
      rejected.push({ ...c, reason: "shortlist already full" });
      continue;
    }
    let page;
    try {
      page = await safeFetch(`https://${c.domain}`, { timeoutMs: 8000, capBytes: 400_000 });
    } catch (err) {
      rejected.push({ ...c, reason: `site unreachable (${String(err?.message || err).slice(0, 60)})` });
      continue;
    }
    if (!page?.ok || !page.body) {
      rejected.push({ ...c, reason: `site returned ${page?.status || "nothing"}` });
      continue;
    }

    const text = visibleText(page.body).slice(0, 12000).toLowerCase();
    const signals = detectSignals(page.body, text);

    // A disqualifier stated on their own site is the cheapest possible no.
    const hit = (profile.disqualifiers || []).find((d) => matchesPhrase(text, d));
    if (hit) {
      rejected.push({ ...c, reason: `disqualified: ${hit}`, signals });
      continue;
    }
    // Word boundaries, not substrings. A plain includes() let "api" match
    // inside "capital" and "rapid", which passed a furniture maker as a
    // software prospect. Short sector terms are exactly where this bites.
    // One weak keyword anywhere on a page is not a sector. A furniture maker
    // matched a software profile on "api" alone, found somewhere in its body
    // copy. So: either two distinct sector terms, or one that appears where a
    // company states what it actually is — its title, description or H1.
    const identity = [titleOf(page.body), metaDescriptionOf(page.body), h1Of(page.body)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matched = sectors.filter((term) => containsTerm(text, term));
    const inIdentity = sectors.filter((term) => containsTerm(identity, term));
    const sectorMatch = sectors.length === 0 || inIdentity.length > 0 || matched.length >= 2;
    if (!sectorMatch) {
      rejected.push({
        ...c,
        reason: matched.length
          ? `only a weak sector signal (${matched.join(", ")}), not in the title or headline`
          : "no sector language on the homepage",
        signals,
      });
      continue;
    }

    shortlisted.push({
      ...c,
      signals,
      matchedOn: matched,
      matchedInIdentity: inIdentity,
      pageTitle: titleOf(page.body),
      fetchedAt: new Date().toISOString(),
    });
    if (onProgress) onProgress({ shortlisted: shortlisted.length, checked: shortlisted.length + rejected.length });
  }

  return { shortlisted, rejected };
}

/** Visible text only — script and style contents are not what a buyer reads. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metaDescriptionOf(html) {
  return (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || "").trim() || null;
}

function h1Of(html) {
  return (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "").replace(/<[^>]+>/g, " ").trim().slice(0, 200) || null;
}

function titleOf(html) {
  return (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim().slice(0, 140) || null;
}

/**
 * Public, observable signals from a company's own page. All company-level —
 * nothing here identifies a person.
 */
function detectSignals(html, text) {
  const has = (re) => re.test(text);
  return {
    hiring: has(/\b(careers|we'?re hiring|join our team|open roles|vacanc)/),
    hasPricing: has(/\bpricing\b|\bplans\b/),
    hasBlog: has(/\bblog\b|\binsights\b|\bnews\b/),
    ecommerce: /shopify|woocommerce|magento|bigcommerce/i.test(html),
    cms: /wp-content|wordpress/i.test(html) ? "wordpress" : /_next\/static/i.test(html) ? "next" : /webflow/i.test(html) ? "webflow" : null,
    // A site with no meta description or title is a live technical gap, which
    // is exactly what MADBOT sells fixing.
    weakMeta: !/<meta[^>]+name=["']description["']/i.test(html),
    bytes: html.length,
  };
}

/**
 * Whole-word (or whole-phrase) match. Anything shorter than four characters
 * would generate more noise than signal even bounded, so it's ignored rather
 * than trusted.
 */
function containsTerm(text, term) {
  const t = String(term).toLowerCase().trim();
  if (t.length < 4) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}

function matchesPhrase(text, phrase) {
  const words = String(phrase).toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  if (!words.length) return false;
  // Most of the meaningful words present as whole words, rather than the exact
  // sentence — and bounded, for the same reason as containsTerm.
  const hits = words.filter((w) => containsTerm(text, w)).length;
  return hits / words.length >= 0.7;
}

// ---------------------------------------------------------------------------
// Stage 3 — deep analysis, on the shortlist only
// ---------------------------------------------------------------------------

const QUALIFY_SCHEMA = {
  type: "object",
  properties: {
    qualified: { type: "boolean" },
    score: { type: "integer", description: "0-100 fit against the buyer profile." },
    reasoning: { type: "string", description: "Why, referring to what was actually on their site." },
    intentSignals: { type: "array", items: { type: "string" } },
    problemYouSolve: { type: "string", description: "The specific problem this company appears to have." },
    openingLine: { type: "string", description: "One opening line referencing something real and specific about them." },
    personLookupJustified: {
      type: "boolean",
      description: "True only if this company clearly qualifies and contacting a named person is proportionate.",
    },
  },
  required: ["qualified", "score", "reasoning", "intentSignals", "problemYouSolve", "openingLine", "personLookupJustified"],
  additionalProperties: false,
};

/**
 * The expensive stage, and the only one that runs a standard-tier model. It
 * sees a crawl of the company rather than one page, because a judgement worth
 * a lead credit needs more than a homepage.
 *
 * It also decides whether looking up a named person is warranted. That decision
 * is deliberately made here, after qualification, rather than assumed upfront —
 * a company that doesn't qualify never has a human associated with it at all.
 */
export async function qualifyCompany({ company, profile, customerDomain }) {
  requireKey();
  const client = new Anthropic();

  const crawl = await crawlSite(`https://${company.domain}`, { maxPages: 5, budgetMs: 30_000 });
  const pages = (crawl.pages || [])
    .slice(0, 5)
    .map((p) => `--- ${p.path} — ${p.title || "untitled"}\n${(p.text || "").slice(0, 1800)}`)
    .join("\n\n");

  const res = await client.messages.parse({
    model: ANALYSE_MODEL,
    max_tokens: 3000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: { type: "json_schema", schema: QUALIFY_SCHEMA } },
    system: [
      `You qualify a company as a prospect for a business at ${customerDomain}.`,
      "",
      "Judge only from what their own site says. Do not speculate about funding, revenue, headcount or anything you cannot see. If evidence is thin, score low and say so — a confident wrong answer costs the customer a wasted approach and their reputation.",
      "The opening line must reference something specific and real from their site. No flattery, no invented compliments.",
      "Set personLookupJustified true only when the company genuinely qualifies and reaching a named individual is a proportionate next step.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: `Buyer profile:\n${JSON.stringify(
          { sells: profile.sells, buyerType: profile.buyerType, sectors: profile.sectors, triggers: profile.triggers },
          null,
          1
        )}\n\nCompany: ${company.name} (${company.domain})\nPublic signals: ${JSON.stringify(company.signals || {})}\n\nTheir pages:\n${pages}`,
      },
    ],
  });

  if (res.stop_reason === "refusal") {
    return { ...company, qualified: false, score: 0, reasoning: "The model declined to assess this company.", skipped: true };
  }

  const q = res.parsed_output || {};
  return {
    ...company,
    ...q,
    pagesRead: crawl.pages?.length || 0,
    analysedAt: new Date().toISOString(),
    usage: {
      inputTokens: res.usage?.input_tokens || 0,
      outputTokens: res.usage?.output_tokens || 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Stage 4 — person-level, and only where the company earned it
// ---------------------------------------------------------------------------

/**
 * Finds a contact route, from the company's own published pages only.
 *
 * What this deliberately does not do: query a people-data broker, scrape a
 * social network, or guess an address from a name-and-domain pattern. All three
 * are how lead tools get their coverage, and all three mean processing someone's
 * personal data with no lawful basis and no way for them to have expected it.
 *
 * A generic company inbox is preferred over a named individual wherever one
 * exists — it reaches the same organisation and involves no personal data at
 * all.
 */
export async function findContactRoute({ company }) {
  const paths = ["/contact", "/contact-us", "/about", "/team", "/"];
  const emails = new Set();
  let source = null;

  for (const path of paths) {
    if (emails.size) break;
    try {
      const res = await safeFetch(`https://${company.domain}${path}`, { timeoutMs: 7000, capBytes: 300_000 });
      if (!res?.ok || !res.body) continue;
      for (const m of res.body.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)) {
        const e = m[0].toLowerCase();
        // Only addresses on the company's own domain; anything else is a third
        // party who never published it here.
        if (!e.endsWith(company.domain) && !e.includes(company.domain.split(".")[0])) continue;
        if (/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/.test(e)) continue;
        emails.add(e);
      }
      if (emails.size) source = `https://${company.domain}${path}`;
    } catch {
      // Missing page is normal; try the next.
    }
  }

  const list = [...emails];
  // role@ addresses reach the organisation without identifying anybody.
  const generic = list.find((e) => /^(hello|info|contact|sales|enquiries|enquiry|team|support|admin|office)@/.test(e));

  return {
    // The whole point of the ordering: a generic inbox is both more likely to be
    // read and free of personal-data questions.
    preferred: generic || list[0] || null,
    isGenericInbox: !!generic,
    allFound: list.slice(0, 5),
    source,
    // Recorded so a customer can answer "where did you get this?" — which under
    // GDPR they may be asked, and must be able to answer.
    provenance: source ? `Published on the company's own page at ${source}` : "No published address found",
    foundAt: new Date().toISOString(),
  };
}

function requireKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw Object.assign(new Error("No Anthropic API key configured."), { code: "not_configured" });
  }
}
