"use client";

import Link from "next/link";
import LegalPage, { LegalSection, Callout, DefTable } from "../../components/LegalPage";
import { COMPANY, emailFor, registeredAddressLine } from "../../../lib/company";
import { CONTACT_EMAIL } from "../../../lib/contact";
import { DEFAULT_POLICY } from "../../../lib/dataPolicy";

/**
 * The Privacy Policy.
 *
 * Everything factual on this page is read from code rather than typed here:
 * retention periods come from lib/dataPolicy.js, company identity from
 * lib/company.js, cookie storage from lib/consent.js via the cookie policy. If
 * the code changes, the page changes with it, which is the only way a document
 * like this stays true after the month it was written.
 */

const privacyEmail = emailFor("privacy", CONTACT_EMAIL);
const securityEmail = emailFor("security", privacyEmail);
const grievanceEmail =
  COMPANY.grievanceOfficer.email || emailFor("grievance", privacyEmail);
const address = registeredAddressLine();

const RETENTION = DEFAULT_POLICY.retentionDays;

/** "at foo@bar.com", or an honest admission when no address is published. */
function ReachUs({ address: mail }) {
  if (mail) {
    return (
      <>
        at <a href={`mailto:${mail}`}>{mail}</a>
      </>
    );
  }
  return (
    <>
      at the address we publish for this purpose, which is not yet set up (the
      notice at the top of this page says so, and it disappears once it is)
    </>
  );
}

