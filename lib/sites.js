import {
  addDoc,
  collection,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

const DEFAULT_RULES = [
  { id: "r1", text: "Never make a claim I haven't approved." },
  { id: "r2", text: "Never email the same person twice in 30 days." },
  { id: "r3", text: "Ask before anything costs money." },
  { id: "r4", text: "No competitor names in ad copy." },
];

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

export function subscribeSites(uid, cb) {
  const q = query(sitesCol(uid), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export function subscribeSite(uid, siteId, cb) {
  return onSnapshot(siteDoc(uid, siteId), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export function subscribeActivity(uid, siteId, cb) {
  const q = query(activityCol(uid, siteId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export function subscribeApprovals(uid, siteId, cb) {
  const q = query(approvalsCol(uid, siteId), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function createSite(uid, { url, title, description, autonomy }) {
  const ref = doc(sitesCol(uid));
  await setDoc(ref, {
    url,
    title: title || url,
    description: description || "",
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
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export function addLead(uid, siteId, entry) {
  return addDoc(leadsCol(uid, siteId), {
    ...entry,
    status: "queued",
    createdAt: serverTimestamp(),
  });
}

export function updateLead(uid, siteId, leadId, patch) {
  return updateDoc(doc(db, "users", uid, "sites", siteId, "leads", leadId), patch);
}

export function subscribeContent(uid, siteId, cb) {
  const q = query(contentCol(uid, siteId), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
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

export { DEFAULT_RULES, deleteField };
