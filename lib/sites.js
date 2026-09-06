import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";


// A snapshot listener that throws takes the whole page down. Most often this
// is a Firestore rule that hasn't been published for a new collection yet, so
// report it and let the rest of the dashboard keep working.
function onListenerError(err, where) {
  if (typeof console !== "undefined") {
    console.warn(`[madbot] Firestore listener (${where}) stopped: ${err?.code || err?.message || err}`);
  }
}

const DEFAULT_RULES = [
  { id: "r1", text: "Never make a claim I haven't approved." },
  { id: "r2", text: "Never email the same person twice in 30 days." },
  { id: "r3", text: "Ask before anything costs money." },
  { id: "r4", text: "No competitor names in ad copy." },
];

/**
 * The signed-in user's licence. Read-only from the browser by design — the
 * rules refuse client writes to this field, so the UI reflects entitlements
 * rather than deciding them.
 */
export function subscribeSubscription(uid, cb) {
  return onSnapshot(
    doc(db, "users", uid),
    (snap) => cb(snap.exists() ? snap.data()?.subscription || null : null),
    (err) => {
      onListenerError(err, "subscription");
      cb(null);
    }
  );
}

/** Payment and refund history, newest first. Written only by the server. */
export function subscribeBilling(uid, cb) {
  return onSnapshot(
    query(collection(db, "users", uid, "billing"), orderBy("issuedAt", "desc"), limit(50)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      onListenerError(err, "billing");
      cb([]);
    }
  );
}

/**
 * This month's metered usage for a site. Read-only from the browser — the rules
 * refuse client writes, since a client that could edit its own counters could
 * grant itself unlimited paid work.
 */
export function subscribeUsage(uid, siteId, cb) {
  const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
  return onSnapshot(
    doc(db, "users", uid, "sites", siteId, "usage", period),
    (snap) => cb(snap.exists() ? { period, ...snap.data() } : { period, credits: 0, leadCredits: 0, emails: 0, contentPieces: 0, socialPosts: 0 }),
    (err) => {
      onListenerError(err, "usage");
      cb(null);
    }
  );
}

function sitesCol(uid) {
  return collection(db, "users", uid, "sites");
}
function siteDoc(uid, siteId) {
  return doc(db, "users", uid, "sites", siteId);
}
function activityCol(uid, siteId) {
  return collection(db, "users", uid, "sites", siteId, "activity");
}
function approvalsCol(uid, siteId) {
  return collection(db, "users", uid, "sites", siteId, "approvals");
}
function leadsCol(uid, siteId) {
  return collection(db, "users", uid, "sites", siteId, "leads");
}
function contentCol(uid, siteId) {
  return collection(db, "users", uid, "sites", siteId, "content");
}
function competitorsCol(uid, siteId) {
  return collection(db, "users", uid, "sites", siteId, "competitors");
}
function jobsCol(uid, siteId) {
  return collection(db, "users", uid, "sites", siteId, "jobs");
}
function pagesCol(uid, siteId) {
  return collection(db, "users", uid, "sites", siteId, "pages");
}
function socialCol(uid, siteId) {
  return collection(db, "users", uid, "sites", siteId, "social");
}
function listingsCol(uid, siteId) {
  return collection(db, "users", uid, "sites", siteId, "listings");
}

export function subscribeSites(uid, cb) {
  const q = query(sitesCol(uid), orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onListenerError(err, "collection")
  );
}

export function subscribeSite(uid, siteId, cb) {
  return onSnapshot(
    siteDoc(uid, siteId),
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => onListenerError(err, "site")
  );
}

export function subscribeActivity(uid, siteId, cb) {
  const q = query(activityCol(uid, siteId), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onListenerError(err, "collection")
  );
}

export function subscribeApprovals(uid, siteId, cb) {
  const q = query(approvalsCol(uid, siteId), orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onListenerError(err, "collection")
  );
}

