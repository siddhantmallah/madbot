// Drafts the actual fix for one opportunity: the meta description, the title,
// the heading changes, the structured data. Server-only.
//
// What it is: one model call over the page as it is right now, fetched live,
// returning the snippet a person (or their developer) pastes in. What it is
// not: an editor of the customer's site. MADBOT has no write access to their
// pages, so the fix goes to Approvals with the snippet, and "approved" means
// "I've applied it". A re-audit is what confirms it took.

import Anthropic from "@anthropic-ai/sdk";
import { modelFor, thinkingFor } from "./aiModels";
import { safeFetch } from "./urlGuard";
import { canonicalOf, h1Of, htmlLang, metaContent, propContent, schemaTypes, stripTags, titleOf, visibleText } from "./htmlParse";
import { elements } from "./htmlTags";

const MODEL = modelFor("seo_recommend").id;

const FIX_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "One or two sentences: what to change and why, specific to this page." },
    where: { type: "string", description: "Exactly where it goes, e.g. 'In the <head> of the homepage, replacing the current <title>'." },
    snippets: {
      type: "array",
      description: "The code or text to paste. Usually one; at most three.",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          language: { type: "string", enum: ["html", "json", "text"] },
          code: { type: "string" },
        },
        required: ["label", "language", "code"],
        additionalProperties: false,
      },
    },
    check: { type: "string", description: "How to confirm it worked once applied." },
    assumptions: {
      type: "array",
      description: "Anything in the snippet not taken from the page itself, for a person to confirm. Empty if everything came from the page.",
      items: { type: "string" },
    },
  },
  required: ["summary", "where", "snippets", "check", "assumptions"],
  additionalProperties: false,
};

function headings(html, tag, max = 12) {
  return elements(html, tag, { limit: 200 })
    .filter((e) => e.inner !== null)
    .map((e) => stripTags(String(e.inner)).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, max);
}

/** What the page says about itself right now: the only material the fix may use. */
export async function readPage(url) {
  const res = await safeFetch(url, { timeoutMs: 10_000, capBytes: 600_000 });
  if (!res.ok) throw Object.assign(new Error(`The page answered ${res.status}, so there was nothing to base a fix on.`), { code: "fetch" });
  const html = res.body;
  return {
    url: res.finalUrl || url,
    title: titleOf(html),
    description: metaContent(html, "description") || "",
    h1: h1Of(html),
    h2: headings(html, "h2"),
    h3: headings(html, "h3", 8),
    lang: htmlLang(html),
    canonical: canonicalOf(html) || "",
    ogTitle: propContent(html, "og:title") || "",
    ogDescription: propContent(html, "og:description") || "",
    ogImage: propContent(html, "og:image") || "",
    schemaTypes: schemaTypes(html),
    text: visibleText(html).replace(/\s+/g, " ").trim().slice(0, 6000),
  };
}

/**
 * The fix for one opportunity, as { summary, where, snippets, check,
 * assumptions, usage }. `opportunity` is what the Opportunities screen shows:
 * its title, detail and fix line, plus the area it came from.
 */
export async function draftFix({ opportunity, page, businessName }) {
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error("No Anthropic API key configured."), { code: "not_configured" });
  const client = new Anthropic();

  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 6000,
    ...thinkingFor("seo_recommend"),
    output_config: { format: { type: "json_schema", schema: FIX_SCHEMA } },
    system: [
      "You write the exact fix for one problem found on a website, for the owner or their developer to paste in.",
      "",
      "Rules:",
      "- Use only facts from the page provided. Never invent a phone number, address, price, rating, review, opening hours, founding date or person. If the fix needs one of those and the page doesn't give it, leave a clearly marked placeholder such as [ADD PHONE NUMBER] and list it in `assumptions`.",
      "- Titles: 50–60 characters where the content allows, the specific thing first, the brand last. Meta descriptions: 140–155 characters, plain, no quotation marks.",
      "- Structured data: valid JSON-LD for schema.org, inside a <script type=\"application/ld+json\"> block, with only the properties the page supports. No aggregateRating or review unless the page shows real reviews.",
      "- Headings: say which existing heading to change and to what, using the page's real heading text.",
      "- Keep the site's own voice and language. If the page is in a language other than English, write the fix in that language.",
      "- If the problem cannot be fixed by changing the page's HTML (server configuration, hosting, redirects), say so in `summary`, give the configuration snippet if there is a standard one, and say where it goes.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [
          `Problem: ${opportunity.title}`,
          opportunity.detail ? `What was found: ${opportunity.detail}` : null,
          opportunity.fix ? `The fix in one line: ${opportunity.fix}` : null,
          opportunity.area ? `Area: ${opportunity.area}` : null,
          "",
          `The page (${page.url}), as it is right now:`,
          `Business name: ${businessName || "(not known)"}`,
          `<title>: ${page.title || "(none)"}`,
          `Meta description: ${page.description || "(none)"}`,
          `H1: ${page.h1 || "(none)"}`,
          `H2s: ${page.h2.length ? page.h2.join(" | ") : "(none)"}`,
          `H3s: ${page.h3.length ? page.h3.join(" | ") : "(none)"}`,
          `<html lang>: ${page.lang || "(none)"}`,
          `Canonical: ${page.canonical || "(none)"}`,
          `og:title: ${page.ogTitle || "(none)"} · og:description: ${page.ogDescription || "(none)"} · og:image: ${page.ogImage || "(none)"}`,
          `Structured data types already present: ${page.schemaTypes.length ? page.schemaTypes.join(", ") : "(none)"}`,
          "",
          `Visible text (first part):\n${page.text}`,
        ]
          .filter((l) => l !== null)
          .join("\n"),
      },
    ],
  });

  if (res.stop_reason === "refusal") throw Object.assign(new Error("The model declined to draft this fix."), { code: "refused" });
  const out = res.parsed_output;
  if (!out || !out.snippets?.length) throw Object.assign(new Error("No fix came back."), { code: "empty" });

  return {
    ...out,
    usage: { inputTokens: res.usage?.input_tokens || 0, outputTokens: res.usage?.output_tokens || 0, webSearches: 0 },
  };
}
