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
    "Provision of the MADBOT service: auditing and crawling a website the customer controls, snapshotting competitor sites, generating content, discovering business leads from public sources, drafting outreach, checking AI visibility, and sending digests.",
  ],
  ["Duration", "The term of the subscription, plus the deletion period described below."],
  [
    "Nature of the processing",
    "Collection, structuring, storage, analysis, generation of derived content, disclosure to the listed sub-processors, erasure and destruction. By automated means.",
  ],
  [
    "Purpose",
    "Delivering the service, metering and billing it, keeping it secure and available, and complying with law.",
  ],
  [
    "Types of personal data",
    "Account data: name, email address, sign-in identifier, plan and billing records. Site data: any personal data appearing on the customer's own site. Lead data: a company record plus either a role inbox or one named business contact, with role, business email and source reference. Communications data: delivery events, bounces and complaints.",
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
            This Data Processing Addendum forms part of the <Link href="/legal/terms">Terms of Service</Link> between
            you and {COMPANY.legalName}
            {address ? `, of ${address}` : ""}. It governs the personal data we process on your behalf when you use{" "}
            {COMPANY.product}. Accepting the Terms accepts this document with them, and where the two conflict on a
            data protection point, this one wins.
          </p>
        </>
      }
    >
      <LegalSection id="application" index={1} title="When this Addendum applies">
        <p>
          This Addendum applies whenever you use {COMPANY.product} for your own business or for a client and we
          process personal data whose purposes and means you decide.
        </p>
        <p>
          It does not cover everything. We are the controller, not your processor, for our own account, billing and
          security records about you and your users. That is covered by the{" "}
          <Link href="/legal/privacy">Privacy Policy</Link>, which this Addendum does not change.
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
          Protection Act 2023 of India, and any other privacy law applying to this processing. Standard Contractual
          Clauses means the clauses in European Commission Decision 2021/914. UK Addendum means the International Data
          Transfer Addendum issued under section 119A of the Data Protection Act 2018. Customer Personal Data means
          personal data we process on your behalf, and Sub-processor a processor we engage to process it.
        </p>
      </LegalSection>

      <LegalSection id="roles" index={3} title="Roles of the parties">
        <p>
          You are the controller. You decide which site to connect, which competitors to snapshot, which leads to
          keep, what outreach to draft and who to send it to. We are your processor and act on your instructions.
          Where you are yourself a processor for someone else, for example an agency acting for a client, you warrant
          that you have that controller&apos;s authority to appoint us as a sub-processor on these terms.
        </p>
      </LegalSection>

      <LegalSection id="annex" index={4} title="Details of the processing">
        <p>The annex required by Article 28(3) and Annex I of the Standard Contractual Clauses.</p>
        <DefTable head={["Item", "Detail"]} rows={ANNEX_ROWS} />
        <Callout>
          <p style={{ margin: 0 }}>
            {COMPANY.product} never sends outreach. It drafts messages and you send them from your own mail client.
            What you send is your processing as controller, outside this Addendum.
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
          Your instructions are the Terms, this Addendum, the settings you choose, and any further written instruction
          we accept. Configuring the service, approving a post, keeping a lead or deleting one are all instructions.
          If we consider an instruction to infringe Data Protection Law we will say so promptly, and may pause the
          affected processing.
        </p>
      </LegalSection>

      <LegalSection id="confidentiality" index={6} title="Confidentiality">
        <p>
          Anyone authorised to process Customer Personal Data is bound by a duty of confidentiality, by contract or
          statute. Access is limited to those who need it to run the service or support you, and ends with their role.
        </p>
      </LegalSection>

      <LegalSection id="security" index={7} title="Security of processing">
        <p>
          We implement appropriate technical and organisational measures under Article 32, taking into account the
          state of the art, the cost, the nature and purposes of the processing, and the risk to people.
        </p>
        <p>
          Those measures are described on the <Link href="/legal/security">Security page</Link>, which also states
          plainly what is not in place yet, and that page is incorporated here by reference. In summary: encryption in
          transit and at rest, per-account access control with a deny-by-default rule, server-side authorisation on
          every paid or publishing action, server-write-only handling of billing, usage and credentials, secrets held
          outside the codebase, authenticated jobs, signed webhooks, and automated deletion of expired lead data.
        </p>
        <p>
          We may update these measures, but not in a way that materially reduces the overall level of protection.
        </p>
        <p>
          We notify you of a personal data breach without undue delay after becoming aware of it, and give you what
          you need for your own notifications. The deadlines, including 72 hours to a supervisory authority and six
          hours to CERT-In, are on that page.
        </p>
      </LegalSection>

      <LegalSection id="subprocessors" index={8} title="Sub-processors">
        <p>
          You give general written authorisation for us to engage sub-processors. The current list, with what each one
          does and where, is published on the <Link href="/legal/subprocessors">Sub-processors page</Link>.
        </p>
        <p>
          Each is engaged under a written contract imposing data protection obligations substantially the same as
          those here, in particular sufficient guarantees of appropriate technical and organisational measures. We
          remain fully liable to you for a sub-processor&apos;s performance.
        </p>
        <p>
          We give at least 30 days&apos; notice before a new sub-processor begins processing, and you may object on
          reasonable data protection grounds within that period. The consequences, including termination of the
          affected part of the subscription without penalty, are on that page.
        </p>
      </LegalSection>

      <LegalSection id="rights" index={9} title="Data subject requests">
        <p>
          Taking into account the nature of the processing, we assist you by appropriate technical and organisational
          measures, so far as possible, in responding to requests under Chapter III of the GDPR. Much of this you can
          do yourself: the dashboard lets you find, correct, export and delete lead and site data, and every lead
          carries a provenance record giving where it came from, the lawful basis relied on and when it will be
          deleted.
        </p>
        <p>
          If a data subject contacts us directly about data we process for you, we will not respond substantively. We
          will point them to you and pass the request on promptly. Where you need help the product does not provide,
          write to <Email purpose="privacy" />. We do not charge for reasonable assistance.
        </p>
      </LegalSection>

      <LegalSection id="assistance" index={10} title="Assistance with Articles 32 to 36">
        <p>
          Taking into account the nature of the processing and the information available to us, we assist you with
          Articles 32 to 36: security of processing, breach notification to the supervisory authority and to data
          subjects, impact assessments, and prior consultation. In practice that means giving you what we know about
          how the service processes data, our security measures, our sub-processors and our retention behaviour, in a
          form you can use in your own assessment.
        </p>
      </LegalSection>

      <LegalSection id="deletion" index={11} title="Deletion and return">
        <p>
          At your choice, we delete or return all Customer Personal Data at the end of the provision of services and
          delete existing copies, unless law requires us to keep it. You can export from the dashboard at any time.
          After termination we keep the account for 30 days so it can be reactivated or exported, then delete it, or
          sooner if you ask. Backups age out on their own cycle and are not restored to bring back deleted data.
        </p>
        <p>
          Two things survive. Records we must keep by law, such as invoices, are retained for the statutory period.
          Suppression records are kept indefinitely, because deleting the record that somebody objected would let them
          be contacted again.
        </p>
      </LegalSection>

      <LegalSection id="information" index={12} title="Demonstrating compliance">
        <p>
          We make available the information necessary to demonstrate compliance with Article 28: this Addendum, the
          Security page, the Sub-processors page, the published data policy the product enforces, and written answers
          to reasonable questions. We hold no security certification and no audit report, and we say so on the{" "}
          <Link href="/legal/security">Security page</Link>. Nothing here promises a report that does not exist.
        </p>
      </LegalSection>

      <LegalSection id="audit" index={13} title="Audit rights">
        <p>
          We allow for and contribute to audits, including inspections, by you or an auditor you mandate. In the first
          instance that obligation is satisfied by written answers: send your questionnaire to{" "}
          <Email purpose="legal" /> and we will answer within 30 days. Most requests are fully met this way.
        </p>
        <p>
          If written answers are genuinely not enough, you may audit us on at least 30 days&apos; written notice, once
          in any 12 months unless a supervisory authority requires otherwise or there has been a breach affecting your
          data. An audit must be during business hours, must not unreasonably disrupt the service, and must not extend
          to another customer&apos;s data. Your auditor must not be a competitor and must sign a confidentiality
          undertaking. You bear the cost.
        </p>
      </LegalSection>

      <LegalSection id="controller" index={14} title="Your obligations as controller">
        <p>
          This is the part we cannot perform for you, and the part carrying the most risk to real people. Whether
          contacting any particular person is lawful is your decision, made with facts we do not have. You are
          responsible for:
        </p>
        <ul>
          <li>
            <b>A lawful basis.</b> Having, and being able to demonstrate, a lawful basis for the leads you ask us to
            find and the outreach you send. For business-to-business contact this is usually legitimate interests,
            which requires a balancing exercise rather than an assertion. The product records the basis and the
            balancing considerations against every lead.
          </li>
          <li>
            <b>Transparency.</b> Giving privacy information to the people you contact. Because you did not collect
            their details from them, Article 14 applies: they must be told who you are, what you do with their data,
            where you got it and what rights they have, at the latest in your first message.
          </li>
          <li>
            <b>Objections.</b> Honouring an objection immediately, permanently and everywhere. The right to object to
            direct marketing is absolute. Record it so the suppression list keeps that contact out of the service, and
            stop contacting them on your other channels too.
          </li>
          <li>
            <b>Accuracy.</b> Reviewing what the service finds before acting on it. Generated and inferred content can
            be wrong, and publishing or sending it makes it yours.
          </li>
          <li>
            <b>Local rules.</b> Complying with anything stricter than general data protection law, such as consent
            requirements for electronic marketing in particular jurisdictions.
          </li>
          <li>
            <b>Not introducing prohibited data.</b> Not entering special-category data, data about children, or
            personal data unrelated to a business context.
          </li>
        </ul>
        <p>
          The <Link href="/legal/acceptable-use">Acceptable Use Policy</Link> states these as usage rules. Here they
          are an allocation of responsibility. They are the same rules.
        </p>
      </LegalSection>

      <LegalSection id="transfers" index={15} title="International transfers">
        <p>
          {COMPANY.legalName} is established in {COMPANY.incorporatedIn}, and several sub-processors process in the
          United States, so Customer Personal Data is transferred outside the European Economic Area and the United
          Kingdom.
        </p>
        <p>
          Where a transfer is subject to Chapter V of the GDPR, it is made under the Standard Contractual Clauses
          incorporated into the relevant sub-processor&apos;s terms, and under Clauses between you and us where those
          are required. Module Two applies where you are a controller and we are a processor, Module Three where you
          act as a processor for another controller. The annex information the Clauses require is the details of the
          processing above, the sub-processor list, and the security measures on the Security page.
        </p>
        <p>
          For transfers subject to the UK GDPR, the UK Addendum applies to those Clauses with the same annex
          information. For Swiss transfers, references to the GDPR and to supervisory authorities are read as
          references to the Swiss Federal Act and its Commissioner. Where a new mechanism replaces one relied on here,
          or an adequacy decision covers the transfer, we may rely on that instead.
        </p>
      </LegalSection>

      <LegalSection id="india" index={16} title="India: the DPDP Act 2023">
        <p>
          Indian law uses different words for the same two roles. Under the Digital Personal Data Protection Act 2023
          the party determining the purpose and means of processing is the Data Fiduciary, and a party processing on
          its behalf is a Data Processor. There is no exact equivalent of controller and processor, but the allocation
          is the one this Addendum makes.
        </p>
        <p>
          So where the DPDP Act applies, you are the Data Fiduciary and {COMPANY.legalName} is your Data Processor.
          The duties the Act places on a Data Fiduciary are yours: notice to the Data Principal, a valid ground for
          processing, answering requests for information, correction and erasure, a published grievance mechanism, and
          notifying the Data Protection Board and affected Data Principals of a breach.
        </p>
        <p>
          As your Data Processor we process only on your instructions, apply the safeguards on the Security page,
          assist with Data Principal requests and breach notification, and delete data when the purpose is served.
          Where the DPDP Act and the GDPR both apply, we follow whichever is stricter.
        </p>
      </LegalSection>

      <LegalSection id="liability" index={17} title="Liability">
        <p>
          Liability under this Addendum is subject to the exclusions and limits in the{" "}
          <Link href="/legal/terms">Terms of Service</Link>, and any claim here counts towards the same aggregate cap.
          Nothing limits liability that cannot lawfully be limited, including a data subject&apos;s rights under
          Article 82 of the GDPR.
        </p>
      </LegalSection>

      <LegalSection id="execution" index={18} title="How this is executed">
        <p>
          No signature is needed. This Addendum takes effect when you accept the Terms of Service and stays in force
          for as long as we process Customer Personal Data for you.
        </p>
        <p>
          If you need a countersigned copy, write to <Email purpose="legal" /> with the legal name and registered
          address of the contracting entity and who should sign for it. We do not usually accept a different template,
          because the document has to match what the product actually does.
        </p>
        <p>
          This Addendum is governed by the law and jurisdiction stated in the Terms, except where Data Protection Law
          requires otherwise and except that the Standard Contractual Clauses are governed as those Clauses provide.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
