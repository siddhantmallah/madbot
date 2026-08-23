import { NextResponse } from "next/server";
import { applyMailEvent, verifySignature } from "../../../../lib/mailEvents";
import { adminAvailable } from "../../../../lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Receives delivery events from Resend.
 *
 * Two rules that matter for a webhook specifically.
 *
 * The raw body must be read before anything parses it, because the signature is
 * computed over the exact bytes sent. Calling request.json() first and
 * re-serialising would change key order and whitespace, and the signature would
 * never match.
 *
 * And a verified-but-unprocessable event returns 200, not an error. Svix retries
 * anything non-2xx, so returning 500 for an event we simply don't handle turns
 * one unknown event type into an indefinite retry loop.
 */
export async function POST(request) {
  const body = await request.text();

  const check = verifySignature({
    secret: process.env.RESEND_WEBHOOK_SECRET,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    body,
  });

  if (!check.ok) {
    // Deliberately terse. An attacker probing this endpoint learns nothing
    // about why their forgery failed.
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  if (!adminAvailable()) {
    // 503 rather than 200: this one IS worth retrying, since the event is
    // genuine and only our own storage is missing.
    return NextResponse.json({ ok: false, error: "No service account configured." }, { status: 503 });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: true, ignored: "unparseable body" });
  }

  const d = event?.data || {};
  const to = Array.isArray(d.to) ? d.to[0] : d.to;

  try {
    const result = await applyMailEvent({
      type: event?.type,
      messageId: d.email_id || d.id || null,
      to: to || null,
      subject: d.subject || null,
      at: event?.created_at || null,
      raw: event,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Storage failed on a genuine event — worth a retry.
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 503 });
  }
}

// Resend pings the endpoint when you add it.
export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: !!process.env.RESEND_WEBHOOK_SECRET,
    storage: adminAvailable(),
  });
}
