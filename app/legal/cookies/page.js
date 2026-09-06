"use client";

import Link from "next/link";
import LegalPage, { LegalSection, Callout, DefTable } from "../../components/LegalPage";
import { COMPANY, emailFor } from "../../../lib/company";
import { CONTACT_EMAIL } from "../../../lib/contact";
import {
  CATEGORY_ORDER,
  CATEGORIES,
  CONSENT_VERSION,
  INVENTORY,
  MODELS,
  modelFor,
  onlyNecessaryInUse,
} from "../../../lib/consent";

/**
 * The Cookie and Local Storage Policy.
 *
 * Every table below is generated from lib/consent.js, which is the same module
 * the banner and the preference panel read. Restating the inventory in prose
 * here would create a second copy that goes stale the first time somebody adds
 * a script, and a stale cookie policy is a false statement published on a
 * website. So: one source, rendered twice.
 */

const privacyEmail = emailFor("privacy", CONTACT_EMAIL);
const nothingOptionalInUse = onlyNecessaryInUse();

/** A representative country per consent model, labelled from the code itself. */
const EXAMPLE_COUNTRIES = [
  ["DE", "Germany, and the rest of the EEA"],
  ["GB", "United Kingdom"],
  ["CH", "Switzerland"],
  ["IN", "India"],
  ["CA", "Canada"],
  ["BR", "Brazil"],
  ["ZA", "South Africa"],
  ["KR", "South Korea"],
  ["AE", "United Arab Emirates"],
  ["SA", "Saudi Arabia"],
  ["US", "United States"],
  ["SG", "Singapore"],
  ["JP", "Japan"],
  ["AU", "Australia"],
];

function modelLabel(model) {
  if (model === MODELS.OPT_IN) return "Opt in: nothing optional runs until you say yes";
  if (model === MODELS.OPT_OUT) return "Opt out: optional storage may run, and you can switch it off";
  return "Notice only";
}

function ReachUs({ address }) {
  if (address) {
    return (
      <>
        at <a href={`mailto:${address}`}>{address}</a>
      </>
    );
  }
  return (
    <>
      at the address we publish for privacy questions, which is not yet set up
      (the notice at the top of this page says so)
    </>
  );
}

