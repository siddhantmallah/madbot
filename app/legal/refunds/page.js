"use client";

import Link from "next/link";
import LegalPage, { LegalSection, Callout, DefTable } from "../../components/LegalPage";
import { COMPANY, emailFor } from "../../../lib/company";
import { CONTACT_EMAIL } from "../../../lib/contact";

const TOC = [
  { id: "how-payment-works", title: "How paying for MADBOT works today" },
  { id: "trial", title: "The 14-day free trial" },
  { id: "monthly", title: "Monthly plans" },
  { id: "annual", title: "Annual plans" },
  { id: "usage", title: "Allowances and top-ups" },
  { id: "india", title: "India: the timelines we commit to" },
  { id: "eu-uk", title: "EU and UK consumers: your right to withdraw" },
  { id: "not-refundable", title: "What we cannot refund" },
  { id: "how-to-cancel", title: "How to cancel" },
  { id: "data", title: "What happens to your data" },
  { id: "chargebacks", title: "Chargebacks: please ask us first" },
  { id: "failed-payments", title: "Failed and late payments" },
  { id: "price-changes", title: "Price changes" },
  { id: "grievance", title: "If you are still unhappy" },
];

export default function RefundsPage() {
  const billingEmail = emailFor("support", CONTACT_EMAIL);
  const legalEmail = emailFor("legal", CONTACT_EMAIL);
  const grievanceEmail = emailFor("grievance", CONTACT_EMAIL);
  const contactPhrase = billingEmail ? null : "our published contact address";

  return (
    <LegalPage
      title="Refund, Cancellation and Payment Terms"
      kicker="Legal"
      updated="6 September 2026"
      effective="6 September 2026"
      intro={
        <>
          What you pay, how you stop paying, and when you get money back. This page forms part of our{" "}
          <Link href="/legal/terms">Terms of Service</Link>. We have put real timelines in it rather than vague
          promises, and we have been explicit about the one thing most policies bury: how payment actually works right
          now.
        </>
      }
      toc={TOC}
    >
      <LegalSection id="how-payment-works" index={1} title="How paying for MADBOT works today">
        <Callout tone="warn">
          <p style={{ margin: 0 }}>
            <b>There is no card checkout on this site yet.</b> You cannot type a card number into MADBOT, because there
            is nowhere to type one. No card is stored, nothing renews automatically, and no amount can be taken from
            you without you moving the money yourself.
          </p>
        </Callout>
        <p>Until card payments go live, a paid plan is arranged like this:</p>
        <ol>
          <li>
            You write to{" "}
            {billingEmail ? <a href={`mailto:${billingEmail}`}>{billingEmail}</a> : contactPhrase} telling us the plan
            you want and whether you want it monthly or annually.
          </li>
          <li>We confirm the price for the region your business is established in, and send you our bank details.</li>
          <li>You pay by bank transfer.</li>
          <li>
            We apply the licence to your account by hand, usually within one working day of the money arriving, and
            email you a receipt.
          </li>
        </ol>
        <p>
          Because a human applies the licence, the start date of your paid period is the date we activate it, not the
          date you sent the transfer. If a transfer takes several days to clear, you do not lose those days.
        </p>
        <p>
          {COMPANY.legalName} is the seller. When we introduce card payments we may use a payment provider that acts as
          merchant of record, in which case that provider becomes the seller for tax purposes and its own refund
          mechanics will apply alongside this policy. We will update this page and tell you before that happens.
        </p>
      </LegalSection>

      <LegalSection id="trial" index={2} title="The 14-day free trial">
        <p>
          Every new customer can take a 14-day free trial. It needs no card and no bank transfer, so there is nothing
          to cancel and nothing to refund. When the 14 days are up, the account drops to the Free plan on its own
          unless you have arranged a paid one. It will never quietly start charging you, because there is no stored
          payment method that could be charged.
        </p>
        <p>
          A trial is granted once per person. Opening a second account with a new email address to get another trial is
          a breach of the <Link href="/legal/terms">Terms of Service</Link>.
        </p>
      </LegalSection>

      <LegalSection id="monthly" index={3} title="Monthly plans">
        <p>
          A monthly plan runs for one month from the day we activate it. You can cancel at any time and you do not have
          to give a reason.
        </p>
        <p>
          When you cancel, your access continues to the end of the month you have already paid for. You keep the full
          plan, the full allowance and every feature until that date, and then the account drops to the Free plan. We
          do not cut you off the moment you cancel.
        </p>
        <p>
          <b>We do not refund part-used months.</b> If you cancel on day 20 of a monthly period, you keep the remaining
          10 days and there is no partial refund. The exceptions are the statutory ones below, and cases where we got
          something wrong: if we billed you twice, billed you for a plan you never received, or the service was
          materially broken for a sustained period, tell us and we will refund it.
        </p>
      </LegalSection>

      <LegalSection id="annual" index={4} title="Annual plans">
        <p>
          An annual plan costs ten months&apos; worth of the monthly price and runs for twelve months. It is cheaper
          precisely because it is a commitment, so the refund rules are different.
        </p>
        <Callout>
          <p style={{ margin: 0 }}>
            <b>14-day refund window.</b> Ask within 14 days of the day we activate an annual plan and we will refund it
            in full, whatever the reason, even if you have used the service in that time. After day 14, an annual plan
            is not refundable for the rest of the year, but you can cancel the renewal at any point so it does not
            continue.
          </p>
        </Callout>
        <p>
          If you upgrade mid-year, we charge the difference pro rata for the remaining months. If you downgrade
          mid-year, the new plan takes effect at the next renewal rather than immediately, and we do not refund the
          difference for months already paid.
        </p>
        <p>
          If we materially reduce or withdraw a feature you bought the annual plan for, section 18 of the{" "}
          <Link href="/legal/terms">Terms of Service</Link> lets you cancel and get back the unused part of the year,
          whatever this section says.
        </p>
      </LegalSection>

      <LegalSection id="usage" index={5} title="Allowances and top-ups">
        <p>
          Plans include a monthly allowance of autonomous actions, lead credits, content pieces, social posts and
          outreach emails. Allowances run per calendar month and reset at the start of the next one. Unused allowance
          does not carry over, and we do not pay out for allowance you did not use, on any plan.
        </p>
        <p>
          If you run out before the reset, you can buy a top-up. A top-up is a one-off purchase and it is refundable
          only while it is unspent. Once credits have been consumed, real model and data costs have already been
          incurred on your behalf and we cannot refund them. Where part of a top-up is unspent, we refund that part.
        </p>
      </LegalSection>

      <LegalSection id="india" index={6} title="India: the timelines we commit to">
        <p>
          We are an Indian company. The Reserve Bank of India and the payment aggregator rules expect a merchant to
          publish a refund and cancellation policy with actual timelines rather than a promise to be reasonable. Here
          are ours, and they apply to every customer, not only customers in India.
        </p>
        <DefTable
          head={["Stage", "Our commitment"]}
          rows={[
            ["You send a refund or cancellation request", "We acknowledge it in writing within 48 hours, with a reference you can quote."],
            ["We assess it", "We decide within 7 working days of the acknowledgement and tell you the outcome and the reason."],
            ["We approve it", "We initiate the refund within 5 to 7 working days of the approval."],
            ["Where the money goes", "Back to the original payment method. A bank transfer is returned to the account it came from. We do not substitute account credit or vouchers unless you ask us to."],
            ["When it lands", "Your bank or card issuer then takes its own time, typically a few working days. That part is outside our control, and we will give you the reference so you can chase it."],
          ]}
        />
        <p>
          If we miss one of these timelines, say so when you write to us and we will escalate it to the grievance route
          at the bottom of this page.
        </p>
      </LegalSection>

      <LegalSection id="eu-uk" index={7} title="EU and UK consumers: your right to withdraw">
        <p>
          If you buy MADBOT as a consumer in the European Union or the United Kingdom, the law gives you a right that
          is separate from, and better than, anything in this policy: for a distance contract you may withdraw within
          14 days of entering into it, without giving a reason.
        </p>
        <p>
          MADBOT is a service that starts as soon as it is switched on, and most people want it switched on
          immediately. So we have to be straight with you about the trade-off the law sets out:
        </p>
        <ul>
          <li>
            By asking us to activate your plan straight away, you are expressly asking us to begin performing the
            service during the 14-day withdrawal period, and you acknowledge that.
          </li>
          <li>
            You keep the right to withdraw within those 14 days. If you use it, we may charge you pro rata for the part
            of the service actually supplied up to the moment you told us, and we refund the rest.
          </li>
          <li>
            If you tell us not to start until the 14 days are up, nothing is supplied and a withdrawal in that window
            is refunded in full.
          </li>
        </ul>
        <p>
          To withdraw, just write to us and say so. Email is fine and you do not need a form. We will acknowledge it
          within 48 hours and refund within 14 days of being told, to the payment method you used.
        </p>
        <Callout>
          <p style={{ margin: 0 }}>
            <b>This right belongs to consumers, not to businesses.</b> Most MADBOT customers buy it for a company, and
            a company buying a business tool does not get a statutory cooling-off period. The commercial windows
            elsewhere on this page still apply to you. If you are unsure which you are, ask us and we will treat a
            genuine doubt in your favour.
          </p>
        </Callout>
      </LegalSection>

      <LegalSection id="not-refundable" index={8} title="What we cannot refund">
        <p>Outside the statutory rights above, these are not refundable:</p>
        <ul>
          <li>allowance you did not use, on any plan, since it does not roll over and was never a separate purchase;</li>
          <li>credits and top-ups already spent, because the model and data costs behind them have already been paid;</li>
          <li>a part-used month on a monthly plan;</li>
          <li>an annual plan after its 14-day window, although you can always stop it renewing;</li>
          <li>
            costs you incurred with someone else: a domain, hosting, a directory listing fee, an advertising spend, or
            a paid tier of a third-party service you connected;
          </li>
          <li>bank charges, transfer fees or currency conversion losses on a payment to or from us;</li>
          <li>an account we closed for breaking the <Link href="/legal/terms">Terms of Service</Link> or the <Link href="/legal/acceptable-use">Acceptable Use Policy</Link>.</li>
        </ul>
        <p>
          Being disappointed with what an AI model wrote, or with the ranking or traffic effect of publishing it, is
          not a refund reason on its own. We are clear in the terms that we do not promise results, and you decide what
          gets published. If the product is genuinely not doing what this site says it does, that is a different
          matter, and we do want to hear about it.
        </p>
      </LegalSection>

      <LegalSection id="how-to-cancel" index={9} title="How to cancel">
        <p>
          Write to{" "}
          {billingEmail ? <a href={`mailto:${billingEmail}`}>{billingEmail}</a> : contactPhrase} from the email address
          on the account and say you want to cancel. That is the whole process. One email, and we will confirm in
          writing.
        </p>
        <Callout>
          <p style={{ margin: 0 }}>
            Cancelling is never hidden behind a phone call, a retention conversation, a notice period or a form you
            have to hunt for. We will not make you explain yourself, and we will not require you to speak to anyone.
            If we ask why you are leaving, you are free to ignore the question and the cancellation still goes through.
          </p>
        </Callout>
        <p>
          Once card checkout is live, you will also be able to cancel from the dashboard in one click, and this section
          will be updated to say so.
        </p>
      </LegalSection>

      <LegalSection id="data" index={10} title="What happens to your data">
        <p>
          Cancelling ends the subscription. It does not immediately erase everything: your account drops to the Free
          plan and stays reachable so you can export what you need. Scheduled work stops, connected third-party
          accounts are disconnected, and the autonomy dial goes back to watching only.
        </p>
        <p>
          If you then ask us to delete the account, we delete or anonymise your data on the schedule set out in the
          retention section of the <Link href="/legal/privacy">Privacy Policy</Link>, keeping only what the law
          requires us to keep, such as billing records. Deletion is permanent and we cannot undo it, so export your
          articles, reports and lead lists first.
        </p>
      </LegalSection>

      <LegalSection id="chargebacks" index={11} title="Chargebacks: please ask us first">
        <p>
          If a charge looks wrong, tell us before you dispute it with your bank. We can usually sort out a genuine
          error in a day, and a chargeback takes weeks, costs both of us a fee, and often ends with the account
          suspended while the dispute runs.
        </p>
        <p>
          We will always look at a real billing error and fix it. If a chargeback is raised without contacting us
          first, we may suspend the account until it is resolved, and we may recover the dispute fee.
        </p>
      </LegalSection>

      <LegalSection id="failed-payments" index={12} title="Failed and late payments">
        <p>
          There is no card to fail today, so this is about a renewal that is not paid. When a paid period is coming to
          an end we will email you before it does. If the next period is not paid by the end date:
        </p>
        <ul>
          <li>the account keeps working for a short grace period rather than stopping the same day;</li>
          <li>during grace we will email you again;</li>
          <li>after grace, the account drops to the Free plan. Scheduled work stops and paid features lock.</li>
        </ul>
        <p>
          Nothing is deleted at that point. Your sites, audits, articles and leads stay in the account, and paying for
          a new period restores access to them. Deletion only happens on the retention schedule in the{" "}
          <Link href="/legal/privacy">Privacy Policy</Link>, and only after you close the account or after a long
          period of inactivity.
        </p>
      </LegalSection>

      <LegalSection id="price-changes" index={13} title="Price changes">
        <p>
          We may change prices. If a change affects a plan you are on, we will email you at least 30 days before it
          applies to you, and it will only take effect at your next renewal, never in the middle of a period you have
          already paid for.
        </p>
        <p>
          If you do not want to pay the new price, cancel before the renewal and nothing more is charged. An annual
          plan holds its price for the whole twelve months regardless of what happens to the list price in between.
        </p>
        <p>
          Introducing a tax we are newly required to collect, such as GST once we are registered for it, is not a price
          change in this sense, but we will still tell you before it appears on a receipt.
        </p>
      </LegalSection>

      <LegalSection id="grievance" index={14} title="If you are still unhappy">
        <p>
          Start with{" "}
          {billingEmail ? <a href={`mailto:${billingEmail}`}>{billingEmail}</a> : contactPhrase}. If that does not
          resolve it, escalate to{" "}
          {legalEmail ? <a href={`mailto:${legalEmail}`}>{legalEmail}</a> : "our published contact address"}.
        </p>
        <p>
          <b>India: grievance officer.</b> Indian law requires us to publish a named grievance officer for complaints
          about a purchase or a refund.
        </p>
        <ul>
          <li>Name: {COMPANY.grievanceOfficer.name || "not yet appointed, and until one is named please write to the contact address above"}</li>
          <li>Designation: {COMPANY.grievanceOfficer.designation}</li>
          <li>
            Email:{" "}
            {grievanceEmail ? <a href={`mailto:${grievanceEmail}`}>{grievanceEmail}</a> : "our published contact address"}
          </li>
          {COMPANY.grievanceOfficer.phone ? (
            <li>
              Telephone:{" "}
              <a href={`tel:${COMPANY.grievanceOfficer.phone}`}>{COMPANY.grievanceOfficer.phoneDisplay}</a>
            </li>
          ) : null}
          <li>
            Acknowledgement within {COMPANY.grievanceOfficer.acknowledgeHours} hours, resolution within{" "}
            {COMPANY.grievanceOfficer.resolveDays} days.
          </li>
        </ul>
        <p>
          None of this stops you using a statutory route instead. Consumers in India may go to a consumer forum, and
          consumers in the European Union and the United Kingdom keep every remedy their own law gives them, including
          the withdrawal right described above. Section 19 of the{" "}
          <Link href="/legal/terms">Terms of Service</Link> says the same thing in the contract itself.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
