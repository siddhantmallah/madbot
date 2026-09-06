import Link from "next/link";
import LegalPage, { LegalSection, Callout, DefTable } from "../components/LegalPage";
import { COMPANY, registeredAddressLine, emailFor } from "../../lib/company";
import { CONTACT_EMAIL } from "../../lib/contact";

export const metadata = {
  title: "About MADBOT",
  description:
    "MADBOT is autonomous website marketing, built by a private limited company in India. What it does, who makes it, and what is still missing.",
};

const TOC = [
  { id: "what", title: "What MADBOT is" },
  { id: "who", title: "Who makes it" },
  { id: "how", title: "How we build it" },
  { id: "where", title: "Where we are" },
  { id: "reach", title: "How to get in touch" },
];

/**
 * About is not a policy, but it wants the same shell.
 *
 * The document layout keeps the page honest: numbered sections, a plain
 * reading measure, and the same missing-details notice every legal page
 * carries. An About page dressed as a pitch invites invention. This one has
 * nowhere to put a founder story, so there isn't one.
 */
export default function AboutPage() {
  const address = registeredAddressLine();
  const support = emailFor("support", CONTACT_EMAIL);

  // Every company detail below is rendered, never typed. Where the value is
  // still null the page says so rather than showing a blank cell.
  const NOT_YET = <span style={{ color: "var(--fg-45)" }}>Not published yet.</span>;

  const details = [
    ["Legal name", COMPANY.legalName],
    ["Entity type", `${COMPANY.entityType}, incorporated in ${COMPANY.incorporatedIn}`],
    ["Product", `${COMPANY.product}, at ${COMPANY.productDomain}`],
    ["CIN", COMPANY.cin || NOT_YET],
    ["Registered office", address || NOT_YET],
    [
      "Contact",
      support ? (
        <a href={`mailto:${support}`}>{support}</a>
      ) : (
        <span style={{ color: "var(--fg-45)" }}>
          No public address is published yet. See <Link href="/contact">Contact</Link>.
        </span>
      ),
    ],
  ];

  return (
    <LegalPage
      kicker="Company"
      title="About MADBOT"
      updated="6 September 2026"
      intro={
        <>
          MADBOT is autonomous website marketing. You connect a website once, and it gets on with the work: finding
          what needs doing, doing it, and showing you exactly what it did. This page says who builds it, how it is
          built, and what is not true yet.
        </>
      }
      toc={TOC}
    >
      <LegalSection id="what" index={1} title="What MADBOT is">
        <p>
          One connected website is the whole setup. From there MADBOT audits the site and crawls it, and then keeps
          working on a schedule you set.
        </p>
        <ul style={{ margin: "14px 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8, lineHeight: 1.6 }}>
          <li>Audits and crawls the site, and re-checks it as it changes.</li>
          <li>Watches the competitors you name and reports what they move on.</li>
          <li>Writes articles that arrive as GitHub pull requests. You merge them, or you don&apos;t.</li>
          <li>Drafts social posts that publish only after you approve them on screen.</li>
          <li>Prepares directory listing copy for you to submit.</li>
          <li>Finds prospective business customers from public company information.</li>
          <li>Drafts outreach that you send yourself, from your own mail client.</li>
          <li>Checks whether AI assistants mention your site when someone asks about your market.</li>
          <li>Emails you a weekly digest of what happened.</li>
        </ul>
        <p>
          Everything in that list runs against your own site and your own market. There is no shared pool of results
          and no template pack.
        </p>
      </LegalSection>

      <LegalSection id="who" index={2} title="Who makes it">
        <p>
          MADBOT is a product of {COMPANY.legalName}, a {COMPANY.entityType.toLowerCase()} incorporated in{" "}
          {COMPANY.incorporatedIn}. That company is the seller, the contracting party and the data controller for
          your account.
        </p>
        <DefTable rows={details} head={["Detail", "Value"]} />
        <p>
          Where a row above says the detail is not published yet, it genuinely is not. Company registration details
          appear here the moment they exist, and the notice at the top of every policy page lists what is still
          outstanding.
        </p>
      </LegalSection>

      <LegalSection id="how" index={3} title="How we build it">
        <p>
          Two principles decide most of the arguments, so they are worth stating plainly.
        </p>

        <h3 style={{ margin: "20px 0 8px", fontSize: 18 }}>Nothing on your screen is invented</h3>
        <p>
          Every number MADBOT shows you is measured. When it does not know something, it says it does not know,
          rather than estimating and letting the estimate look like a fact. That rule costs us the nicer-looking
          dashboard and we keep it anyway, because a made-up figure you act on is worse than a gap you can see.
        </p>

        <h3 style={{ margin: "20px 0 8px", fontSize: 18 }}>An autonomy dial, with things it cannot override</h3>
        <p>
          A single dial from 0 to 100 sets how much of the work runs on a schedule without being asked. Turn it down
          and MADBOT proposes; turn it up and it proceeds. Some things always ask, wherever the dial sits.
        </p>
        <Callout>
          <b>Three limits the dial cannot move.</b> Articles only go live through a pull request a person merges.
          Social posts always wait for on-screen approval. Outreach is never sent by MADBOT, only drafted for you to
          send.
        </Callout>

        <h3 style={{ margin: "20px 0 8px", fontSize: 18 }}>Data governance is part of the build</h3>
        <p>
          Company information and personal data are treated as different things, because they are. Facts about an
          organisation are commercial facts. A named individual is personal data, and anything touching one goes to a
          human for review before it is used. Special-category data is never collected at all. Lead data carries a
          retention limit, and a daily job enforces it rather than leaving it to good intentions.
        </p>
      </LegalSection>

      <LegalSection id="where" index={4} title="Where we are">
        <p>
          MADBOT is new. There are no customer results to show you yet, so the site does not show any. Plenty of
          products would put a stranger&apos;s traffic chart here. We would rather you pointed MADBOT at your own site
          and watched what it actually finds.
        </p>
        <p>
          Card checkout is not live yet either. Starting a plan gets you a trial, and we contact you about payment
          separately. Pricing is published in full on the <Link href="/pricing">pricing page</Link> so there is
          nothing to discover later.
        </p>
        <p>
          When there are results worth showing, they will be measured ones from customers who agreed to be named.
          Until then this section stays as it is.
        </p>
      </LegalSection>

      <LegalSection id="reach" index={5} title="How to get in touch">
        <p>
          The <Link href="/contact">contact page</Link> lists every route we have: support and sales, privacy and
          data requests, security reports, legal, and the grievance route required in India. It also says plainly
          which of those addresses are not published yet.
        </p>
        <p>
          Our policies live at <Link href="/legal">/legal</Link>. If you are a customer, you can export or delete
          your data yourself from the dashboard at any time, without asking us first.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
