// Group-scoped robots.txt reading, in one place.
//
// This lived inside lib/audit.js and answered exactly one question about the
// wildcard group. The AdSense readiness check needs the same answer about a
// different agent — Mediapartners-Google, which is what Google uses to read a
// page it is about to place an ad on — so the parser moved here rather than
// being written a second time and drifting.

/**
 * Which groups in this file apply to `agent`, and what each of them disallows.
 *
 * The subtlety worth spelling out, because getting it wrong here cost a real
 * false positive: consecutive `User-agent:` lines form ONE group. So
 *
 *     User-agent: *
 *     User-agent: Mediapartners-Google
 *     Disallow: /private
 *
 * is a single group that both agents belong to, while
 *
 *     User-agent: *
 *     Disallow: /admin
 *
 *     User-agent: BadBot
 *     Disallow: /
 *
 * is two groups, and only the first one is about everybody. An earlier version
 * of this used one regex with a lazy wildcard between the user-agent and the
 * disallow, so the second file above read as "blocks all crawlers", earned a
 * critical finding, a twenty point penalty and the line "Nothing else matters
 * until this is fixed" — on an entirely ordinary robots.txt.
 *
 * The record for the most specific agent wins per the standard, but for the
 * only question asked of this — is everything shut out — the union of the
 * groups that apply is the honest reading: any of them saying `Disallow: /`
 * means that agent is excluded somewhere it matters.
 */
export function robotsGroups(body) {
  const groups = [];
  let current = null;
  let sawAgentLine = false;

  for (const raw of String(body || "").split("\n")) {
    // trim() also drops a trailing carriage return on CRLF files.
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "user-agent") {
      // A user-agent line after a directive starts a new group; one that
      // follows another user-agent line joins the group being opened.
      if (!sawAgentLine || !current) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      sawAgentLine = true;
      current.agents.push(value.toLowerCase());
      continue;
    }

    sawAgentLine = false;
    if (!current) continue;
    if (key === "disallow") current.disallow.push(value);
    else if (key === "allow") current.allow.push(value);
  }

  return groups;
}

/** Does any group that covers `agent` shut it out of the whole site? */
export function disallowsEverything(body, agent = "*") {
  const want = String(agent).toLowerCase();
  return robotsGroups(body).some((g) => {
    const applies = g.agents.includes("*") || g.agents.includes(want);
    if (!applies) return false;
    // An Allow of "/" alongside the blanket Disallow is the conventional way
    // to carve the root back out, and the longest-match rule makes it win.
    if (g.allow.includes("/")) return false;
    return g.disallow.includes("/");
  });
}

/** Does a group name this agent specifically, rather than only via `*`? */
export function namesAgent(body, agent) {
  const want = String(agent).toLowerCase();
  return robotsGroups(body).some((g) => g.agents.includes(want));
}

export function sitemapsIn(body) {
  return String(body || "")
    .split("\n")
    .map((l) => l.split("#")[0].trim())
    .filter((l) => /^sitemap\s*:/i.test(l))
    .map((l) => l.slice(l.indexOf(":") + 1).trim())
    .filter(Boolean);
}
