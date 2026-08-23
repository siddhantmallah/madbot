// Company facts from official and structured public sources.
//
// These are the sources a company-intelligence layer should be built on: they
// publish deliberately, for reuse, with terms that permit it. That is a
// different thing from a social network whose data happens to be visible.
//
// None of them return personal data about employees. RDAP redacts registrant
// details by default, Certificate Transparency logs certificates, and the
// registries return company records. Directors do appear in some registry data,
// which is why the registry lookups below take only company-level fields.
//
// Three of the four need no key at all, which is deliberate — the foundation
// shouldn't depend on a subscription.

const UA = "MADBOTBot/1.0 (+https://getmadbot.com)";

async function getJson(url, { timeoutMs = 9000, headers = {} } = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const e = new Error(`${res.status}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// RDAP — domain registration. Free, no key, an IETF standard.
// ---------------------------------------------------------------------------

/**
 * Domain registration facts. Registrant identity is redacted by registries as
 * standard and no attempt is made to unmask it — what's useful here is the
 * dates and the registrar, not who owns it.
 *
 * Domain age is a genuine signal: a domain registered three months ago is a new
 * business, and one registered in 2004 is not.
 */
export async function rdapDomain(domain) {
  try {
    const d = await getJson(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
    const event = (name) => d.events?.find((e) => e.eventAction === name)?.eventDate || null;
    const registered = event("registration");
    const registrar = d.entities?.find((e) => (e.roles || []).includes("registrar"));

    // Registrant country is the one entity field worth taking: it decides which
    // data-protection regime applies.
    const registrant = d.entities?.find((e) => (e.roles || []).includes("registrant"));
    const country = vcardField(registrant, "adr")?.[6] || null;

    return {
      ok: true,
      source: "RDAP",
      sourceUrl: `https://rdap.org/domain/${domain}`,
      registeredAt: registered,
      ageYears: registered ? +((Date.now() - new Date(registered).getTime()) / 31557600000).toFixed(1) : null,
      expiresAt: event("expiration"),
      lastChangedAt: event("last changed"),
      registrar: registrar ? vcardField(registrar, "fn") || null : null,
      registrantCountry: country,
      status: d.status || [],
      // Stated so it's clear nothing was inferred about a person.
      registrantIdentity: "redacted by the registry; not requested",
      // Worth flagging: most registries redact the registrant entirely, so a
      // null country here is the normal case rather than a failure. Anything
      // relying on it must treat null as "unknown", not as "not regulated".
      countryReliable: !!country,
    };
  } catch (err) {
    return { ok: false, source: "RDAP", reason: err.status ? `HTTP ${err.status}` : String(err?.message || err).slice(0, 100) };
  }
}

function vcardField(entity, key) {
  const arr = entity?.vcardArray?.[1];
  if (!Array.isArray(arr)) return null;
  const row = arr.find((r) => r[0] === key);
  return row ? row[3] : null;
}

// ---------------------------------------------------------------------------
// Certificate Transparency — every publicly trusted certificate, logged.
// Free, no key.
// ---------------------------------------------------------------------------

/**
 * Certificates issued for a domain, from the public CT logs.
 *
 * Two things make this valuable. It reveals the whole subdomain estate, which
 * is the size signal a homepage can't give you. And because every certificate
 * is logged with its issue date, a burst of new certificates means a launch, a
 * migration, or infrastructure work happening right now.
 *
 * It can also be used the other way round — as a discovery source, finding
 * companies whose certificates were issued recently rather than scoring ones you
 * already have.
 */
/**
 * CertSpotter, as a second CT provider.
 *
 * crt.sh is the obvious choice and was returning 502 for every request —
 * including its own homepage — while this was being built. Depending on one
 * free service for a core signal is a design weakness, so there are two, and
 * "estate size unknown" only happens when both are down.
 */
async function certSpotter(domain) {
  // With subdomains first, because that's the estate-size signal. A very large
  // estate (apple.com has thousands) times out, so fall back to the apex only —
  // a partial answer beats none, and it's labelled as partial.
  const tries = [
    { url: `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names&expand=issuer`, subdomains: true, timeoutMs: 20000 },
    { url: `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&expand=dns_names&expand=issuer`, subdomains: false, timeoutMs: 12000 },
  ];
  let last = null;
  for (const t of tries) {
    try {
      const data = await getJson(t.url, { timeoutMs: t.timeoutMs });
      if (!Array.isArray(data)) throw new Error("unexpected response");
      return {
        rows: data.map((r) => ({
          name_value: (r.dns_names || []).join(" "),
          // CertSpotter gives a full DN like "C=US, O=Let's Encrypt, CN=R3".
          // Wrapping it in another O= made the regex below match "C=US".
          issuer_name: r.issuer?.name || "",
          not_before: r.not_before,
          entry_timestamp: r.not_before,
        })),
        partial: !t.subdomains,
      };
    } catch (err) {
      last = err;
    }
  }
  throw last || new Error("CertSpotter unavailable");
}

