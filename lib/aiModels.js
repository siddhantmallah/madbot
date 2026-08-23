// Which model does which job, and what each one costs.
//
// The rule from the pricing brief: don't reach for the biggest model by
// default. Classification, extraction and scoring are cheap work and should run
// on cheap models; only genuinely hard reasoning earns an expensive one.
//
// PRICES ARE CONFIGURATION, NOT FACT. They're used to meter customer usage and
// enforce budgets, so a stale number here means over- or under-charging.
// Check them against Anthropic's current pricing page before launch, and
// re-check whenever a model is added.

export const MODELS = {
  cheap: {
    id: "claude-haiku-4-5-20251001",
    label: "Haiku 4.5",
    inputPerMTok: 1.0,
    outputPerMTok: 5.0,
  },
  standard: {
    id: "claude-sonnet-5",
    label: "Sonnet 5",
    inputPerMTok: 2.0,
    outputPerMTok: 10.0,
  },
  deep: {
    id: "claude-opus-5",
    label: "Opus 5",
    inputPerMTok: 5.0,
    outputPerMTok: 25.0,
  },
};

// Anthropic bills server-side web search per search, on top of tokens. Ignoring
// it would under-report the cost of exactly the feature that uses it most.
export const WEB_SEARCH_PER_1K = 10.0;

/**
 * Every job MADBOT does, and the tier it runs on.
 *
 * `visibility_answer` deliberately stays on the deep model. The whole point of
 * that check is "what would a buyer actually be told" — running it on a cheaper
 * model would measure something nobody asked about, and a wrong answer there
 * isn't a saving, it's a fabrication. The analysis wrapped around it is cheap
 * work and drops accordingly.
 */
export const JOBS = {
  visibility_questions: { tier: "cheap", label: "Work out buyer questions" },
  visibility_answer: { tier: "deep", label: "Ask an assistant a buyer question", webSearches: 3 },
  visibility_rivals: { tier: "cheap", label: "Extract named competitors" },
  content_outline: { tier: "standard", label: "Outline an article" },
  content_write: { tier: "standard", label: "Write an article" },
  content_factcheck: { tier: "cheap", label: "Check claims against the source" },
  lead_classify: { tier: "cheap", label: "Match a company against your buyer profile" },
  lead_analyse: { tier: "standard", label: "Analyse a company in depth" },
  lead_outreach: { tier: "standard", label: "Draft an outreach message" },
  competitor_analyse: { tier: "standard", label: "Analyse a competitor's move" },
  seo_recommend: { tier: "standard", label: "Recommend an SEO fix" },
  page_classify: { tier: "cheap", label: "Classify a page" },
};

export function modelFor(job) {
  const spec = JOBS[job];
  if (!spec) throw new Error(`Unknown AI job "${job}" — add it to JOBS in aiModels.js.`);
  return MODELS[spec.tier];
}

/**
 * What a call actually cost, in USD. Takes real token counts from the response
 * rather than an estimate, so recorded spend matches the bill.
 */
export function costOf({ job, inputTokens = 0, outputTokens = 0, webSearches = 0 }) {
  const model = modelFor(job);
  return (
    (inputTokens / 1_000_000) * model.inputPerMTok +
    (outputTokens / 1_000_000) * model.outputPerMTok +
    (webSearches / 1000) * WEB_SEARCH_PER_1K
  );
}

/**
 * A pre-flight estimate, used to decide whether a call is allowed to start.
 * Deliberately pessimistic: refusing a call that would have been cheap is
 * recoverable, letting through one that blows the budget is not.
 */
export function estimateCost({ job, expectedInputTokens = 8000, expectedOutputTokens = 2000 }) {
  const spec = JOBS[job];
  return costOf({
    job,
    inputTokens: expectedInputTokens,
    outputTokens: expectedOutputTokens,
    webSearches: spec?.webSearches || 0,
  });
}