const TOC = [
  { id: "what-this-is", title: "What this page covers" },
  { id: "inventory", title: "Everything we store, in full" },
  { id: "empty-categories", title: "No analytics, no advertising" },
  { id: "by-country", title: "Why the banner differs by country" },
  { id: "gpc", title: "Global Privacy Control" },
  { id: "change", title: "How to change your answer" },
  { id: "clear", title: "How to clear this from your browser" },
  { id: "third-party", title: "Storage set by Firebase Authentication" },
  { id: "when-this-changes", title: "When this list changes" },
  { id: "contact", title: "Questions" },
];

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie and Local Storage Policy"
      kicker="Legal"
      updated="6 September 2026"
      effective="6 September 2026"
      toc={TOC}
      intro={
        <>
          <p style={{ margin: "0 0 12px" }}>
            Most of what this site stores is not a cookie. It is local storage,
            which sits in your browser and never travels with a request. The law
            treats both the same way, so this page covers both, and the title
            says so rather than pretending otherwise.
          </p>
          <p style={{ margin: 0 }}>
            The tables below are generated from the same code that does the
            storing. If something is not listed here, {COMPANY.product} is not
            writing it.
          </p>
        </>
      }
    >
      <LegalSection id="what-this-is" index={1} title="What this page covers">
        <p>
          Cookies, local storage, session storage and IndexedDB are four ways a
          site can leave something behind in your browser. This page lists
          everything {COMPANY.product} leaves behind, in each of those forms, and
          why.
        </p>
        <p>
          It also explains the part most cookie pages skip: what happens when
          you refuse. In {COMPANY.product} the answer is enforced in code. Every
          piece of non-essential storage passes through a single gate that
          checks your recorded choice first, and that gate returns false when no
          choice has been recorded. A script added without a consent check
          therefore fails closed rather than running quietly.
        </p>
        <p>
          For what we do with personal data more generally, see the{" "}
          <Link href="/legal/privacy">Privacy Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection id="inventory" index={2} title="Everything we store, in full">
        {CATEGORY_ORDER.map((c) => {
          const cat = INVENTORY[c];
          return (
            <div key={c} style={{ marginBottom: 22 }}>
              <h3>
                {cat.label}
                {cat.required ? " (not optional)" : ""}
              </h3>
              <p>{cat.description}</p>
              {cat.items.length ? (
                <DefTable
                  head={["Key", "Kind", "Purpose", "Retention", "Set by"]}
                  rows={cat.items.map((item) => [
                    item.key,
                    item.kind,
                    item.purpose,
                    item.retention,
                    item.party,
                  ])}
                />
              ) : (
                <p>
                  <b>Nothing.</b> This category is empty. Nothing is stored under
                  it, and nothing is loaded for it.
                </p>
              )}
            </div>
          );
        })}
        <p>
          The strictly necessary entries are the two things the site cannot work
          without: what keeps you signed in, and the record of your answer to the
          banner. Refusing the record of your answer would mean being asked the
          question on every page, which is why no consent is required for it.
        </p>
      </LegalSection>

      <LegalSection id="empty-categories" index={3} title="No analytics, no advertising">
        <p>
          {COMPANY.product} runs <b>no analytics</b> and <b>no advertising or
          tracking cookies</b>. There is no Google Analytics, no pixel, no
          fingerprinting, no session recorder, no A/B testing tool and no ad
          network. Nobody is building a profile of you from this site, and we do
          not sell or share anything for advertising.
        </p>
        <p>
          The two categories named{" "}
          <b>{INVENTORY[CATEGORIES.ANALYTICS].label}</b> and{" "}
          <b>{INVENTORY[CATEGORIES.MARKETING].label}</b> still appear in the
          table above with nothing in them. That is deliberate. An empty category on the record is a
          verifiable claim: you can see that we considered the question and that
          the answer is currently none. Deleting the category would make the
          claim disappear rather than making it stronger.
        </p>
        {nothingOptionalInUse ? (
          <Callout>
            <p style={{ margin: 0 }}>
              At the time this page was rendered, nothing beyond strictly
              necessary storage was in use at all.
            </p>
          </Callout>
        ) : null}
        <p>
          If that ever changes, the vendor will be added to the inventory in the
          same commit that adds the script, this page will show it the moment it
          is deployed, and consent will be asked for again before it runs. It
          cannot happen the other way round, because the gate described above
          refuses anything the inventory has not been updated for.
        </p>
      </LegalSection>

      <LegalSection id="by-country" index={4} title="Why the banner differs by country">
        <p>
          The consent notice you see depends on where you appear to be. We work
          this out from a country code our hosting providers add at the edge, and
          we do not store your IP address to do it.
        </p>
        <p>
          Showing everybody the strictest possible wall is not compliance, it is
          a worse product for no legal gain. Showing everybody the most permissive
          option is a regulator&apos;s problem. So the notice follows your law:
        </p>
        <ul>
          <li>
            <b>Opt in.</b> Nothing optional runs until you agree. Refusing is as
            easy as agreeing, both are one click, and staying silent counts as
            refusal. This is what the ePrivacy Directive and the GDPR require in
            the EEA, and what the UK, India, Brazil, Canada, South Korea, the
            Gulf states and several others require too.
          </li>
          <li>
            <b>Opt out.</b> Optional storage may start, you are told about it,
            and you get a standing and easy way to stop it, including an
            automated browser signal. This is the United States model, and it
            applies in Japan, Singapore, Australia and elsewhere.
          </li>
        </ul>
        <p>
          Advertising storage is never on by default in any country. If we cannot
          tell where you are, you get the opt-in notice, because the cost of
          asking somebody who did not need to be asked is one click.
        </p>
        <DefTable
          head={["If you are in", "What you get"]}
          rows={EXAMPLE_COUNTRIES.map(([code, label]) => [
            label,
            modelLabel(modelFor(code)),
          ])}
        />
        <p>
          Whichever notice you get, the choice you make is recorded with the date,
          the country, and how you gave it, so that a consent we never actually
          received cannot be claimed later.
        </p>
      </LegalSection>

      <LegalSection id="gpc" index={5} title="Global Privacy Control">
        <p>
          If your browser or an extension sends a{" "}
          <b>Global Privacy Control</b> signal, we honour it. It is treated as a
          valid opt-out before any banner is shown, and it overrides an opt-out
          default, so nothing in the analytics or advertising categories may run
          regardless of what any stored answer says.
        </p>
        <p>
          The one thing GPC does not switch off is the preferences category,
          because remembering your theme and your currency is for you, not for
          us, and losing it every visit would be a worse experience with no
          privacy gain.
        </p>
        <p>
          GPC is a legally recognised opt-out in California, Colorado and
          Connecticut among others. We honour it everywhere, not only where we
          are required to.
        </p>
      </LegalSection>

      <LegalSection id="change" index={6} title="How to change your answer">
        <p>
          Your answer is not final and you do not have to clear anything to
          change it. At the bottom of every page on this site, under{" "}
          <b>Legal</b>, there is a <b>Cookie preferences</b> control. Click it and
          the preference panel opens with your current choices, wherever you are
          on the site.
        </p>
        <p>
          If you are curious about the mechanism: that control dispatches a{" "}
          <code>madbot:open-consent</code> event on the window, which the consent
          panel listens for. It is the same panel you saw the first time, showing
          the same categories.
        </p>
        <p>
          Turning a category off takes effect immediately for anything that has
          not already run, and anything already written under that category is
          removed. There is no dark pattern here: rejecting everything optional is
          a single click and does not cost you access to any part of the service.
        </p>
      </LegalSection>

      <LegalSection id="clear" index={7} title="How to clear this from your browser">
        <p>
          You can also delete everything yourself, without our involvement. Local
          storage and cookies for a site are cleared from the browser&apos;s own
          settings.
        </p>
        <ul>
          <li>
            <b>Chrome and Edge:</b> Settings, then Privacy and security, then
            Third-party cookies or Cookies and site data, then See all site data
            and permissions. Search for {COMPANY.productDomain} and delete it.
          </li>
          <li>
            <b>Safari:</b> Settings, then Privacy, then Manage Website Data.
            Search for the site and remove it.
          </li>
          <li>
            <b>Firefox:</b> Settings, then Privacy &amp; Security, then Cookies
            and Site Data, then Manage Data.
          </li>
          <li>
            <b>Any browser:</b> open the developer tools, go to the Application
            or Storage tab, and clear Local Storage and IndexedDB for this site.
          </li>
        </ul>
        <p>
          Two things follow from clearing it. You will be signed out, because the
          sign-in token lives in that storage. And you will be asked the consent
          question again, because the record of your answer is what we cleared.
          Both are the expected result, not a fault.
        </p>
        <p>
          Browser-level blocking works too. If storage is blocked or you are in a
          private window, we treat that as &quot;not asked yet&quot;, which means
          nothing optional runs. That is the safe failure, and the site still
          works.
        </p>
      </LegalSection>

      <LegalSection id="third-party" index={8} title="Storage set by Firebase Authentication">
        <p>
          One entry in the table above is not written by us. When you sign in,
          Firebase Authentication, which is a Google service, stores your session
          in local storage and IndexedDB under keys beginning{" "}
          <code>firebase:authUser:</code>. That is what keeps you signed in
          between visits, and it is why the entry is listed as strictly necessary
          rather than optional: without it, signing in would not survive a page
          reload.
        </p>
        <p>
          It is only set once you have signed in. A visitor who never signs in
          never gets it. Signing out removes it. Google is listed as a
          sub-processor in the{" "}
          <Link href="/legal/privacy#subprocessors">Privacy Policy</Link> and on{" "}
          <Link href="/legal/subprocessors">the sub-processors page</Link>.
        </p>
        <p>
          No other third party sets storage through this site. If you connect an
          integration such as GitHub or a social account, that connection is held
          on our servers, not in your browser.
        </p>
      </LegalSection>

      <LegalSection id="when-this-changes" index={9} title="When this list changes">
        <p>
          The inventory is versioned. The record of your answer carries that
          version number, currently <b>{CONSENT_VERSION}</b>. When the inventory
          changes, the version changes, and every stored answer that refers to the
          old version stops counting as consent.
        </p>
        <p>
          In practice that means you are asked again, about the new list, rather
          than being treated as having already agreed to something that did not
          exist when you clicked. Consent to an unspecified future thing is not
          consent, and treating it as such is the most common way a cookie banner
          becomes decorative.
        </p>
        <p>
          The date at the top of this page changes whenever the inventory does.
        </p>
      </LegalSection>

      <LegalSection id="contact" index={10} title="Questions">
        <p>
          If something here does not match what you observe in your browser, we
          want to know, because it would mean the inventory is wrong and the
          inventory is what the code reads. Write to us{" "}
          <ReachUs address={privacyEmail} />.
        </p>
        <p>
          Related reading: the{" "}
          <Link href="/legal/privacy">Privacy Policy</Link> for what we do with
          personal data, the{" "}
          <Link href="/legal/subprocessors">sub-processors list</Link> for who
          else is involved, and the{" "}
          <Link href="/legal/security">security page</Link> for how the service is
          protected.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
