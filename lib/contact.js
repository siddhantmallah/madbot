// Two different addresses that must not be confused.
//
// EMAIL_FROM is a send-only marketing sender (welcome, digests, promotional).
// Nobody monitors its inbox, so nothing may invite a reply to it.
//
// CONTACT_EMAIL is an address a person actually reads. It is deliberately
// unset by default: printing a plausible-looking address nobody monitors is
// worse than printing none, because a customer trying to buy would write into
// a black hole and conclude the product is abandoned.
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || null;

export function hasContactEmail() {
  return !!CONTACT_EMAIL;
}
