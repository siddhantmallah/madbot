// Outbound email. One place, so the sender address and failure handling don't
// drift between the digest, the welcome mail and whatever comes next.

import { CONTACT_EMAIL } from "./contact";
import { isSuppressed } from "./mailEvents";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const SANDBOX = "MADBOT <onboarding@resend.dev>";

/**
 * Two separate sending identities, on purpose.
 *
 * Transactional mail — welcome, digests, receipts — must always arrive. It goes
 * from the root domain, whose reputation nothing else can damage.
 *
 * Marketing mail goes from its own subdomain. If a campaign trips spam filters,
 * the damage is contained there and receipts keep landing. That containment is
 * the entire point, so marketing deliberately does NOT fall back to the
 * transactional sender — it refuses instead.
 *
 * Note on classification: a welcome email is transactional. It's triggered by
 * the recipient's own signup and describes their account, so it belongs on the
 * stream that has to work, not the one that might get filtered.
 */
export function senderAddress(stream = "transactional") {
  if (stream === "marketing") return process.env.MARKETING_EMAIL_FROM || null;
  return process.env.EMAIL_FROM || SANDBOX;
}

/**
 * True when transactional mail is still going through Resend's sandbox sender,
 * which only delivers to the Resend account's own address — so everything to a
 * real customer silently vanishes.
 */
export function usingSandboxSender() {
  return !process.env.EMAIL_FROM;
}

/**
 * Sends one email. Returns a result rather than throwing, so a caller can
 * record the failure without losing the thing it was notifying about.
 */
export async function sendEmail({ to, subject, html, text, replyTo = CONTACT_EMAIL, stream = "transactional" }) {
  // replyTo defaults to the monitored contact address, which may be null. It
  // must never fall back to the From address: that inbox is send-only, so a
  // reply there is never read by anyone.
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY is not configured.", code: "not_configured" };
  }
  if (!to) return { ok: false, error: "No recipient.", code: "no_recipient" };

  // Recording bounces is pointless unless something acts on them. Continuing to
  // mail an address that hard-bounced or filed a complaint is what wrecks a
  // sending domain's reputation, which then costs delivery for every other
  // customer.
  const blocked = await isSuppressed(to);
  if (blocked) {
    return {
      ok: false,
      error: `${to} is suppressed after a ${blocked.reason}. Nothing was sent.`,
      code: "suppressed",
      suppression: { reason: blocked.reason, detail: blocked.detail || null },
    };
  }

  const from = senderAddress(stream);
  if (!from) {
    // Only reachable for marketing, which has no fallback by design — sending a
    // campaign from the transactional domain is the exact risk the split exists
    // to prevent.
    return {
      ok: false,
      error: "No marketing sender configured. Set MARKETING_EMAIL_FROM to an address on a verified marketing subdomain.",
      code: "no_marketing_sender",
    };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        ...(text ? { text } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: data?.message || `Resend returned ${res.status}.`,
        code: "rejected",
        status: res.status,
        sandbox: usingSandboxSender(),
      };
    }
    return { ok: true, id: data.id, to };
  } catch (err) {
    return { ok: false, error: String(err?.message || err), code: "network" };
  }
}

const WRAP = (body) => `<!doctype html>
<html><body style="margin:0;padding:0;background:#0A0810;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0810;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#141020;border-radius:14px;padding:32px;font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#EDEAF5;">
${body}
<tr><td style="padding-top:26px;border-top:1px solid rgba(255,255,255,.10);color:rgba(237,234,245,.42);font-size:12px;">
getmadbot.com — autonomous website marketing
</td></tr>
</table>
</td></tr></table>
</body></html>`;

/**
 * The welcome mail. States what they actually get and for how long — a welcome
 * that oversells the trial just creates a support ticket on day fifteen.
 */
export function buildWelcomeEmail({ name, maxSites, intendedPlanName, trialDays, siteUrl, contactEmail = CONTACT_EMAIL }) {
  const first = (name || "").trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : "Hi,";

  const subject = `Your MADBOT trial is live — ${trialDays} days, everything included`;

  const body = `
<tr><td style="padding-bottom:18px;">
  <span style="font-size:21px;font-weight:700;color:#fff;">Your trial is live</span>
</td></tr>
<tr><td style="padding-bottom:16px;">${greeting}</td></tr>
<tr><td style="padding-bottom:16px;">
  You have <strong style="color:#fff;">${trialDays} days</strong> of everything MADBOT does, across up to
  <strong style="color:#fff;">${maxSites} sites</strong> — so you can see it working, client sites included, before
  paying for it. No card was taken and nothing renews on its own.
</td></tr>
${
  intendedPlanName
    ? `<tr><td style="padding-bottom:16px;color:rgba(237,234,245,.72);">
  You picked <strong style="color:#fff;">${intendedPlanName}</strong>. We'll sort that out at the end of the trial —
  your Billing page shows exactly what changes.
</td></tr>`
    : ""
}
<tr><td style="padding-bottom:10px;font-weight:700;color:#fff;">Worth doing first</td></tr>
<tr><td style="padding-bottom:16px;color:rgba(237,234,245,.82);">
  1. ${siteUrl ? `We've started reading <strong style="color:#fff;">${siteUrl}</strong>.` : "Connect your site so MADBOT can read it."}<br>
  2. Look at the Opportunities map — every item traces back to something found on your site.<br>
  3. Set the autonomy dial to how much you want done without asking.
</td></tr>
<tr><td style="padding-bottom:22px;">
  <a href="https://getmadbot.com/dashboard" style="display:inline-block;background:#FF6B35;color:#0A0810;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;">Open your dashboard</a>
</td></tr>
${
  contactEmail
    ? `<tr><td style="padding-bottom:6px;color:rgba(237,234,245,.62);font-size:13.5px;">
  Something look wrong? Write to <a href="mailto:${contactEmail}" style="color:#FF9068;">${contactEmail}</a>.
</td></tr>`
    : ""
}`;

  const text = `${greeting}

Your MADBOT trial is live: ${trialDays} days of everything MADBOT does, across up to ${maxSites} sites.
No card was taken and nothing renews automatically.
${intendedPlanName ? `\nYou picked ${intendedPlanName}. Your Billing page shows what changes at the end of the trial.\n` : ""}
Worth doing first:
1. ${siteUrl ? `We've started reading ${siteUrl}.` : "Connect your site so MADBOT can read it."}
2. Look at the Opportunities map.
3. Set the autonomy dial.

Open your dashboard: https://getmadbot.com/dashboard

${contactEmail ? `Something look wrong? Write to ${contactEmail}.

` : ""}getmadbot.com`;

  return { subject, html: WRAP(body), text };
}
