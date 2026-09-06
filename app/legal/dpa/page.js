"use client";

import Link from "next/link";
import LegalPage, { LegalSection, Callout, DefTable } from "../../components/LegalPage";
import { COMPANY, emailFor, registeredAddressLine } from "../../../lib/company";
import { CONTACT_EMAIL } from "../../../lib/contact";

/**
 * The Data Processing Addendum.
 *
 * Article 28(3) sets out what a controller-to-processor contract must contain.
 * This document works through that list in order rather than reordering it into
 * something prettier, so a reader with the Article open can tick items off. The
 * two sections that are not boilerplate are the controller obligations, because
 * the lead engine makes those unusually concrete, and the India section.
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
  { id: "application", title: "When this Addendum applies" },
  { id: "definitions", title: "Definitions" },
  { id: "roles", title: "Roles of the parties" },
  { id: "annex", title: "Details of the processing" },
  { id: "instructions", title: "Processing only on your instructions" },
  { id: "confidentiality", title: "Confidentiality" },
  { id: "security", title: "Security of processing" },
  { id: "subprocessors", title: "Sub-processors" },
  { id: "rights", title: "Data subject requests" },
  { id: "assistance", title: "Assistance with Articles 32 to 36" },
  { id: "deletion", title: "Deletion and return" },
  { id: "information", title: "Demonstrating compliance" },
  { id: "audit", title: "Audit rights" },
  { id: "controller", title: "Your obligations as controller" },
  { id: "transfers", title: "International transfers" },
  { id: "india", title: "India: the DPDP Act 2023" },
  { id: "liability", title: "Liability" },
  { id: "execution", title: "How this is executed" },
];

const ANNEX_ROWS = [
  [
    "Subject matter",
    "Provision of the MADBOT service: auditing and crawling a website the customer controls, snapshotting competitor sites, generating written content, discovering business leads from public sources, drafting outreach, checking AI assistant visibility, and sending digests.",
  ],
  ["Duration", "The term of the subscription, plus the deletion period described below."],
  [
    "Nature of the processing",
    "Collection, structuring, storage, analysis, generation of derived content, retrieval, disclosure to the listed sub-processors, erasure and destruction. By automated means.",
  ],
  [
    "Purpose",
    "Delivering the service, metering and billing it, keeping it secure and available, and complying with law.",
  ],
  [
    "Types of personal data",
    "Account data: name, email address, sign-in identifier, plan and billing records. Site data: any personal data appearing in the pages of the customer's own site. Lead data: a company record plus either a role inbox or one named business contact, with role, business email and public source reference. Communications data: delivery events, bounces and complaints.",
  ],
  [
    "Categories of data subject",
    "The customer and its authorised users; people whose details appear on the customer's own website; business contacts at prospect organisations; recipients of the customer's outreach.",
  ],
  [
    "Special categories of data",
    "None. Special-category data is switched off in the data policy the service enforces and there is no setting to enable it. The customer must not introduce it.",
  ],
  ["Frequency", "Continuous for the duration of the subscription."],
  [
    "Retention",
    "Account data for the life of the account. Lead data under the policy a daily job enforces: 90 days active, 30 days rejected, and indefinitely for a suppression record, because a record of an objection must outlive the data it refers to.",
  ],
];

export default function DpaPage() {
  const address = registeredAddressLine();

  return (
    <LegalPage
      title="Data Processing Addendum"
      kicker="Legal"
      updated="6 September 2026"
      effective="6 September 2026"
      toc={TOC}
      intro={
        <>
          <p>
            This Data Processing Addendum forms part of the{" "}
            <Link href="/legal/terms">Terms of Service</Link> between you and {COMPANY.legalName}
            {address ? `, of ${address}` : ""}. It governs the personal data we process on your behalf when you use{" "}
            {COMPANY.product}.
          </p>
          <p>
            You do not need to sign anything for it to apply. Accepting the Terms accepts this document with them. If
            it conflicts with the Terms on a data protection point, this document wins.
          </p>
        </>
      }
    >
      <LegalSection id="application" index={1} title="When this Addendum applies">
        <p>
          This Addendum applies whenever you use {COMPANY.product} for your own business or for a client, and we
          process personal data whose purposes and means you decide. You are the controller and we are the processor.
        </p>
        <p>
          It does not cover everything. We are the controller, not your processor, for our own account, billing and
          security records about you and your users. What we do in that capacity is set out in the{" "}
          <Link href="/legal/privacy">Privacy Policy</Link>, and this Addendum does not change it.
        </p>
      </LegalSection>

      <LegalSection id="definitions" index={2} title="Definitions">
        <p>
          Personal data, processing, controller, processor, data subject, supervisory authority and personal data
          breach have the meanings given in Article 4 of the GDPR. They are not restated here, because restating a
          definition in different words is how two documents come to mean different things.
        </p>
        <p>
          Data Protection Law means the GDPR, the UK GDPR and the Data Protection Act 2018, the Digital Personal Data
          Protection Act 2023 of India, and any other privacy law applying to a party for this processing. Standard
          Contractual Clauses means the clauses approved by the European Commission in Decision 2021/914. UK Addendum
          means the International Data Transfer Addendum issued under section 119A of the Data Protection Act 2018.
          Customer Personal Data means personal data we process on your behalf. Sub-processor means a processor we
          engage to process it.
        </p>
      </LegalSection>

      <LegalSection id="roles" index={3} title="Roles of the parties">
        <p>
          You are the controller. You decide which site to connect, which competitors to snapshot, which leads to
          keep, what outreach to draft and who to send it to. We are your processor and act on your instructions.
        </p>
        <p>
          Where you are yourself a processor for someone else, for example an agency acting for a client, you warrant
          that you have that controller&apos;s authority to appoint us as a sub-processor on these terms.
        </p>
      </LegalSection>

      <LegalSection id="annex" index={4} title="Details of the processing">
        <p>
          This is the annex required by Article 28(3) and Annex I of the Standard Contractual Clauses. It describes the
          processing as the product actually performs it.
        </p>
        <DefTable head={["Item", "Detail"]} rows={ANNEX_ROWS} />
        <Callout>
          <p style={{ margin: 0 }}>
            {COMPANY.product} never sends outreach. It drafts messages, and you send them from your own mail client.
            Everything you send is your processing as controller, outside this Addendum, under your own sender
            identity and your own legal responsibility.
          </p>
        </Callout>
      </LegalSection>

      <LegalSection id="instructions" index={5} title="Processing only on your instructions">
        <p>
          We process Customer Personal Data only on your documented instructions, including on international
          transfers, unless a law that applies to us requires otherwise. Where it does, we will tell you first unless
          that law forbids it on important grounds of public interest.
        </p>
        <p>
          Your instructions are the Terms, this Addendum, the settings you choose in the product, and any further
          written instruction we accept. Configuring the service, approving a post, keeping a lead or deleting one are
          all instructions. If we consider an instruction to infringe Data Protection Law we will tell you promptly,
          and may pause the affected processing until it is resolved.
        </p>
      </LegalSection>

      <LegalSection id="confidentiality" index={6} title="Confidentiality">
        <p>
          Anyone authorised to process Customer Personal Data is bound by a duty of confidentiality, by contract or by
          statute. Access is limited to the people who need it to run the service or support you, and ends when their
          role does.
        </p>
      </LegalSection>

      <LegalSection id="security" index={7} title="Security of processing">
        <p>
          We implement appropriate technical and organisational measures under Article 32, taking into account the
          state of the art, the cost of implementation, and the nature, scope, context and purposes of the processing
          as well as the risk to people.
        </p>
        <p>
          The measures currently in place are described in detail on the{" "}
          <Link href="/legal/security">Security page</Link>, which also states plainly what is not in place yet. That
          page is incorporated into this Addendum by reference. In summary the measures include encryption in transit,
          encryption at rest by our hosting and database providers, per-account access control enforced at the
          database with a deny-by-default rule, server-side authorisation on every paid or publishing action,
          server-write-only handling of subscriptions, usage, billing records, integration credentials and the
          suppression list, secrets held outside the codebase, authenticated scheduled jobs, signature-verified
          webhooks, guards against server-side request forgery on outbound fetches, and automated deletion of lead
          data at the end of its retention window.
        </p>
        <p>
          We may update these measures over time. We will not make a change that materially reduces the overall level
          of protection.
        </p>
        <p>
          We notify you of a personal data breach affecting Customer Personal Data without undue delay after becoming
          aware of it, and give you the information you need for your own notifications. Our notification deadlines,
          including the 72 hours to a supervisory authority and the six hours to CERT-In, are set out on the Security
          page.
        </p>
      </LegalSection>

      <LegalSection id="subprocessors" index={8} title="Sub-processors">
        <p>
          You give general written authorisation for us to engage sub-processors. The current list, what each one
          does, where it processes and whether it applies to your account at all, is published on the{" "}
          <Link href="/legal/subprocessors">Sub-processors page</Link>.
        </p>
        <p>
          Each sub-processor is engaged under a written contract imposing data protection obligations that are
          substantially the same as those in this Addendum, in particular the obligation to provide sufficient
          guarantees of appropriate technical and organisational measures. We remain fully liable to you for a
          sub-processor&apos;s performance of its obligations.
        </p>
        <p>
          We give at least 30 days&apos; notice before a new sub-processor begins processing Customer Personal Data,
          and you may object on reasonable data protection grounds within that period. The consequences of an objection
          are set out on the Sub-processors page and include termination of the affected part of the subscription
          without penalty if we cannot resolve it.
        </p>
      </LegalSection>

      <LegalSection id="rights" index={9} title="Data subject requests">
        <p>
          Taking into account the nature of the processing, we assist you by appropriate technical and organisational
          measures, so far as possible, in fulfilling your obligation to respond to requests to exercise rights under
          Chapter III of the GDPR.
        </p>
        <p>
          Much of this you can do yourself. The dashboard lets you find, correct, export and delete lead records and
          site data directly, and every lead carries a provenance record explaining where it came from, the lawful
          basis relied on and when it will be deleted. That record exists so you can answer a request for information
          without having to reconstruct it later.
        </p>
        <p>
          If a data subject contacts us directly about data we process for you, we will not respond substantively. We
          will tell them to contact you, and pass the request to you promptly. Where you need help that the product
          does not provide, write to <Email purpose="privacy" /> and we will assist. We do not charge for reasonable
          assistance.
        </p>
      </LegalSection>

      <LegalSection id="assistance" index={10} title="Assistance with Articles 32 to 36">
        <p>
          Taking into account the nature of the processing and the information available to us, we assist you in
          meeting your obligations under Articles 32 to 36: security of processing, notification of a breach to the
          supervisory authority, communication of a breach to data subjects, data protection impact assessments, and
          prior consultation with a supervisory authority.
        </p>
        <p>
          In practice that means giving you the information we hold about how the service processes data, our security
          measures, our sub-processors and our retention behaviour, in a form you can use in your own assessment.
        </p>
      </LegalSection>

      <LegalSection id="deletion" index={11} title="Deletion and return">
        <p>
          At your choice, we delete or return all Customer Personal Data at the end of the provision of services, and
          delete existing copies, unless law requires us to keep it.
        </p>
        <p>
          You can export your data from the dashboard at any time while the subscription is live. After termination we
          keep the account for 30 days so it can be reactivated or exported, then delete it. If you ask for deletion
          sooner, we act on that instead. Backups age out on their own cycle and are not restored to bring back
          deleted data.
        </p>
        <p>
          Two things survive. Records we must keep by law, such as invoices and tax records, are retained for the
          statutory period. Suppression records are kept indefinitely, because deleting the record that somebody
          objected would allow them to be contacted again, which is worse for that person than keeping it.
        </p>
      </LegalSection>

      <LegalSection id="information" index={12} title="Demonstrating compliance">
        <p>
          We make available to you the information necessary to demonstrate compliance with the obligations in Article
          28. That includes this Addendum, the Security page, the Sub-processors page, the published data policy the
          product enforces, and written answers to reasonable questions about any of them.
        </p>
        <p>
          We hold no security certification and no audit report, and we say so on the{" "}
          <Link href="/legal/security">Security page</Link>. Nothing in this section should be read as promising a
          report that does not exist.
        </p>
      </LegalSection>

      <LegalSection id="audit" index={13} title="Audit rights">
        <p>
          We allow for and contribute to audits, including inspections, conducted by you or an auditor you mandate.
        </p>
        <p>
          In the first instance that obligation is satisfied by written answers. Send your questionnaire or your
          questions to <Email purpose="legal" /> and we will answer within 30 days. Most requests are fully met this
          way.
        </p>
        <p>
          If written answers are genuinely not enough to demonstrate compliance, you may audit us on reasonable prior
          written notice of at least 30 days, no more than once in any 12 months unless a supervisory authority
          requires otherwise or there has been a breach affecting your data. An audit must take place during business
          hours, must not unreasonably disrupt the service, must respect the confidentiality of other customers, and
          must not extend to any other customer&apos;s data. Your auditor must not be a competitor of ours and must
          sign a confidentiality undertaking. You bear the cost of the audit.
        </p>
      </LegalSection>

      <LegalSection id="controller" index={14} title="Your obligations as controller">
        <p>
          This is the part of the arrangement that we cannot perform for you, and the part that carries the most real
          risk to real people. The lead engine finds business contacts and drafts messages. Whether contacting any
          particular person is lawful is your decision, made with facts we do not have.
        </p>
        <p>You are responsible for:</p>
        <ul>
          <li>
            <b>A lawful basis.</b> Having, and being able to demonstrate, a lawful basis for the leads you ask us to
            find and for the outreach you send. For business-to-business contact this is usually legitimate interests,
            which requires a balancing exercise rather than an assertion. The product records the basis and the
            balancing considerations against every lead so that the answer exists before anyone asks for it.
          </li>
          <li>
            <b>Transparency.</b> Giving privacy information to the people you contact, as required by Articles 13 and
            14. Because you did not collect their details from them, Article 14 applies: they need to be told who you
            are, what you are doing with their data, where you got it and what rights they have, at the latest in your
            first communication with them.
          </li>
          <li>
            <b>Objections.</b> Honouring an objection immediately, permanently, and everywhere. There is an absolute
            right to object to direct marketing, and it is not a preference to be weighed. Record it so the
            suppression list stops the contact being approached again through the service, and stop contacting them
            through your other channels too.
          </li>
          <li>
            <b>Accuracy and relevance.</b> Reviewing what the service finds before acting on it. Generated and
            inferred content can be wrong, and publishing or sending it makes it yours.
          </li>
          <li>
            <b>Local rules.</b> Complying with any rule that goes beyond general data protection law, such as consent
            requirements for electronic marketing in particular jurisdictions.
          </li>
          <li>
            <b>Not introducing prohibited data.</b> Not entering special-category data, data about children, or
            personal data unrelated to a business context into the service.
          </li>
        </ul>
        <p>
          The <Link href="/legal/acceptable-use">Acceptable Use Policy</Link> states these as usage rules. This section
          states them as contractual allocation of responsibility. They are the same rules.
        </p>
      </LegalSection>

      <LegalSection id="transfers" index={15} title="International transfers">
        <p>
          {COMPANY.legalName} is established in {COMPANY.incorporatedIn}, and several sub-processors process in the
          United States. Customer Personal Data will therefore be transferred outside the European Economic Area and
          the United Kingdom.
        </p>
        <p>
          Where a transfer is subject to Chapter V of the GDPR, it is made under the Standard Contractual Clauses
          incorporated into the relevant sub-processor&apos;s data processing terms, and under Standard Contractual
          Clauses between you and us where they are required for the transfer to us. Module Two applies where you are
          a controller and we are a processor, and Module Three where you act as a processor for another controller.
          The annex information required by the Clauses is the details of the processing set out above, the
          sub-processor list, and the security measures on the Security page.
        </p>
        <p>
          For transfers subject to the UK GDPR, the UK Addendum applies to those Clauses, with the same annex
          information. For transfers subject to Swiss law, references to the GDPR and to supervisory authorities are
          read as references to the Swiss Federal Act on Data Protection and the Federal Data Protection and
          Information Commissioner.
        </p>
        <p>
          Where a new transfer mechanism replaces one relied on here, or an adequacy decision covers the transfer, we
          may rely on that instead.
        </p>
      </LegalSection>

      <LegalSection id="india" index={16} title="India: the DPDP Act 2023">
        <p>
          Indian law uses different words for the same two roles. Under the Digital Personal Data Protection Act 2023,
          the party that determines the purpose and means of processing is the Data Fiduciary, and a party processing
          on its behalf is a Data Processor. There is no term corresponding exactly to controller or processor, but the
          allocation is the same one this Addendum makes.
        </p>
        <p>
          Where the DPDP Act applies to your use of {COMPANY.product}, you are the Data Fiduciary and{" "}
          {COMPANY.legalName} is your Data Processor. Everything in this Addendum applies with that reading. In
          particular, the duties the Act places on a Data Fiduciary are yours: giving notice to the Data Principal,
          establishing a valid ground for processing, responding to requests for information, correction and erasure,
          publishing a grievance mechanism, and notifying the Data Protection Board and affected Data Principals of a
          personal data breach.
        </p>
        <p>
          As your Data Processor we process only under this Addendum and your instructions, apply the security
          safeguards described on the Security page, assist you with Data Principal requests and with breach
          notification, and delete data when the purpose is served or the engagement ends.
        </p>
        <p>
          Where the DPDP Act and the GDPR both apply to the same processing, we apply whichever requirement is stricter
          rather than treating one as satisfying the other.
        </p>
      </LegalSection>

      <LegalSection id="liability" index={17} title="Liability">
        <p>
          Each party&apos;s liability under this Addendum is subject to the exclusions and limits of liability in the{" "}
          <Link href="/legal/terms">Terms of Service</Link>, and any claim under this Addendum counts towards the same
          aggregate cap. Nothing here limits liability that cannot lawfully be limited, including a data
          subject&apos;s rights against either party under Article 82 of the GDPR.
        </p>
      </LegalSection>

      <LegalSection id="execution" index={18} title="How this is executed">
        <p>
          No signature is needed. This Addendum takes effect when you accept the Terms of Service, and stays in force
          for as long as we process Customer Personal Data for you.
        </p>
        <p>
          If your organisation needs a countersigned copy for its records, write to <Email purpose="legal" /> with the
          legal name and registered address of the contracting entity and the name of the person who should sign for
          it. We will return a signed copy of this document. We do not usually accept a different template, because
          the document has to match what the product actually does.
        </p>
        <p>
          This Addendum is governed by the law and subject to the jurisdiction stated in the Terms of Service, except
          where Data Protection Law requires otherwise, and except that the Standard Contractual Clauses are governed
          as those Clauses provide.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
