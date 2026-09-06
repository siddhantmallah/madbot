"use client";

import Link from "next/link";
import LegalPage, { Callout } from "../components/LegalPage";
import { COMPANY } from "../../lib/company";

// One row per document. Keeping the list here rather than in each page's
// frontmatter means a policy cannot quietly go missing from the index.
const POLICIES = [
  {
    href: "/legal/terms",
    name: "Terms of Service",
    blurb: "The contract between you and us: what you get, what you owe, and how either side ends it.",
  },
  {
    href: "/legal/privacy",
    name: "Privacy Policy",
    blurb: "What personal data we hold, why we hold it, how long for, and the rights you have over it.",
  },
  {
    href: "/legal/cookies",
    name: "Cookie Policy",
    blurb: "Every cookie and similar technology the site sets, what each one is for, and how to refuse them.",
  },
  {
    href: "/legal/refunds",
    name: "Refunds and Cancellation",
    blurb: "How to cancel, what happens to the rest of your billing period, and when money comes back.",
  },
  {
    href: "/legal/acceptable-use",
    name: "Acceptable Use Policy",
    blurb: "What MADBOT may not be pointed at, and what we do about it when someone tries.",
  },
  {
    href: "/legal/dpa",
    name: "Data Processing Addendum",
    blurb: "The processor terms that apply when we handle personal data on your instructions.",
  },
  {
    href: "/legal/subprocessors",
    name: "Sub-processors",
    blurb: "The named third parties that process data for us, what each one does, and where it sits.",
  },
  {
    href: "/legal/security",
    name: "Security",
    blurb: "How accounts, credentials and your site data are protected, and how to report a vulnerability.",
  },
];

export default function LegalIndexPage() {
  return (
    <LegalPage
      kicker="Legal"
      title="Policies"
      updated="6 September 2026"
      intro={
        <>
          Everything {COMPANY.legalName} publishes about how {COMPANY.product} may be used, what we do with data, and
          what each side owes the other. These apply to everyone who uses MADBOT, on a paid plan or not, from the
          moment you first use the site.
        </>
      }
      toc={[]}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2, margin: "0 0 30px" }}>
        {POLICIES.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            style={{
              display: "block",
              padding: "16px 2px",
              borderBottom: "1px solid var(--color-divider)",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <span style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-heading)", fontSize: 18, lineHeight: 1.2, color: "var(--fg)" }}>
                {p.name}
              </span>
              <span className="mono" style={{ color: "var(--fg-32)" }}>{p.href}</span>
            </span>
            <span style={{ display: "block", marginTop: 5, fontSize: 14, lineHeight: 1.6, color: "var(--fg-60)" }}>
              {p.blurb}
            </span>
          </Link>
        ))}
      </div>

      <Callout>
        <b>Your data stays yours.</b> If you have an account you can export everything MADBOT holds for you, or
        delete it outright, from the dashboard at any time. You do not need to email anyone or wait for us to act.
        What each of those does is set out in the <Link href="/legal/privacy">Privacy Policy</Link>.
      </Callout>

      <h2 style={{ margin: "34px 0 8px", fontSize: "clamp(19px, 2.2vw, 24px)" }}>Cookie preferences</h2>
      <p style={{ margin: "0 0 14px", fontSize: 15, lineHeight: 1.65, color: "var(--fg-80)" }}>
        Changed your mind about what the site may store? Reopen the consent panel and set it again. Your choice takes
        effect straight away.
      </p>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("madbot:open-consent"));
        }}
      >
        Manage cookie preferences
      </button>

      <p style={{ margin: "34px 0 0", fontSize: 14.5, lineHeight: 1.65, color: "var(--fg-60)" }}>
        Questions about any of these documents go to the legal route on the{" "}
        <Link href="/contact">contact page</Link>, which also lists the grievance route required in India.
      </p>
    </LegalPage>
  );
}
