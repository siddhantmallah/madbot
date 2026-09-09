// AdSense readiness — an opt-in section of the free report.
//
// Everything here is measured off the page, its robots.txt and its ads.txt.
// Nothing is a prediction of whether Google will approve a site, because that
// depends on a human review of the content itself, which no fetch can see. The
// report says so out loud in `notes` rather than implying a verdict it cannot
// reach.
//
// The rules being checked are Google's published ones:
//   · ads.txt — an existing file that omits your publisher id stops Google
//     buying that inventory. This is the single most expensive thing on the
//     list and the easiest to get wrong.
//   · Mediapartners-Google is the crawler that reads a page to decide which
//     ads belong on it. robots.txt shutting it out means untargeted ads.
//   · The programme policies require a privacy policy that discloses
//     third-party advertising cookies.
//   · The EU user consent policy requires a Google-certified CMP for EEA and
//     UK traffic.
//   · Site eligibility requires substantial original content and a site a
//     visitor can navigate.

import { SCORE_FLOOR, criticalCeiling } from "./auditClient";
import { disallowsEverything, namesAgent } from "./robotsTxt";
import {
  adsenseSignals,
  consentSignals,
  policyLinks,
} from "./htmlParse";

// The lines this section judges by, in one place so the copy and the verdict
// cannot drift apart.
export const ADSENSE_THRESHOLDS = {
  // Google rejects thin sites as "low value content". These are not published
  // numbers — Google gives none — so they are stated as our own working lines
  // and the copy never attributes them to Google.
  wordsThin: 300,
  wordsHealthy: 600,
  pagesThin: 5,
  pagesHealthy: 15,
  // Programme policy forbids more advertising than content. One slot per this
  // many words is our reading of "content of little value".
  wordsPerSlot: 150,
};

const AD_CRAWLER = "mediapartners-google";

/**
 * Reads an ads.txt the way a buyer does: line by line, comments stripped,
 * fields split on commas.
 *
 * The `subdomain=` and `contact=` variable lines are not records and are kept
 * apart so a file that only contains those is not reported as authorising
 * anybody.
 */
export function parseAdsTxt(body) {
  const records = [];
  const variables = [];
  let malformed = 0;

  String(body || "")
    .split(/\r?\n/)
    .forEach((raw) => {
      const line = raw.split("#")[0].trim();
      if (!line) return;
      if (/^[a-z]+=/i.test(line)) {
        variables.push(line);
        return;
      }
      const fields = line.split(",").map((f) => f.trim());
      if (fields.length < 3) {
        malformed += 1;
        return;
      }
      const [domain, publisherId, relationship, authority] = fields;
      if (!/^(DIRECT|RESELLER)$/i.test(relationship)) {
        malformed += 1;
        return;
      }
      records.push({
        domain: domain.toLowerCase(),
        publisherId: publisherId.toLowerCase(),
        relationship: relationship.toUpperCase(),
        authority: authority || null,
      });
    });

  const googleRecords = records.filter((r) => r.domain === "google.com");
  return {
    records,
    variables,
    malformed,
    googleRecords,
    // ads.txt writes the id as pub-…; the page writes it as ca-pub-…. Same id,
    // two spellings, and comparing them naively is how a correct file gets
    // reported as broken.
    googlePubIds: googleRecords.map((r) => r.publisherId.replace(/^ca-/, "")),
  };
}

/** Normalises either spelling of a publisher id to the ads.txt one. */
function pubId(id) {
  return String(id || "").toLowerCase().replace(/^ca-/, "");
}

/**
 * Builds the AdSense readiness report.
 *
 * Takes what runAudit already fetched — no extra requests are made here — plus
 * the ads.txt response, which is the one thing this section needs on its own.
 */
