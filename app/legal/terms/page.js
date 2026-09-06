"use client";

import Link from "next/link";
import LegalPage, { LegalSection, Callout, DefTable } from "../../components/LegalPage";
import { COMPANY, emailFor, registeredAddressLine } from "../../../lib/company";
import { CONTACT_EMAIL } from "../../../lib/contact";

const TOC = [
  { id: "who-we-are", title: "Who you are contracting with" },
  { id: "who-may-use", title: "Who may use MADBOT" },
  { id: "account", title: "Your account" },
  { id: "your-websites", title: "The websites you connect" },
  { id: "acceptable-use", title: "Acceptable use" },
  { id: "what-it-does", title: "What MADBOT does, and where it stops" },
  { id: "ai", title: "Working with AI output" },
  { id: "ownership", title: "Who owns what" },
  { id: "licence", title: "The permission you give us" },
  { id: "third-parties", title: "Accounts and services you connect" },
  { id: "outreach", title: "Leads, outreach and anti-spam" },
  { id: "fees", title: "Plans, fees and tax" },
  { id: "trial", title: "The free trial" },
  { id: "suspension", title: "Suspension, termination and your data" },
  { id: "warranties", title: "What we do not promise" },
  { id: "liability", title: "Limits on our liability" },
  { id: "indemnity", title: "Your indemnity to us" },
  { id: "changes", title: "Changes to the service and these terms" },
  { id: "law", title: "Governing law and your local rights" },
  { id: "contact", title: "Contact and grievances" },
];

