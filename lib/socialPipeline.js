// Turning one thing worth saying into posts that suit each network.
//
//   angles → per-network draft → guardrail check
//
// The naive version of this feature writes one post and truncates it per
// network. That produces a LinkedIn post with a severed last sentence and an X
// post that reads like the opening of something longer, because it is. Each
// network gets its own draft written to its own shape, from a shared angle.
//
// Every stage runs on the cheapest model that can do it — see aiModels.js. A
// set of four drafts costs about a cent.

import Anthropic from "@anthropic-ai/sdk";
import { modelFor, thinkingFor } from "./aiModels";
import { NETWORKS, charLimitFor, effectiveLength, validatePost } from "./social";

const ANGLE_MODEL = modelFor("social_angles").id;
const DRAFT_MODEL = modelFor("social_draft").id;
const CHECK_MODEL = modelFor("social_guardrail").id;

// ---------------------------------------------------------------------------
// Stage 1 — angles. What is actually worth posting about this.
// ---------------------------------------------------------------------------

const ANGLES_SCHEMA = {
  type: "object",
  properties: {
    angles: {
      type: "array",
      description: "Distinct things worth saying about this. Not rephrasings of each other.",
      items: {
        type: "object",
        properties: {
          hook: { type: "string", description: "The one sentence that earns the reader's attention." },
          point: { type: "string", description: "What the reader takes away." },
          audience: { type: "string", description: "Who specifically this lands for." },
          evidence: {
            type: "string",
            description: "The fact from the source that backs this up, quoted or closely paraphrased. Empty if the source does not support it.",
          },
        },
        required: ["hook", "point", "audience", "evidence"],
        additionalProperties: false,
      },
    },
    unsupported: {
      type: "array",
      description: "Angles that would be worth posting but that the source material does not actually support.",
      items: { type: "string" },
    },
  },
  required: ["angles", "unsupported"],
  additionalProperties: false,
};

/**
 * Finds the angles worth posting. `unsupported` matters as much as `angles`:
 * it's where the model puts the claim it wanted to make and couldn't back, which
 * is exactly the claim that would otherwise have been quietly asserted in a
 * post going out under the customer's name.
 */
export async function angles({ source, siteContext, audience }) {
  requireKey();
  const client = new Anthropic();

  const res = await client.messages.parse({
    model: ANGLE_MODEL,
    max_tokens: 2000,
    ...thinkingFor("social_angles"),
    output_config: { effort: "low", format: { type: "json_schema", schema: ANGLES_SCHEMA } },
    system: [
      "You find the things worth saying publicly about a piece of source material.",
      "",
      "Every angle must be supported by the source. If an angle would need a fact the source does not contain, put it in `unsupported` instead of inventing the fact.",
      "An angle is not a summary. 'We wrote a blog post' is not an angle; the surprising thing the blog post found is.",
      "Three to five angles. Fewer good ones beats a full list.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [
          `Business: ${siteContext?.name || "unknown"} — ${siteContext?.summary || ""}`,
          audience ? `Who they sell to: ${audience}` : null,
          "",
          "Source material:",
          String(source || "").slice(0, 24000),
        ]
          .filter((l) => l !== null)
          .join("\n"),
      },
    ],
  });

  if (res.stop_reason === "refusal") {
    throw Object.assign(new Error("Declined to find angles in this material."), { code: "refused" });
  }
  const out = res.parsed_output;
  if (!out) throw Object.assign(new Error("No angles returned."), { code: "empty" });

  return { ...out, usage: usageOf(res) };
}

// ---------------------------------------------------------------------------
// Stage 2 — the draft, written to one network's shape
// ---------------------------------------------------------------------------

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string", description: "The post exactly as it should appear. No surrounding quotes, no commentary." },
    imageBrief: {
      type: "string",
      description:
        "What an accompanying image should show, for a designer or an image model. Empty string if the post does not need one.",
    },
    altText: { type: "string", description: "Alt text for that image. Empty if there is no image." },
    firstComment: {
      type: "string",
      description: "Text for a first comment, where the network penalises links in the post body. Empty if not needed.",
    },
    confidence: {
      type: "number",
      description: "0 to 1: how sure you are every claim in this post is supported by the source.",
    },
  },
  required: ["text", "imageBrief", "altText", "firstComment", "confidence"],
  additionalProperties: false,
};