export function buildAdsenseReport({
  html,
  base,
  https,
  viewport,
  lang,
  wordCount,
  distinctPages,
  sitemapUrls,
  robots,
  robotsBody,
  truncated = false,
  htmlKb = 0,
  adsTxt,
}) {
  const T = ADSENSE_THRESHOLDS;
  const findings = [];
  let maxPenalty = 0;
  let ceiling = 100;

  const add = (severity, area, title, detail, fix, weight = 0) =>
    findings.push({ severity, area, title, detail, fix, weight });
  const risk = (n) => {
    maxPenalty += n;
  };
  const blocks = (n) => {
    ceiling = Math.min(ceiling, n);
  };

  const ads = adsenseSignals(html);
  const consent = consentSignals(html);
  const pages = policyLinks(html, base);
  const adsTxtParsed = adsTxt?.exists ? parseAdsTxt(adsTxt.body) : null;
  // The pages a visitor can reach is the better denominator when a sitemap
  // exists, since a homepage links to a fraction of a real site.
  const pageCount = Math.max(distinctPages || 0, sitemapUrls || 0);

  // — Inventory: ads.txt. First, because it is the one that costs money. —
  risk(30);
  if (!adsTxt?.exists) {
    add(
      "warning",
      "Inventory",
      "No ads.txt file",
      "Without one, anyone can claim to be selling your inventory and Google has no way to tell. It is not required to serve ads, but it is the only thing standing between your domain and somebody else's arbitrage.",
      "Publish /ads.txt listing your own publisher id as DIRECT, and nothing else.",
      6
    );
  } else if (adsTxtParsed.records.length === 0) {
    add(
      "critical",
      "Inventory",
      "ads.txt exists but authorises nobody",
      `The file is served but contains no usable record${adsTxtParsed.malformed ? ` — ${adsTxtParsed.malformed} line${adsTxtParsed.malformed === 1 ? "" : "s"} could not be parsed` : ""}. A present-but-empty ads.txt is read as "no seller is authorised", which is worse than having no file at all.`,
      "Fix the records, or remove the file until it is right. One line per authorised seller: google.com, pub-…, DIRECT, f08c47fec0942fa0.",
      30
    );
    blocks(45);
  } else if (adsTxtParsed.googlePubIds.length === 0) {
    add(
      "critical",
      "Inventory",
      "ads.txt does not list google.com",
      `It authorises ${adsTxtParsed.records.length} seller${adsTxtParsed.records.length === 1 ? "" : "s"}, none of them Google. With an ads.txt in place, Google will not buy inventory it is not named in — so AdSense demand stops at this file.`,
      "Add a google.com record for your own publisher id: google.com, pub-…, DIRECT, f08c47fec0942fa0.",
      30
    );
    blocks(45);
  } else {
    const onPage = ads.clients.map(pubId);
    const listed = adsTxtParsed.googlePubIds;
    const mismatch = onPage.filter((id) => !listed.includes(id));
    if (mismatch.length) {
      add(
        "critical",
        "Inventory",
        "The publisher id on the page is not the one in ads.txt",
        `The page serves ads for ${mismatch.map((id) => `ca-${id}`).join(", ")}, but ads.txt only authorises ${listed.join(", ")}. Google reads the file as the final word, so the ads on this page are unauthorised inventory and go unfilled.`,
        "Make the two agree — add the id the page actually uses to ads.txt, or change the page to the id the file authorises.",
        28
      );
      blocks(45);
    } else {
      // A large publisher authorises a dozen Google ids. The title names two
      // and counts the rest, because the whole list turns one line of the
      // report into a paragraph.
      const others = adsTxtParsed.records.length - listed.length;
      add(
        "good",
        "Inventory",
        listed.length > 2
          ? `ads.txt authorises ${listed.slice(0, 2).join(", ")} and ${listed.length - 2} more Google id${listed.length - 2 === 1 ? "" : "s"}`
          : `ads.txt authorises ${listed.join(", ")}`,
        others > 0
          ? `Alongside ${others} other seller record${others === 1 ? "" : "s"}.`
          : "Google is named as an authorised seller.",
        null,
        0
      );
    }
    if (adsTxtParsed.malformed) {
      risk(4);
      add(
        "warning",
        "Inventory",
        `${adsTxtParsed.malformed} unparseable line${adsTxtParsed.malformed === 1 ? "" : "s"} in ads.txt`,
        "Lines that do not carry three comma-separated fields and a DIRECT or RESELLER relationship are skipped by every buyer that reads the file.",
        "Correct or delete the malformed lines so the whole file is honoured.",
        4
      );
    }
  }

  // — Eligibility: can the ad crawler read the page at all? —
  risk(25);
  if (!robots?.exists) {
    add(
      "warning",
      "Eligibility",
      "No robots.txt",
      "Nothing is blocked, so the ad crawler can read the page — but you also have no way to allow it explicitly if you ever add rules.",
      "Add a robots.txt that allows Mediapartners-Google and points at your sitemap.",
      3
    );
  } else if (disallowsEverything(robotsBody, AD_CRAWLER)) {
    add(
      "critical",
      "Eligibility",
      "robots.txt shuts out Mediapartners-Google",
      "That is the crawler Google uses to read a page and decide which ads belong on it. Blocked, it cannot see your content, so you get untargeted ads at the lowest rates — or none.",
      "Allow Mediapartners-Google in robots.txt. It only reads pages you already serve to visitors.",
      25
    );
    blocks(40);
  } else {
    add(
      "good",
      "Eligibility",
      "The ad crawler can read this page",
      namesAgent(robotsBody, AD_CRAWLER)
        ? "robots.txt names Mediapartners-Google and lets it in."
        : "Nothing in robots.txt excludes Mediapartners-Google.",
      null,
      0
    );
  }

  risk(20);
  if (!https) {
    add(
      "critical",
      "Eligibility",
      "The site is not served over HTTPS",
      "Ad code on an insecure page cannot request secure ads, which cuts you off from most of the demand — and browsers are flagging the page as not secure to every visitor anyway.",
      "Move to HTTPS before wiring up any ad code.",
      20
    );
    blocks(50);
  } else {
    add("good", "Eligibility", "Served over HTTPS", "Secure ad requests are possible.", null, 0);
  }

  risk(14);
  if (wordCount < T.wordsThin) {
    add(
      "critical",
      "Eligibility",
      `Only ~${wordCount} words on this page`,
      "Thin pages are the most common reason AdSense applications are turned down — the rejection reads \"low value content\". There is not enough here for a reviewer to see a reason for the page to exist, or for the ad crawler to work out what it is about.",
      "Write the page out properly before applying: what it is, who it is for, and the questions a visitor arrives with.",
      14
    );
  } else if (wordCount < T.wordsHealthy) {
    add(
      "warning",
      "Eligibility",
      `~${wordCount} words on this page`,
      "Enough to be a page, thin for one carrying advertising. Ad density is judged against how much content surrounds it.",
      "Deepen the page so the ads sit inside something worth reading.",
      6
    );
  } else {
    add("good", "Eligibility", `~${wordCount} words of copy`, "Substantial enough to carry advertising.", null, 0);
  }

  risk(12);
  if (pageCount === 0) {
    add(
      "critical",
      "Eligibility",
      "This appears to be a single page",
      "A one-page site is very rarely approved. Reviewers look for a site somebody could spend time on, and there is nowhere else to go from here.",
      "Build out the pages the site should have — each one its own topic — and link them from the homepage.",
      12
    );
  } else if (pageCount < T.pagesThin) {
    add(
      "warning",
      "Eligibility",
      `Only ${pageCount} other page${pageCount === 1 ? "" : "s"} found`,
      "A small site can be approved, but it earns very little: ad revenue is a function of pages times visits, and there is almost nothing here to place ads on.",
      "Add the pages worth ranking for, then place ads on the ones that earn attention.",
      6
    );
  } else {
    add(
      "good",
      "Eligibility",
      `${pageCount} pages found`,
      pageCount >= T.pagesHealthy ? "Enough surface for advertising to add up." : "A real site with somewhere to go.",
      null,
      0
    );
  }

  risk(6);
  if (!viewport) {
    add(
      "critical",
      "Eligibility",
      "No mobile viewport tag",
      "Most ad impressions are mobile, and responsive ad units need the viewport declared to size themselves. Without it, ads render at desktop widths on a phone and get squeezed out of the layout.",
      "Add the viewport meta tag and check the layout genuinely reflows.",
      6
    );
  } else {
    add("good", "Eligibility", "Mobile viewport set", "Responsive ad units can size themselves.", null, 0);
  }

  risk(3);
  if (!lang) {
    add(
      "warning",
      "Eligibility",
      "No language declared on <html>",
      "AdSense only monetises content in the languages it supports, and the declared language is the first thing that decides which advertisers can bid on the page.",
      "Declare the page language explicitly.",
      3
    );
  }

  // — Policy: the pages Google's own rules require you to have. —
  risk(22);
  if (!pages.privacy && truncated) {
    // The footer is where these links live, and it is the first thing lost
    // when a document runs past what we will read. Saying "you have no privacy
    // policy" off a partial page is exactly the kind of confident wrongness
    // that makes a report worthless.
    add(
      "warning",
      "Policy",
      "Could not confirm a privacy policy",
      `This page is over ${htmlKb} KB and we stopped reading before the end of it, so a footer link may have been missed. AdSense requires a privacy policy that discloses third-party advertising cookies.`,
      "Check the privacy policy is linked from every page — and if it is, this one is already done.",
      6
    );
  } else if (!pages.privacy) {
    add(
      "critical",
      "Policy",
      "No privacy policy found",
      "The AdSense programme policies require one, and require it to disclose that third parties place cookies to serve advertising. This is not a nice-to-have: it is a condition of the account.",
      "Publish a privacy policy that names third-party advertising cookies, and link it from every page.",
      22
    );
    blocks(55);
  } else {
    add("good", "Policy", "Privacy policy linked", "The page Google's policies require is present.", null, 0);
  }

  risk(8);
  if (consent.vendors.length) {
    const certified = consent.vendors.includes("Google Funding Choices");
    add(
      certified ? "good" : "warning",
      "Policy",
      `Consent platform detected: ${consent.vendors.join(", ")}`,
      certified
        ? "Google's own CMP, which satisfies the EU user consent policy for EEA and UK visitors."
        : "Google's EU user consent policy requires a CMP from its certified list for EEA and UK traffic. This one may well be on that list — the list is Google's and changes — so confirm it rather than assume it.",
      certified ? null : "Check this vendor against Google's certified CMP list, and switch if it is not on it.",
      certified ? 0 : 3
    );
  } else if (consent.tcfApi) {
    add(
      "warning",
      "Policy",
      "A consent framework is running, vendor unrecognised",
      "The IAB TCF API is on the page, so something is collecting consent, but not a platform we recognise. Google requires a CMP from its own certified list for EEA and UK visitors.",
      "Confirm the CMP is on Google's certified list.",
      3
    );
  } else if (truncated) {
    add(
      "warning",
      "Policy",
      "Could not confirm a consent platform",
      "Nothing on the part of the page we read is collecting consent, but the document was cut short. Serving personalised ads to EEA or UK visitors requires a Google-certified consent platform.",
      "Confirm a certified CMP is installed — Google's own Funding Choices is free.",
      4
    );
  } else {
    add(
      "critical",
      "Policy",
      "No consent platform on the page",
      "Serving personalised ads to visitors in the EEA or the UK requires a Google-certified consent platform. Nothing on this page is asking, so those impressions are either non-personalised at a fraction of the rate, or a policy problem.",
      "Install a certified CMP — Google's own Funding Choices is free — before serving ads to EEA or UK traffic.",
      8
    );
  }

  risk(5);
  const trust = ["contact", "about"].filter((k) => pages[k]);
  if (trust.length === 2) {
    add("good", "Policy", "About and contact pages linked", "The site reads as a real business.", null, 0);
  } else {
    const missing = ["contact", "about"].filter((k) => !pages[k]);
    add(
      "warning",
      "Policy",
      `No ${missing.join(" or ")} page linked`,
      `Reviewers weigh whether a site belongs to somebody identifiable. A site with no way to reach its owner reads as built for ads rather than for readers.${truncated ? " This page was cut short before the footer, so check it is not simply linked further down." : ""}`,
      `Add ${missing.length === 2 ? "an about page and a contact page" : `a ${missing[0]} page`} and link ${missing.length === 2 ? "them" : "it"} from the footer.`,
      missing.length === 2 ? 5 : 2
    );
  }

  // — Setup: what is already wired up. —
  if (ads.loader || ads.slots || ads.clients.length) {
    if (ads.loader && ads.slots === 0) {
      risk(4);
      add(
        "good",
        "Setup",
        "AdSense loaded, running Auto ads",
        `The loader is present with no manual slots on the page${ads.clients.length ? ` (${ads.clients.join(", ")})` : ""}, which is how Auto ads works — Google picks the placements.`,
        null,
        0
      );
    } else if (ads.slots > 0 && !ads.loader) {
      risk(16);
      add(
        "critical",
        "Setup",
        `${ads.slots} ad slot${ads.slots === 1 ? "" : "s"} on the page, but no AdSense script`,
        "The <ins> elements are there and the loader that fills them is not, so every one of those slots renders as empty space. This earns nothing and looks broken.",
        "Load adsbygoogle.js on the page, or remove the slots until you do.",
        16
      );
      blocks(50);
    } else {
      risk(4);
      add(
        "good",
        "Setup",
        `AdSense wired up — ${ads.slots} slot${ads.slots === 1 ? "" : "s"}`,
        `Loader present${ads.clients.length ? ` for ${ads.clients.join(", ")}` : ""}.`,
        null,
        0
      );
    }

    if (ads.slots > 0 && wordCount > 0) {
      risk(10);
      const perSlot = Math.round(wordCount / ads.slots);
      if (perSlot < T.wordsPerSlot) {
        add(
          "critical",
          "Setup",
          `${ads.slots} ad slots against ~${wordCount} words`,
          `That is roughly ${perSlot} words per ad. Programme policy prohibits pages where the advertising outweighs the content, and this is the shape of page that gets an account limited rather than a warning.`,
          "Cut slots or add content until each ad sits inside something worth reading.",
          10
        );
        blocks(55);
      } else {
        add("good", "Setup", `~${perSlot} words per ad slot`, "Content outweighs the advertising.", null, 0);
      }
    }
  } else {
    risk(4);
    add(
      "warning",
      "Setup",
      "No AdSense code on this page",
      ads.verificationMeta
        ? "The site verification meta tag is present but no ad code is loaded, so nothing can serve yet."
        : "Nothing is loaded yet — which is the right order. Get the checks above green first, then add the code.",
      "Add the AdSense code once the eligibility and policy items are clear.",
      2
    );
  }

  if (ads.otherNetworks.length) {
    add(
      "good",
      "Setup",
      `Already running ${ads.otherNetworks.join(", ")}`,
      "AdSense can sit alongside most other networks, but check the terms of the one you have before adding a second.",
      null,
      0
    );
  }

  const penalty = findings.reduce((sum, f) => sum + (f.weight || 0), 0);
  const normalised = maxPenalty > 0 ? Math.round(100 * (1 - penalty / maxPenalty)) : 100;
  // Same rule as the main score: this section's own label already reads "Not
  // ready" the moment there is a blocking item, so the number has to agree.
  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const score = Math.max(SCORE_FLOOR, Math.min(ceiling, criticalCeiling(criticalCount), normalised));

  const order = { critical: 0, warning: 1, good: 2 };
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    score,
    counts: {
      critical: findings.filter((f) => f.severity === "critical").length,
      warning: findings.filter((f) => f.severity === "warning").length,
      good: findings.filter((f) => f.severity === "good").length,
    },
    findings: sorted.map(({ weight, ...rest }) => rest),
    stats: {
      installed: ads.loader,
      slots: ads.slots,
      clients: ads.clients,
      verificationMeta: ads.verificationMeta,
      otherNetworks: ads.otherNetworks,
      adsTxt: adsTxt?.exists
        ? {
            exists: true,
            records: adsTxtParsed.records.length,
            googlePubIds: adsTxtParsed.googlePubIds,
            malformed: adsTxtParsed.malformed,
          }
        : { exists: false, records: 0, googlePubIds: [], malformed: 0 },
      consent: consent.vendors.length ? consent.vendors : consent.tcfApi ? ["Unrecognised TCF platform"] : [],
      policyPages: pages,
      pageCount,
      wordCount,
      wordsPerSlot: ads.slots > 0 ? Math.round(wordCount / ads.slots) : null,
    },
    // Said plainly, because the alternative is implying a verdict this cannot
    // reach. Approval turns on a human reading the content.
    notes: [
      "Approval is a human review of your content. Nothing measurable from outside can promise it — this checks the mechanical requirements only.",
      "What the content is about is not judged here. Google's prohibited-content rules cover things a fetch cannot assess.",
      ...(truncated
        ? [`This page is over ${htmlKb} KB and was read only as far as our limit, so anything in the last part of it may have been missed.`]
        : []),
    ],
  };
}
