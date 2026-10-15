import { FieldPath } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "../../../../lib/firebaseAdmin";
import { adminRoute, iso, ok, pageOf, pageSize, reply } from "../../../../lib/adminApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function row(authUser, profile) {
  return {
    uid: authUser?.uid || profile?.id,
    email: authUser?.email || profile?.email || null,
    displayName: authUser?.displayName || profile?.displayName || null,
    emailVerified: !!authUser?.emailVerified,
    disabled: !!authUser?.disabled,
    status: profile?.status || (authUser?.disabled ? "suspended" : "active"),
    createdAt: authUser?.metadata?.creationTime || iso(profile?.createdAt),
    lastSignInAt: authUser?.metadata?.lastSignInTime || null,
    orgCount: (profile?.orgIds || []).length,
    inAuth: !!authUser,
  };
}

async function profilesFor(db, uids) {
  if (!uids.length) return new Map();
  const snaps = await db.getAll(...uids.map((u) => db.collection("users").doc(u)));
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, { id: s.id, ...s.data() }]));
}

async function authFor(uids) {
  if (!uids.length) return new Map();
  const out = new Map();
  // getUsers takes at most 100 identifiers per call.
  for (let i = 0; i < uids.length; i += 100) {
    // eslint-disable-next-line no-await-in-loop
    const res = await adminAuth().getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
    res.users.forEach((u) => out.set(u.uid, u));
  }
  return out;
}

/**
 * Users, a page at a time, server-side.
 *
 *   ?q=       an exact address finds that account; anything else is an email
 *             prefix (case-insensitive) over profiles
 *   ?status=  all (default) | suspended | deleted
 *   ?cursor=  from the previous page's `next`
 *
 * With no search and no filter the list is Firebase Auth's own, so an account
 * that never got a profile still shows.
 */
export const GET = adminRoute("platform.users.read", async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const limit = pageSize(searchParams);
  const q = String(searchParams.get("q") || "").trim().toLowerCase().slice(0, 200);
  const status = searchParams.get("status") || "all";
  const cursor = searchParams.get("cursor");
  const db = adminDb();

  if (!["all", "suspended", "deleted"].includes(status)) return reply(400, "Unknown status filter.");

  if (q && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q)) {
    try {
      const u = await adminAuth().getUserByEmail(q);
      const profiles = await profilesFor(db, [u.uid]);
      const r = row(u, profiles.get(u.uid));
      return ok({ users: status === "all" || r.status === status ? [r] : [], next: null });
    } catch {
      return ok({ users: [], next: null });
    }
  }

  if (q || status !== "all") {
    // A prefix search and a status filter together would need a composite
    // index; with a search, the status filter is applied to each page instead,
    // so a filtered search page can come back shorter than the limit.
    let query = db.collection("users");
    if (q) query = query.where("email", ">=", q).where("email", "<", `${q}`).orderBy("email");
    else query = query.where("status", "==", status);
    query = query.orderBy(FieldPath.documentId());
    const { docs, next } = await pageOf(query, {
      limit,
      cursor,
      toCursorValues: (d) => (q ? [d.data().email, d.id] : [d.id]),
    });
    const auth = await authFor(docs.map((d) => d.id));
    const rows = docs.map((d) => row(auth.get(d.id), { id: d.id, ...d.data() }));
    return ok({ users: q && status !== "all" ? rows.filter((r) => r.status === status) : rows, next });
  }

  const page = await adminAuth().listUsers(limit, cursor || undefined);
  const profiles = await profilesFor(db, page.users.map((u) => u.uid));
  return ok({ users: page.users.map((u) => row(u, profiles.get(u.uid))), next: page.pageToken || null });
});