export async function certificateHistory(domain) {
  // crt.sh first, CertSpotter as the fallback. The cheaper exact-domain query
  // before the wildcard, since the wildcard is what tips crt.sh over.
  const attempts = [
    `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json&exclude=expired`,
    `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json&exclude=expired`,
  ];
  let rows = null;
  let lastReason = null;
  let provider = "crt.sh";
  for (const url of attempts) {
    try {
      rows = await getJson(url, { timeoutMs: 20000 });
      if (Array.isArray(rows) && rows.length) break;
      rows = null;
      lastReason = "empty result";
    } catch (err) {
      lastReason = err.status ? `HTTP ${err.status}` : String(err?.message || err).slice(0, 80);
    }
  }
  if (!rows) {
    try {
      const cs = await certSpotter(domain);
      rows = cs.rows;
      provider = cs.partial ? "CertSpotter (apex only)" : "CertSpotter";
      if (!rows.length) {
        rows = null;
        lastReason = "no certificates found by either provider";
      }
    } catch (err) {
      lastReason = `crt.sh ${lastReason}; CertSpotter ${err.status ? `HTTP ${err.status}` : String(err?.message || err).slice(0, 60)}`;
    }
  }
  if (!rows) {
    return {
      ok: false,
      source: "Certificate Transparency",
      reason: lastReason || "unavailable",
      // Said plainly so a missing estate size isn't mistaken for a small one.
      note: "Both CT providers were unavailable. Estate size is unknown, not zero — the TLS certificate's own SAN count is a partial substitute.",
    };
  }

  try {

    const names = new Set();
    const issuers = {};
    let newest = null;
    for (const r of rows.slice(0, 800)) {
      String(r.name_value || "")
        .split(/\s+/)
        .filter(Boolean)
        .forEach((n) => names.add(n.toLowerCase().replace(/^\*\./, "")));
      const iss = (r.issuer_name || "").match(/O=([^,]+)/)?.[1] || null;
      if (iss) issuers[iss] = (issuers[iss] || 0) + 1;
      const at = r.entry_timestamp || r.not_before;
      if (at && (!newest || new Date(at) > new Date(newest))) newest = at;
    }

    const day = 86400000;
    const recent = rows.filter((r) => {
      const at = r.entry_timestamp || r.not_before;
      return at && Date.now() - new Date(at).getTime() < 30 * day;
    }).length;

    return {
      ok: true,
      source: "Certificate Transparency",
      provider,
      sourceUrl: provider === "crt.sh" ? `https://crt.sh/?q=%25.${domain}` : `https://api.certspotter.com/v1/issuances?domain=${domain}`,
      certificateCount: rows.length,
      distinctHostnames: names.size,
      // A rough estate-size signal that a single homepage fetch cannot provide.
      hostnames: [...names].slice(0, 25),
      issuers: Object.entries(issuers).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => ({ name, count })),
      newestIssuedAt: newest,
      issuedLast30Days: recent,
      // The buying signal: someone is actively changing infrastructure.
      activeChange: recent >= 3,
    };
  } catch (err) {
    return { ok: false, source: "Certificate Transparency", reason: String(err?.message || err).slice(0, 100) };
  }
}

// ---------------------------------------------------------------------------
// SEC EDGAR — US filers. Free, no key, but requires a declared User-Agent.
// ---------------------------------------------------------------------------

/**
 * Whether a company files with the SEC, and its scale if so.
 *
 * Only meaningful for US public companies, so it returns a clean "not found"
 * for everyone else rather than an error. SEC requires a real User-Agent and
 * rate-limits to 10 requests a second; one lookup per company is well inside
 * that.
 */
