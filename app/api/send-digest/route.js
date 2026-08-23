import { NextResponse } from "next/server";

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

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "MADBOT <onboarding@resend.dev>",
      to: [email],
      subject: subject || "Your MADBOT digest",
      html,
      text,
    }),
  });

  const resendData = await resendRes.json().catch(() => ({}));
  if (!resendRes.ok) {
    return NextResponse.json({ ok: false, error: resendData?.message || "Failed to send." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, id: resendData.id, to: email });
}