const TOC = [
  { id: "who-we-are", title: "Who we are and how to reach us" },
  { id: "roles", title: "Controller or processor: which one we are" },
  { id: "what-we-collect", title: "What we collect about you, and why" },
  { id: "leads", title: "Data about other people: the lead engine" },
  { id: "ai", title: "AI, and what we send to Anthropic" },
  { id: "subprocessors", title: "Who else handles the data" },
  { id: "transfers", title: "Where the data goes" },
  { id: "retention", title: "How long we keep things" },
  { id: "security", title: "How we protect it" },
  { id: "rights", title: "Your rights, and how to actually use them" },
  { id: "gdpr", title: "EU, EEA, UK and Switzerland" },
  { id: "india", title: "India: the DPDP Act 2023" },
  { id: "us-states", title: "United States: California and other states" },
  { id: "other-countries", title: "Other countries" },
  { id: "automated", title: "Automated decisions and lead scoring" },
  { id: "children", title: "Children" },
  { id: "cookies", title: "Cookies and browser storage" },
  { id: "breach", title: "If something goes wrong" },
  { id: "changes", title: "Changes to this policy" },
  { id: "complaints", title: "Complaints and grievance redressal" },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      kicker="Legal"
      updated="6 September 2026"
      effective="6 September 2026"
      toc={TOC}
      intro={
        <>
          <p style={{ margin: "0 0 12px" }}>
            This policy covers two different things, and it is worth separating
            them before you read any further. The first is what {COMPANY.product} does
            with data about <b>you</b>, our customer. The second is what {COMPANY.product}{" "}
            does with data about <b>other people</b>, because the software finds
            business contacts and drafts outreach on your instruction. Our legal
            role is different in each case, and so are the rules.
          </p>
          <p style={{ margin: 0 }}>
            It is written in plain English on purpose. Where the law gives you a
            right, we have tried to say how to use it rather than merely that it
            exists. If a sentence here is unclear, tell us and we will rewrite
            it.
          </p>
        </>
      }
    >
      <LegalSection id="who-we-are" index={1} title="Who we are and how to reach us">
        <p>
          {COMPANY.product} is operated by {COMPANY.legalName}, a{" "}
          {COMPANY.entityType} incorporated in {COMPANY.incorporatedIn}. In this
          policy, &quot;we&quot;, &quot;us&quot; and &quot;our&quot; mean that
          company.
        </p>
        {COMPANY.cin ? <p>Corporate Identity Number: {COMPANY.cin}.</p> : null}
        {address ? (
          <p>Registered office: {address}.</p>
        ) : (
          <p>
            Our registered office address is not yet published on this site. It
            is listed in the notice at the top of this page as outstanding, and
            it will appear here as soon as it is filed and confirmed. We are not
            going to print a plausible-looking address that is not the one on
            record.
          </p>
        )}
        <p>
          For anything about this policy, your data, or a request you want to
          make, reach us <ReachUs address={privacyEmail} />.
        </p>

        <h3>No Data Protection Officer, and no EU or UK representative</h3>
        <p>
          We have not appointed a Data Protection Officer. We are not required
          to have one, and naming a person who does not hold that role would be
          worse than saying nothing. Requests go to the address above and are
          handled by the people who run the service.
        </p>
        <Callout tone="warn">
          <p style={{ margin: 0 }}>
            <b>We have not appointed an Article 27 representative.</b> Article 27
            of the GDPR asks a company outside the EU that offers services to
            people in the EU to appoint a representative established there, and
            the UK GDPR asks the same for the UK.{" "}
            {COMPANY.euRepresentative ? null : "We have not done this yet."} If
            you are in the EU, the EEA or the UK, contact us directly using the
            address above. The absence of a representative will not make us
            slower to answer you, and it does not reduce any of your rights.
          </p>
        </Callout>
      </LegalSection>

      <LegalSection id="roles" index={2} title="Controller or processor: which one we are">
        <p>
          Data protection law distinguishes between the party that decides why
          personal data is being used (the <b>controller</b>) and the party that
          only handles it on someone else&apos;s instruction (the{" "}
          <b>processor</b>). {COMPANY.product} is both, depending on whose data
          is in question.
        </p>
        <DefTable
          head={["Whose data", "Our role", "What that means"]}
          rows={[
            [
              "Your account",
              "Controller",
              "Your email address, name, sign-in method, billing history, usage counters and the list of sites you connect. We decide why we hold these, so the responsibility is ours and the rights below are exercised against us.",
            ],
            [
              "The people your use of MADBOT finds",
              "Processor",
              "Prospective leads the engine discovers, and anyone you draft outreach to. You decide who is contacted and why. We run the software. You are the controller of that data and we act on your instructions.",
            ],
            [
              "Your website content",
              "Processor",
              "Everything we crawl from the sites you connect is processed to give you the audit and the copy you asked for. If a page on your site contains personal data, we hold it for you, not for ourselves.",
            ],
          ]}
        />
        <p>
          The second row has consequences you should be aware of before you use
          the lead engine. As controller of that data, you are the one who owes
          those people transparency, who must be able to justify contacting
          them, and who must honour it when they object. We build the product so
          that this is possible rather than theoretical: every lead carries a
          record of where it came from, on what basis, and when it will be
          deleted. See <Link href="/legal/dpa">our Data Processing Addendum</Link>,
          which sets out the processor terms we work under and forms part of
          your agreement with us.
        </p>
      </LegalSection>

      <LegalSection id="what-we-collect" index={3} title="What we collect about you, and why">
        <p>
          Here is the complete list for a customer account, with the reason and
          the lawful basis for each. We do not collect anything that is not on
          this list, and we do not buy data about you from anyone.
        </p>
        <DefTable
          head={["What", "Why we have it", "Lawful basis"]}
          rows={[
            [
              "Email address, display name and account id",
              "To create your account and sign you in. You can sign up with an email and password, or with Google or GitHub, in which case that provider tells us your email address and name. Accounts are held in Firebase Authentication.",
              "Performance of our contract with you.",
            ],
            [
              "Whether your email is verified",
              "So that an account cannot be opened on an address that is not yours.",
              "Contract, and our legitimate interest in preventing account abuse.",
            ],
            [
              "A one-way hash of your email address",
              "Kept in a trial ledger so that one person cannot take the free trial over and over with new addresses. Explained in full below.",
              "Legitimate interests: preventing fraud and abuse of a free offer.",
            ],
            [
              "Subscription, plan and billing history",
              "To charge the correct amount, issue receipts, apply refunds and keep proper books.",
              "Contract, and a legal obligation under Indian company and tax law.",
            ],
            [
              "Usage counters",
              "To meter what your plan includes, stop runaway spend, and show you what you have used.",
              "Performance of our contract with you.",
            ],
            [
              "The websites you connect, and everything we crawl from them",
              "This is the product. We cannot audit, monitor or write for a site without reading it.",
              "Performance of our contract with you.",
            ],
            [
              "Email delivery events",
              "Our email provider, Resend, tells us when a message we sent you was delivered, opened, clicked, bounced or reported as spam. We keep a permanent suppression list of addresses that bounced or complained.",
              "Legitimate interests in reliable delivery, and compliance with anti-spam law.",
            ],
            [
              "Approximate country",
              "Derived at the edge from headers our hosts add to your request. Used for exactly two things: which currency to show you first, and which cookie notice your country requires. We do not store your IP address.",
              "Legitimate interests in showing you the right price and the right notice.",
            ],
            [
              "Anything you write to us",
              "Support and sales messages, so we can answer them.",
              "Legitimate interests in running a service people can talk to.",
            ],
          ]}
        />

        <h3>The trial ledger, and why it holds a hash</h3>
        <p>
          When you start a free trial we take your email address, normalise it,
          and compute a SHA-256 hash of the result. That hash goes into a ledger
          and stays there permanently. The plain address is not written to the
          ledger, and a SHA-256 hash cannot be turned back into an email
          address.
        </p>
        <p>
          The reason for the design is simple. To stop one person taking
          unlimited free trials we need to recognise an address we have seen
          before, and that is all we need. Storing a hash lets us answer
          &quot;have we seen this one?&quot; without the ledger ever being a
          readable list of everybody who has tried the product. If you later
          delete your account, the hash remains, because deleting it would
          reopen the loophole it exists to close. Nothing else about you is
          attached to it.
        </p>
        <Callout>
          <p style={{ margin: 0 }}>
            We do not handle your card details. Payment is taken by our payment
            provider, which sends us the outcome of the transaction and never
            the card number.
          </p>
        </Callout>
      </LegalSection>

      <LegalSection id="leads" index={4} title="Data about other people: the lead engine">
        <p>
          {COMPANY.product} finds businesses that look like a fit for what you
          sell, and drafts outreach for you. Some of what it finds is personal
          data about real people, so the engine sorts everything into three
          levels and applies different rules to each. This is enforced in code,
          not in a policy document: the same rules the dashboard shows you are
          the ones the server applies.
        </p>
        <DefTable
          head={["Level", "What it is", "How it is treated"]}
          rows={[
            [
              "Company information",
              "Company name, domain, sector, website content and technology, TLS and DNS records, published pricing, job listings, public registry entries.",
              "Not personal data. These are commercial facts about an organisation, so data protection law is not engaged and collection runs freely.",
            ],
            [
              "Role inboxes",
              "Generic addresses such as info@, hello@, sales@ or support@.",
              "Treated as personal data by default. A one-person company's info@ is that person, so the safe reading is applied rather than the convenient one. Collection needs a human to approve it for Canada and for any country we cannot identify.",
            ],
            [
              "Named individuals",
              "A person's name, role, direct email, phone number or profile.",
              "Personal data. A human must review and approve it in every jurisdiction, and it is never collected for Canada under the default policy.",
            ],
          ]}
        />

        <h3>What is never collected</h3>
        <p>
          Special category data, meaning health, religion, politics, ethnicity,
          sex life, sexual orientation, trade union membership, genetic and
          biometric data, is never collected. There is no setting to turn it on.
          There is no lawful basis for gathering any of it for cold business
          outreach, so offering a switch would imply otherwise.
        </p>

        <h3>The lawful basis, and the right to object</h3>
        <p>
          Where a lead is personal data, the basis relied on is legitimate
          interests: contacting an organisation about something relevant to its
          publicly observable circumstances. That is a real basis, not a blank
          cheque. It requires a balancing test, and the engine records one
          against every lead: the purpose, why the contact is necessary, and the
          safeguards applied. It also gives the person an absolute right to
          object. When someone objects, contact stops immediately and
          permanently.
        </p>

        <h3>How long lead data lives</h3>
        <ul>
          <li>
            An active lead is deleted {RETENTION.active} days after it was
            collected, unless something happens with it.
          </li>
          <li>A rejected lead is deleted after {RETENTION.rejected} days.</li>
          <li>
            A suppression record, meaning a note that somebody asked not to be
            contacted, is kept indefinitely. Deleting it would mean contacting
            that person again, which is the opposite of what they asked for. A
            suppression record holds only what is needed to avoid the contact.
          </li>
        </ul>
        <p>
          A job runs once a day and deletes records whose retention date has
          passed. A retention date that nothing enforces is worse than no policy
          at all, because it looks like compliance.
        </p>
        <p>
          If you are a person who has been contacted through {COMPANY.product} and
          you want your data removed, the fastest route is to reply to the sender,
          because they are the controller and we act on their instructions. You
          can also write to us <ReachUs address={privacyEmail} /> and we will
          pass it on and suppress the address.
        </p>
      </LegalSection>

      <LegalSection id="ai" index={5} title="AI, and what we send to Anthropic">
        <p>
          {COMPANY.product} uses Anthropic&apos;s Claude API to audit sites,
          analyse what it finds, and write copy. That means the following leaves
          our systems and is sent to Anthropic:
        </p>
        <ul>
          <li>
            Content crawled from the websites you connect, including page text,
            metadata and structure.
          </li>
          <li>
            Information about the leads the engine has found, so that outreach
            can be drafted and a fit assessed.
          </li>
          <li>
            Prompts and instructions we construct, plus anything you type into a
            field that feeds one.
          </li>
        </ul>
        <p>
          This is processed under Anthropic&apos;s commercial terms. We are not
          going to make claims on Anthropic&apos;s behalf about model training
          that we cannot verify ourselves. Read the terms and decide for
          yourself:{" "}
          <a
            href="https://www.anthropic.com/legal/commercial-terms"
            target="_blank"
            rel="noreferrer noopener"
          >
            anthropic.com/legal/commercial-terms
          </a>
          .
        </p>
        <p>
          If you do not want a particular site or a particular lead analysed,
          do not connect it. There is no way to run the audit or the copywriting
          without sending the content to the model.
        </p>
      </LegalSection>

      <LegalSection id="subprocessors" index={6} title="Who else handles the data">
        <p>
          These are the companies that process data on our behalf. Some are
          always involved; others only if you connect them yourself. The current
          list is maintained at{" "}
          <Link href="/legal/subprocessors">/legal/subprocessors</Link>, which is
          the version to check, because this page is updated less often.
        </p>
        <DefTable
          head={["Sub-processor", "What it does", "When"]}
          rows={[
            ["Google", "Firebase Authentication for accounts and sign-in, and Cloud Firestore as the database.", "Always"],
            ["Vercel", "Hosting, serverless functions and edge network.", "Always"],
            ["Anthropic", "The Claude API, for audits, analysis and writing.", "Always"],
            ["Resend", "Transactional email and digests, plus delivery events.", "Always"],
            ["GitHub", "Reading and publishing to a repository.", "Only if you connect it"],
            ["Google Search Console", "Reading your search performance data.", "Only if you connect it"],
            ["LinkedIn, X and Meta", "Publishing posts you have approved.", "Only if you connect them"],
          ]}
        />
        <p>
          We do not sell personal data, we do not share it for cross-context
          behavioural advertising, and we do not pass it to data brokers. The
          only other circumstance in which we would hand data over is a valid
          legal demand, and we would tell you about it unless we were forbidden
          from doing so.
        </p>
      </LegalSection>

      <LegalSection id="transfers" index={7} title="Where the data goes">
        <p>
          We are in {COMPANY.incorporatedIn}. The sub-processors listed above are
          mostly in the United States and the European Union. Data collected in
          one country therefore leaves it, and there is no way to use the
          service without that happening.
        </p>
        <p>
          For personal data covered by the GDPR or the UK GDPR, we rely on the
          Standard Contractual Clauses incorporated in our sub-processors&apos;
          terms. That is the honest description of the mechanism. We have not
          completed our own transfer impact assessment, and we will publish one
          when we have. If you need the assessment before you can use the
          product, tell us and we will say where we have got to rather than
          guessing.
        </p>
      </LegalSection>

      <LegalSection id="retention" index={8} title="How long we keep things">
        <DefTable
          head={["What", "How long"]}
          rows={[
            [
              "Your account and its contents",
              "For as long as your account is open. If you delete it, or if you ask us to, we delete the account, your sites, the crawled content and the leads within 30 days.",
            ],
            [
              "Active leads",
              `${RETENTION.active} days from collection, then deleted automatically.`,
            ],
            [
              "Rejected leads",
              `${RETENTION.rejected} days, then deleted automatically.`,
            ],
            [
              "Suppression records",
              "Indefinitely. A record that somebody objected has to outlive the data it refers to, or we would contact them again.",
            ],
            [
              "The trial ledger hash",
              "Indefinitely. It is a hash, not an address, and deleting it would reopen the abuse it prevents.",
            ],
            [
              "Email delivery events",
              "Kept while they are useful for diagnosing delivery, then deleted. The suppression entry a bounce or complaint creates is separate and is kept.",
            ],
            [
              "Billing records and invoices",
              "Eight years. Indian law requires books of account to be preserved for eight financial years, and we cannot delete them on request before that.",
            ],
            [
              "Backups",
              "Deleted data can persist in our provider's backups for a short period after deletion before it ages out.",
            ],
          ]}
        />
      </LegalSection>

      <LegalSection id="security" index={9} title="How we protect it">
        <p>
          What follows is what is actually in place. It is not a list of things
          we intend to do, and it deliberately does not mention any
          certification, because we hold none.
        </p>
        <ul>
          <li>
            Everything travels over HTTPS. There is no unencrypted route into
            the service.
          </li>
          <li>
            Data is encrypted at rest by Google Cloud Platform, which is where
            the database lives.
          </li>
          <li>
            Database security rules make entitlements, usage counters, billing
            records and integration credentials server-write-only. A signed-in
            user cannot grant themselves a plan, cannot edit their own usage,
            and cannot read anybody else&apos;s documents. Integration tokens
            cannot be read from a browser at all.
          </li>
          <li>
            Every licence and entitlement check is verified on the server
            against a verified sign-in token. A client claiming to be on a
            higher plan is simply ignored.
          </li>
          <li>
            The email events webhook is signed, and an unverified call is
            rejected. Otherwise anyone could add addresses to the suppression
            list and quietly stop your mail.
          </li>
          <li>
            Secrets are held as environment variables. None are committed to the
            repository.
          </li>
          <li>
            Every outbound fetch passes an SSRF guard that resolves the target
            and refuses private, loopback and link-local addresses. A URL you
            connect cannot be pointed at internal infrastructure.
          </li>
        </ul>
        <p>
          We do not hold ISO 27001, SOC 2 or any other certification, and we
          have not commissioned a penetration test. When either changes we will
          say so here. More detail is on the{" "}
          <Link href="/legal/security">security page</Link>. If you have found a
          vulnerability, tell us <ReachUs address={securityEmail} /> and we will
          not take legal action against you for reporting it in good faith.
        </p>
      </LegalSection>

      <LegalSection id="rights" index={10} title="Your rights, and how to actually use them">
        <p>
          The sections after this one set out which rights apply where. This one
          is the part that matters: how to use them without writing a letter.
        </p>
        <h3>Export everything we hold about you</h3>
        <p>
          Sign in and use the export tool in your dashboard, which calls{" "}
          <code>/api/privacy/export</code>. It returns a machine-readable file
          containing your account record, your sites, your crawled content, your
          leads, your usage and your billing history. That is a subject access
          request and a data portability request answered in one click, without
          you having to ask us for either.
        </p>
        <h3>Delete your account and your data</h3>
        <p>
          The delete tool in your dashboard calls{" "}
          <code>/api/privacy/delete</code>. It removes your account, your sites,
          your crawled content and your leads. Two things survive it, and both
          are explained above: the billing records we are required by law to
          keep for eight years, and the suppression and trial-ledger entries,
          which exist precisely so that deleting them would harm somebody.
        </p>
        <h3>Everything else</h3>
        <p>
          For correction, restriction, objection, withdrawing consent, or any
          right the tools do not cover, write to us{" "}
          <ReachUs address={privacyEmail} />. Tell us what you want and, if it
          is not obvious, which account or address you are asking about. We will
          answer within 30 days. We do not charge for this, and we will not ask
          you for identification we do not already hold. If we ever cannot do
          what you asked, we will say why rather than going quiet.
        </p>
        <Callout>
          <p style={{ margin: 0 }}>
            If you want to stop marketing email, use the unsubscribe link in any
            message we send. It works immediately and it does not need our
            involvement. Objecting to direct marketing is absolute: we do not
            get to weigh it against anything.
          </p>
        </Callout>
      </LegalSection>

      <LegalSection id="gdpr" index={11} title="EU, EEA, UK and Switzerland">
        <p>
          If the GDPR, the UK GDPR or the Swiss FADP applies to you, you have
          these rights over the data we hold as controller:
        </p>
        <ul>
          <li>
            <b>Access.</b> A copy of your data and an explanation of what we do
            with it. Use the export tool.
          </li>
          <li>
            <b>Rectification.</b> Correction of anything inaccurate, and
            completion of anything incomplete.
          </li>
          <li>
            <b>Erasure.</b> Deletion, subject to the two carve-outs described
            above.
          </li>
          <li>
            <b>Restriction.</b> A pause on processing while a dispute about
            accuracy or lawful basis is resolved.
          </li>
          <li>
            <b>Portability.</b> Your data in a structured, commonly used,
            machine-readable format. That is what the export returns.
          </li>
          <li>
            <b>Objection.</b> To anything we do on the basis of legitimate
            interests. For direct marketing the right is absolute and takes
            effect at once.
          </li>
          <li>
            <b>No automated decisions with legal effect.</b> We make none. See
            the section on lead scoring.
          </li>
          <li>
            <b>Withdrawal of consent</b> where we relied on consent, without
            affecting what was lawful before you withdrew it.
          </li>
        </ul>
        <p>
          You can also complain to a regulator. Complain to the supervisory
          authority in the country where you live or work, or where you think
          the problem happened. In the United Kingdom that is the Information
          Commissioner&apos;s Office. You do not have to come to us first,
          although we would rather you did, because we can usually fix it faster
          than a regulator can.
        </p>
        <p>
          Where you are a customer using the lead engine, you are the controller
          of that lead data and we are your processor. Rights over that data are
          exercised against you, not us. We will help you answer them, which is
          part of what the{" "}
          <Link href="/legal/dpa">Data Processing Addendum</Link> commits us to.
        </p>
      </LegalSection>

      <LegalSection id="india" index={12} title="India: the DPDP Act 2023">
        <p>
          If you are in India, the Digital Personal Data Protection Act, 2023
          applies. In its language we are the Data Fiduciary and you are the
          Data Principal. You have the right to:
        </p>
        <ul>
          <li>
            <b>Access</b> a summary of the personal data we process and who we
            have shared it with.
          </li>
          <li>
            <b>Correction, completion, updating and erasure</b> of your personal
            data.
          </li>
          <li>
            <b>Grievance redressal.</b> A route to complain to us directly, set
            out in the last section of this policy.
          </li>
          <li>
            <b>Nomination.</b> You may nominate another person to exercise these
            rights on your behalf if you die or become incapable of exercising
            them yourself. Write to us{" "}
            <ReachUs address={grievanceEmail} /> with the nominee&apos;s name
            and contact details and we will record it against your account.
          </li>
          <li>
            <b>Withdrawal of consent</b> at any time, as easily as it was given.
          </li>
        </ul>
        <p>
          The Act also places a duty on you. A Data Principal must not raise a
          false or frivolous complaint, must not impersonate somebody else when
          making a request, and must give authentic information when asked to
          correct a record. The Act provides for a penalty where that duty is
          breached. We mention it because the Act does, not because we expect it
          to come up.
        </p>
        <p>
          If we do not resolve your grievance, you may escalate to the Data
          Protection Board of India.
        </p>
      </LegalSection>

      <LegalSection id="us-states" index={13} title="United States: California and other states">
        <p>
          If you live in California, or in another state with a comprehensive
          privacy law such as Colorado, Connecticut, Virginia, Utah, Texas,
          Oregon or Montana, you have the right to:
        </p>
        <ul>
          <li>
            <b>Know</b> what personal information we collect, why, and who we
            disclose it to. This page is that disclosure, and the export tool
            gives you the data itself.
          </li>
          <li>
            <b>Delete</b> the personal information we hold about you.
          </li>
          <li>
            <b>Correct</b> inaccurate personal information.
          </li>
          <li>
            <b>Opt out</b> of the sale or sharing of personal information, and
            of targeted advertising.
          </li>
          <li>
            <b>Limit</b> the use and disclosure of sensitive personal
            information.
          </li>
          <li>
            <b>Not be discriminated against</b> for exercising any of these. We
            will not degrade the service, change your price, or treat you
            differently because you made a request.
          </li>
        </ul>
        <Callout>
          <p style={{ margin: 0 }}>
            <b>
              We do not sell personal information and we do not share it for
              cross-context behavioural advertising,
            </b>{" "}
            as those terms are defined in the California Consumer Privacy Act as
            amended by the CPRA and in the equivalent state laws. There is
            nothing to opt out of, and we would have to change this page before
            there was. We do not use or disclose sensitive personal information
            for any purpose beyond providing the service.
          </p>
        </Callout>
        <p>
          <b>Global Privacy Control is honoured.</b> If your browser sends a GPC
          signal, we treat it as a valid opt-out request without you having to
          do anything else, and we act on it before any consent banner is shown.
          An authorised agent may make a request on your behalf; we will ask for
          proof that you authorised them.
        </p>
      </LegalSection>

      <LegalSection id="other-countries" index={14} title="Other countries">
        <p>
          Equivalent rights are honoured for residents of the following
          countries, under the law named. In practice the rights are close
          enough that we do not operate different processes: use the export and
          delete tools, or write to us <ReachUs address={privacyEmail} /> and say
          which country you are in.
        </p>
        <ul>
          <li>
            <b>United Arab Emirates:</b> Federal Decree-Law No. 45 of 2021 on
            the Protection of Personal Data, and the DIFC and ADGM regimes where
            they apply instead.
          </li>
          <li>
            <b>Saudi Arabia:</b> the Personal Data Protection Law.
          </li>
          <li>
            <b>Singapore:</b> the Personal Data Protection Act 2012, including
            withdrawal of deemed consent.
          </li>
          <li>
            <b>Australia:</b> the Privacy Act 1988 and the Australian Privacy
            Principles.
          </li>
          <li>
            <b>Canada:</b> PIPEDA, and Quebec Law 25, which additionally gives
            you the right to data portability and to be told when a decision is
            made about you by automated means.
          </li>
          <li>
            <b>Brazil:</b> the LGPD, including confirmation of processing,
            anonymisation and information about data sharing.
          </li>
          <li>
            <b>South Africa:</b> POPIA, including the right to complain to the
            Information Regulator.
          </li>
          <li>
            <b>Japan:</b> the APPI, including disclosure, correction and
            cessation of use.
          </li>
          <li>
            <b>South Korea:</b> PIPA, including access, correction, suspension
            of processing and deletion.
          </li>
        </ul>
        <p>
          If you are somewhere not listed and your law gives you a right, ask
          for it. We would rather honour a right we were not certain applied
          than argue about jurisdiction.
        </p>
      </LegalSection>

      <LegalSection id="automated" index={15} title="Automated decisions and lead scoring">
        <p>
          {COMPANY.product} scores leads automatically. It looks at technical and
          commercial signals about a company and produces a number and a reason.
          It is worth being precise about what that is and is not.
        </p>
        <p>
          It is a <b>suggestion to a human</b>. The score orders a list. A person
          decides whether to approve a lead, whether to send anything, and what
          to send. Where the data concerns a named individual, or a role inbox
          in a jurisdiction we treat strictly, the engine will not proceed at all
          until a person approves it.
        </p>
        <p>
          It is <b>not</b> a decision that produces a legal effect on anybody, or
          anything similarly significant. Nobody is refused credit, employment,
          insurance, a service or a price by this system. If we ever build
          something that does make such a decision, this section will change
          first and we will tell you before it runs.
        </p>
        <p>
          We do not build behavioural profiles of individuals, and the engine
          does not use special category data because it never collects any.
        </p>
      </LegalSection>

      <LegalSection id="children" index={16} title="Children">
        <p>
          {COMPANY.product} is a business tool and is not for anybody under 18.
          You may not create an account if you are under 18, and the{" "}
          <Link href="/legal/terms">Terms of Service</Link> say the same.
        </p>
        <p>
          Under India&apos;s DPDP Act 2023, a child is anybody under 18, and
          processing a child&apos;s data requires verifiable parental consent.
          The Act also prohibits tracking, behavioural monitoring and targeted
          advertising directed at children. We do not knowingly process any
          child&apos;s personal data, we do not do behavioural tracking or
          targeted advertising at all, and we do not offer the service to
          children.
        </p>
        <p>
          If you believe a child has created an account, tell us{" "}
          <ReachUs address={privacyEmail} /> and we will delete it and the data
          attached to it.
        </p>
      </LegalSection>

      <LegalSection id="cookies" index={17} title="Cookies and browser storage">
        <p>
          {COMPANY.product} runs no analytics and no advertising cookies. What
          the site stores in your browser is a short list: what keeps you signed
          in, what remembers your answer to the cookie banner, and what remembers
          your theme and currency.
        </p>
        <p>
          The full inventory, the reason for each entry, how long it lasts, and
          how to change your mind are in the{" "}
          <Link href="/legal/cookies">Cookie and Local Storage Policy</Link>. That
          page is generated from the same code that does the storing, so it
          cannot describe something we are not doing, or omit something we are.
        </p>
      </LegalSection>

      <LegalSection id="breach" index={18} title="If something goes wrong">
        <p>
          If personal data we hold is exposed, lost or accessed by somebody who
          should not have it, here is what happens.
        </p>
        <ul>
          <li>
            We contain it, work out what was affected, and write down what we
            find as we find it.
          </li>
          <li>
            Under the GDPR and the UK GDPR we notify the relevant supervisory
            authority within <b>72 hours</b> of becoming aware, unless the breach
            is unlikely to result in a risk to anybody. Where the risk to you is
            high, we tell you directly, without undue delay.
          </li>
          <li>
            In India, the CERT-In directions require certain cyber incidents to
            be reported within <b>6 hours</b> of noticing them. The DPDP Act
            separately requires us to notify the Data Protection Board of India
            and every affected Data Principal. We do both.
          </li>
          <li>
            Where you are the controller and we are your processor, we tell you
            without undue delay so that you can meet your own notification
            deadlines. Your deadline is the one that governs, not ours.
          </li>
          <li>
            Other regimes have their own timelines, and we meet whichever is
            shortest rather than picking the most convenient.
          </li>
        </ul>
        <p>
          A notification from us will say what happened, what data was involved,
          what we have done, and what you should do. It will not be written to
          minimise the incident.
        </p>
      </LegalSection>

      <LegalSection id="changes" index={19} title="Changes to this policy">
        <p>
          The date at the top of this page is the last time it changed. Minor
          corrections, clearer wording and new sub-processors get published here
          with the date updated.
        </p>
        <p>
          If we change something that materially affects you, meaning a new
          purpose for your data, a new category of data, or a change in the legal
          basis we rely on, we will email account holders before the change takes
          effect, and we will not apply it retroactively. If the change requires
          consent, we will ask for consent rather than assuming it from your
          continued use.
        </p>
        <p>
          If our cookie inventory changes, the stored consent record carries a
          version number that invalidates old answers, so you are asked again
          about the new thing rather than being treated as having agreed to it.
        </p>
      </LegalSection>

      <LegalSection id="complaints" index={20} title="Complaints and grievance redressal">
        <p>
          Start with us. Write <ReachUs address={privacyEmail} /> and describe
          the problem.
        </p>
        <h3>India: the Grievance Officer route</h3>
        <p>
          India&apos;s Consumer Protection (E-Commerce) Rules 2020 and the IT
          Rules 2021 require us to publish a named Grievance Officer, and the
          DPDP Act requires a published contact for grievances.
        </p>
        {COMPANY.grievanceOfficer.name ? (
          <p>
            {COMPANY.grievanceOfficer.designation}:{" "}
            <b>{COMPANY.grievanceOfficer.name}</b>
            {grievanceEmail ? (
              <>
                , <a href={`mailto:${grievanceEmail}`}>{grievanceEmail}</a>
              </>
            ) : null}
            {address ? <>, {address}</> : null}.
          </p>
        ) : (
          <p>
            We have not yet appointed a named Grievance Officer. That is a gap,
            it is listed in the notice at the top of this page, and it will be
            filled before we take money. Until then, grievances go{" "}
            <ReachUs address={grievanceEmail} /> and are handled on the same
            timetable set out below.
          </p>
        )}
        <p>
          We acknowledge a grievance within{" "}
          <b>{COMPANY.grievanceOfficer.acknowledgeHours} hours</b> and resolve it
          within <b>{COMPANY.grievanceOfficer.resolveDays} days</b>. If you are in
          India and we have not resolved it, you may escalate to the Data
          Protection Board of India.
        </p>
        <h3>Elsewhere</h3>
        <p>
          In the EU or the EEA, complain to the supervisory authority where you
          live or work. In the United Kingdom, the Information
          Commissioner&apos;s Office. In South Africa, the Information
          Regulator. In Brazil, the ANPD. In Singapore, the PDPC. In Australia,
          the OAIC. In Canada, the Office of the Privacy Commissioner, or the
          Commission d&apos;acc&egrave;s &agrave; l&apos;information in Quebec.
          In California, the California Privacy Protection Agency or the Attorney
          General. You never have to come to us first.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
