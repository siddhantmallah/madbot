// Turning measurements into work: what each opportunity starts, the content
// MADBOT suggests and from what, which directories a business sees, and the
// Indian registry name matching. No network: GLEIF is answered by a stub.
//   node --no-warnings --import ./tests/_register.mjs tests/workFromData.test.mjs
import { suite, test, eq, truthy, report } from "./_harness.mjs";

const O = await import("../lib/opportunities.js");
const C = await import("../lib/contentSuggestions.js");
const L = await import("../lib/listings.js");
const S = await import("../lib/officialSources.js");

suite("actionFor — what taking an opportunity starts");

await test("page-level fixes are drafted, content gaps are written, server work goes on the list", () => {
  eq(O.actionFor({ id: "audit-no-meta-description", source: "audit", area: "Foundations", title: "No meta description" }).kind, "fix", "meta");
  eq(O.actionFor({ id: "audit-no-structured-data-at-all", source: "audit", area: "AI & structured data", title: "No structured data at all" }).kind, "fix", "schema");
  eq(O.actionFor({ id: "audit-no-open-graph-tags", source: "audit", area: "Sharing", title: "No Open Graph tags" }).kind, "fix", "og");
  eq(O.actionFor({ id: "audit-site-is-one-page", source: "audit", area: "Content", title: "The site is one page" }).kind, "content", "thin site");
  eq(O.actionFor({ id: "audit-not-served-over-https", source: "audit", area: "Security", title: "Not served over HTTPS" }).kind, "checklist", "https");
  eq(O.actionFor({ id: "audit-slow", source: "audit", area: "Performance", title: "Slow to respond" }).kind, "checklist", "speed");
  eq(O.actionFor({ id: "vis-absent", source: "visibility" }).kind, "content", "never named");
  eq(O.actionFor({ id: "vis-uncited", source: "visibility" }).kind, "checklist", "never linked");
  eq(O.actionFor({ id: "gsc-p2-crm-software", source: "search" }).kind, "content", "page two");
  eq(O.actionFor({ id: "gsc-noclick-crm", source: "search" }).kind, "fix", "no clicks");
  eq(O.actionFor({ id: "comp-schema-rival-com", source: "competitor" }).kind, "fix", "their schema");
  eq(O.actionFor(null).kind, "checklist", "nothing");
});

await test("a visibility brief is the real question that missed, with the rivals named instead", () => {
  const site = {
    url: "https://acme.in",
    intelligence: { business: { name: "Acme" } },
    aiVisibility: {
      engineLabel: "Claude",
      topRivals: [{ name: "Rival One" }, { name: "Rival Two" }],
      results: [
        { question: "Who sells GST software in Pune?", mentioned: false },
        { question: "Best invoicing tool for small shops?", mentioned: true },
        { question: "Skipped one", skipped: true },
      ],
    },
  };
  const b = O.briefFor({ id: "vis-absent", source: "visibility", title: "Claude never names you" }, site);
  eq(b.title, "Who sells GST software in Pune?", "title is the missed question");
  eq(b.kind, "Answer", "kind");
  truthy(b.angle.includes("Rival One") && b.angle.includes("Acme"), b.angle);
  truthy(!b.angle.includes("Best invoicing"), "a question that named them isn't in the brief");
});

suite("suggestContent — only from measured signals");

await test("no signals, no suggestions", () => {
  eq(C.suggestContent({ url: "https://a.com", intelligence: { structure: { pagesCrawled: 20 } } }).length, 0, "none invented");
});

await test("missed questions, page-two queries and competitors' new pages each produce a suggestion that says why", () => {
  const site = {
    url: "https://acme.in",
    intelligence: { business: { name: "Acme" }, structure: { pagesCrawled: 12 } },
    aiVisibility: { engineLabel: "Claude", results: [{ question: "Which CRM suits a Pune clinic?", mentioned: false }] },
  };
  const out = C.suggestContent(site, {
    search: { topQueries: [{ query: "clinic crm india", position: 13.2, impressions: 140, clicks: 1 }, { query: "acme login", position: 1, impressions: 900, clicks: 400 }] },
    competitors: [{ url: "https://www.rival.com", changes: [{ kind: "new pages", text: "Added 2 pages: /blog/clinic-billing-guide, /p/123" }] }],
  });
  eq(out.map((s) => s.source).join(","), "visibility,search,competitor", "one of each");
  eq(out[1].title, "Clinic crm india", "the query");
  eq(out[2].title, "Clinic billing guide", "topic from the path; the numeric one is dropped");
  truthy(out.every((s) => s.why && s.angle), "each says why");
});

