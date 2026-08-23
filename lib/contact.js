// The one address customers are told to write to. Client-safe, so the same
// value can appear in the dashboard and in outbound mail.
//
// It's a single constant because the alternative already bit us: outbound mail
// went out from hello@ while the Billing screen told people to email support@,
// so half the invitations to get in touch pointed at an address that didn't
// exist. A verified sending domain does not give you a receiving mailbox.
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@getmadbot.com";
