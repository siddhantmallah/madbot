// Measures whether an AI assistant actually names a business when asked the
// questions its buyers would ask. Queries with web search enabled, because
// that's how people use assistants now — the answer reflects what's findable,
// not just what happened to be in training data.

import Anthropic from "@anthropic-ai/sdk";
import { brandCandidates } from "./aiVisibilityClient";
import { modelFor } from "./aiModels";

// Each step runs on the tier its work actually needs. Deriving questions and
// pulling names out of prose is classification, not reasoning, so both drop to
// the cheap model. The answers themselves stay on the deep one: the measurement
// is "what would a buyer be told", and a lesser model would be measuring
// something nobody asked about.
const QUESTION_MODEL = modelFor("visibility_questions").id;
const ANSWER_MODEL = modelFor("visibility_answer").id;
const RIVAL_MODEL = modelFor("visibility_rivals").id;

// Leave headroom under the route's 300s cap — a partial result the UI can
// explain beats a timeout that loses every answer already paid for.
const TIME_BUDGET_MS = 210_000;

// ---------------------------------------------------------------------------
// Question generation
// ---------------------------------------------------------------------------

const QUESTION_SCHEMA = {
  type: "object",
  properties: {
    category: {
      type: "string",
      description: "The product or service category in plain buyer language, with no brand name in it.",
    },
    city: { type: "string", description: "The city or region it serves, or an empty string if not clear." },
    confident: {
      type: "boolean",
      description: "False if the site content is too thin to tell what is actually sold.",
    },
    // No minItems/maxItems — structured outputs reject array bounds, so the
    // count is capped in the prompt and enforced in code below.
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          intent: { type: "string", enum: ["discovery", "comparison", "selection", "local"] },
        },
        required: ["question", "intent"],
        additionalProperties: false,
      },
    },
  },
  required: ["category", "city", "confident", "questions"],
  additionalProperties: false,
};

/**
 * Turns crawl intelligence into the questions a prospect would actually type
 * before they've heard of this business.
 *
 * The whole measurement depends on these being *unbranded* — a question that
 * contains the company's own name guarantees a mention and measures nothing.
 * The prompt says so, and mentionsBrand() below enforces it regardless of what
 * comes back.
 */
export async function generateQuestions({ intel, max = 4 }) {
  requireKey();
  const client = new Anthropic();

  const brand = intel?.business?.name || intel?.domain || "";
  const profile = [
    `Domain: ${intel?.domain || "unknown"}`,
    `Site title: ${brand}`,
    intel?.business?.description ? `Meta description: ${intel.business.description}` : null,
    intel?.business?.category ? `Guessed category: ${intel.business.category}` : null,
    intel?.geography?.locations?.length ? `Places named on the site: ${intel.geography.locations.join(", ")}` : null,
    intel?.structure?.topPages?.length
      ? `Pages: ${intel.structure.topPages.map((p) => `${p.path} (${p.title || "untitled"})`).join(" | ")}`
      : null,
    intel?.commercial?.prices?.length ? `Prices seen: ${intel.commercial.prices.slice(0, 6).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.parse({
    model: QUESTION_MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: {
      format: { type: "json_schema", schema: QUESTION_SCHEMA },
    },
    system: [
      "You write the search questions a prospective buyer would type into an AI assistant BEFORE they have heard of a particular company.",
      "",
      "Hard rules:",
      "- Never put the company's own name, brand, or domain in a question. A branded question is worthless here.",
      `- The company is "${brand}". Treat every part of that name as forbidden in your questions.`,
      "- Use the generic category a buyer would say out loud, not the company's marketing phrasing.",
      "- Questions must be answerable by naming real businesses or products.",
      "- If the site content is too thin to tell what is genuinely sold, set confident to false and return no questions. Do not guess.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: `Here is what a crawl found about a website. Work out what it actually sells and who to, then write up to ${max} unbranded buyer questions.\n\n${profile}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    const e = new Error("The model declined to build questions for this site.");
    e.code = "refused";
    throw e;
  }

  const parsed = response.parsed_output;
  if (!parsed || !parsed.confident || !parsed.questions?.length) {
    const e = new Error(
      "Couldn't work out what this site sells clearly enough to ask buyer questions. Crawl more pages, or add a description to the homepage."
    );
    e.code = "not_confident";
    throw e;
  }

  const forbidden = brandCandidates({ brandName: brand, domain: intel?.domain || "" });

  // Belt and braces: drop anything branded no matter what the model returned.
  const clean = parsed.questions
    .map((q) => (q.question || "").trim())
    .filter((q) => q.length > 8 && !mentionsBrand(q, forbidden))
    .slice(0, max)
    .map((question, i) => ({ id: `q${i + 1}`, question }));

  if (clean.length < 2) {
    const e = new Error("Every generated question named the business, which would measure nothing.");
    e.code = "all_branded";
    throw e;
  }

  return { category: parsed.category, city: parsed.city || null, questions: clean };
}

// ---------------------------------------------------------------------------
// Brand detection — deliberately deterministic
// ---------------------------------------------------------------------------

const squash = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * True if the text names the business. Kept as plain string matching rather
 * than a model judgement so the headline number is reproducible and checkable
 * against the stored answer.
 */
function mentionsBrand(text, candidates) {
  const squashed = squash(text);
  return candidates.some((c) => {
    const bounded = new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (bounded.test(text)) return true;
    // "Sofa Alay" should count as "Sofaalay". Only for names distinctive enough
    // that ignoring spacing can't collide with an ordinary word.
    const sq = squash(c);
    return sq.length >= 6 && squashed.includes(sq);
  });
}

