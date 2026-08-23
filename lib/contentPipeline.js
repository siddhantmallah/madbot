// Writing an article that can actually rank, rather than one that reads well.
//
//   research → outline → draft → fact-check → schema + internal links
//
// The existing generator went straight from a title to prose using the site's
// own description. That produces fluent text with nothing behind it: no idea
// what already ranks for the query, no internal links, no structured data, and
// no check on whether any claim in it is true. Fluent and unfounded is the worst
// combination, because it's the hardest to spot.
//
// Each stage is a separate call on the cheapest model that can do it, so the
// pipeline costs a few cents rather than a few dollars — see aiModels.js.

import Anthropic from "@anthropic-ai/sdk";
import { modelFor } from "./aiModels";

const RESEARCH_MODEL = modelFor("content_outline").id;
const WRITE_MODEL = modelFor("content_write").id;
const CHECK_MODEL = modelFor("content_factcheck").id;

// ---------------------------------------------------------------------------
// Stage 1 — research. What already answers this, and what it misses.
// ---------------------------------------------------------------------------

const RESEARCH_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["informational", "commercial", "transactional", "navigational"],
      description: "What someone searching this actually wants.",
    },
    whatRanksNow: {
      type: "array",
      description: "The kinds of page currently answering this, and what each covers.",
      items: {
        type: "object",
        properties: { source: { type: "string" }, covers: { type: "string" } },
        required: ["source", "covers"],
        additionalProperties: false,
      },
    },
    gaps: {
      type: "array",
      description: "Questions a reader would still have after reading what's already out there.",
      items: { type: "string" },
    },
    mustCover: { type: "array", items: { type: "string" } },
    facts: {
      type: "array",
      description: "Specific, checkable facts found during research, each with where it came from.",
      items: {
        type: "object",
        properties: { claim: { type: "string" }, source: { type: "string" } },
        required: ["claim", "source"],
        additionalProperties: false,
      },
    },
    suggestedTitle: { type: "string" },
    searched: { type: "boolean" },
  },
  required: ["intent", "whatRanksNow", "gaps", "mustCover", "facts", "suggestedTitle", "searched"],
  additionalProperties: false,
};

/**
 * Reads the live web before writing anything, so the article can cover what the
 * existing results don't. Without this stage a "new" article is just a
 * rearrangement of what the model already assumed.
 */
export async function research({ topic, siteContext }) {
  requireKey();
  const client = new Anthropic();
  const res = await client.messages.parse({
    model: RESEARCH_MODEL,
    max_tokens: 5000,
    thinking: { type: "adaptive" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
    output_config: { effort: "low", format: { type: "json_schema", schema: RESEARCH_SCHEMA } },
    system: [
      "You research a topic before an article is written about it, using web search.",
      "",
      "Every entry in `facts` must be something you actually read, with the source named. If you cannot verify a number or a date, leave it out — the article is better without it than wrong with it.",
      "`gaps` is the valuable part: what a reader still doesn't know after reading the current results. That's what the new article is for.",
      "Set searched false if you could not retrieve anything, so the caller knows the research is thin.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: `Topic: ${topic}\n\nThe article will be published on: ${siteContext}\n\nResearch what already ranks and what it leaves out.`,
      },
    ],
  });

  if (res.stop_reason === "refusal") throw Object.assign(new Error("Declined to research this topic."), { code: "refused" });
  const out = res.parsed_output;
  if (!out) throw Object.assign(new Error("No research returned."), { code: "empty" });
  return { ...out, usage: usageOf(res) };
}

// ---------------------------------------------------------------------------
// Stage 2 — outline, with the internal links decided up front
// ---------------------------------------------------------------------------