export async function secFiler(companyName) {
  if (!companyName || companyName.length < 3) return { ok: false, source: "SEC EDGAR", reason: "no company name" };
  try {
    const data = await getJson("https://www.sec.gov/files/company_tickers.json", {
      timeoutMs: 12000,
      headers: { "User-Agent": `MADBOT/1.0 (getmadbot.com; contact via https://getmadbot.com)` },
    });
    const needle = companyName.toLowerCase().replace(/\b(inc|corp|corporation|ltd|limited|llc|plc|co)\b\.?/g, "").trim();
    const hit = Object.values(data || {}).find((c) => {
      const t = String(c.title || "").toLowerCase();
      return t === needle || t.startsWith(needle + " ") || needle.startsWith(t + " ");
    });
    if (!hit) return { ok: true, source: "SEC EDGAR", found: false };
    return {
      ok: true,
      source: "SEC EDGAR",
      sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${hit.cik_str}`,
      found: true,
      cik: hit.cik_str,
      ticker: hit.ticker,
      registeredName: hit.title,
      // A public filer is a materially different prospect from a private one.
      publiclyListed: true,
    };
  } catch (err) {
    return { ok: false, source: "SEC EDGAR", reason: err.status ? `HTTP ${err.status}` : String(err?.message || err).slice(0, 100) };
  }
}

// ---------------------------------------------------------------------------
// Companies House (UK) and OpenCorporates — need keys.
// ---------------------------------------------------------------------------

/**
 * UK registry data. Needs a free API key from Companies House.
 *
 * Takes company-level fields only. The registry also publishes officers, which
 * is personal data about named individuals — deliberately not requested here,
 * because pulling director names into a sales pipeline is a much bigger step
 * than reading a company's incorporation date, and it should be a separate
 * decision rather than a side effect.
 */
export async function companiesHouse(companyName) {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) {
    return {
      ok: false,
      source: "Companies House",
      reason: "not configured",
      howTo: "Free key from developer.company-information.service.gov.uk, then set COMPANIES_HOUSE_API_KEY.",
    };
  }
  try {
    const auth = Buffer.from(`${key}:`).toString("base64");
    const data = await getJson(
      `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(companyName)}&items_per_page=1`,
      { headers: { Authorization: `Basic ${auth}` } }
    );
    const c = data?.items?.[0];
    if (!c) return { ok: true, source: "Companies House", found: false };
    return {
      ok: true,
      source: "Companies House",
      sourceUrl: `https://find-and-update.company-information.service.gov.uk/company/${c.company_number}`,
      found: true,
      companyNumber: c.company_number,
      registeredName: c.title,
      status: c.company_status,
      incorporatedAt: c.date_of_creation || null,
      registeredCountry: "GB",
      sic: c.sic_codes || [],
      // Recorded so the omission is visible rather than looking like an oversight.
      officersRequested: false,
    };
  } catch (err) {
    return { ok: false, source: "Companies House", reason: err.status ? `HTTP ${err.status}` : String(err?.message || err).slice(0, 100) };
  }
}

/** OpenCorporates covers most jurisdictions but needs a key for API access. */
export async function openCorporates(companyName, jurisdiction) {
  const key = process.env.OPENCORPORATES_API_KEY;
  if (!key) {
    return {
      ok: false,
      source: "OpenCorporates",
      reason: "not configured",
      howTo: "API token from opencorporates.com/api_accounts/new, then set OPENCORPORATES_API_KEY.",
    };
  }
  try {
    const q = new URLSearchParams({ q: companyName, api_token: key, per_page: "1" });
    if (jurisdiction) q.set("jurisdiction_code", jurisdiction.toLowerCase());
    const data = await getJson(`https://api.opencorporates.com/v0.4/companies/search?${q}`);
    const c = data?.results?.companies?.[0]?.company;
    if (!c) return { ok: true, source: "OpenCorporates", found: false };
    return {
      ok: true,
      source: "OpenCorporates",
      sourceUrl: c.opencorporates_url || null,
      found: true,
      registeredName: c.name,
      companyNumber: c.company_number,
      jurisdictionCode: c.jurisdiction_code,
      status: c.current_status,
      incorporatedAt: c.incorporation_date,
      officersRequested: false,
    };
  } catch (err) {
    return { ok: false, source: "OpenCorporates", reason: err.status ? `HTTP ${err.status}` : String(err?.message || err).slice(0, 100) };
  }
}

// ---------------------------------------------------------------------------

/**
 * Every official source that applies, in one pass. Sources that need a key and
 * don't have one report that plainly rather than failing — a missing key is a
 * configuration fact, not an error, and the UI should be able to say which
 * sources are switched on.
 */
export async function officialProfile({ domain, companyName }) {
  const [rdap, ct, sec] = await Promise.all([
    rdapDomain(domain),
    certificateHistory(domain),
    companyName ? secFiler(companyName) : Promise.resolve({ ok: false, source: "SEC EDGAR", reason: "no company name" }),
  ]);

  // Registry lookups run after RDAP, because its registrant country decides
  // which registry is even worth asking.
  const country = rdap.ok ? rdap.registrantCountry : null;
  const [ch, oc] = await Promise.all([
    country === "GB" || String(domain).endsWith(".uk") ? companiesHouse(companyName || domain) : Promise.resolve({ ok: false, source: "Companies House", reason: "not a UK company" }),
    companyName ? openCorporates(companyName, country) : Promise.resolve({ ok: false, source: "OpenCorporates", reason: "no company name" }),
  ]);

  const sources = { rdap, certificateTransparency: ct, sec, companiesHouse: ch, openCorporates: oc };

  return {
    domain,
    sources,
    // Which of them actually contributed, so the UI can be honest about
    // coverage rather than implying all five ran.
    contributed: Object.entries(sources).filter(([, v]) => v.ok && v.found !== false).map(([k]) => k),
    notConfigured: Object.entries(sources).filter(([, v]) => v.reason === "not configured").map(([k]) => k),
    registrantCountry: country,
    observedAt: new Date().toISOString(),
  };
}
