"use client";

import Link from "next/link";
import LegalPage, { LegalSection, Callout } from "../../components/LegalPage";
import { COMPANY, emailFor } from "../../../lib/company";
import { CONTACT_EMAIL } from "../../../lib/contact";

/**
 * The Acceptable Use Policy.
 *
 * Written as a list of things a person could actually do with MADBOT and
 * shouldn't, rather than a generic list of internet crimes. The lead engine and
 * the publishing pipeline are the two places where a customer can cause real
 * harm to somebody who never agreed to anything, so those get the most words.
 */

/** Renders the best address for a purpose, or says plainly that there isn't one. */
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
  { id: "scope", title: "Who this applies to" },
  { id: "sites", title: "Sites you may connect" },
  { id: "crawling", title: "Crawling and competitor snapshots" },
  { id: "limits", title: "Rate limits, volume and metering" },
  { id: "outreach", title: "Leads and outreach" },
  { id: "people", title: "Data about people" },
  { id: "content", title: "Content the model writes" },
  { id: "search", title: "Search engines, reviews and impersonation" },
  { id: "harmful", title: "Unlawful and harmful content" },
  { id: "integrity", title: "Attacks on the service" },
  { id: "reselling", title: "Reselling and white-labelling" },
  { id: "enforcement", title: "What happens if you breach this policy" },
  { id: "reporting", title: "Reporting abuse" },
];

