import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Article generation with adaptive thinking can run well past the default
// serverless ceiling. Hosting plans cap this lower and will clamp it.
export const maxDuration = 300;

const MODEL = "claude-opus-5";

// Same identity check the digest route uses: the recipient of the work must be
// the account that asked for it, verified against Google rather than trusted
// from the client.
async function verifiedUidFromIdToken(idToken) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.users?.[0]?.localId || null;
}

// Availability probe so the UI can tell the truth about whether real writing
// is switched on, instead of advertising a button that can't work.
export async function GET() {
  return NextResponse.json({ ok: true, configured: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
}

function buildSystemPrompt({ siteName, domain, description, rules, voice }) {
  const guardrails = (rules || []).map((r) => `- ${r.text || r}`).join("\n");
  return [
    `You are writing web content for ${siteName} (${domain}).`,
    description ? `How the site describes itself: ${description}` : null,
    "",
    "How to write:",
    voice === "a"
      ? "- Short, direct sentences. Plain words. No corporate throat-clearing."
      : "- Professional and thorough, but never padded or vague.",
    "- Lead with the answer, then support it. Never open with a definition of the industry.",
    "- Be specific. If you do not know a fact about this business, write around it rather than inventing it.",
    "- No invented statistics, awards, certifications, customer counts or testimonials.",
    "- Write for someone deciding whether to buy, not for a search engine.",
    "",
    guardrails ? `Hard rules from the site owner — never break these:\n${guardrails}` : null,
    "",
    "Return GitHub-flavoured Markdown. Start with a single H1. Use H2s for sections.",
    "Do not include front matter, code fences around the whole document, or commentary about the task.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildUserPrompt({ title, kind, angle, wordTarget, findings }) {
  const kindGuidance = {
    Pillar: "A comprehensive primary page that owns this topic end to end. Cover the whole decision, with clear section headings someone can scan.",
    Support: "A focused piece answering one specific question well. Go deep on the one thing rather than broad.",
    Compare: "An honest comparison. State tradeoffs plainly, including where the alternative is genuinely better. Never disparage. Do not invent competitor feature details — describe the dimensions buyers should compare on instead.",
    Answer: "Short and quotable. Answer the question directly in the first sentence, then briefly expand. Structure so a machine can extract the answer cleanly.",
    Outreach: "A short pitch email to an editor. Lead with a specific, timely angle. Under 200 words, no attachments implied.",
    Digest: "A brief internal summary. Plain and scannable.",
    Upkeep: "A refresh brief describing what to change and why.",
  };

  const relevant = (findings || [])
    .filter((f) => f.severity !== "good")
    .slice(0, 4)
    .map((f) => `- ${f.title}: ${f.detail}`)
    .join("\n");

  return [
    `Write this piece: "${title}"`,
    `Type: ${kind} — ${kindGuidance[kind] || kindGuidance.Support}`,
    angle ? `The angle the owner asked for: ${angle}` : null,
    wordTarget ? `Aim for roughly ${wordTarget} words.` : "Aim for roughly 900 words.",
    "",
    relevant
      ? `Known weaknesses on this site, so you can write in a way that helps rather than repeats them:\n${relevant}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        notConfigured: true,
        error: "Real writing isn't switched on yet — no Anthropic API key is configured on the server.",
      },
      { status: 200 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { idToken, item, site } = body || {};
  if (!idToken) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!item?.title) return NextResponse.json({ ok: false, error: "Nothing to write." }, { status: 400 });

  const uid = await verifiedUidFromIdToken(idToken);
  if (!uid) return NextResponse.json({ ok: false, error: "Could not verify your account." }, { status: 401 });

  const client = new Anthropic();

  try {
    // Streamed so a long article can't trip the SDK's HTTP timeout; the final
    // message is assembled before responding.
    const stream = await client.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: buildSystemPrompt({
        siteName: site?.name || site?.domain || "this site",
        domain: site?.domain || "",
        description: site?.description || "",
        rules: site?.rules || [],
        voice: site?.voice || "a",
      }),
      messages: [
        {
          role: "user",
          content: buildUserPrompt({
            title: item.title,
            kind: item.kind || "Support",
            angle: item.angle || null,
            wordTarget: item.wordTarget || null,
            findings: site?.findings || [],
          }),
        },
      ],
    });

    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      return NextResponse.json({
        ok: false,
        error: `The model declined to write this${message.stop_details?.category ? ` (${message.stop_details.category})` : ""}. Try rephrasing the topic.`,
      });
    }

    const article = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!article) {
      return NextResponse.json({ ok: false, error: "The model returned nothing usable. Try again." });
    }

    const words = article.split(/\s+/).filter(Boolean).length;

    return NextResponse.json({
      ok: true,
      article,
      words,
      model: message.model,
      usage: {
        input: message.usage?.input_tokens ?? null,
        output: message.usage?.output_tokens ?? null,
      },
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ ok: false, error: "The configured Anthropic API key was rejected." }, { status: 200 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ ok: false, error: "Rate limited by the API — try again in a moment." }, { status: 200 });
    }
    if (err instanceof Anthropic.BadRequestError) {
      return NextResponse.json({ ok: false, error: `The request was rejected: ${err.message}` }, { status: 200 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ ok: false, error: `API error ${err.status}: ${err.message}` }, { status: 200 });
    }
    return NextResponse.json({ ok: false, error: "Writing failed unexpectedly." }, { status: 200 });
  }
}