function firstMentionOffset(text, candidates) {
  let best = -1;
  for (const c of candidates) {
    const idx = text.toLowerCase().indexOf(c.toLowerCase());
    if (idx >= 0 && (best === -1 || idx < best)) best = idx;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------

async function askOne(client, { question, candidates, domain }) {
  try {
    const stream = await client.messages.stream({
      model: ANSWER_MODEL,
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
      system:
        "Answer as you would for a real person researching a purchase. Name specific businesses or products where you can, and say plainly when you don't know. Do not pad the answer.",
      messages: [{ role: "user", content: question }],
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      return { question, error: "The model declined this question.", skipped: true };
    }

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const mentioned = mentionsBrand(text, candidates);
    const cited = text.toLowerCase().includes(domain.replace(/^www\./, "").toLowerCase());
    const offset = mentioned ? firstMentionOffset(text, candidates) : -1;

    return {
      question,
      answer: text.slice(0, 4000),
      answerExcerpt: text.slice(0, 600),
      searched: message.content.some((b) => b.type === "web_search_tool_result"),
      webSearches: message.content.filter((b) => b.type === "web_search_tool_result").length,
      mentioned,
      cited,
      // How far into the answer the business first appears, as a percentage.
      // Being named in the opening line is worth more than a closing footnote.
      position: offset >= 0 ? Math.round((offset / Math.max(text.length, 1)) * 100) : null,
      usage: { input: message.usage?.input_tokens ?? null, output: message.usage?.output_tokens ?? null },
    };
  } catch (err) {
    return { question, error: String(err?.message || err).slice(0, 200), skipped: true };
  }
}

// ---------------------------------------------------------------------------
// Rival extraction
// ---------------------------------------------------------------------------

const RIVAL_SCHEMA = {
  type: "object",
  properties: {
    businesses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          count: { type: "integer", description: "How many of the answers named this business." },
        },
        required: ["name", "count"],
        additionalProperties: false,
      },
    },
  },
  required: ["businesses"],
  additionalProperties: false,
};

/**
 * Pulls the real competitor names out of the answers. A regex over capitalised
 * words returns things like "Here's" and "Cheapest", so this asks the model to
 * read its own answers back and list only actual businesses.
 */
async function extractRivals(client, { answers, brandName }) {
  if (!answers.length) return [];
  try {
    const response = await client.messages.parse({
      model: RIVAL_MODEL,
      max_tokens: 3000,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: RIVAL_SCHEMA } },
      system: `List only real, named businesses, brands or products. Exclude cities, neighbourhoods, generic descriptions, headings, and sentence fragments. Exclude "${brandName}" and any spelling of it.`,
      messages: [
        {
          role: "user",
          content: `Read these ${answers.length} answers and list the businesses named across them, with how many answers named each.\n\n${answers
            .map((a, i) => `--- Answer ${i + 1} ---\n${a}`)
            .join("\n\n")}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") return [];
    return (response.parsed_output?.businesses || [])
      .filter((b) => b.name && b.name.length > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  } catch {
    // A failed extraction shouldn't lose the measurement it was decorating.
    return [];
  }
}

// ---------------------------------------------------------------------------

function requireKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    const e = new Error("No Anthropic API key configured.");
    e.code = "not_configured";
    throw e;
  }
}

export async function runVisibilityCheck({ brandName = null, domain, questions, onProgress }) {
  requireKey();
  if (!questions?.length) {
    const e = new Error("No questions to ask.");
    e.code = "no_questions";
    throw e;
  }

  const client = new Anthropic();
  const candidates = brandCandidates({ brandName, domain });
  const results = [];
  const deadline = Date.now() + TIME_BUDGET_MS;

  // Sequential on purpose: each query does its own web searches, and hammering
  // them in parallel is both rate-limit bait and needlessly expensive.
  for (const q of questions) {
    if (Date.now() > deadline) {
      results.push({ id: q.id, question: q.question, error: "Ran out of time this run.", skipped: true });
      continue;
    }
    const r = await askOne(client, { question: q.question, candidates, domain });
    results.push({ id: q.id, ...r });
    if (onProgress) onProgress({ done: results.length, total: questions.length });
  }

  const answered = results.filter((r) => !r.skipped);
  const mentions = answered.filter((r) => r.mentioned).length;
  const citations = answered.filter((r) => r.cited).length;

  const topRivals = await extractRivals(client, {
    answers: answered.map((r) => r.answer).filter(Boolean),
    brandName: brandName || domain,
  });

  const placed = answered.filter((r) => r.position !== null);
  const avgPosition = placed.length
    ? Math.round(placed.reduce((s, r) => s + r.position, 0) / placed.length)
    : null;

  return {
    engine: "claude",
    engineLabel: "Claude",
    model: ANSWER_MODEL,
    domain,
    brandName,
    ranAt: new Date().toISOString(),
    questionsAsked: answered.length,
    questionsSkipped: results.length - answered.length,
    mentions,
    citations,
    mentionRate: answered.length ? mentions / answered.length : 0,
    citationRate: answered.length ? citations / answered.length : 0,
    avgPosition,
    topRivals,
    // Full answers are dropped before storage — they'd bloat the site document
    // and the excerpt is what the UI shows.
    results: results.map(({ answer, ...rest }) => rest),
    usage: {
      inputTokens: answered.reduce((s, r) => s + (r.usage?.input || 0), 0),
      outputTokens: answered.reduce((s, r) => s + (r.usage?.output || 0), 0),
      webSearches: answered.reduce((s, r) => s + (r.webSearches || 0), 0),
    },
  };
}
