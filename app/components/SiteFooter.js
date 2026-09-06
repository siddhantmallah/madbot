"use client";

import Link from "next/link";
import { MadbotMark } from "./Brand";
import { COMPANY, copyrightLine, registeredAddressLine } from "../../lib/company";
import { CONTACT_EMAIL } from "../../lib/contact";

/**
 * The footer, shared by every public page.
 *
 * It carries the things a footer is legally load-bearing for: who the seller
 * actually is, where it is registered, and one click to each policy. India's
 * Consumer Protection (E-Commerce) Rules require the legal name and registered
 * address to be published; GDPR Article 13 requires the controller's identity.
 * A brand name on its own satisfies neither.
 */
export default function SiteFooter({ onManageCookies }) {
  const address = registeredAddressLine();

  return (
    <footer style={{ borderTop: "1px solid var(--color-divider)" }}>
      <div className="footer-grid pad-responsive" style={{ maxWidth: 1180, margin: "0 auto", padding: "46px 28px", gap: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}>
            <MadbotMark size={26} />
            <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 19, letterSpacing: "-.005em", color: "var(--fg)" }}>madbot</span>
          </div>
          <p style={{ margin: "0 0 12px", fontSize: 13.5, maxWidth: "26em", color: "var(--fg-45)" }}>
            Autonomous website marketing. One dial, a full audit trail, and no seats to buy.
          </p>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: "var(--fg-32)", maxWidth: "26em" }}>
            A product of {COMPANY.legalName}
            {COMPANY.cin ? <><br />CIN {COMPANY.cin}</> : null}
            {address ? <><br />{address}</> : null}
          </p>
        </div>

        <nav aria-label="Product" style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 14 }}>
          <h4 style={{ margin: "0 0 2px", fontSize: 12.5, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--fg-45)" }}>Product</h4>
          <Link href="/#how">How it works</Link>
          <Link href="/#does">What it does</Link>
          <Link href="/#rope">Autonomy</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/#faq">FAQ</Link>
        </nav>

        <nav aria-label="Company" style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 14 }}>
          <h4 style={{ margin: "0 0 2px", fontSize: 12.5, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--fg-45)" }}>Company</h4>
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/legal/security">Security</Link>
          <Link href="/login">Sign in</Link>
        </nav>

        <nav aria-label="Legal" style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 14 }}>
          <h4 style={{ margin: "0 0 2px", fontSize: 12.5, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--fg-45)" }}>Legal</h4>
          <Link href="/legal/terms">Terms of Service</Link>
          <Link href="/legal/privacy">Privacy Policy</Link>
          <Link href="/legal/cookies">Cookie Policy</Link>
          <Link href="/legal/refunds">Refunds &amp; Cancellation</Link>
          <Link href="/legal">All policies</Link>
          <button
            type="button"
            onClick={() => {
              if (onManageCookies) onManageCookies();
              else if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("madbot:open-consent"));
            }}
            className="btn btn-ghost"
            style={{ padding: 0, fontSize: 14, justifyContent: "flex-start", color: "var(--fg-60)", minHeight: 0 }}
          >
            Cookie preferences
          </button>
        </nav>
      </div>

      <div
        className="pad-responsive"
        style={{ maxWidth: 1180, margin: "0 auto", padding: "0 28px 36px", fontSize: 12.5, color: "var(--fg-32)", display: "flex", gap: "8px 20px", flexWrap: "wrap" }}
      >
        <span>{copyrightLine()}</span>
        <span>MADBOT is a product of {COMPANY.shortLegalName}, {COMPANY.entityType}, {COMPANY.incorporatedIn}.</span>
        {CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--fg-45)" }}>{CONTACT_EMAIL}</a> : null}
      </div>
    </footer>
  );
}
