// Technical buying signals, observed directly from a company's own
// infrastructure.
//
// This is what makes the lead engine defensible rather than another scraped
// database. "Their certificate expires in nine days and nothing is watching it"
// is a reason to make contact this week. It is also:
//
//   - not personal data at all. A certificate, a DNS record and a response
//     header describe a machine, not a person, so none of this engages GDPR.
//   - free. No provider, no API key, no per-record cost.
//   - deterministic. No model involved, so it cannot invent a signal, and the
//     same domain gives the same answer twice.
//   - cheap enough to run on thousands of companies before anything expensive
//     sees a shortlist.
//
// Everything here is what the company publishes to anyone who connects to it.

import tls from "node:tls";
import dnsPromises from "node:dns/promises";
import { assertPublicHost, safeFetch } from "./urlGuard";

const TLS_TIMEOUT_MS = 8000;

/**
 * Reads the live TLS certificate by opening a connection, as a browser would.
 * Nothing is sent — the handshake alone reveals the certificate.
 */
export async function sslProfile(domain) {
  await assertPublicHost(domain);

  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };

    const socket = tls.connect(
      {
        host: domain,
        port: 443,
        servername: domain,
        // Inspect certificates a browser would reject too — an expired or
        // mismatched cert is the most valuable signal there is.
        rejectUnauthorized: false,
      },
      () => {
        const cert = socket.getPeerCertificate(false);
        const protocol = socket.getProtocol?.() || null;
        socket.destroy();

        if (!cert || !cert.valid_to) return done({ ok: false, reason: "no certificate presented" });

        const validTo = new Date(cert.valid_to);
        const validFrom = new Date(cert.valid_from);
        const now = Date.now();
        const day = 86400000;
        const lifetimeDays = Math.round((validTo.getTime() - validFrom.getTime()) / day);

        // Subject Alternative Names show how large the estate is — a cert
        // covering forty hostnames is a different problem from one.
        const sans = String(cert.subjectaltname || "")
          .split(",")
          .map((s) => s.trim().replace(/^DNS:/, ""))
          .filter(Boolean);

        done({
          ok: true,
          issuer: cert.issuer?.O || cert.issuer?.CN || null,
          validFrom: validFrom.toISOString(),
          validTo: validTo.toISOString(),
          daysToExpiry: Math.floor((validTo.getTime() - now) / day),
          expired: validTo.getTime() < now,
          // A certificate issued in the last fortnight usually means a launch,
          // a migration, or a renewal someone did by hand.
          daysSinceIssued: Math.floor((now - validFrom.getTime()) / day),
          lifetimeDays,
          sanCount: sans.length,
          wildcard: sans.some((s) => s.startsWith("*.")),
          // Short-lived certs imply automated renewal; a one-year cert usually
          // means somebody has to remember.
          likelyAutomated: lifetimeDays <= 100,
          protocol,
          observedAt: new Date().toISOString(),
        });
      }
    );

    socket.setTimeout(TLS_TIMEOUT_MS, () => {
      socket.destroy();
      done({ ok: false, reason: "TLS handshake timed out" });
    });
    socket.on("error", (err) => {
      socket.destroy();
      done({ ok: false, reason: String(err?.message || err).slice(0, 120) });
    });
  });
}

/** Response headers — how carefully a site is run, and which gaps exist. */
export async function headerProfile(domain) {
  try {
    await assertPublicHost(domain);
    const res = await fetch(`https://${domain}`, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "MADBOTBot/1.0 (+https://getmadbot.com)" },
      signal: AbortSignal.timeout(8000),
    });
    const h = (k) => res.headers.get(k);
    const basics = ["strict-transport-security", "content-security-policy", "x-frame-options", "referrer-policy", "x-content-type-options"];
    return {
      ok: true,
      status: res.status,
      server: h("server") || null,
      poweredBy: h("x-powered-by") || null,
      hsts: !!h("strict-transport-security"),
      csp: !!h("content-security-policy"),
      // A count of the basics present, so it can be scored without pretending
      // to be a security audit.
      securityHeaderCount: basics.filter((k) => h(k)).length,
      observedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err).slice(0, 120) };
  }
}

/**
 * DNS facts. Mail and nameserver providers show how a company runs itself and
 * are a reasonable proxy for size and sophistication.
 */
