// Outbound email. One place, so the sender address and failure handling don't
// drift between the digest, the welcome mail and whatever comes next.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * The From address. Defaults to Resend's shared sandbox sender, which only
 * delivers to the address the Resend account was registered with — so with the
 * default, mail to real customers silently goes nowhere. Set EMAIL_FROM to an
 * address on a domain verified in Resend before expecting delivery.
 */
export function senderAddress() {
  return process.env.EMAIL_FROM || "MADBOT <onboarding@resend.dev>";
}

export function usingSandboxSender() {
  return !process.env.EMAIL_FROM;
}

/**
 * Sends one email. Returns a result rather than throwing, so a caller can
 * record the failure without losing the thing it was notifying about.
 */
export async function sendEmail({ to, subject, html, text, replyTo }) {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY is not configured.", code: "not_configured" };
  }
  if (!to) return { ok: false, error: "No recipient.", code: "no_recipient" };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: senderAddress(),
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
export function buildWelcomeEmail({ name, planName, intendedPlanName, trialDays, siteUrl }) {
  const first = (name || "").trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : "Hi,";

  const subject = `Your MADBOT trial is live — ${trialDays} days of ${planName}`;

  const body = `
<tr><td style="padding-bottom:18px;">
  <span style="font-size:21px;font-weight:700;color:#fff;">Your trial is live</span>
</td></tr>
<tr><td style="padding-bottom:16px;">${greeting}</td></tr>
<tr><td style="padding-bottom:16px;">
  You have <strong style="color:#fff;">${trialDays} days of ${planName}</strong> — everything MADBOT can do, so you can
  see it working before paying for it. No card was taken and nothing renews on its own.
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
<tr><td style="padding-bottom:6px;color:rgba(237,234,245,.62);font-size:13.5px;">
  Reply to this email if anything looks wrong — it reaches a person.
</td></tr>`;

  const text = `${greeting}

Your MADBOT trial is live: ${trialDays} days of ${planName}, with everything included.
No card was taken and nothing renews automatically.
${intendedPlanName ? `\nYou picked ${intendedPlanName}. Your Billing page shows what changes at the end of the trial.\n` : ""}
Worth doing first:
1. ${siteUrl ? `We've started reading ${siteUrl}.` : "Connect your site so MADBOT can read it."}
2. Look at the Opportunities map.
3. Set the autonomy dial.

Open your dashboard: https://getmadbot.com/dashboard

Reply to this email if anything looks wrong.

getmadbot.com`;

  return { subject, html: WRAP(body), text };
}
