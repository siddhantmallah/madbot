"use client";

import Link from "next/link";
import LegalPage, { LegalSection, Callout, DefTable } from "../../components/LegalPage";
import { COMPANY, emailFor } from "../../../lib/company";
import { CONTACT_EMAIL } from "../../../lib/contact";

/**
 * The sub-processor list.
 *
 * Article 28(2) GDPR only requires notice and a right to object. Publishing the
 * actual list, with what each one touches and whether it applies to a given
 * customer at all, is the version that lets somebody complete their own record
 * of processing without writing to ask.
 */

function Email({ purpose }) {
  const address = emailFor(purpose, CONTACT_EMAIL);
  if (!address) {
    return (
      <>
        the contact address published on our <Link href="/legal">policies page</Link>
      </>
    );
  }
  return <a href={`mailto:${address}`}>{address}</a>;
}

const TOC = [
  { id: "what", title: "What a sub-processor is" },
  { id: "list", title: "The current list" },
  { id: "conditional", title: "The ones that only apply sometimes" },
  { id: "terms", title: "How each one is bound" },
  { id: "transfers", title: "Where the data goes" },
  { id: "changes", title: "Adding or replacing a sub-processor" },
  { id: "notice", title: "Being told about changes" },
];

const ROWS = [
  [
    "Google (Firebase Authentication)",
    "Account sign-in and identity. Holds your email address, sign-in provider and authentication tokens.",
    "United States and globally",
    "Always",
  ],
  [
    "Google (Cloud Firestore)",
    "The database. Holds account records, connected sites, crawl and audit results, drafted content, lead records and usage counters.",
    "The Firestore region chosen when the database was created",
    "Always",
  ],
  [
    "Vercel",
    "Hosting, edge routing, TLS termination and the approximate-country header used to pick a currency.",
    "United States, and edge locations globally",
    "Always",
  ],
  [
    "Anthropic (Claude API)",
    "Analysing site content and generating copy: audits, articles, social drafts, listing copy, lead qualification and AI visibility checks.",
    "United States",
    "Always",
  ],
  [
    "Resend",
    "Transactional email, the welcome message, weekly digests, and the delivery events behind bounce and complaint handling.",
    "United States and the European Union",
    "Always",
  ],
  [
    "GitHub",
    "Receiving generated articles as pull requests on your repository.",
    "United States",
    "Only if you connect a repository",
  ],
  [
    "Google Search Console API",
    "Reading your own search performance data for the property you verified.",
    "United States and globally",
    "Only if you connect it",
  ],
  [
    "LinkedIn, X, Meta",
    "Publishing social posts you have approved on screen, to the account you connected.",
    "United States and globally",
    "Only if you connect that account",
  ],
  [
    "Google AdSense",
    "Serving the advertising on our public pages, and the cookies it uses to choose which ads a visitor sees. Never touches anything inside a customer dashboard.",
    "United States and globally",
    "Public pages only, and only where a visitor has allowed the Advertising category",
  ],
];