export async function dnsProfile(domain) {
  try {
    await assertPublicHost(domain);
    const [mx, ns, txt] = await Promise.allSettled([
      dnsPromises.resolveMx(domain),
      dnsPromises.resolveNs(domain),
      dnsPromises.resolveTxt(domain),
    ]);
    const val = (r) => (r.status === "fulfilled" ? r.value : []);

    const mxHosts = val(mx).map((m) => m.exchange.toLowerCase());
    const out = {
      ok: true,
      hasMail: mxHosts.length > 0,
      mailProvider:
        mxHosts.some((h) => /google/.test(h)) ? "Google Workspace"
        : mxHosts.some((h) => /outlook|microsoft/.test(h)) ? "Microsoft 365"
        : mxHosts.some((h) => /zoho/.test(h)) ? "Zoho"
        : mxHosts.length ? "other" : null,
      nameserver: (val(ns)[0] || "").toLowerCase().split(".").slice(-2).join(".") || null,
      hasSpf: /v=spf1/i.test(val(txt).map((t) => t.join("")).join(" ")),
      hasDmarc: false,
      observedAt: new Date().toISOString(),
    };
    try {
      const dmarc = await dnsPromises.resolveTxt(`_dmarc.${domain}`);
      out.hasDmarc = dmarc.flat().join("").toLowerCase().includes("v=dmarc1");
    } catch {
      // No DMARC record is itself the signal.
    }
    return out;
  } catch (err) {
    return { ok: false, reason: String(err?.message || err).slice(0, 120) };
  }
}

/**
 * What the site is built with, and whether monitoring is visibly in use. The
 * absence of it is the gap a monitoring product sells into.
 */
