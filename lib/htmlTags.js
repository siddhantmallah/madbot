// Linear-time tag scanning for HTML somebody else wrote.
//
// Everything that reads a stranger's page goes through here instead of a
// pattern like <meta[^>]+name=...content=.... Those restart at every "<meta"
// and scan to the end of the document, then backtrack through what they
// scanned: 60 KB of '<meta content="' took 87 seconds for one call, and the
// audit reads 1.2 MB. tests/redos.test.mjs holds every extractor to a budget.
//
// The rules that keep this linear:
//   - a tag runs from "<name" to the next ">", and a tag longer than MAX_TAG is
//     malformed and skipped;
//   - scanning resumes after the tag it just read, so no character is read as
//     part of two tags;
//   - searches only ever move forward, and a "next X after here" answer is
//     remembered, so a thousand openers waiting on one closer find it once;
//   - attributes are read by a character loop, not a regex.

const MAX_TAG = 4096;

/**
 * "Where is the next match at or after `from`?", for searches that only move
 * forward. The answer to one question answers every later question asked from
 * a position before it, which is what stops a run of openers re-scanning the
 * same stretch for the same closer.
 */
function forwardFinder(html, re) {
  let askedFrom = -1;
  let found = -1; // index, or -2 for "nothing after askedFrom"
  let foundEnd = -1;
  return (from) => {
    if (askedFrom >= 0 && from >= askedFrom) {
      if (found === -2) return null;
      if (from <= found) return { index: found, end: foundEnd };
    }
    re.lastIndex = from;
    const m = re.exec(html);
    askedFrom = from;
    found = m ? m.index : -2;
    foundEnd = m ? m.index + m[0].length : -1;
    return m ? { index: found, end: foundEnd } : null;
  };
}

function isSpace(c) {
  return c === " " || c === "\n" || c === "\t" || c === "\r" || c === "\f";
}

/**
 * The attributes of one tag, lowercased names to raw values. The first
 * occurrence of a name wins, as it does in a browser. A bare attribute
 * (`async`) has the value "".
 */
export function parseAttrs(raw) {
  const attrs = {};
  const n = raw.length;
  let i = 1;
  // Past the tag name.
  while (i < n && !isSpace(raw[i]) && raw[i] !== ">" && raw[i] !== "/") i += 1;
  while (i < n) {
    while (i < n && (isSpace(raw[i]) || raw[i] === "/")) i += 1;
    if (i >= n || raw[i] === ">") break;
    const nameStart = i;
    while (i < n && !isSpace(raw[i]) && raw[i] !== "=" && raw[i] !== ">" && raw[i] !== "/") i += 1;
    const name = raw.slice(nameStart, i).toLowerCase();
    if (!name) {
      i += 1;
      continue;
    }
    while (i < n && isSpace(raw[i])) i += 1;
    let value = "";
    if (raw[i] === "=") {
      i += 1;
      while (i < n && isSpace(raw[i])) i += 1;
      const q = raw[i];
      if (q === '"' || q === "'") {
        const close = raw.indexOf(q, i + 1);
        const stop = close === -1 ? (raw.endsWith(">") ? n - 1 : n) : close;
        value = raw.slice(i + 1, stop);
        i = close === -1 ? n : close + 1;
      } else {
        const valStart = i;
        while (i < n && !isSpace(raw[i]) && raw[i] !== ">") i += 1;
        value = raw.slice(valStart, i);
      }
    }
    if (!(name in attrs)) attrs[name] = value;
  }
  return attrs;
}

/**
 * Every start tag called `name`, in document order, as
 * { start, end, raw, attrs } where `end` is just past the closing ">".
 *
 * `name` may be an alternation such as "source|video|audio". "<a" never
 * matches "<abbr": a tag name has to be followed by a space, "/" or ">".
 */
export function startTags(html, name, { limit = 20_000 } = {}) {
  const open = new RegExp(`<(?:${name})(?=[\\s/>])`, "gi");
  const nextGt = forwardFinder(html, />/g);
  const out = [];
  let m;
  while (out.length < limit && (m = open.exec(html))) {
    const gt = nextGt(m.index);
    if (!gt) break; // nothing after this can close either
    open.lastIndex = gt.end;
    if (gt.index - m.index > MAX_TAG) continue;
    const raw = html.slice(m.index, gt.end);
    out.push({ start: m.index, end: gt.end, raw, attrs: parseAttrs(raw) });
  }
  return out;
}

/**
 * Every `name` element with what is between its start tag and the next
 * matching end tag, as { start, end, raw, attrs, inner }. `inner` is null when
 * nothing closes it within `maxInner` characters, the same as a pattern with a
 * bounded lazy middle that fails to find its end.
 */
export function elements(html, name, { limit = 20_000, maxInner = Infinity } = {}) {
  const open = new RegExp(`<(?:${name})(?=[\\s/>])`, "gi");
  const nextGt = forwardFinder(html, />/g);
  const nextClose = forwardFinder(html, new RegExp(`</(?:${name})\\s*>`, "gi"));
  const out = [];
  let m;
  while (out.length < limit && (m = open.exec(html))) {
    const gt = nextGt(m.index);
    if (!gt) break;
    open.lastIndex = gt.end;
    if (gt.index - m.index > MAX_TAG) continue;
    const raw = html.slice(m.index, gt.end);
    const close = nextClose(gt.end);
    let inner = null;
    let end = gt.end;
    if (close && close.index - gt.end <= maxInner) {
      inner = html.slice(gt.end, close.index);
      end = close.end;
      open.lastIndex = close.end;
    }
    out.push({ start: m.index, end, raw, attrs: parseAttrs(raw), inner });
  }
  return out;
}

/**
 * Cuts out every block from an opener to its closer, replacing each with a
 * space. An opener with no closer after it is left in place, as the patterns
 * this replaces left it.
 */
export function removeBlocks(html, openRe, closeRe) {
  const open = new RegExp(openRe.source, "gi");
  const nextClose = forwardFinder(html, new RegExp(closeRe.source, "gi"));
  let out = "";
  let pos = 0;
  let m;
  while ((m = open.exec(html))) {
    const close = nextClose(m.index + m[0].length);
    if (!close) break;
    out += html.slice(pos, m.index) + " ";
    pos = close.end;
    open.lastIndex = close.end;
  }
  return out + html.slice(pos);
}