export default function SubprocessorsPage() {
  return (
    <LegalPage
      title="Sub-processors"
      kicker="Legal"
      updated="6 September 2026"
      effective="6 September 2026"
      toc={TOC}
      intro={
        <>
          <p>
            {COMPANY.legalName} does not run {COMPANY.product} on its own machines end to end. Other companies host it,
            store its data, run the model and deliver its email. Where those companies handle personal data on our
            behalf, they are sub-processors, and you are entitled to know who they are before you trust us with
            anything.
          </p>
          <p>This is the full list as at the last-updated date above.</p>
        </>
      }
    >
      <LegalSection id="what" index={1} title="What a sub-processor is">
        <p>
          When you use {COMPANY.product} for your own business, you are usually the controller of the personal data
          involved and we are your processor. A sub-processor is a company we engage to carry out part of that
          processing for us. Our hosting provider is one. The model provider that reads your site content is another.
        </p>
        <p>
          This matters because a processor may not bring in a sub-processor without the controller&apos;s
          authorisation. By accepting the <Link href="/legal/terms">Terms of Service</Link> and the{" "}
          <Link href="/legal/dpa">Data Processing Addendum</Link>, you give general written authorisation for the
          companies below, on the conditions set out in this page.
        </p>
      </LegalSection>

      <LegalSection id="list" index={2} title="The current list">
        <DefTable head={["Sub-processor", "What it does", "Where it processes", "When it applies"]} rows={ROWS} />
        <p>
          Where a row says the processing happens globally, that reflects the provider&apos;s own network. Edge routing
          and content delivery in particular can touch a location close to the person making the request, rather than
          the region where data is stored.
        </p>
      </LegalSection>

      <LegalSection id="conditional" index={3} title="The ones that only apply sometimes">
        <p>
          Five of the entries above run for every account. The rest only ever see anything if you switch the relevant
          feature on:
        </p>
        <ul>
          <li>
            <b>GitHub</b> receives nothing until you connect a repository. It then receives the article text and the
            branch and commit metadata that a pull request needs.
          </li>
          <li>
            <b>Google Search Console</b> is read-only, is limited to the property you verified, and is only called
            after you connect it.
          </li>
          <li>
            <b>LinkedIn, X and Meta</b> receive a post only after you approve that specific post on screen. Nothing is
            published automatically.
          </li>
        </ul>
        <p>
          Disconnecting an integration stops any further processing by that provider. It does not, on its own, delete
          what they already received, because a merged pull request or a published post belongs to that platform after
          it lands there.
        </p>
      </LegalSection>

      <LegalSection id="terms" index={4} title="How each one is bound">
        <p>
          Each company above is engaged under its own data processing terms, which impose obligations at least as
          protective as those we owe you under our{" "}
          <Link href="/legal/dpa">Data Processing Addendum</Link>. In practice that means confidentiality, security
          measures appropriate to the risk, restrictions on further sub-processing, and deletion or return at the end
          of the relationship.
        </p>
        <p>
          We remain responsible to you for what they do. If a sub-processor fails to meet its obligations, our
          liability to you is unchanged by the fact that the failure happened at their end.
        </p>
        <Callout>
          <p style={{ margin: 0 }}>
            The model provider is engaged on terms under which content sent to the API is not used to train its
            models. If that ever changes we will treat it as a material change to this list and give notice under the
            section below.
          </p>
        </Callout>
      </LegalSection>

      <LegalSection id="transfers" index={5} title="Where the data goes">
        <p>
          {COMPANY.legalName} is incorporated in {COMPANY.incorporatedIn}, and several of the companies above process
          in the United States. If you are in the European Economic Area, the United Kingdom or another jurisdiction
          with transfer restrictions, that means your data leaves it.
        </p>
        <p>
          Those transfers rely on the Standard Contractual Clauses incorporated into each provider&apos;s data
          processing terms, with the UK International Data Transfer Addendum where the transfer is from the United
          Kingdom. The <Link href="/legal/dpa">Data Processing Addendum</Link> sets out the mechanism in full, and the{" "}
          <Link href="/legal/privacy">Privacy Policy</Link> explains what we hold and for how long.
        </p>
      </LegalSection>

      <LegalSection id="changes" index={6} title="Adding or replacing a sub-processor">
        <p>
          We will give at least 30 days&apos; notice before a new sub-processor starts processing personal data, or
          before an existing one is replaced. During that period you may object in writing, on reasonable grounds
          related to data protection.
        </p>
        <p>
          If you object, we will try to offer a change to the service or a different arrangement that avoids the
          processing you objected to. If we cannot do that within a reasonable time, you may terminate the affected
          part of the subscription without penalty, and we will refund any fees covering the period after termination.
        </p>
        <p>
          One exception. Where a provider has to be replaced urgently, for security or continuity reasons, we may act
          first and notify you as soon as we can. The right to object still applies afterwards.
        </p>
      </LegalSection>

      <LegalSection id="notice" index={7} title="Being told about changes">
        <p>
          This page is the authoritative list, and the last-updated date at the top of it changes whenever the list
          does. If you would like changes pushed to you rather than having to check, write to{" "}
          <Email purpose="privacy" /> and ask to be added to the sub-processor notification list. Tell us which
          address should receive it. There is no charge for this and no minimum plan.
        </p>
        <p>
          Questions about a specific provider, or a request for a copy of the relevant terms, go to the same address.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