// Written per network rather than derived from the constants, because the
// difference between these platforms is cultural, not numeric. A 280-character
// LinkedIn post is not an X post.
const NETWORK_STYLE = {
  linkedin: [
    "Open with the specific claim, not a windup. 'Most X get Y wrong' is a windup.",
    "Short paragraphs, one idea each, blank line between them. It is read on a phone.",
    "No emoji bullets. No 'Thoughts?' at the end.",
  ],
  x: [
    "One idea. If it needs two, it needs to be two posts, and you are writing the first.",
    "No hashtags unless the tag is a real community that reads it.",
    "The link, if any, goes last.",
  ],
  instagram: [
    "The first line is all most people read — it has to stand alone.",
    "Never put a URL in the caption; it is not clickable. Refer to the profile link instead.",
    "Tags go in a block at the end, not scattered through the sentences.",
  ],
  facebook: [
    "Plainer and warmer than LinkedIn. Assume a general reader, not a peer.",
    "Two or three short paragraphs at most.",
  ],
};

/**
 * Writes one post for one network.
 *
 * The character limit is given to the model and then enforced in code, because
 * a limit in a prompt is a request. `tooLong` coming back true is a bug the UI
 * has to surface rather than a draft to publish — see `writePosts`, which
 * retries once at a hard-tightened target before giving up and saying so.
 */