export async function createSite(uid, { url, title, description, autonomy, faviconUrl, audit }) {
  const ref = doc(sitesCol(uid));
  await setDoc(ref, {
    url,
    title: title || url,
    description: description || "",
    faviconUrl: faviconUrl || null,
    audit: audit || null,
    autonomy: typeof autonomy === "number" ? autonomy : 62,
    throttle: 58,
    rules: DEFAULT_RULES,
    voice: "a",
    paused: false,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export function updateSiteSettings(uid, siteId, patch) {
  return updateDoc(siteDoc(uid, siteId), patch);
}

export function addActivity(uid, siteId, entry) {
  return addDoc(activityCol(uid, siteId), {
    ...entry,
    undone: false,
    createdAt: serverTimestamp(),
  });
}

/**
 * Marks a log entry as something the customer reverted themselves.
 *
 * It does NOT undo anything, and it never did. The UI used to call this "roll
 * back" and render "Rolled back" as a result, which described work that had
 * not happened: the article stayed written, the competitor stayed tracked. The
 * flag is a note on the record, so the log can show what you have already
 * backed out by hand, and it is labelled that way now.
 *
 * Real one-click rollback would need each action to carry an inverse. Nothing
 * here does yet, which is exactly why claiming it was wrong.
 */
export function setActivityUndone(uid, siteId, activityId, undone) {
  return updateDoc(doc(db, "users", uid, "sites", siteId, "activity", activityId), { undone });
}

export function addApproval(uid, siteId, entry) {
  return addDoc(approvalsCol(uid, siteId), {
    ...entry,
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

export function setApprovalStatus(uid, siteId, approvalId, status) {
  return updateDoc(doc(db, "users", uid, "sites", siteId, "approvals", approvalId), { status });
}

export function updateApproval(uid, siteId, approvalId, patch) {
  return updateDoc(doc(db, "users", uid, "sites", siteId, "approvals", approvalId), patch);
}

export function subscribeLeads(uid, siteId, cb) {
  const q = query(leadsCol(uid, siteId), orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onListenerError(err, "collection")
  );
}

// Leads are only ever written by the job engine (discover, then qualify). There
// is no "add a lead by hand", and the helper that pretended otherwise wrote a
// status nothing read.
export function updateLead(uid, siteId, leadId, patch) {
  return updateDoc(doc(db, "users", uid, "sites", siteId, "leads", leadId), patch);
}

export function subscribeContent(uid, siteId, cb) {
  const q = query(contentCol(uid, siteId), orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onListenerError(err, "collection")
  );
}

export function addContentItem(uid, siteId, entry) {
  return addDoc(contentCol(uid, siteId), {
    status: "draft",
    ...entry,
    createdAt: serverTimestamp(),
  });
}

export function updateContentItem(uid, siteId, itemId, patch) {
  return updateDoc(doc(db, "users", uid, "sites", siteId, "content", itemId), patch);
}

// --- Social ---------------------------------------------------------------
// Newest first, unlike content: a social feed is read from the top, and the
// post someone wants is almost always the one just drafted.

export function subscribeSocialPosts(uid, siteId, cb) {
  const q = query(socialCol(uid, siteId), orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onListenerError(err, "collection")
  );
}

export function addSocialPost(uid, siteId, entry) {
  return addDoc(socialCol(uid, siteId), {
    status: "drafted",
    ...entry,
    createdAt: serverTimestamp(),
  });
}

export function updateSocialPost(uid, siteId, postId, patch) {
  return updateDoc(doc(db, "users", uid, "sites", siteId, "social", postId), patch);
}

export function deleteSocialPost(uid, siteId, postId) {
  return deleteDoc(doc(db, "users", uid, "sites", siteId, "social", postId));
}

// --- Directory listings ----------------------------------------------------
// Keyed by directory id rather than auto-id: there is exactly one listing per
// directory per site, and an auto-id would let a second "Product Hunt" row
// appear every time someone pressed the button twice.

export function subscribeListings(uid, siteId, cb) {
  return onSnapshot(
    listingsCol(uid, siteId),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onListenerError(err, "collection")
  );
}

export function saveListing(uid, siteId, directoryId, entry) {
  return setDoc(
    doc(db, "users", uid, "sites", siteId, "listings", directoryId),
    { ...entry, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export function subscribeCompetitors(uid, siteId, cb) {
  const q = query(competitorsCol(uid, siteId), orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onListenerError(err, "collection")
  );
}

export function addCompetitor(uid, siteId, { url, snapshot }) {
  return addDoc(competitorsCol(uid, siteId), {
    url,
    snapshot,
    changes: [],
    lastCheckedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
}

export function updateCompetitor(uid, siteId, competitorId, patch) {
  return updateDoc(doc(db, "users", uid, "sites", siteId, "competitors", competitorId), patch);
}

export function removeCompetitor(uid, siteId, competitorId) {
  return deleteDoc(doc(db, "users", uid, "sites", siteId, "competitors", competitorId));
}

export function subscribeJobs(uid, siteId, cb, max = 20) {
  const q = query(jobsCol(uid, siteId), orderBy("createdAt", "desc"), limit(max));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onListenerError(err, "collection")
  );
}

export function subscribePages(uid, siteId, cb) {
  const q = query(pagesCol(uid, siteId), orderBy("path", "asc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onListenerError(err, "collection")
  );
}

export { DEFAULT_RULES, deleteField };
