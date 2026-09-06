// lib/officialSources.js — the key-free sources (RDAP, Certificate
// Transparency, SEC EDGAR) plus honest degradation for the ones that need a
// key. Run with:
//   node --no-warnings --import ./tests/_register.mjs tests/officialsources.test.mjs
// Note: plain `node` does not load .env.local, so COMPANIES_HOUSE_API_KEY and
// OPENCORPORATES_API_KEY are absent here by construction — which is exactly
// the "not configured" path under test.
import { suite, test, eq, truthy, report } from "./_harness.mjs";
import { rdapDomain, certificateHistory, secFiler, companiesHouse, openCorporates, officialProfile } from "../lib/officialSources.js";

suite("lib/officialSources.js");

// ---------------------------------------------------------------------------
// RDAP — no key.
// ---------------------------------------------------------------------------
await test("rdapDomain returns real registration facts for a known domain", async () => {
  const r = await rdapDomain("example.com");
  eq(r.source, "RDAP", "source");
  if (!r.ok) throw new Error(`RDAP unavailable: ${r.reason}`);
  truthy(r.registeredAt, "registeredAt");
  if (!(new Date(r.registeredAt).getFullYear() > 1990)) throw new Error(`implausible registration date ${r.registeredAt}`);
  if (typeof r.ageYears !== "number" || r.ageYears <= 0) throw new Error(`ageYears = ${r.ageYears}`);
  eq(r.registrantIdentity, "redacted by the registry; not requested", "registrant disclosure note");
  eq(typeof r.countryReliable, "boolean", "countryReliable");
  if (r.registrantCountry === null && r.countryReliable !== false) throw new Error("null country not marked unreliable");
  return `registered ${String(r.registeredAt).slice(0, 10)}, ${r.ageYears}y, registrar ${r.registrar}`;
});

await test("rdapDomain never returns personal registrant data", async () => {
  const r = await rdapDomain("iana.org");
  const blob = JSON.stringify(r).toLowerCase();
  for (const leak of ["email", "phone", "\"tel\"", "street", "postal"]) {
    if (blob.includes(leak)) throw new Error(`RDAP result contains "${leak}": ${blob.slice(0, 300)}`);
  }
  return "company-level fields only";
});

await test("rdapDomain degrades honestly on a domain that does not exist", async () => {
  const r = await rdapDomain("this-domain-does-not-exist-madbot-91827.com");
  eq(r.ok, false, "ok");
  eq(r.source, "RDAP", "source");
  truthy(typeof r.reason === "string" && r.reason.length, "reason string");
  if ("registeredAt" in r || "ageYears" in r) throw new Error(`fabricated fields on a failed lookup: ${JSON.stringify(r)}`);
  return `ok:false, reason "${r.reason}"`;
});

await test("rdapDomain degrades rather than throwing on junk input", async () => {
  for (const junk of ["", "   ", "not a domain at all", "../../etc/passwd", "a".repeat(300)]) {
    const r = await rdapDomain(junk);
    if (typeof r?.ok !== "boolean") throw new Error(`${JSON.stringify(junk)} -> ${JSON.stringify(r)}`);
    if (r.ok === true) throw new Error(`${JSON.stringify(junk)} was reported as a successful lookup: ${JSON.stringify(r).slice(0, 200)}`);
  }
  return "5 junk inputs, all ok:false";
});

// ---------------------------------------------------------------------------
// Certificate Transparency — no key, two providers.
// ---------------------------------------------------------------------------
await test("certificateHistory returns a real CT estate or says plainly that it could not", async () => {
  const r = await certificateHistory("iana.org");
  eq(r.source, "Certificate Transparency", "source");
  if (!r.ok) {
    truthy(r.reason, "reason");
    if (!/unknown, not zero/i.test(r.note || "")) throw new Error(`failure note does not warn against reading it as zero: ${r.note}`);
    if ("certificateCount" in r || "distinctHostnames" in r) throw new Error("failure result still carries counts");
    return `both providers down — ok:false, reason "${String(r.reason).slice(0, 70)}", note present`;
  }
  truthy(r.provider, "provider");
  if (!(r.certificateCount > 0)) throw new Error(`ok:true with certificateCount ${r.certificateCount}`);
  if (!(r.distinctHostnames > 0)) throw new Error(`ok:true with distinctHostnames ${r.distinctHostnames}`);
  if (!Array.isArray(r.hostnames)) throw new Error("hostnames is not an array");
  if (r.hostnames.some((h) => h.startsWith("*."))) throw new Error("wildcard prefix not stripped from hostnames");
  if (typeof r.activeChange !== "boolean") throw new Error("activeChange is not boolean");
  if (r.issuedLast30Days > r.certificateCount) throw new Error(`issuedLast30Days ${r.issuedLast30Days} > certificateCount ${r.certificateCount}`);
  eq(r.activeChange, r.issuedLast30Days >= 3, "activeChange matches its own rule");
  return `${r.provider}: ${r.certificateCount} certs, ${r.distinctHostnames} hostnames, ${r.issuedLast30Days} in 30d`;
});

await test("certificateHistory degrades honestly for a domain with no certificates", async () => {
  const r = await certificateHistory("this-domain-does-not-exist-madbot-91827.com");
  if (r.ok) {
    if (r.certificateCount > 0) throw new Error(`claims ${r.certificateCount} certificates for a non-existent domain`);
    return "ok:true with zero rows";
  }
  truthy(r.reason, "reason");
  truthy(r.note, "note distinguishing unknown from zero");
  return `ok:false, "${String(r.reason).slice(0, 80)}"`;
});

