import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://madbot.com"),
  title: "MADBOT — autonomous website marketing that runs itself",
  description:
    "Connect your website once. MADBOT finds the opportunities, writes and publishes the pages, earns the links, spots the buyers and reports what it did — at the level of autonomy you choose.",
  icons: { icon: "/madbot-logo.png" },
  openGraph: {
    type: "website",
    siteName: "MADBOT",
    title: "MADBOT — autonomous website marketing that runs itself",
    description:
      "Give it a website. It finds the work, does the work, and shows you the receipts.",
    url: "https://madbot.com/",
  },
  twitter: {
    card: "summary_large_image",
    title: "MADBOT — autonomous website marketing",
    description:
      "Give it a website. It finds the work, does the work, and shows you the receipts.",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
