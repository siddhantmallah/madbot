import "./globals.css";
import { AuthProvider } from "./providers/AuthProvider";
import CookieConsent from "./components/CookieConsent";
import { themeBootScript } from "./components/ThemeToggle";

export const metadata = {
  metadataBase: new URL("https://getmadbot.com"),
  title: "MADBOT — autonomous website marketing that runs itself",
  description:
    "Connect your website once. MADBOT finds the opportunities, writes and publishes the pages, earns the links, spots the buyers and reports what it did — at the level of autonomy you choose.",
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
    url: "https://getmadbot.com/",
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

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Stamps the saved theme onto <html> before the first paint. Anything
            that runs after hydration is too late — the visitor would see a
            flash of the wrong theme first. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
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
