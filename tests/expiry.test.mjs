// lib/expiry.js — the daily sweep that stands in for Firestore TTL on the
// free plan. Runs against an in-memory stand-in for the Firestore calls it
// makes, so it needs no database.
//   node --no-warnings --import ./tests/_register.mjs tests/expiry.test.mjs
import { suite, test, eq, truthy, report } from "./_harness.mjs";

const { sweepExpired, EXPIRING } = await import("../lib/expiry.js");

/** Just enough of Firestore: collection().where("expiresAt","<=",t).orderBy().limit(n).select().get(), batch().delete().commit(). */
function fakeDb(data) {
  const store = Object.fromEntries(Object.entries(data).map(([c, rows]) => [c, new Map(rows.map((r, i) => [`${c}-${i}`, r]))]));
  const queries = [];
  const db = {
    store,
    queries,
    collection(name) {
      const rows = store[name] || new Map();
      const q = { name, field: null, op: null, value: null, n: Infinity };
      const chain = {
        where(field, op, value) {
          Object.assign(q, { field, op, value });
          return chain;
        },
        orderBy() {
          return chain;
        },
        limit(n) {
          q.n = n;
          return chain;
        },
        select() {
          return chain;
        },
        async get() {
          queries.push({ ...q });
          if (q.field !== "expiresAt" || q.op !== "<=") throw new Error("unexpected query");
          const docs = [...rows.entries()]
            .filter(([, r]) => r.expiresAt && r.expiresAt <= q.value)
            .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
            .slice(0, q.n)
            .map(([id]) => ({ ref: { name, id } }));
          return { empty: docs.length === 0, size: docs.length, docs };
        },
      };
      return chain;
    },
    batch() {
      const refs = [];
      return {
        delete: (ref) => refs.push(ref),
        commit: async () => refs.forEach((r) => store[r.name].delete(r.id)),
      };
    },
  };
  return db;
}

const NOW = new Date("2026-10-15T00:00:00Z");
const past = (h) => new Date(NOW.getTime() - h * 3_600_000);
const future = (h) => new Date(NOW.getTime() + h * 3_600_000);
const rows = (n, at) => Array.from({ length: n }, () => ({ expiresAt: at }));

suite("lib/expiry.js — sweepExpired");

await test("deletes what has expired and leaves what hasn't", async () => {
  const db = fakeDb({ rateLimits: [...rows(3, past(2)), ...rows(2, future(2))], errorLog: rows(1, past(1)), systemRuns: rows(1, future(24)) });
  const r = await sweepExpired(db, { now: NOW });
  eq(r.deleted.rateLimits, 3, "rateLimits");
  eq(r.deleted.errorLog, 1, "errorLog");
  eq(r.deleted.systemRuns, 0, "systemRuns");
  eq(db.store.rateLimits.size, 2, "the unexpired rows remain");
  eq(r.done, true, "done");
});

await test("works through more than one page", async () => {
  const db = fakeDb({ rateLimits: rows(1000, past(5)), errorLog: [], systemRuns: [] });
  const r = await sweepExpired(db, { now: NOW });
  eq(r.deleted.rateLimits, 1000, "all of them");
  eq(db.store.rateLimits.size, 0, "none left");
  truthy(db.queries.every((q) => q.n <= 400), "pages of at most 400");
});

await test("stops at the cap, says it isn't done, and the next run carries on", async () => {
  const db = fakeDb({ rateLimits: rows(700, past(5)), errorLog: rows(10, past(5)), systemRuns: [] });
  const first = await sweepExpired(db, { now: NOW, maxDeletes: 500 });
  eq(first.total, 500, "capped");
  eq(first.done, false, "not done");
  const second = await sweepExpired(db, { now: NOW, maxDeletes: 500 });
  eq(second.deleted.rateLimits, 200, "the rest of rateLimits");
  eq(second.deleted.errorLog, 10, "then errorLog");
  eq(second.done, true, "done");
});

await test("a row with no expiresAt is never deleted", async () => {
  const db = fakeDb({ rateLimits: [{ count: 3 }, { expiresAt: past(1) }], errorLog: [], systemRuns: [] });
  await sweepExpired(db, { now: NOW });
  eq(db.store.rateLimits.size, 1, "the row without expiresAt stays");
});

await test("the audit log is never in the sweep", () => {
  eq(EXPIRING.includes("adminAudit"), false, "adminAudit");
  eq(EXPIRING.join(","), "rateLimits,errorLog,systemRuns", "exactly these");
});

report();
