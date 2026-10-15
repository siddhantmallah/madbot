// Content worth writing, suggested from what MADBOT has measured. Client-safe
// and pure: computed when the Content screen renders, so it costs nothing and
// is never stale.
//
// Every suggestion traces to a signal, carried in `why`:
//
//   visibility  a buyer question an AI assistant answered without naming you
//   search      a query you already rank on page two for (Search Console)
//   competitor  a page a competitor just published (their snapshot diff)
//   thin        a site with almost nothing for a search engine to rank
//
// No topic is invented to fill the list. A site with none of these signals
// gets no suggestions, and the screen says what would produce some.

import { shortSiteName } from "./seed";

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

/** "/blog/gst-compliance-checklist" → "GST compliance checklist"-ish: the words, capitalised once. */
export function topicFromPath(path) {
  const last = String(path || "")
    .split(/[?#]/)[0]
    .split("/")
    .filter(Boolean)
    .pop();
  if (!last) return null;
  const words = decodeURIComponent(last)
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // A bare id or a one-letter slug is not a topic.
  if (words.length < 6 || /^\d+$/.test(words) || !/[a-z]/i.test(words)) return null;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function normal(title) {
  return String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * The suggestions for one site, most useful first, at most `max`.
 * `existing` is the content already planned or written, so nothing is
 * suggested twice; `dismissed` is site.dismissedSuggestions.
 */
export function suggestContent(site, { competitors = [], search = null, existing = [], max = 8 } = {}) {
  if (!site) return [];
  const name = site.intelligence?.business?.name || shortSiteName(site);
  const dismissed = site.dismissedSuggestions || {};
  const taken = new Set(existing.map((c) => c.suggestionId).filter(Boolean));
  const titles = new Set(existing.map((c) => normal(c.title)));
  const out = [];
  const add = (s) => {
    if (dismissed[s.id] || taken.has(s.id) || titles.has(normal(s.title))) return;
    if (out.some((o) => o.id === s.id || normal(o.title) === normal(s.title))) return;
    out.push(s);
  };

  // 1. Buyer questions an assistant answered without naming the business.
  const v = site.aiVisibility;
  const rivals = (v?.topRivals || []).slice(0, 3).map((r) => r.name).filter(Boolean);
  for (const r of (v?.results || []).filter((x) => !x.skipped && !x.mentioned && x.question)) {
    add({
      id: `sugg-vis-${slug(r.question)}`,
      source: "visibility",
      title: r.question,
      kind: "Answer",
      why: `${v.engineLabel || "An AI assistant"} answered this buyer question without naming ${name}${rivals.length ? `; it named ${rivals.join(", ")}` : ""}.`,
      angle: `Answer "${r.question}" directly and quotably in the first two sentences, as ${name}, then back it up.${rivals.length ? ` Say plainly how ${name} differs from ${rivals.join(", ")}, without disparaging them.` : ""}`,
    });
  }

  // 2. Queries already ranking on page two.
  for (const q of (search?.topQueries || []).filter((x) => x.position > 10 && x.position <= 20 && x.impressions >= 20).sort((a, b) => b.impressions - a.impressions).slice(0, 4)) {
    add({
      id: `sugg-gsc-${slug(q.query)}`,
      source: "search",
      title: q.query.charAt(0).toUpperCase() + q.query.slice(1),
      kind: "Support",
      why: `You rank at position ${q.position.toFixed(1)} for "${q.query}" with ${q.impressions.toLocaleString()} impressions in 28 days: page two, where nobody scrolls.`,
      angle: `Answer "${q.query}" directly near the top, and link to the page that already ranks for it so the two support each other.`,
    });
  }

  // 3. Pages competitors just published.
  for (const c of competitors) {
    let host = "";
    try {
      host = new URL(c.url).hostname.replace(/^www\./, "");
    } catch {
      host = String(c.url || "");
    }
    for (const ch of (c.changes || []).filter((x) => x.kind === "new pages")) {
      const paths = (ch.text.match(/:\s*(.+)$/)?.[1] || "").split(",").map((p) => p.trim()).filter((p) => p.startsWith("/"));
      for (const p of paths) {
        const topic = topicFromPath(p);
        if (!topic) continue;
        add({
          id: `sugg-comp-${slug(host)}-${slug(p)}`,
          source: "competitor",
          title: topic,
          kind: "Support",
          why: `${host} just published ${p}.`,
          angle: `${host} has started covering this (${p}). Research what buyers need on the subject and write ${name}'s own take, from ${name}'s position. Don't copy or reference their page.`,
        });
      }
    }
  }

  // 4. A site too thin to rank for anything gets the one page it most needs.
  const pages = site.intelligence?.structure?.pagesCrawled || 0;
  if (site.intelligence && pages > 0 && pages < 3) {
    add({
      id: "sugg-thin-pillar",
      source: "thin",
      title: `What ${name} does, and who it's for`,
      kind: "Pillar",
      why: `The crawl found ${pages} page${pages === 1 ? "" : "s"} on the site, so there's almost nothing for a search engine to rank or an assistant to quote.`,
      angle: `A complete, plain-language page on what ${name} does, who it's for and the questions buyers ask before choosing, using only what the site says about itself.`,
    });
  }

  return out.slice(0, max);
}