const OUTLINE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string", description: "Meta description, under 155 characters." },
    targetWords: { type: "integer" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          covers: { type: "string" },
          // Chosen from the site's real pages, so links can't be invented.
          linkTo: { type: "string", description: "Path of an existing page on this site to link from here, or empty." },
        },
        required: ["heading", "covers", "linkTo"],
        additionalProperties: false,
      },
    },
    faqs: {
      type: "array",
      description: "Questions worth answering directly, for FAQ structured data.",
      items: {
        type: "object",
        properties: { q: { type: "string" }, a: { type: "string" } },
        required: ["q", "a"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "description", "targetWords", "sections", "faqs"],
  additionalProperties: false,
};

/**
 * Plans the article, and decides its internal links from the site's actual
 * pages. Deciding links here rather than after writing is what stops the model
 * inventing a plausible-looking /pricing that doesn't exist.
 */
export async function outline({ topic, researchResult, sitePages, voice }) {
  requireKey();
  const client = new Anthropic();
  const pageList = (sitePages || [])
    .slice(0, 40)
    .map((p) => `${p.path} — ${p.title || "untitled"}`)
    .join("\n");

  const res = await client.messages.parse({
    model: RESEARCH_MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: { type: "json_schema", schema: OUTLINE_SCHEMA } },
    system: [
      "You outline an article so it covers what existing results miss.",
      "",
      "linkTo must be a path copied exactly from the list of existing pages, or an empty string. Never invent a path — a link to a page that doesn't exist is a 404 in published content.",
      "FAQs must be questions a real reader would ask, answered in one or two sentences each.",
      voice ? `Write headings in this voice: ${voice}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    messages: [
      {
        role: "user",
        content: `Topic: ${topic}\nSearch intent: ${researchResult.intent}\n\nGaps to fill:\n${researchResult.gaps.map((g) => `- ${g}`).join("\n")}\n\nMust cover:\n${researchResult.mustCover.map((m) => `- ${m}`).join("\n")}\n\nExisting pages on this site:\n${pageList || "(none known)"}`,
      },
    ],
  });

  if (res.stop_reason === "refusal") throw Object.assign(new Error("Declined to outline this topic."), { code: "refused" });
  const plan = res.parsed_output;
  if (!plan) throw Object.assign(new Error("No outline returned."), { code: "empty" });

  // Enforce the link rule in code. The prompt asks; this guarantees.
  const known = new Set((sitePages || []).map((p) => p.path));
  const sections = plan.sections.map((s) => {
    if (s.linkTo && !known.has(s.linkTo)) {
      return { ...s, linkTo: "", droppedLink: s.linkTo };
    }
    return s;
  });
  const invented = sections.filter((s) => s.droppedLink).map((s) => s.droppedLink);

  return { ...plan, sections, inventedLinksDropped: invented, usage: usageOf(res) };
}

// ---------------------------------------------------------------------------
// Stage 3 — draft
// ---------------------------------------------------------------------------

export async function draft({ plan, researchResult, siteContext, voice, rules }) {
  requireKey();
  const client = new Anthropic();

  const guardrails = (rules || []).map((r) => `- ${r.text || r}`).join("\n");
  const links = plan.sections.filter((s) => s.linkTo).map((s) => `${s.heading} → ${s.linkTo}`).join("\n");

  const stream = await client.messages.stream({
    model: WRITE_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: [
      `You write for ${siteContext}.`,
      voice ? `Voice: ${voice}` : null,
      "",
      "Rules:",
      "- Use only the verified facts supplied. Do not add statistics, dates, prices or study references of your own — anything unverifiable must be phrased as general guidance instead.",
      "- Where a section has an internal link, place it naturally in that section using a markdown link to the given path.",
      "- No filler openings. No 'in today's fast-paced world'. Start on the reader's question.",
      "- Markdown only. One H1, then H2s matching the outline.",
      guardrails ? `\nThe site owner's guardrails, which override everything above:\n${guardrails}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    messages: [
      {
        role: "user",
        content: `Write this article.\n\nTitle: ${plan.title}\nTarget length: about ${plan.targetWords} words\n\nSections:\n${plan.sections.map((s) => `## ${s.heading}\n${s.covers}`).join("\n\n")}\n\nVerified facts you may use:\n${researchResult.facts.map((f) => `- ${f.claim} (${f.source})`).join("\n") || "(none — avoid specific claims)"}\n\nInternal links to include:\n${links || "(none)"}`,
      },
    ],
  });

  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    throw Object.assign(new Error("The model declined to write this article."), { code: "refused" });
  }

  const body = message.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  return {
    body,
    wordCount: body.split(/\s+/).filter(Boolean).length,
    usage: { inputTokens: message.usage?.input_tokens || 0, outputTokens: message.usage?.output_tokens || 0 },
  };
}

// ---------------------------------------------------------------------------
// Stage 4 — fact-check the draft against the research
// ---------------------------------------------------------------------------

const CHECK_SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          status: { type: "string", enum: ["supported", "unsupported", "contradicted"] },
          note: { type: "string" },
        },
        required: ["claim", "status", "note"],
        additionalProperties: false,
      },
    },
    verdict: { type: "string", enum: ["clean", "needs_edit", "do_not_publish"] },
  },
  required: ["claims", "verdict"],
  additionalProperties: false,
};

/**
 * Reads the draft back against the verified facts and flags anything asserted
 * without support.
 *
 * A separate call on purpose: asking the model that wrote it to also approve it
 * is not a check. This runs on the cheap tier because comparing two texts is
 * not the hard part.
 */
