import "./globals.css";
import { AuthProvider } from "./providers/AuthProvider";
import { themeBootScript } from "./components/ThemeToggle";

export const metadata = {
  metadataBase: new URL("https://getmadbot.com"),
  title: "MADBOT — autonomous website marketing that runs itself",
  description:
    "Connect your website once. MADBOT finds the opportunities, writes and publishes the pages, earns the links, spots the buyers and reports what it did — at the level of autonomy you choose.",
  // A favicon sits on browser chrome we don't control, so unlike the in-app
  // mark it can't be recoloured by the theme — it has to ship in both. Browsers
  // that ignore `media` take the first entry, which is the dark-on-light one
  // most tab bars still are.
  icons: {
    icon: [
      { url: "/icon-32.png", type: "image/png", sizes: "32x32", media: "(prefers-color-scheme: light)" },
      { url: "/icon-32-light.png", type: "image/png", sizes: "32x32", media: "(prefers-color-scheme: dark)" },
    ],
    apple: [
      { url: "/icon-180.png", sizes: "180x180", media: "(prefers-color-scheme: light)" },
      { url: "/icon-180-light.png", sizes: "180x180", media: "(prefers-color-scheme: dark)" },
    ],
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
