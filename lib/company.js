// The legal entity behind MADBOT, in one place.
//
// Every policy page, invoice, email footer and consent notice reads from here,
// so the company's details can never say one thing on the Terms and another on
// the Privacy Policy. Client-safe: no secrets, no server imports.
//
// ---------------------------------------------------------------------------
// BEFORE LAUNCH: the values marked `null` below are legally required and
// nobody can invent them. Grep for MISSING_FOR_LAUNCH to find every place that
// changes behaviour when one is absent.
//
// India's Consumer Protection (E-Commerce) Rules 2020 require an online seller
// to publish its legal name, registered address and a customer-care contact.
// GDPR Article 13 requires the controller's identity and contact details, and
// a representative's if the controller is outside the EU. Neither is satisfied
// by a brand name alone.
// ---------------------------------------------------------------------------

export const COMPANY = {
  // The trading name people know.
  product: "MADBOT",
  productDomain: "getmadbot.com",

  // The legal person that contracts, invoices and is liable.
  legalName: "Mallah Software Services Private Limited",
  shortLegalName: "Mallah Software Services",
  entityType: "Private Limited Company",
  incorporatedIn: "India",

  incorporatedOn: "2026-09-05",

  // Registrar of Companies identifiers. On an Indian private limited company
  // the CIN must appear on letterheads, invoices and official publications
  // (Companies Act 2013, s.12(3)(c)), which is why it is rendered in the
  // footer and on the policy pages.
  //
  // The CIN decodes as: U = unlisted, 62011 = development of computer
  // software, MH = Maharashtra, 2026 = year of incorporation, PTC = private
  // limited company, 475385 = registration number.
  cin: "U62011MH2026PTC475385",

  // Tax identifiers. Deliberately NOT rendered on any public page: they belong
  // on an invoice, not in a footer, and publishing them widens the surface for
  // impersonation for no benefit. Grep before changing that — no page reads
  // these today.
  pan: "AAVCM4546P",
  tan: "MUMM76259B",
  gstin: null, // MISSING_FOR_LAUNCH — only once GST-registered; until then invoices must NOT show tax

  // Registered office as filed with the RoC. This is the address that has to
  // appear publicly, not a mailing address.
  registeredOffice: {
    line1: null, // MISSING_FOR_LAUNCH — building, street
    line2: null,
    city: null, // MISSING_FOR_LAUNCH — the TAN prefix MUM points at Mumbai, but that is an inference, not the filed address
    // Derived from the MH in the CIN, which is the state of the Registrar the
    // company is filed with.
    state: "Maharashtra",
    postcode: null, // MISSING_FOR_LAUNCH — six-digit PIN
    country: "India",
  },

  // Addresses. Each one must reach a human who reads it — see lib/contact.js
  // for why an unmonitored address is worse than none.
  emails: {
    // Falls back to the single configured contact address so the site never
    // prints an inbox that does not exist. Split them once each is real.
    support: null, // e.g. support@getmadbot.com
    privacy: null, // e.g. privacy@getmadbot.com — data-subject requests land here
    legal: null, // e.g. legal@getmadbot.com
    security: null, // e.g. security@getmadbot.com
    grievance: null, // MISSING_FOR_LAUNCH in India — see grievanceOfficer below
  },

  // India: the Consumer Protection (E-Commerce) Rules 2020 and the IT Rules
  // 2021 both require a named grievance officer with a published name, contact
  // and response window. The DPDP Act 2023 additionally requires a Data
  // Protection Officer or an equivalent contact for a Significant Data
  // Fiduciary, and a published contact for everyone else.
  grievanceOfficer: {
    name: null, // MISSING_FOR_LAUNCH
    designation: "Grievance Officer",
    email: null, // MISSING_FOR_LAUNCH
    // The Rules give 48 hours to acknowledge and one month to resolve.
    acknowledgeHours: 48,
    resolveDays: 30,
  },

  // GDPR Article 27: a controller outside the EU that offers services to people
  // in the EU must appoint a representative established in the EU, unless the
  // processing is occasional and low-risk. Same again for the UK under UK GDPR.
  // Until one is appointed, say so plainly rather than implying one exists.
  euRepresentative: null,
  ukRepresentative: null,

  foundedYear: 2026,
};

/** The registered office as a single line, or null while it is unset. */
export function registeredAddressLine() {
  const a = COMPANY.registeredOffice;
  // A state and a country are not an address. Requiring the street line and
  // the city means partially-filled details cannot make the policy pages look
  // complete while still being unusable by someone trying to serve notice.
  if (!a.line1 || !a.city) return null;
  return [a.line1, a.line2, a.city, a.state, a.postcode, a.country].filter(Boolean).join(", ");
}

/**
 * The best address for a given purpose, falling back to the one configured
 * contact address, then to null. Never invents one.
 */
export function emailFor(purpose, fallback = null) {
  return COMPANY.emails[purpose] || fallback || null;
}

/**
 * What still has to be filled in before the site can lawfully take money.
 *
 * The legal pages call this and render a visible notice when anything is
 * outstanding, rather than quietly publishing a policy with holes in it. That
 * is deliberate: an incomplete policy that looks complete is worse than one
 * that admits what it is missing.
 */
export function missingForLaunch() {
  const out = [];
  const a = COMPANY.registeredOffice;
  if (!COMPANY.cin) out.push("Corporate Identity Number (CIN)");
  if (!a.line1) out.push("Registered office street address");
  if (!a.city) out.push("Registered office city");
  if (!a.postcode) out.push("Registered office PIN code");
  if (!COMPANY.grievanceOfficer.name) out.push("Grievance officer name");
  if (!COMPANY.grievanceOfficer.email && !COMPANY.emails.grievance) out.push("Grievance officer email");
  return out;
}

export function isLaunchReady() {
  return missingForLaunch().length === 0;
}

/** "© 2026 Mallah Software Services Private Limited" */
export function copyrightLine(year = new Date().getFullYear()) {
  const from = COMPANY.foundedYear;
  const span = year > from ? `${from}–${year}` : `${from}`;
  return `© ${span} ${COMPANY.legalName}`;
}
