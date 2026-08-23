import { NextResponse } from "next/server";
import { sendEmail, usingSandboxSender } from "../../../lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The recipient is never trusted from the client — we verify the caller's
// Firebase ID token against Google's identity endpoint and only ever send
// to the email that token actually belongs to. Otherwise this route would
// be an open relay for anyone who found the URL.
async function verifiedEmailFromIdToken(idToken) {
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
  return data?.users?.[0]?.email || null;
}

export async function POST(request) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: false, error: "Email sending isn't configured yet." }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { idToken, subject, html, text } = body || {};
  if (!idToken || !html) {
    return NextResponse.json({ ok: false, error: "Missing digest content." }, { status: 400 });
  }

  const email = await verifiedEmailFromIdToken(idToken);
  if (!email) {
    return NextResponse.json({ ok: false, error: "Could not verify your account." }, { status: 401 });
  }

  const result = await sendEmail({
    to: email,
    subject: subject || "Your MADBOT digest",
    html,
    text,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        // The sandbox sender only delivers to the Resend account's own address,
        // which looks exactly like a broken app if it isn't called out.
        sandboxSender: usingSandboxSender(),
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, id: result.id, to: email });
}