await test("dismissed and already-planned suggestions don't come back", () => {
  const site = {
    url: "https://acme.in",
    intelligence: { structure: { pagesCrawled: 12 } },
    aiVisibility: { results: [{ question: "Q one?", mentioned: false }, { question: "Q two?", mentioned: false }] },
    dismissedSuggestions: { "sugg-vis-q-one": true },
  };
  const out = C.suggestContent(site, { existing: [{ title: "Q two?" }] });
  eq(out.length, 0, "one dismissed, one already planned");
});

await test("a thin site gets the one page it most needs", () => {
  const out = C.suggestContent({ url: "https://tiny.in", intelligence: { business: { name: "Tiny" }, structure: { pagesCrawled: 1 } } });
  eq(out.length, 1, "one");
  eq(out[0].source, "thin", "source");
});

suite("directories — the right ones for the business");

await test("a local Indian business sees Google, Justdial and Sulekha, not Product Hunt or Yelp", () => {
  const ids = L.relevantFor({ type: "local", country: "IN" }).map((d) => d.id);
  truthy(["google_business", "justdial", "sulekha"].every((x) => ids.includes(x)), ids.join(","));
  truthy(!ids.includes("product_hunt") && !ids.includes("yelp"), ids.join(","));
});

await test("an Indian manufacturer sees the B2B marketplaces; a US local business sees Yelp instead", () => {
  const mfg = L.relevantFor({ type: "products", country: "IN" }).map((d) => d.id);
  truthy(["indiamart", "tradeindia", "exportersindia"].every((x) => mfg.includes(x)), mfg.join(","));
  const us = L.relevantFor({ type: "local", country: null }).map((d) => d.id);
  truthy(us.includes("yelp") && !us.includes("justdial"), us.join(","));
});

await test("software keeps its software directories", () => {
  const ids = L.relevantFor({ type: "software", country: "IN" }).map((d) => d.id);
  truthy(ids.includes("g2") && ids.includes("capterra") && !ids.includes("justdial"), ids.join(","));
});

await test("every directory's fields have a limit, and unpublished ones say so", () => {
  for (const d of Object.values(L.DIRECTORIES)) {
    for (const [f, spec] of Object.entries(d.fields)) truthy(Number.isInteger(spec.max) && spec.max > 0, `${d.id}.${f}`);
  }
  eq(L.DIRECTORIES.google_business.fields.description.max, 750, "Google's published limit");
  eq(L.DIRECTORIES.justdial.fields.description.confirmed, false, "Justdial's is marked unconfirmed");
});

await test("businessKind reads India from the domain, the currency or the city", () => {
  eq(L.businessKind({ url: "https://a.in", intelligence: { domain: "a.in", business: { category: "Local business" } } }).country, "IN", ".in");
  eq(L.businessKind({ url: "https://a.com", intelligence: { domain: "a.com", commercial: { prices: ["₹1,499"] } } }).country, "IN", "rupees");
  eq(L.businessKind({ url: "https://a.com", intelligence: { domain: "a.com", geography: { locations: ["Pune"] } } }).country, "IN", "city");
  eq(L.businessKind({ url: "https://a.com", intelligence: { domain: "a.com" } }).country, null, "nothing Indian");
});

suite("Indian registries — name matching");

await test("legal suffixes are ignored, but India is part of the name", () => {
  eq(S.bareName("Infosys Limited"), S.bareName("INFOSYS LTD."), "suffixes");
  eq(S.bareName("Acme Pvt. Ltd"), "ACME", "pvt ltd");
  truthy(S.bareName("Stripe India Private Limited") !== S.bareName("Stripe"), "a subsidiary isn't the parent");
});

await test("GLEIF only accepts an exact name match, not the loose search's first hit", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: [
        { attributes: { lei: "L1", entity: { legalName: { name: "RAVI INFOSYS" }, registeredAs: "X", legalAddress: {} } } },
        { attributes: { lei: "L2", entity: { legalName: { name: "INFOSYS LIMITED" }, status: "ACTIVE", registeredAs: "L85110KA1981PLC013115", legalAddress: { city: "BANGALORE" } } } },
      ],
    }),
  });
  try {
    const hit = await S.gleifIndia("Infosys");
    eq(hit.lei, "L2", "the exact match, not the first result");
    eq(hit.cin, "L85110KA1981PLC013115", "the CIN is recognised");
    const miss = await S.gleifIndia("Wipro");
    eq(miss.found, false, "no exact match, no record");
  } finally {
    globalThis.fetch = realFetch;
  }
});

await test("the MCA register says it isn't configured rather than failing", async () => {
  const saved = process.env.DATA_GOV_IN_API_KEY;
  delete process.env.DATA_GOV_IN_API_KEY;
  try {
    const r = await S.mcaIndia({ companyName: "Acme" });
    eq(r.reason, "not configured", "reason");
    truthy(/data\.gov\.in/.test(r.howTo), "says how to switch it on");
  } finally {
    if (saved !== undefined) process.env.DATA_GOV_IN_API_KEY = saved;
  }
});

report();
