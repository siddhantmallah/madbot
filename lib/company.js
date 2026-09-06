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
  // As filed with the Registrar of Companies. Split across the fields the way
  // an address is actually read rather than the way the MCA record prints it:
  // that record repeats "Mumbai, Mumbai" for city and district, which would
  // look like a typo on the page.
  //
  // Worth knowing that this is a residential address and publishing it is not
  // optional. An Indian private limited company must publish its registered
  // office, and the e-commerce rules require it of an online seller. If having
  // a home address on a public page becomes a problem, the fix is a registered
  // office service, not omitting it.
  registeredOffice: {
    line1: "Plot No. 347, Flat No. 301",
    line2: "Status-2 CHSL, Santacruz (East)",
    city: "Mumbai",
    // Matches the MH in the CIN, which is the Registrar the company is filed
    // with, and the MUM prefix on the TAN.
    state: "Maharashtra",
    postcode: "400055",
    country: "India",
  },

  // Addresses. Each one must reach a human who reads it — see lib/contact.js
  // for why an unmonitored address is worse than none.
  emails: {
    // Falls back to the single configured contact address so the site never
    // prints an inbox that does not exist. Split them once each is real.
    support: null, // falls back to NEXT_PUBLIC_CONTACT_EMAIL
    privacy: null, // e.g. privacy@getmadbot.com — data-subject requests land here
    // The company's own domain rather than the product's, because these two
    // reach the legal entity rather than the support desk. mallahsoftware.com
    // has live MX records, so mail to it is delivered rather than bounced.
    legal: "contact@mallahsoftware.com",
    security: null, // e.g. security@getmadbot.com
    grievance: "contact@mallahsoftware.com"
  },

  // India: the Consumer Protection (E-Commerce) Rules 2020 and the IT Rules
  // 2021 both require a named grievance officer with a published name, contact
  // and response window. The DPDP Act 2023 additionally requires a Data
  // Protection Officer or an equivalent contact for a Significant Data
  // Fiduciary, and a published contact for everyone else.
  grievanceOfficer: {
    name: "Siddhant Mallah",
    designation: "Grievance Officer",
    email: "contact@mallahsoftware.com",
    // Both forms on purpose: E.164 for the tel: link so a phone dials it
    // correctly from any country, and a spaced version for reading.
    //
    // Worth knowing what publishing this costs. The Rules want a contact a
    // customer can actually use, and a number qualifies, but a number on a
    // public page will attract cold callers and scrapers. If that becomes a
    // nuisance, a virtual number forwarding to the same handset satisfies the
    // rule equally well.
    phone: "+918828141371",
    phoneDisplay: "+91 88281 41371",
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

/**
 * The canonical origin, with the www.
 *
 * The apex 308-redirects to www, so pointing canonical tags, Open Graph URLs
 * and the sitemap at the apex would aim every one of them at a redirect. One
 * constant here means robots.txt, the sitemap, the metadata base and the
 * structured data cannot disagree about which host is the real one.
 */
export const SITE_URL = "https://www.getmadbot.com";

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