export default function AcceptableUsePage() {
  return (
    <LegalPage
      title="Acceptable Use Policy"
      kicker="Legal"
      updated="6 September 2026"
      effective="6 September 2026"
      toc={TOC}
      intro={
        <>
          <p>
            {COMPANY.product} works on the open internet in your name. It fetches other people&apos;s pages,
            researches other people&apos;s companies, and drafts messages you will send. Pointed the wrong way, that
            causes real harm.
          </p>
          <p>
            This policy sets out what you may and may not do with the service. It forms part of the{" "}
            <Link href="/legal/terms">Terms of Service</Link>, so breaking it breaches the agreement.
          </p>
        </>
      }
    >
      <LegalSection id="scope" index={1} title="Who this applies to">
        <p>
          This policy applies to you, to anyone you let use your account, and to anything done through your connected
          integrations, including work by colleagues, contractors or agencies acting for you. It applies to the output
          too: content {COMPANY.product} drafts becomes yours when you publish it, and these rules travel with it.
        </p>
      </LegalSection>

      <LegalSection id="sites" index={2} title="Sites you may connect">
        <p>
          You may connect a website only if you own it, or are authorised in writing by whoever does. Being able to
          reach a site in a browser is not authorisation, and neither is managing someone&apos;s marketing unless that
          engagement covers automated work of this kind.
        </p>
        <p>Be ready to prove it if we ask, by one of:</p>
        <ul>
          <li>DNS or file-based control of the domain,</li>
          <li>verified ownership in Google Search Console,</li>
          <li>written permission from the owner.</li>
        </ul>
        <p>Connecting a site you do not control is a serious breach and results in immediate suspension.</p>
      </LegalSection>

      <LegalSection id="crawling" index={3} title="Crawling and competitor snapshots">
        <p>
          On a site you control you may crawl as deeply as the service allows. On any other site, including a
          competitor you snapshot, you may only take the public pages a normal browser would fetch. You may not:
        </p>
        <ul>
          <li>reach any page behind a login, a paywall or an access control, whether or not you hold credentials;</li>
          <li>ignore a robots directive, a rate limit, a block or a terms-of-use restriction on another site;</li>
          <li>harvest a competitor&apos;s site wholesale, mirror it, or rebuild it as your own content;</li>
          <li>use the crawler to test another site for weaknesses, or to load it heavily enough to degrade it.</li>
        </ul>
        <p>A competitor snapshot is for understanding positioning. Copied text remains their copyright.</p>
      </LegalSection>

      <LegalSection id="limits" index={4} title="Rate limits, volume and metering">
        <p>
          Your plan sets how much work the service will do. Those limits stop one account consuming capacity other
          customers paid for, and cap what we spend on your behalf with model and infrastructure providers. You may
          not work around them. That means no:
        </p>
        <ul>
          <li>extra accounts, or one business split across accounts, to get more allowance;</li>
          <li>sharing one account between separate businesses;</li>
          <li>tampering with usage counters, licence checks or entitlement responses;</li>
          <li>automated calls to our endpoints outside the product, at a rate the product would not produce.</li>
        </ul>
        <p>We may throttle an account generating load far beyond its plan, and will say when we do.</p>
      </LegalSection>

      <LegalSection id="outreach" index={5} title="Leads and outreach">
        <p>
          The lead engine finds companies from public information and drafts an email. You send it, from your own mail
          client, under your own sender reputation and your own legal responsibility.
        </p>
        <Callout tone="warn">
          <p style={{ margin: 0 }}>
            You may not use leads or drafts produced by {COMPANY.product} to send unlawful marketing. That includes
            unsolicited bulk mail, mail to purchased or rented lists, mail to addresses taken from anywhere other than
            the company&apos;s own published contact details, messages with no working way to opt out, messages that
            hide who is sending them, and any message to someone who has already objected.
          </p>
        </Callout>
        <p>For every message you send off the back of the service you must:</p>
        <ul>
          <li>have a lawful basis for contacting that recipient in their jurisdiction;</li>
          <li>identify yourself and your business honestly;</li>
          <li>give a clear and free way to stop hearing from you, and act on it;</li>
          <li>honour an objection immediately and permanently, everywhere, not just in {COMPANY.product};</li>
          <li>respect any stricter local rule, such as consent requirements in some jurisdictions.</li>
        </ul>
        <p>
          Record every objection. The suppression list then keeps that contact out of the service permanently, even
          after the underlying lead data is deleted.
        </p>
      </LegalSection>

      <LegalSection id="people" index={6} title="Data about people">
        <p>
          {COMPANY.product} researches organisations, not individuals. Company names, domains, technology and
          published pricing are commercial facts. A named person&apos;s details are personal data, and the service
          treats them that way. You may not use it to:
        </p>
        <ul>
          <li>research a person rather than the company they work for, or compile a dossier on anyone;</li>
          <li>load in personal data from social profiles, data brokers or purchased lists;</li>
          <li>target consumers rather than businesses;</li>
          <li>infer or record anything about a person&apos;s health, race, ethnicity, politics, religion, trade union
            membership, sex life or sexual orientation, or their biometric or genetic data.</li>
        </ul>
        <p>
          That last one is not a setting. Special-category data is switched off in the data policy the service
          enforces and there is no option to turn it on. Smuggling it in through free-text fields breaches this
          policy. The <Link href="/legal/privacy">Privacy Policy</Link> sets out the levels and their retention
          windows.
        </p>
      </LegalSection>

      <LegalSection id="content" index={7} title="Content the model writes">
        <p>
          Articles, social posts, listing copy and outreach drafts are produced by an AI model. You are the publisher
          of anything you ship, and the law treats you as its author. You may not publish generated content that is:
        </p>
        <ul>
          <li>defamatory, or that states something as fact without checking it;</li>
          <li>infringing, including text or images copied from another site;</li>
          <li>deceptive about what your business is, does or has achieved;</li>
          <li>presented as human-written where a law or platform rule requires you to disclose AI involvement.</li>
        </ul>
        <p>
          You may not publish generated content you have not reviewed. The product is built around that: articles ship
          only as pull requests you merge, social posts publish only after you approve them on screen, and listing copy
          is submitted by hand. Auto-merging or bulk-approving without reading breaches this policy.
        </p>
      </LegalSection>

      <LegalSection id="search" index={8} title="Search engines, reviews and impersonation">
        <p>
          The service exists to make a real site easier to find. It is not a manipulation tool. You may not use it to
          impersonate another business or person, to write fake reviews or fabricated testimonials, to invent
          customers, case studies or statistics, or to build doorway pages, cloaked pages, hidden text, link schemes
          or anything else that would breach a search engine&apos;s own webmaster guidelines. Nor may you use the
          visibility checks to plant misleading claims in content meant to be picked up by an AI assistant.
        </p>
      </LegalSection>

      <LegalSection id="harmful" index={9} title="Unlawful and harmful content">
        <p>
          You may not use {COMPANY.product} for content or activity that is unlawful where you or your audience are,
          or to harass, threaten or defame anyone, to discriminate against a protected group, to promote self-harm or
          violence, to produce sexual content involving children, or to run a fraud or a scam.
        </p>
      </LegalSection>

      <LegalSection id="integrity" index={10} title="Attacks on the service">
        <p>You may not attack the service, or use it to attack anyone else. No:</p>
        <ul>
          <li>probing, scanning or automated testing of our infrastructure without written permission;</li>
          <li>reverse engineering, decompiling, or extracting prompts, models or source;</li>
          <li>attempts to read, write or delete another customer&apos;s data, or to bypass the database security rules;</li>
          <li>attempts to get around the guards on outbound requests, for example by pointing a connected URL at an
            internal host, a private address or a cloud metadata endpoint;</li>
          <li>using the service as a relay for denial of service, credential stuffing or any attack on a third party;</li>
          <li>uploading malware, or content designed to exploit a reader&apos;s browser.</li>
        </ul>
        <p>
          Good-faith security research is welcome. The <Link href="/legal/security">Security page</Link> says how to
          report something.
        </p>
      </LegalSection>

      <LegalSection id="reselling" index={11} title="Reselling and white-labelling">
        <p>
          You may use {COMPANY.product} for clients, on sites you are authorised to manage. You may not resell it,
          rebrand it or present it as your own product without a written agreement with {COMPANY.legalName}. Write to{" "}
          <Email purpose="legal" /> if you want one.
        </p>
      </LegalSection>

      <LegalSection id="enforcement" index={12} title="What happens if you breach this policy">
        <p>Most problems are honest mistakes. We take the smallest step that resolves the issue.</p>
        <ul>
          <li>
            <b>Warning.</b> We describe the problem and give you reasonable time to correct it. This is the normal
            first step.
          </li>
          <li>
            <b>Suspension.</b> We pause the account or the affected feature. Your data stays where it is.
          </li>
          <li>
            <b>Termination.</b> For serious or repeated breaches we end the agreement. Refunds follow the{" "}
            <Link href="/legal/refunds">Refunds and Cancellation policy</Link>.
          </li>
        </ul>
        <p>
          We suspend immediately, with no warning, where continuing would put other customers, third parties or the
          people whose data is being processed at risk. Connecting a site you do not control, sending unlawful
          marketing at volume, and attacking the service or a third party all fall into that category. We will tell
          you why as soon as we act.
        </p>
        <p>
          Where the law requires it we report unlawful activity to the relevant authority. Nothing here limits any
          other remedy.
        </p>
      </LegalSection>

      <LegalSection id="reporting" index={13} title="Reporting abuse">
        <p>
          If you believe an account is using {COMPANY.product} against your site, or that content produced with it
          breaches this policy, write to <Email purpose="legal" />. Tell us the site or content, what you think is
          happening, and how we can reach you.
        </p>
        <p>
          For a complaint about your own personal data, the <Link href="/legal/privacy">Privacy Policy</Link> sets out
          your rights and the address for those requests. For a security vulnerability, use the route on the{" "}
          <Link href="/legal/security">Security page</Link>.
        </p>
        <p>
          We investigate every report. We may not be able to tell you the outcome for another customer&apos;s account,
          but we will confirm that we looked.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
