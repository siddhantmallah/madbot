import Link from "next/link";
import { MadbotMark } from "./components/Brand";
import ThemeToggle from "./components/ThemeToggle";
import SiteFooter from "./components/SiteFooter";

// A 404 is not a page anyone should find in a search result, and it isn't the
// homepage either, so it doesn't inherit the root layout's canonical.
export const metadata = {
  title: "Page not found · MADBOT",
  description: "This address doesn't lead anywhere on getmadbot.com.",
  robots: { index: false, follow: true },
  alternates: { canonical: null },
};

const WAYS_ON = [
  { href: "/", label: "Run a free report on your site", note: "The homepage. Paste a URL and see what MADBOT finds." },
  { href: "/pricing", label: "Pricing", note: "What each plan includes, per month." },
  { href: "/about", label: "About", note: "What MADBOT is, and who makes it." },
  { href: "/contact", label: "Contact", note: "Support, legal and grievance routes." },
  { href: "/legal", label: "Legal", note: "Terms, privacy, cookies and the rest." },
];

export default function NotFound() {
  return (
    <div className="marketing" style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", flexDirection: "column" }}>
      <header style={{ borderBottom: "1px solid var(--color-divider)" }}>
        <div className="nav pad-responsive" style={{ maxWidth: 1180, margin: "0 auto", padding: "15px 28px" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 11, textDecoration: "none", color: "var(--fg)", marginRight: "auto" }}>
            <MadbotMark size={29} />
            <span style={{ fontFamily: "var(--font-body)", fontSize: 21, color: "var(--fg)" }}>madbot</span>
          </Link>
          <ThemeToggle compact />
        </div>
      </header>

      <main className="pad-responsive" style={{ flex: 1, maxWidth: 760, width: "100%", margin: "0 auto", padding: "clamp(40px, 8vw, 96px) 28px 64px", boxSizing: "border-box" }}>
        <span className="card-kicker">404</span>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 52px)", margin: "10px 0 14px" }}>Nothing lives at this address.</h1>
        <p style={{ margin: "0 0 28px", fontSize: 17, lineHeight: 1.6, color: "var(--fg-80)" }}>
          The link may be old, or mistyped. Here is where the site actually goes.
        </p>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          {WAYS_ON.map((w) => (
            <li key={w.href} style={{ borderTop: "1px solid var(--color-divider)", padding: "14px 0" }}>
              <Link href={w.href} style={{ fontWeight: 600, fontSize: 17, color: "var(--fg)" }}>
                {w.label}
              </Link>
              <div style={{ fontSize: 14.5, color: "var(--fg-80)", marginTop: 3 }}>{w.note}</div>
            </li>
          ))}
        </ul>
      </main>

      <SiteFooter />
    </div>
  );
}
