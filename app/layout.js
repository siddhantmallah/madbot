import { headers } from "next/headers";
import { Caprasimo, Figtree } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./providers/AuthProvider";
import CookieConsent from "./components/CookieConsent";
import { themeBootScript } from "./components/ThemeToggle";
import { COMPANY, SITE_URL } from "../lib/company";

// Self-hosted at build time by next/font: no request to Google from the
// visitor's browser (so no visitor IP sent there), no render-blocking CSS
// @import chain, and a size-adjusted fallback so the swap doesn't shift the
// layout. globals.css reads the two variables.
const caprasimo = Caprasimo({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-caprasimo" });
const figtree = Figtree({ weight: ["400", "600", "700"], subsets: ["latin"], display: "swap", variable: "--font-figtree" });

// The browser chrome follows the page: the dark stage, or the light theme's
// ground. The same two values as --color-bg in globals.css.
export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0A0810" },
    { media: "(prefers-color-scheme: light)", color: "#F6F4F8" },
  ],
};

export const metadata = {
  // The www host, because the apex redirects to it. Pointing canonicals and
  // Open Graph URLs at a redirect is a small own goal.
  metadataBase: new URL(SITE_URL),
  // A relative canonical resolves against metadataBase plus the current route,
  // so every page gets its own rather than all of them claiming to be the
  // homepage. MADBOT's own audit flags a missing canonical as a finding.
  alternates: { canonical: "./" },
  title: "MADBOT — autonomous website marketing that runs itself",
  description:
    "Connect your site once. MADBOT audits it, writes the pages and your directory listings, and finds the companies who need you. You keep a dial and a veto.",
  // A favicon sits on browser chrome this app does not control, so unlike the
  // in-app mark it cannot be recoloured by the theme at runtime. It has to ship
  // in both, selected by `media`, or the dark mark vanishes against a dark tab
  // bar. Browsers that ignore `media` take the first entry, which is the
  // dark-on-light one most tab bars still are.
  //
  // Every file here is generated from brand/madbot-mark-source.png with a real
  // margin. The previous set ran edge to edge, and tab bars, bookmark lists and
  // OS icon masks all crop or round the outer pixels, so the corners of the
  // mark were being eaten.
  icons: {
    icon: [
      { url: "/icon-32.png", type: "image/png", sizes: "32x32", media: "(prefers-color-scheme: light)" },
      { url: "/icon-32-light.png", type: "image/png", sizes: "32x32", media: "(prefers-color-scheme: dark)" },
      { url: "/icon-16.png", type: "image/png", sizes: "16x16", media: "(prefers-color-scheme: light)" },
      { url: "/icon-16-light.png", type: "image/png", sizes: "16x16", media: "(prefers-color-scheme: dark)" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192", media: "(prefers-color-scheme: light)" },
      { url: "/icon-192-light.png", type: "image/png", sizes: "192x192", media: "(prefers-color-scheme: dark)" },
      // Legacy fallback. Crawlers and older clients ask for /favicon.ico by
      // convention rather than reading the markup, and without it they get a 404.
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
    ],
    // One icon, not a pair: iOS composites transparency onto black and rounds
    // the corners hard, so this one carries an opaque brand ground, the white
    // mark and a wider margin to survive the mask.
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
    shortcut: ["/favicon.ico"],
  },
  openGraph: {
    type: "website",
    siteName: "MADBOT",
    title: "MADBOT — autonomous website marketing that runs itself",
    description:
      "Give it a website. It finds the work, does the work, and shows you the receipts.",
    // Resolves against metadataBase, so it is the www host like the canonical.
    // It was the apex, which redirects.
    url: "/",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "MADBOT — autonomous website marketing" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MADBOT — autonomous website marketing",
    description:
      "Give it a website. It finds the work, does the work, and shows you the receipts.",
    images: ["/og.png"],
  },
};


// Structured data. MADBOT's own report marks "no structured data at all" as
// critical and pitches schema markup as a reason to buy, so the site having
// none was the most quietly embarrassing finding in its own audit.
//
// Every property here is verifiable. There is no aggregateRating and no review,
// because there are no customers yet and inventing either would be a fabricated
// record rather than an optimisation.
const ORGANISATION = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: COMPANY.product,
  legalName: COMPANY.legalName,
  url: SITE_URL,
  logo: `${SITE_URL}/icon-192.png`,
  foundingDate: COMPANY.incorporatedOn,
  ...(COMPANY.cin ? { identifier: { "@type": "PropertyValue", name: "CIN", value: COMPANY.cin } } : {}),
  address: {
    "@type": "PostalAddress",
    ...(COMPANY.registeredOffice.line1
      ? {
          streetAddress: [COMPANY.registeredOffice.line1, COMPANY.registeredOffice.line2]
            .filter(Boolean)
            .join(", "),
        }
      : {}),
    ...(COMPANY.registeredOffice.city ? { addressLocality: COMPANY.registeredOffice.city } : {}),
    ...(COMPANY.registeredOffice.state ? { addressRegion: COMPANY.registeredOffice.state } : {}),
    ...(COMPANY.registeredOffice.postcode ? { postalCode: COMPANY.registeredOffice.postcode } : {}),
    addressCountry: "IN",
  },
  ...(COMPANY.grievanceOfficer.email
    ? {
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: COMPANY.grievanceOfficer.email,
          ...(COMPANY.grievanceOfficer.phone ? { telephone: COMPANY.grievanceOfficer.phone } : {}),
          availableLanguage: ["en"],
        },
      }
    : {}),
};

const WEBSITE = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: COMPANY.product,
  url: SITE_URL,
  publisher: { "@id": `${SITE_URL}/#organization` },
  inLanguage: "en",
};

export default async function RootLayout({ children }) {
  // The nonce proxy.js put in this request's Content-Security-Policy. Reading
  // it also makes every page render on request, which nonces require: a page
  // built ahead of time has no request and so no nonce, and the policy would
  // refuse every inline script in it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" className={`${caprasimo.variable} ${figtree.variable}`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Stamps the saved theme onto <html> before the first paint. Anything
            that runs after hydration is too late — the visitor would see a
            flash of the wrong theme first. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify([ORGANISATION, WEBSITE]) }}
        />
      </head>
      <body>
        <AuthProvider>
          {children}
          {/* Renders nothing until it knows where the visitor is, then asks the
              question their jurisdiction actually requires. See lib/consent.js. */}
          <CookieConsent />
        </AuthProvider>
      </body>
    </html>
  );
}
