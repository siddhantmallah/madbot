// Writing a directory listing to one directory's exact form.
//
// The temptation is to write the copy once and paste it everywhere. It reads
// badly everywhere: a 60-character Product Hunt tagline padded out to 2,000
// characters for Capterra is filler, and a Capterra description cut to 60
// characters for Product Hunt is a fragment. Each form gets its own pass.

import Anthropic from "@anthropic-ai/sdk";
import { modelFor, thinkingFor } from "./aiModels";
import { DIRECTORIES, validateListing } from "./listings";

const MODEL = modelFor("listing_copy").id;

function schemaFor(directory) {
  const properties = {};
  const required = [];

  for (const [field, spec] of Object.entries(directory.fields)) {
    // Categories and features are lists on every form that has them; the rest
    // are free text. Building the schema from the directory definition rather
    // than hand-writing one per directory is what stops the two drifting.
    if (field === "categories" || field === "features") {
      properties[field] = {
        type: "array",
        description: `${spec.label}. At most ${spec.max}.`,
        items: { type: "string" },
      };
    } else {
      properties[field] = {
        type: "string",
        description: `${spec.label}. Hard limit ${spec.max} characters.`,
      };
    }
    required.push(field);
  }

  // Always asked for, on every directory: the claims made, so a person can check
  // them without rereading the copy against the site.
  properties.claims = {
    type: "array",
    description: "Every factual claim this copy makes about the product, one per item.",
    items: { type: "string" },
  };
  required.push("claims");

  return { type: "object", properties, required, additionalProperties: false };
}

/**
 * Writes the copy for one directory.
 *
 * Length is enforced in code after the fact, the same way the article pipeline
 * enforces internal links: the prompt states the limit, and `validateListing`
 * is what guarantees it. A model told "at most 60 characters" writes 64 often
 * enough that trusting it would put truncated copy on someone else's site.
 */
export async function writeListing({ directoryId, siteContext, sitePages, voice, rules }) {
  requireKey();
  const directory = DIRECTORIES[directoryId];
  if (!directory) throw new Error(`Unknown directory "${directoryId}".`);

  const client = new Anthropic();
  const guardrails = (rules || []).map((r) => `- ${r.text || r}`).join("\n");

  const fieldSpec = Object.entries(directory.fields)
    .map(([field, spec]) => `- ${field} (${spec.label}): at most ${spec.max}${spec.required ? ", required" : ", optional"}`)
    .join("\n");

  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 3000,
    ...thinkingFor("listing_copy"),
    output_config: { effort: "low", format: { type: "json_schema", schema: schemaFor(directory) } },
    system: [
      `You write a product listing for ${directory.name}.`,
      "",
      `What ${directory.name} is: ${directory.note}`,
      "",
      "Fields, with their hard limits:",
      fieldSpec,
      "",
      "Count characters. A field over its limit is truncated by the directory, mid-word, in public.",
      "Write what the product does, not what category it belongs to. 'Marketing automation platform' tells a reader nothing they did not already assume from the page they are on.",
      "Claim only what the source material supports. List every claim you make in `claims` so a person can check them.",
      guardrails ? `\nThe customer's standing rules, which override everything above:\n${guardrails}` : null,
      voice ? `\nVoice: ${voice}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    messages: [
      {
        role: "user",
        content: [
          `Business: ${siteContext?.name || "unknown"}`,
          `What it does: ${siteContext?.summary || "(unknown)"}`,
          siteContext?.audience ? `Who it is for: ${siteContext.audience}` : null,
          siteContext?.differentiator ? `What makes it different: ${siteContext.differentiator}` : null,
          "",
          sitePages?.length
            ? `Pages on the site:\n${sitePages.slice(0, 25).map((p) => `${p.path} — ${p.title || "untitled"}`).join("\n")}`
            : null,
        ]
          .filter((l) => l !== null)
          .join("\n"),
      },
    ],
  });

  if (res.stop_reason === "refusal") {
    throw Object.assign(new Error(`Declined to write a ${directory.name} listing.`), { code: "refused" });
  }
  const copy = res.parsed_output;
  if (!copy) throw Object.assign(new Error("No listing copy returned."), { code: "empty" });

  const problems = validateListing(directoryId, copy);

  return {
    directoryId,
    copy,
    claims: copy.claims || [],
    problems,
    // Same rule as everywhere else: the pipeline never decides this is finished.
    ready: problems.length === 0,
    usage: {
      inputTokens: res.usage?.input_tokens || 0,
      outputTokens: res.usage?.output_tokens || 0,
      webSearches: 0,
    },
  };
}

function requireKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw Object.assign(new Error("No Anthropic API key configured."), { code: "not_configured" });
  }
}