// ---------------------------------------------------------------------------
// SEC EDGAR — no key, but a declared User-Agent.
// ---------------------------------------------------------------------------
await test("secFiler finds a real public filer", async () => {
  const r = await secFiler("Apple Inc");
  eq(r.source, "SEC EDGAR", "source");
  if (!r.ok) throw new Error(`SEC unavailable: ${r.reason}`);
  if (!r.found) throw new Error(`"Apple Inc" not matched in company_tickers.json`);
  eq(r.ticker, "AAPL", "ticker");
  eq(r.publiclyListed, true, "publiclyListed");
  truthy(r.sourceUrl?.startsWith("https://www.sec.gov/"), "sourceUrl");
  return `${r.registeredName} (${r.ticker}, CIK ${r.cik})`;
});

await test("secFiler returns a clean not-found for a private company", async () => {
  const r = await secFiler("Stripe");
  eq(r.ok, true, "ok");
  eq(r.found, false, "found");
  if ("ticker" in r || "cik" in r) throw new Error(`not-found result carries filer fields: ${JSON.stringify(r)}`);
  return "ok:true, found:false";
});

await test("secFiler refuses a name too short to match rather than guessing", async () => {
  for (const n of ["", null, undefined, "ab"]) {
    const r = await secFiler(n);
    eq(r.ok, false, `ok for ${JSON.stringify(n)}`);
    eq(r.reason, "no company name", `reason for ${JSON.stringify(n)}`);
  }
  return "4 short/absent names refused without a network call";
});

// ---------------------------------------------------------------------------
// Key-gated sources — must report a missing key as configuration, not error.
// ---------------------------------------------------------------------------
await test("companiesHouse reports a missing key as 'not configured' with instructions", async () => {
  if (process.env.COMPANIES_HOUSE_API_KEY) throw new Error("a key is set in this process — cannot test the unconfigured path");
  const r = await companiesHouse("Monzo Bank Limited");
  eq(r.ok, false, "ok");
  eq(r.reason, "not configured", "reason");
  truthy(r.howTo && /COMPANIES_HOUSE_API_KEY/.test(r.howTo), "howTo names the env var");
  if ("registeredName" in r || "companyNumber" in r) throw new Error("fabricated registry fields with no key");
  return `"${r.reason}" — ${r.howTo.slice(0, 60)}...`;
});

await test("openCorporates reports a missing key as 'not configured' with instructions", async () => {
  if (process.env.OPENCORPORATES_API_KEY) throw new Error("a key is set in this process — cannot test the unconfigured path");
  const r = await openCorporates("Monzo Bank Limited", "gb");
  eq(r.ok, false, "ok");
  eq(r.reason, "not configured", "reason");
  truthy(r.howTo && /OPENCORPORATES_API_KEY/.test(r.howTo), "howTo names the env var");
  if ("registeredName" in r) throw new Error("fabricated registry fields with no key");
  return `"${r.reason}"`;
});

// ---------------------------------------------------------------------------
// The aggregate.
// ---------------------------------------------------------------------------
let profile;
await test("officialProfile runs every source and never throws", async () => {
  profile = await officialProfile({ domain: "iana.org", companyName: "Internet Assigned Numbers Authority" });
  for (const k of ["domain", "sources", "contributed", "notConfigured", "observedAt"]) {
    if (!(k in profile)) throw new Error(`missing key "${k}"`);
  }
  for (const k of ["rdap", "certificateTransparency", "sec", "companiesHouse", "openCorporates"]) {
    if (!(k in profile.sources)) throw new Error(`missing source "${k}"`);
    if (typeof profile.sources[k].ok !== "boolean") throw new Error(`source "${k}" has no boolean ok`);
  }
  return `contributed: [${profile.contributed.join(", ")}], notConfigured: [${profile.notConfigured.join(", ")}]`;
});

await test("contributed lists exactly the sources that actually returned data", () => {
  truthy(profile, "profile ran");
  const expected = Object.entries(profile.sources)
    .filter(([, v]) => v.ok && v.found !== false)
    .map(([k]) => k);
  eq(profile.contributed.join(","), expected.join(","), "contributed");
  const overclaim = profile.contributed.filter((k) => !profile.sources[k].ok);
  if (overclaim.length) throw new Error(`claims ${overclaim.join(", ")} contributed while ok:false`);
  return `${profile.contributed.length} contributed`;
});

await test("a key-gated source that never ran is still reported as unconfigured", () => {
  truthy(profile, "profile ran");
  // iana.org is not a .uk domain, so companiesHouse short-circuits to
  // "not a UK company" and never reaches its own missing-key branch.
  const ch = profile.sources.companiesHouse;
  if (ch.reason !== "not configured" && !profile.notConfigured.includes("companiesHouse") && !process.env.COMPANIES_HOUSE_API_KEY) {
    throw new Error(
      `companiesHouse has no key but officialProfile reports reason "${ch.reason}" and leaves it out of notConfigured ` +
        `[${profile.notConfigured.join(", ")}]. The UI cannot tell "switched off" from "not applicable", which is the ` +
        `exact distinction the notConfigured list exists to make.`
    );
  }
  return `notConfigured: [${profile.notConfigured.join(", ")}]`;
});

await test("officialProfile survives junk input without throwing", async () => {
  const r = await officialProfile({ domain: "", companyName: "" });
  if (!r || typeof r !== "object") throw new Error("no result");
  const thrown = Object.entries(r.sources).filter(([, v]) => typeof v?.ok !== "boolean");
  if (thrown.length) throw new Error(`sources without a boolean ok: ${thrown.map(([k]) => k).join(", ")}`);
  if (r.contributed.length) throw new Error(`claims contributions from empty input: ${r.contributed.join(", ")}`);
  return "all sources ok:false, nothing contributed";
});

report();