export async function techProfile(domain) {
  try {
    const res = await safeFetch(`https://${domain}`, { timeoutMs: 9000, capBytes: 400_000 });
    if (!res?.ok || !res.body) return { ok: false, reason: `returned ${res?.status || "nothing"}` };
    const html = res.body;
    const has = (re) => re.test(html);
    return {
      ok: true,
      stack:
        has(/wp-content|wp-includes/i) ? "WordPress"
        : has(/_next\/static|__NEXT_DATA__/) ? "Next.js"
        : has(/cdn\.shopify\.com/i) ? "Shopify"
        : has(/webflow/i) ? "Webflow"
        : has(/squarespace/i) ? "Squarespace"
        : has(/wixstatic|wix\.com/i) ? "Wix"
        : null,
      analytics: has(/googletagmanager|google-analytics|plausible|fathom|posthog|matomo/i),
      monitoring: {
        statusPage: has(/statuspage\.io|betteruptime|instatus|status\.io/i),
        errorTracking: has(/sentry|bugsnag|rollbar|datadog|newrelic/i),
        uptime: has(/pingdom|uptimerobot|freshping/i),
      },
      hasPricingPage: has(/href=["'][^"']*\/pricing/i),
      hasCareers: has(/href=["'][^"']*(careers|jobs|hiring)/i),
      observedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err).slice(0, 120) };
  }
}

/**
 * Whether a status page exists at a conventional subdomain.
 *
 * Grepping the homepage for a third-party status widget misses every company
 * that self-hosts, and stripe.com is the obvious example — it runs
 * status.stripe.com and my homepage check reported it as having no monitoring
 * at all. Presenting that as a reason to make contact would be a fabricated
 * signal, so the subdomains get checked directly.
 */
export async function statusPageProbe(domain) {
  const hosts = [`status.${domain}`, `uptime.${domain}`, `health.${domain}`];
  for (const host of hosts) {
    try {
      await assertPublicHost(host);
    } catch {
      // Doesn't resolve — try the next.
      continue;
    }
    try {
      const res = await fetch(`https://${host}`, {
        method: "HEAD",
        redirect: "follow",
        headers: { "User-Agent": "MADBOTBot/1.0 (+https://getmadbot.com)" },
        signal: AbortSignal.timeout(6000),
      });
      if (res.status < 400) return { found: true, host, status: res.status };
    } catch {
      // Resolves but won't serve; not evidence either way.
    }
  }
  return { found: false };
}

/**
 * Everything observable about one company's infrastructure, in one pass. The
 * four probes are independent so they run concurrently — this stage has to be
 * fast enough to run on thousands.
 */
export async function observeCompany(domain) {
  const [ssl, headers, dns, tech, statusPage] = await Promise.all([
    sslProfile(domain).catch((e) => ({ ok: false, reason: String(e?.message || e).slice(0, 120) })),
    headerProfile(domain),
    dnsProfile(domain),
    techProfile(domain),
    statusPageProbe(domain),
  ]);
  return { domain, ssl, headers, dns, tech, statusPage, observedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Three separate numbers, because they answer different questions and blending
 * them hides the useful one.
 *
 *   fit      — is this the kind of company that buys this at all?
 *   intent   — is there evidence they have the problem now?
 *   urgency  — is there a clock running?
 *
 * A perfect fit with no urgency is a next-quarter conversation. A mediocre fit
 * with a certificate expiring on Friday is a call today. One combined score
 * cannot express that difference, which is why the old single score was worse
 * than useless for deciding what to do first.
 *
 * Every point carries the observation that produced it, so the score can always
 * be read rather than trusted.
 */
export function scoreOpportunity({ observation, productSignals = {} }) {
  const reasons = [];
  const buckets = { fit: [], intent: [], urgency: [] };

  const add = (bucket, points, label, detail) => {
    buckets[bucket].push(points);
    reasons.push({ bucket, points, label, detail });
  };

  const { ssl, headers, dns, tech, statusPage } = observation || {};

  // ---- fit: the shape of the organisation ----
  if (tech?.ok && tech.stack) add("fit", 10, `Runs ${tech.stack}`, "An identifiable stack, so the site is actively maintained");
  if (dns?.ok && dns.mailProvider) add("fit", 10, `${dns.mailProvider} for mail`, "A managed mail provider means a real operation, not a parked domain");
  if (tech?.ok && tech.hasPricingPage) add("fit", 10, "Publishes pricing", "Sells commercially rather than by enquiry only");
  if (tech?.ok && tech.hasCareers) add("fit", 8, "Hiring publicly", "Growing, and has budget");
  if (ssl?.ok && ssl.sanCount > 10) add("fit", 12, `Certificate covers ${ssl.sanCount} hostnames`, "A large estate, so more to manage");
  if (dns?.ok && dns.nameserver) add("fit", 4, `DNS at ${dns.nameserver}`, "Infrastructure managed somewhere identifiable");

  // ---- intent: evidence of the specific problem ----
  if (productSignals.monitoring && tech?.ok) {
    const m = tech.monitoring || {};
    const anyStatusPage = m.statusPage || m.uptime || statusPage?.found;
    if (anyStatusPage) {
      // Worth recording as a negative: they already care about this, which
      // changes the pitch from "you have a gap" to "you have a tool".
      add("fit", 6, `Runs a status page${statusPage?.host ? ` at ${statusPage.host}` : ""}`, "Already invests in uptime visibility, so the problem is understood");
    } else {
      add("intent", 25, "No status page found", `Checked the homepage and status./uptime./health.${observation.domain} — nothing responded`);
    }
    if (!m.errorTracking) add("intent", 8, "No error tracking detected on the homepage", "Not conclusive — it may be loaded later or self-hosted");
  }
  if (productSignals.certificates && ssl?.ok) {
    if (!ssl.likelyAutomated) add("intent", 22, `Certificate has a ${ssl.lifetimeDays}-day lifetime`, "Long-lived certificates are usually renewed by hand, and that is what gets forgotten");
    if (ssl.sanCount > 5) add("intent", 10, `${ssl.sanCount} hostnames on one certificate`, "A single renewal is a single point of failure across all of them");
  }
  if (productSignals.security && headers?.ok && headers.securityHeaderCount <= 1) {
    add("intent", 18, `Only ${headers.securityHeaderCount} of 5 basic security headers`, "Security hygiene is visibly incomplete");
  }
  if (productSignals.email && dns?.ok && dns.hasMail && !dns.hasDmarc) {
    add("intent", 20, "Sends mail with no DMARC record", "Their domain can be spoofed and they would have no visibility of it");
  }

  // ---- urgency: the clock ----
  if (ssl?.ok) {
    if (ssl.expired) add("urgency", 45, "Certificate has already expired", "Visitors are seeing a browser warning right now");
    else if (ssl.daysToExpiry <= 14) add("urgency", 40, `Certificate expires in ${ssl.daysToExpiry} days`, "Inside the window where this becomes urgent");
    else if (ssl.daysToExpiry <= 30) add("urgency", 25, `Certificate expires in ${ssl.daysToExpiry} days`, "Approaching renewal");
    if (ssl.daysSinceIssued <= 21) add("urgency", 12, `Certificate issued ${ssl.daysSinceIssued} days ago`, "A recent launch or migration, so decisions are being made now");
  }

  const cap = (arr) => Math.min(100, arr.reduce((a, b) => a + b, 0));
  const fit = cap(buckets.fit);
  const intent = cap(buckets.intent);
  const urgency = cap(buckets.urgency);

  return {
    fit,
    intent,
    urgency,
    // Weighted toward evidence over shape: plenty of companies look right and
    // have no reason to act.
    overall: Math.round(fit * 0.3 + intent * 0.4 + urgency * 0.3),
    reasons: reasons.sort((a, b) => b.points - a.points),
    // Worth stating on the record: nothing above touched a person.
    personalDataUsed: false,
    scoredAt: new Date().toISOString(),
  };
}

/**
 * Which technical signals matter for what this customer sells, derived from the
 * buyer profile rather than configured — a monitoring product and a security
 * product should not be scored the same way.
 */
export function signalsForProduct(profile) {
  const text = `${profile?.sells || ""} ${profile?.buyerType || ""} ${(profile?.sectors || []).join(" ")}`.toLowerCase();
  return {
    certificates: /certificat|ssl|tls|expir|https/.test(text),
    monitoring: /monitor|uptime|observab|status|alert|incident|apm/.test(text),
    security: /security|pentest|vulnerab|compliance|soc ?2|iso ?27001/.test(text),
    email: /email|deliverab|dmarc|spf|phishing|spoof/.test(text),
  };
}