export default function TermsPage() {
  const legalEmail = emailFor("legal", CONTACT_EMAIL);
  const supportEmail = emailFor("support", CONTACT_EMAIL);
  const grievanceEmail = emailFor("grievance", CONTACT_EMAIL);
  const address = registeredAddressLine();
  const seat = COMPANY.registeredOffice.city;

  return (
    <LegalPage
      title="Terms of Service"
      kicker="Legal"
      updated="6 September 2026"
      effective="6 September 2026"
      intro={
        <>
          MADBOT is a subscription service that audits a website you own, watches the competitors you name, and drafts
          marketing work for you to approve. These terms are the contract between you and the company that runs it. We
          have tried to write them so that you can actually read them, and we have said plainly where a clause is
          unusual or where the decision is left with you.
        </>
      }
      toc={TOC}
    >
      <LegalSection id="who-we-are" index={1} title="Who you are contracting with">
        <p>
          MADBOT, at {COMPANY.productDomain}, is operated by {COMPANY.legalName}, a {COMPANY.entityType} incorporated in{" "}
          {COMPANY.incorporatedIn}. In these terms, &quot;we&quot;, &quot;us&quot; and &quot;our&quot; mean that
          company. &quot;You&quot; means the person or organisation that holds the account.
        </p>
        {COMPANY.cin ? <p>Corporate Identity Number: {COMPANY.cin}.</p> : null}
        {address ? <p>Registered office: {address}.</p> : null}
        <p>
          These terms apply the moment you create an account or use the service, whether you pay for it or not. If you
          are agreeing on behalf of a company, you also agree to the terms on that company&apos;s behalf, and
          &quot;you&quot; means the company.
        </p>
      </LegalSection>

      <LegalSection id="who-may-use" index={2} title="Who may use MADBOT">
        <p>
          You must be at least 18. MADBOT is built for business use: marketing a website that belongs to a business,
          a practice, a charity or a sole trader. It is not a consumer product and it is not for children.
        </p>
        <p>
          If you sign up for an organisation, you confirm you have authority to enter into this contract for it. If you
          do not, do not create the account. You must not use MADBOT if the law where you live or trade forbids it, or
          if we have previously closed your account for breaking these terms.
        </p>
        <p>
          Some buyers will still count as consumers under the law of their own country. Nothing here takes away rights
          you have in that capacity: see <a href="#law">Governing law and your local rights</a>.
        </p>
      </LegalSection>

      <LegalSection id="account" index={3} title="Your account">
        <p>
          Give us accurate details and keep them current. Billing and legal notices go to the address on the account,
          so a stale one is your risk, not ours.
        </p>
        <p>
          Keep your sign-in credentials to yourself. Anything done through your account is treated as done by you. If
          you think someone else has got in, tell us at once at{" "}
          {supportEmail ? <a href={`mailto:${supportEmail}`}>{supportEmail}</a> : "our published contact address"} and
          change your credentials.
        </p>
        <p>
          One account is for one customer. Invite the colleagues you need, but do not resell access, share a login
          across unrelated businesses, or open extra accounts to get round a plan limit.
        </p>
      </LegalSection>

      <LegalSection id="your-websites" index={4} title="The websites you connect">
        <Callout tone="warn">
          <p style={{ margin: 0 }}>
            <b>This is the clause that matters most.</b> You must own every website you connect to MADBOT, or be
            authorised in writing by its owner to manage it. You must also have the right to publish content to that
            site. If you cannot say yes to both, do not connect it.
          </p>
        </Callout>
        <p>
          Connecting a site instructs us to fetch its pages over ordinary HTTP so we can read them, audit them and
          re-check them on a schedule. Our crawler reads your robots.txt and honours the paths it disallows. It does
          not log in, submit forms, or try to reach anything that is not publicly served.
        </p>
        <p>
          You may also name competitors, so MADBOT can snapshot their public pages and report what changed. That is
          reading a public web page, which is what a browser does, but you are responsible for it being lawful where
          you are, and you must not use it to copy protected material or reach anything behind a login or a paywall.
        </p>
        <p>If you lose the right to manage a site, disconnect it from MADBOT straight away.</p>
      </LegalSection>

      <LegalSection id="acceptable-use" index={5} title="Acceptable use">
        <p>
          Our <Link href="/legal/acceptable-use">Acceptable Use Policy</Link> forms part of these terms. In short: do
          not use MADBOT to break the law, to attack or overload anyone&apos;s systems, to produce content that is
          defamatory, deceptive, hateful or infringing, to impersonate a person or a business, or to work around a
          limit we have set. Do not try to extract our prompts, models or source code, and do not use MADBOT to build a
          competing product.
        </p>
      </LegalSection>

      <LegalSection id="what-it-does" index={6} title="What MADBOT does, and where it stops">
        <p>
          MADBOT does a lot on a schedule. It publishes nothing on your behalf. Every step that puts something into the
          world in your name ends with you, deliberately.
        </p>
        <DefTable
          head={["What it does", "Who presses the button"]}
          rows={[
            ["Technical audit", "Runs automatically. Fetches your pages and checks titles, meta, schema, robots, sitemap, links and speed. Changes nothing on your site."],
            ["Site crawl", "Runs automatically and repeats on a schedule, to build an internal picture of the site."],
            ["Competitor snapshots", "Runs automatically against the sites you name, and reports what changed. Reporting only."],
            ["Articles", "Written by an AI model. Publishing happens only as a GitHub pull request that you merge yourself, and only if you chose to supply a GitHub token. If you did not, nothing can reach your site at all."],
            ["Social posts", "Drafted for LinkedIn, X, Instagram and Facebook. Nothing is posted until you approve it on screen, and only to accounts you connected yourself."],
            ["Directory and listing copy", "Prepared for you to use. MADBOT never submits a listing. You paste it in."],
            ["Leads and outreach", "Prospects are found from public company information and scored, and an email is drafted. The draft opens in your own email client and you press send. MADBOT never sends outreach."],
            ["AI visibility checks", "A Claude model with web search looks for whether AI assistants mention your site. Reporting only."],
            ["Weekly digest", "Emailed to you."],
          ]}
        />
        <p>
          The autonomy dial, from 0 to 100, sets how much of this starts without asking you first. It removes none of
          the approval steps in the table above: a pull request still has to be merged by you, a social post still has
          to be approved on screen, and an outreach email is still sent by you.
        </p>
        <p>
          Because you decide what goes live, you are the publisher of everything that does. Review it before you merge
          or approve it.
        </p>
      </LegalSection>

      <LegalSection id="ai" index={7} title="Working with AI output">
        <p>
          MADBOT uses Anthropic Claude models to write and analyse. Language models are useful, and they are also
          sometimes wrong, confidently. You need to know what that means for you.
        </p>
        <ul>
          <li>
            <b>We do not warrant that AI output is accurate.</b> Facts, figures, dates, names, quotations, statistics
            and claims about your own product may be invented or out of date. Check them.
          </li>
          <li>
            <b>Output is not unique.</b> Given similar inputs, a model may produce output that resembles what it
            produced for someone else. We cannot promise originality and we do not.
          </li>
          <li>
            <b>Output is not advice.</b> Nothing MADBOT writes is legal, tax, medical, financial or regulatory advice.
            If your sector regulates what you may claim in marketing, that is on you to check before you publish.
          </li>
          <li>
            <b>You are responsible for what you publish.</b> Once you merge a pull request, approve a post or send an
            outreach email, the words are yours. Every claim in them is yours to stand behind.
          </li>
        </ul>
        <p>
          Audit findings, competitor analysis and lead scores are our reading of public information at a moment in
          time. They are opinions produced by software, not a guarantee of ranking, traffic, revenue, or the quality of
          any company we surface as a lead.
        </p>
      </LegalSection>

      <LegalSection id="ownership" index={8} title="Who owns what">
        <p>
          <b>Yours.</b> Your website, your content, the data we gather about your site, and the output MADBOT produces
          for you: articles, social drafts, listing copy, outreach drafts and reports. As between you and us, all of
          that is yours. We claim no ownership in it and we will not sell it.
        </p>
        <p>
          <b>Ours.</b> MADBOT itself: the software, the interface, the prompts, the scoring logic, the credit model,
          the brand and the documentation. Nothing here transfers any of it to you. You get a non-exclusive,
          non-transferable right to use the service while your account is in good standing, and nothing more.
        </p>
        <p>
          We may look at aggregated, de-identified usage statistics to improve the product. That never includes your
          site content, your leads, or anything identifying you or your customers.
        </p>
      </LegalSection>

      <LegalSection id="licence" index={9} title="The permission you give us">
        <p>
          To do the job we need permission to handle your material. You grant us a worldwide, non-exclusive,
          royalty-free licence to fetch, store, copy, parse, analyse and process your website content, the competitor
          pages you name, and anything you upload or type into MADBOT, for one purpose only: providing and supporting
          the service for you.
        </p>
        <p>
          That licence lasts as long as your account does, plus the retention periods described in our{" "}
          <Link href="/legal/privacy">Privacy Policy</Link>. It does not let us use your content to advertise, to
          train models of our own, or to build a data product. Where personal data is involved, our{" "}
          <Link href="/legal/dpa">Data Processing Addendum</Link> applies and we act as your processor.
        </p>
      </LegalSection>

      <LegalSection id="third-parties" index={10} title="Accounts and services you connect">
        <p>
          Several features only work if you connect an account you control elsewhere: GitHub for publishing articles,
          Google Search Console for search data, and LinkedIn, X, Instagram or Facebook for social posts. Each is
          optional.
        </p>
        <p>
          Those services have their own terms, and those terms apply to you as well as to us. If a platform changes its
          API, suspends your account or withdraws a permission, the connected feature may stop working. We will tell
          you when we can, but we do not control them and we are not responsible for what they do.
        </p>
        <p>
          You are responsible for the credentials and tokens you give us, and for revoking them when you no longer want
          the connection. Our own infrastructure providers, currently Anthropic for models, Google Firebase for
          authentication and data storage, Vercel for hosting and Resend for email, are listed with their roles in our{" "}
          <Link href="/legal/subprocessors">subprocessor list</Link>.
        </p>
      </LegalSection>

      <LegalSection id="outreach" index={11} title="Leads, outreach and anti-spam">
        <p>
          MADBOT finds prospective business customers from public company information, scores them, and drafts an
          email. It never sends one. The draft opens in your own email client, from your own address, and you press
          send.
        </p>
        <Callout>
          <p style={{ margin: 0 }}>
            That means you are the sender in law, every time. Marketing email is heavily regulated and the obligations
            fall on the sender, not on the tool that drafted the text.
          </p>
        </Callout>
        <p>Before you send anything, make sure it is lawful where you are and where the recipient is. That can include:</p>
        <ul>
          <li>the GDPR and UK GDPR, and the ePrivacy rules on unsolicited marketing;</li>
          <li>CAN-SPAM in the United States, including a working unsubscribe route and a real postal address;</li>
          <li>Canada&apos;s Anti-Spam Legislation, which needs consent before you send at all;</li>
          <li>India&apos;s Digital Personal Data Protection Act 2023 and the rules on commercial communication.</li>
        </ul>
        <p>
          Do not use MADBOT to send bulk unsolicited mail, to contact people who have opted out, to hide who you are,
          or to work with contact data you have no right to hold. If someone asks you to stop, honour it and mark them
          suppressed so we do not surface them again. We may cap outreach volume, refuse to draft something, or suspend
          the feature if we think it is being used to spam people.
        </p>
      </LegalSection>

      <LegalSection id="fees" index={12} title="Plans, fees and tax">
        <p>
          MADBOT has five plans: Free, Starter, Growth, Pro and Agency. Paid plans are billed monthly or annually, and
          the annual price is ten months&apos; worth of the monthly price, so paying for a year saves you two months.
        </p>
        <Callout tone="warn">
          <p style={{ margin: 0 }}>
            <b>There is no card checkout yet.</b> Today, a paid plan is arranged by contacting us. You pay by bank
            transfer and we apply the licence to your account by hand. There is no stored card, no automatic renewal
            and no silent charge. When card payments do go live we will tell you before anything changes.
          </p>
        </Callout>
        <p>
          Prices are published in local currency for each region we sell in, on the{" "}
          <Link href="/pricing">pricing page</Link>. Which list applies to you follows where your business is
          established, not where you happen to be browsing from. If you claim a region you are not established in, we
          may correct the price. Prices exclude taxes unless we say otherwise, so any GST, VAT, sales tax or
          withholding is yours to pay on top.
        </p>
        <p>
          Usage is metered. Plans include a monthly allowance of autonomous actions, lead credits, content pieces,
          social posts and outreach emails. Allowances run per calendar month and reset at the start of each month.{" "}
          <b>Unused allowance does not roll over.</b> If you need more before the reset, you can buy a top-up.
        </p>
        <p>
          Refunds, cancellation and failed payments are all in our{" "}
          <Link href="/legal/refunds">Refund, Cancellation and Payment Terms</Link>, which form part of this contract.
        </p>
      </LegalSection>

      <LegalSection id="trial" index={13} title="The free trial">
        <p>
          New customers get a 14-day free trial. It needs no card, and because there is no card, it cannot roll into a
          paid plan by itself. At the end of the trial the account simply drops to the Free plan unless you have
          arranged a paid one.
        </p>
        <p>
          A trial is granted once per person. Signing up again with a different email address, a different company name
          or a different card to get a second trial is a breach of these terms, and we may close every account
          involved.
        </p>
      </LegalSection>

      <LegalSection id="suspension" index={14} title="Suspension, termination and your data">
        <p>
          You can stop using MADBOT whenever you like. Cancelling is covered in the{" "}
          <Link href="/legal/refunds">refunds and cancellation terms</Link>, and it is never hidden behind a phone
          call.
        </p>
        <p>
          We may suspend or close an account if you break these terms or the acceptable use policy, if you do not pay,
          if your use is putting the service or other customers at risk, or if the law requires it. Where the situation
          allows it we will warn you first and give you a chance to put it right. Where it does not, for example an
          active security problem, we may act immediately and explain afterwards.
        </p>
        <p>
          After an account closes you can export your data during a grace period, after which we delete or anonymise it
          on the schedule in the <Link href="/legal/privacy">Privacy Policy</Link>, keeping only what the law makes us
          keep. Deletion is permanent, so export first. Clauses meant to outlive the contract do: ownership, the
          liability cap, your indemnity and governing law.
        </p>
      </LegalSection>

      <LegalSection id="warranties" index={15} title="What we do not promise">
        <p>
          We provide MADBOT with reasonable skill and care, and we genuinely try to keep it up. Beyond that, and so far
          as the law allows, the service is provided as it is, without warranties of any kind, express or implied,
          including any implied warranty of merchantability, fitness for a particular purpose or non-infringement.
        </p>
        <p>In particular, we do not promise that:</p>
        <ul>
          <li>the service will be uninterrupted or free of errors;</li>
          <li>AI output will be accurate, original or fit to publish without review;</li>
          <li>an audit, crawl or visibility check will find every issue on your site;</li>
          <li>MADBOT will improve your rankings, traffic, leads or revenue;</li>
          <li>a lead we surface is a real prospect, is solvent, or wants to hear from you;</li>
          <li>third-party services you connect will keep working.</li>
        </ul>
        <p>
          Nothing here excludes a warranty that cannot lawfully be excluded, and consumers keep their statutory
          guarantees in full.
        </p>
      </LegalSection>

      <LegalSection id="liability" index={16} title="Limits on our liability">
        <p>
          Neither of us is liable to the other for indirect or consequential loss, or for loss of profit, revenue,
          business, goodwill, anticipated savings or data, however it arises.
        </p>
        <p>
          Our total liability to you, for everything connected with this contract taken together, is capped at the
          fees you actually paid us in the 12 months before the event that gave rise to the claim. If you have paid us
          nothing, for example on the Free plan or during a trial, the cap is a nominal amount.
        </p>
        <Callout>
          <p style={{ margin: 0 }}>
            These caps do not apply to fraud or fraudulent misrepresentation, to death or personal injury caused by
            negligence, or to any other liability that the law does not allow to be limited or excluded. If you are a
            consumer, the cap never reduces a remedy your own consumer law gives you.
          </p>
        </Callout>
        <p>
          We are not liable for what you choose to publish or send. The approval steps in section 6 exist precisely so
          that decision is yours.
        </p>
      </LegalSection>

      <LegalSection id="indemnity" index={17} title="Your indemnity to us">
        <p>
          If you are using MADBOT for a business, you agree to cover us against claims, damages, fines and reasonable
          legal costs that arise from:
        </p>
        <ul>
          <li>content you published, merged or approved, including any claim that it is inaccurate, misleading, defamatory or infringes someone&apos;s rights;</li>
          <li>outreach you sent, including any data protection or anti-spam complaint or penalty;</li>
          <li>connecting a website you did not own or were not authorised to manage;</li>
          <li>your breach of these terms or the acceptable use policy.</li>
        </ul>
        <p>
          We will tell you promptly about any such claim, let you take conduct of the defence where the law allows it,
          and not settle without your agreement. This indemnity does not apply to a consumer, and it does not cover
          anything caused by our own breach.
        </p>
      </LegalSection>

      <LegalSection id="changes" index={18} title="Changes to the service and these terms">
        <p>
          MADBOT is actively developed. We add features and occasionally retire one that is not working. If we remove
          or materially reduce a feature you are paying for, we will give you at least 30 days&apos; notice by email,
          and you can cancel and get back the unused part of a period you paid in advance.
        </p>
        <p>
          We may change these terms. For a minor change, such as a clarification or a corrected address, we update the
          page and the date at the top. For a change that materially affects your rights, we will email you at least 30
          days before it takes effect. Cancel before then if you do not accept it, and the old terms apply until that
          date. Carrying on afterwards means you accept the new ones. Price changes are covered in the{" "}
          <Link href="/legal/refunds">refunds and payment terms</Link>.
        </p>
      </LegalSection>

      <LegalSection id="law" index={19} title="Governing law and your local rights">
        <p>
          This contract is governed by the laws of India. The courts at{" "}
          {seat ? `${seat}, India` : "the place of our registered office in India"} have exclusive jurisdiction over any
          dispute arising out of it.
        </p>
        <Callout>
          <p style={{ margin: 0 }}>
            <b>That clause does not take away rights you have at home.</b> If you deal with us as a consumer, you keep
            every protection the mandatory law of your own country gives you, and you may bring proceedings in your
            local courts if that law says you can. Consumers in the European Union and the United Kingdom specifically
            keep the protections of their local consumer law, including the statutory right to withdraw from a
            distance contract set out in our <Link href="/legal/refunds">refund and cancellation terms</Link>.
          </p>
        </Callout>
        <p>
          Before starting proceedings, please write to us. Most disagreements are a misunderstanding about what a
          feature does, and those are quicker to fix in an email than in a courtroom.
        </p>
      </LegalSection>

      <LegalSection id="contact" index={20} title="Contact and grievances">
        <p>
          For these terms, write to{" "}
          {legalEmail ? <a href={`mailto:${legalEmail}`}>{legalEmail}</a> : "our published contact address"}. For help
          with the product, write to{" "}
          {supportEmail ? <a href={`mailto:${supportEmail}`}>{supportEmail}</a> : "our published contact address"}. For
          privacy requests, see the <Link href="/legal/privacy">Privacy Policy</Link>. For anything you think is a
          security problem, see our <Link href="/legal/security">security page</Link>.
        </p>
        <p>
          <b>India: grievance route.</b> Indian law requires us to name a grievance officer for complaints about the
          service or about your data.
        </p>
        <ul>
          <li>Name: {COMPANY.grievanceOfficer.name || "not yet appointed, and until one is named please write to the contact address above"}</li>
          <li>Designation: {COMPANY.grievanceOfficer.designation}</li>
          <li>
            Email:{" "}
            {grievanceEmail ? (
              <a href={`mailto:${grievanceEmail}`}>{grievanceEmail}</a>
            ) : (
              "our published contact address"
            )}
          </li>
          {COMPANY.grievanceOfficer.phone ? (
            <li>
              Telephone:{" "}
              <a href={`tel:${COMPANY.grievanceOfficer.phone}`}>{COMPANY.grievanceOfficer.phoneDisplay}</a>
            </li>
          ) : null}
        </ul>
        <p>
          We acknowledge a grievance within {COMPANY.grievanceOfficer.acknowledgeHours} hours and aim to resolve it
          within {COMPANY.grievanceOfficer.resolveDays} days.
        </p>
        <p>
          Related documents: <Link href="/legal/privacy">Privacy Policy</Link>,{" "}
          <Link href="/legal/cookies">Cookie Policy</Link>,{" "}
          <Link href="/legal/acceptable-use">Acceptable Use Policy</Link>,{" "}
          <Link href="/legal/refunds">Refunds and Cancellation</Link>,{" "}
          <Link href="/legal/dpa">Data Processing Addendum</Link>,{" "}
          <Link href="/legal/subprocessors">Subprocessors</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