export async function draftFor({ networkId, angle, siteContext, voice, rules, link, premium = false }) {
  requireKey();
  const net = NETWORKS[networkId];
  if (!net) throw new Error(`Unknown network "${networkId}".`);

  const client = new Anthropic();
  const limit = charLimitFor(networkId, { premium });
  const guardrails = (rules || []).map((r) => `- ${r.text || r}`).join("\n");

  const res = await client.messages.parse({
    model: DRAFT_MODEL,
    max_tokens: 2000,
    ...thinkingFor("social_draft"),
    output_config: { effort: "low", format: { type: "json_schema", schema: DRAFT_SCHEMA } },
    system: [
      `You write posts for ${net.label}.`,
      "",
      ...NETWORK_STYLE[networkId],
      "",
      `Hard limit: ${limit} characters.`,
      net.linkCharCost ? `Every link counts as ${net.linkCharCost} characters on this network however long it is.` : null,
      net.imageRequired
        ? "This network cannot post text alone. Always fill in imageBrief and altText."
        : "Only fill in imageBrief if an image genuinely adds something.",
      !net.linksOk ? "Links are not clickable here. Never put a URL in the text." : null,
      `At most ${net.hashtags.advised} hashtags.`,
      "",
      "Claim nothing the angle's evidence does not support. Lower `confidence` instead of hedging the wording — a post that reads as confident but scores 0.4 is worse than one that scores 0.4 and says so.",
      guardrails ? `\nThe customer's standing rules. These override everything above:\n${guardrails}` : null,
      voice ? `\nVoice: ${voice}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    messages: [
      {
        role: "user",
        content: [
          `Business: ${siteContext?.name || "unknown"} — ${siteContext?.summary || ""}`,
          "",
          `Hook: ${angle.hook}`,
          `Point: ${angle.point}`,
          `Audience: ${angle.audience}`,
          `Evidence from the source: ${angle.evidence || "(none — do not assert anything specific)"}`,
          link && net.linksOk ? `\nLink to include: ${link}` : null,
        ]
          .filter((l) => l !== null)
          .join("\n"),
      },
    ],
  });

  if (res.stop_reason === "refusal") {
    throw Object.assign(new Error(`Declined to draft a ${net.label} post from this angle.`), { code: "refused" });
  }
  const out = res.parsed_output;
  if (!out) throw Object.assign(new Error("No draft returned."), { code: "empty" });

  const length = effectiveLength(out.text, networkId);
  return {
    ...out,
    networkId,
    length,
    limit,
    tooLong: length > limit,
    usage: usageOf(res),
  };
}

// ---------------------------------------------------------------------------
// Stage 3 — the guardrail check
// ---------------------------------------------------------------------------

const GUARDRAIL_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["clean", "review", "block"],
      description: "clean: nothing wrong. review: a person should look. block: breaks a stated rule.",
    },
    breaches: {
      type: "array",
      description: "Each rule this post breaks, and the words that break it.",
      items: {
        type: "object",
        properties: {
          rule: { type: "string" },
          quote: { type: "string", description: "The exact words from the post." },
          why: { type: "string" },
        },
        required: ["rule", "quote", "why"],
        additionalProperties: false,
      },
    },
    unsupportedClaims: {
      type: "array",
      description: "Statements of fact in the post that the source does not back.",
      items: { type: "string" },
    },
  },
  required: ["verdict", "breaches", "unsupportedClaims"],
  additionalProperties: false,
};

/**
 * Checks a finished post against the customer's own rules and the source.
 *
 * Separate from drafting on purpose. Asking one call to both write the post and
 * judge it produces a model marking its own homework, and it marks it generously
 * — the same call that just chose the words is the worst judge of whether they
 * overclaim.
 */
export async function guardrailCheck({ text, rules, source }) {
  requireKey();
  const client = new Anthropic();

  const guardrails = (rules || []).map((r) => `- ${r.text || r}`).join("\n");
  if (!guardrails && !source) {
    // Nothing to check against. Say so rather than returning a clean verdict
    // that implies a check happened.
    return { verdict: "review", breaches: [], unsupportedClaims: [], checked: false, usage: null };
  }

  const res = await client.messages.parse({
    model: CHECK_MODEL,
    max_tokens: 1500,
    ...thinkingFor("social_guardrail"),
    output_config: { effort: "low", format: { type: "json_schema", schema: GUARDRAIL_SCHEMA } },
    system: [
      "You check a social post before it is published under a company's own name.",
      "",
      "Quote the exact words when you flag something. A breach you cannot quote is a breach you have not found.",
      "Judge only what the post asserts. A post that is merely bland is clean.",
      "'block' is for a stated rule broken outright. 'review' is for a claim you cannot verify from the source.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [
          "Post:",
          text,
          "",
          guardrails ? `Standing rules:\n${guardrails}` : "Standing rules: none given.",
          "",
          source ? `Source material this came from:\n${String(source).slice(0, 12000)}` : "Source material: none given.",
        ].join("\n"),
      },
    ],
  });

  const out = res.parsed_output;
  if (!out) return { verdict: "review", breaches: [], unsupportedClaims: [], checked: false, usage: usageOf(res) };
  return { ...out, checked: true, usage: usageOf(res) };
}

// ---------------------------------------------------------------------------
// The whole pipeline
// ---------------------------------------------------------------------------

/**
 * One angle, drafted for every requested network and checked.
 *
 * Networks are drafted concurrently — they don't depend on each other, and doing
 * them in series makes a four-network set feel broken. One failing network does
 * not sink the set: it comes back with an `error` and the others still arrive,
 * because three usable drafts and one honest failure is a better outcome than
 * nothing.
 */
export async function writePosts({
  networkIds,
  angle,
  siteContext,
  voice,
  rules,
  link,
  source,
  premium = false,
  onStage,
}) {
  const usage = [];

  const results = await Promise.all(
    (networkIds || []).map(async (networkId) => {
      try {
        onStage?.(`drafting ${NETWORKS[networkId]?.label || networkId}`);
        let post = await draftFor({ networkId, angle, siteContext, voice, rules, link, premium });
        usage.push(post.usage);

        // One retry, at a target below the real limit so the model has room to
        // land under it. Past that we hand back the long draft and say it is
        // long — silently truncating mid-sentence is how a severed post ends up
        // on a customer's feed.
        if (post.tooLong) {
          onStage?.(`tightening ${NETWORKS[networkId]?.label || networkId}`);
          const tightened = await draftFor({
            networkId,
            angle: { ...angle, point: `${angle.point}\n\nSay this in at most ${Math.floor(post.limit * 0.8)} characters.` },
            siteContext,
            voice,
            rules,
            link,
            premium,
          });
          usage.push(tightened.usage);
          if (!tightened.tooLong) post = tightened;
        }

        const check = await guardrailCheck({ text: post.text, rules, source });
        if (check.usage) usage.push(check.usage);

        const problems = validatePost({
          networkId,
          text: post.text,
          // The pipeline writes a brief, not an image. An Instagram draft is
          // therefore always short of one asset, and validatePost is what says
          // so rather than letting it reach the publisher.
          images: [],
          premium,
        });

        return {
          networkId,
          text: post.text,
          imageBrief: post.imageBrief || null,
          altText: post.altText || null,
          firstComment: post.firstComment || null,
          confidence: post.confidence,
          length: post.length,
          limit: post.limit,
          tooLong: post.tooLong,
          guardrail: check,
          problems,
          // Three separate ways a post can fail to be publishable, kept apart so
          // the UI can say which one it is.
          publishable: !post.tooLong && problems.length === 0 && check.verdict === "clean" && post.confidence >= 0.6,
          needsImage: !!NETWORKS[networkId]?.imageRequired,
          error: null,
        };
      } catch (err) {
        return {
          networkId,
          error: String(err?.message || err),
          code: err?.code || null,
          publishable: false,
        };
      }
    })
  );

  return { posts: results, usage: mergeUsage(usage) };
}

function mergeUsage(list) {
  return (list || []).filter(Boolean).reduce(
    (acc, u) => ({
      inputTokens: acc.inputTokens + (u.inputTokens || 0),
      outputTokens: acc.outputTokens + (u.outputTokens || 0),
      webSearches: acc.webSearches + (u.webSearches || 0),
    }),
    { inputTokens: 0, outputTokens: 0, webSearches: 0 }
  );
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