export async function factCheck({ body, researchResult }) {
  requireKey();
  const client = new Anthropic();
  const res = await client.messages.parse({
    model: CHECK_MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: { type: "json_schema", schema: CHECK_SCHEMA } },
    system: [
      "You check an article's specific claims against a list of verified facts.",
      "",
      "Only flag things that are actually checkable — numbers, dates, prices, named studies, capability claims. General advice needs no source.",
      "unsupported means the article asserts something specific that isn't in the verified list. contradicted means it disagrees with it.",
      "Return do_not_publish only if something is contradicted or a false claim is central to the piece.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: `Verified facts:\n${researchResult.facts.map((f) => `- ${f.claim} (${f.source})`).join("\n") || "(none)"}\n\nArticle:\n${body.slice(0, 24000)}`,
      },
    ],
  });

  const out = res.parsed_output || { claims: [], verdict: "needs_edit" };
  return {
    ...out,
    unsupportedCount: out.claims.filter((c) => c.status !== "supported").length,
    usage: usageOf(res),
  };
}

// ---------------------------------------------------------------------------
// Stage 5 — structured data. Deterministic, no model.
// ---------------------------------------------------------------------------

/**
 * Builds the JSON-LD. Generated in code rather than asked for, because schema is
 * a strict format where a model's plausible-looking near-miss is worse than
 * useless — it validates as broken rather than failing loudly.
 */
export function buildSchema({ plan, article, siteUrl, authorName, publishedAt }) {
  const url = `${siteUrl.replace(/\/$/, "")}/${slugOf(plan.title)}`;
  const graph = [
    {
      "@type": "Article",
      headline: plan.title.slice(0, 110),
      description: plan.description,
      datePublished: publishedAt || new Date().toISOString(),
      author: authorName ? { "@type": "Organization", name: authorName } : undefined,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      wordCount: article.wordCount,
    },
  ];

  // Only emit FAQPage when there are real Q&A pairs — an empty one is an
  // invalid-markup warning in Search Console for no benefit.
  if (plan.faqs?.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: plan.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

function slugOf(title) {
  return String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
}

// ---------------------------------------------------------------------------

/**
 * The whole pipeline. Reports each stage so the UI can show progress and, more
 * importantly, show what the fact-check found before anyone publishes.
 */
export async function writeArticle({ topic, siteContext, siteUrl, sitePages, voice, rules, authorName, onStage }) {
  const stage = (name, detail) => onStage && onStage({ stage: name, detail });

  stage("research");
  const researchResult = await research({ topic, siteContext });

  stage("outline");
  const plan = await outline({ topic, researchResult, sitePages, voice });

  stage("draft");
  const article = await draft({ plan, researchResult, siteContext, voice, rules });

  stage("factcheck");
  const check = await factCheck({ body: article.body, researchResult });

  stage("schema");
  const schema = buildSchema({ plan, article, siteUrl, authorName });

  const usage = [researchResult.usage, plan.usage, article.usage, check.usage].reduce(
    (a, u) => ({
      inputTokens: a.inputTokens + (u?.inputTokens || 0),
      outputTokens: a.outputTokens + (u?.outputTokens || 0),
      webSearches: a.webSearches + (u?.webSearches || 0),
    }),
    { inputTokens: 0, outputTokens: 0, webSearches: 0 }
  );

  return {
    title: plan.title,
    description: plan.description,
    body: article.body,
    wordCount: article.wordCount,
    faqs: plan.faqs,
    schema,
    internalLinks: plan.sections.filter((s) => s.linkTo).map((s) => s.linkTo),
    inventedLinksDropped: plan.inventedLinksDropped,
    sources: researchResult.facts.map((f) => f.source).filter((v, i, a) => a.indexOf(v) === i),
    factCheck: check,
    // The pipeline never decides to publish. A draft with unsupported claims
    // goes to the approvals queue, and one that contradicts a source doesn't go
    // anywhere without a human saying so.
    publishable: check.verdict === "clean",
    needsReview: check.verdict !== "clean",
    researchWasThin: !researchResult.searched,
    usage,
  };
}

function usageOf(res) {
  return {
    inputTokens: res.usage?.input_tokens || 0,
    outputTokens: res.usage?.output_tokens || 0,
    webSearches: res.content?.filter?.((b) => b.type === "web_search_tool_result").length || 0,
  };
}

function requireKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw Object.assign(new Error("No Anthropic API key configured."), { code: "not_configured" });
  }
}
