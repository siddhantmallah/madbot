// Organisations: who belongs to which, in what role, under which licence.
// Server-only (firebase-admin).
//
// The shape:
//
//   orgs/{orgId}                    name, ownerUid, status, subscription (the
//                                   licence), flags, memberCount
//   orgs/{orgId}/members/{uid}      roleId, email, displayName, joinedAt
//   orgs/{orgId}/invites/{id}       email, roleId, tokenHash, expiresAt, status
//   orgs/{orgId}/licenseHistory/{id}  every change to the licence
//   roles/{roleId}                  scope, name, permissions (built-ins too, so
//                                   the Firestore rules can read them)
//   users/{uid}                     orgIds, activeOrgId (server-written)
//
// Where an organisation's work lives. Sites, usage and billing stay at
// users/{orgId}/... , the paths they already had. Every existing account
// becomes an organisation whose id IS its uid, so nothing moves and there is
// no migration to run; the server creates the organisation the first time the
// person signs in after this ships (ensurePersonalOrg). An organisation an
// admin creates gets a fresh id, and its work lives at users/{thatId}/... the
// same way. dataRoot() is the one place that knows this, so it can change.
//
// Which organisation a request acts for is never taken from the request. It
// is the caller's activeOrgId, written only by the server after checking
// membership, and checked again on every call.

import { createHash, randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin";
import { BUILT_IN_ROLES, DEFAULT_ORG_ROLE, OWNER_ROLE, SCOPES, isBuiltIn } from "./rbac";
import { platformSettings } from "./platform";
import { seatAccess } from "./entitlements";

export const ORG_STATUS = { ACTIVE: "active", SUSPENDED: "suspended", DELETED: "deleted" };
const INVITE_DAYS = 14;

/** Where an organisation's sites, usage and billing live. */
export function dataRoot(db, orgId) {
  return db.collection("users").doc(orgId);
}

export function orgRef(db, orgId) {
  return db.collection("orgs").doc(orgId);
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

let builtInsWritten = false;

/**
 * Writes the built-in roles to Firestore, where the security rules can read
 * their permissions. Idempotent and cheap after the first call in an
 * instance; a built-in whose stored permissions drifted from the code is
 * rewritten, because the code is the definition.
 */
export async function ensureBuiltInRoles(db = adminDb()) {
  if (builtInsWritten) return;
  const refs = Object.values(BUILT_IN_ROLES).map((r) => db.collection("roles").doc(r.id));
  const snaps = await db.getAll(...refs);
  const batch = db.batch();
  let writes = 0;
  snaps.forEach((snap, i) => {
    const role = Object.values(BUILT_IN_ROLES)[i];
    const stored = snap.exists ? snap.data() : null;
    const same =
      stored &&
      stored.name === role.name &&
      stored.scope === role.scope &&
      JSON.stringify([...(stored.permissions || [])].sort()) === JSON.stringify([...role.permissions].sort());
    if (!same) {
      batch.set(refs[i], { ...role, builtIn: true, updatedAt: FieldValue.serverTimestamp() });
      writes += 1;
    }
  });
  if (writes) await batch.commit();
  builtInsWritten = true;
}

/** A role by id: built-ins from code, custom ones from Firestore. */
export async function getRole(db, roleId) {
  if (isBuiltIn(roleId)) return { ...BUILT_IN_ROLES[roleId], builtIn: true };
  if (typeof roleId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(roleId)) return null;
  const snap = await db.collection("roles").doc(roleId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

// ---------------------------------------------------------------------------
// Becoming a member of something
// ---------------------------------------------------------------------------

function displayNameFor({ displayName, email }) {
  if (displayName && displayName.trim()) return `${displayName.trim().split(/\s+/)[0]}'s workspace`.slice(0, 80);
  const domain = String(email || "").split("@")[1];
  return (domain || "My workspace").slice(0, 80);
}

/**
 * Gives an account with no organisation its own, owned by it, with the id of
 * its uid so its existing sites, usage and billing are already in place. The
 * licence it had on its user document comes across. Safe to call on every
 * sign-in: an account that belongs to anything already is left alone.
 *
 * While signups are closed (/admin settings) a new account gets nothing and
 * the result carries refused: "signups_closed". An account from before
 * organisations, one with a profile or a licence, is still migrated: closing
 * signups mustn't lock out existing customers who haven't signed in since.
 * (A user document alone proves nothing: the server writes one for a brand
 * new account the moment it asks for a verification email.) byAdmin skips the
 * check: an admin acting on an account from the console is not a signup.
 */
export async function ensurePersonalOrg(db, { uid, email = null, displayName = null, byAdmin = false }) {
  await ensureBuiltInRoles(db);
  const signupOpen = byAdmin || (await platformSettings()).signupOpen;
  const userRef = db.collection("users").doc(uid);
  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const user = userSnap.exists ? userSnap.data() : {};
    if (Array.isArray(user.orgIds) && user.orgIds.length) return { created: false, orgId: user.activeOrgId || user.orgIds[0] };

    const ref = orgRef(db, uid);
    const existing = await tx.get(ref);
    if (existing.exists) {
      // The organisation exists (an admin made it, or a previous run got this
      // far): just make sure the user document points at it.
      tx.set(userRef, { orgIds: [uid], activeOrgId: uid }, { merge: true });
      return { created: false, orgId: uid };
    }

    const existingCustomer = userSnap.exists && (user.createdAt != null || user.subscription != null);
    if (!signupOpen && !existingCustomer) return { created: false, orgId: null, refused: "signups_closed" };

    const name = displayNameFor({ displayName, email: email || user.email });
    tx.set(ref, {
      name,
      nameLower: name.toLowerCase(),
      ownerUid: uid,
      status: ORG_STATUS.ACTIVE,
      // The licence moves with the work. A user document's subscription is
      // read nowhere after this.
      subscription: user.subscription || null,
      memberCount: 1,
      personal: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(ref.collection("members").doc(uid), {
      uid,
      email: email || user.email || null,
      displayName: displayName || user.displayName || null,
      roleId: OWNER_ROLE.org,
      joinedAt: FieldValue.serverTimestamp(),
    });
    tx.set(userRef, { orgIds: [uid], activeOrgId: uid }, { merge: true });
    return { created: true, orgId: uid };
  });
}

/**
 * The organisation a signed-in person is acting for, with their role in it.
 *
 * Returns { ok: true, orgId, org, member, role, permissions } or
 * { ok: false, status, code, error }. Never trusts a client-sent org id: it
 * reads the server-written activeOrgId and checks the membership exists.
 */
export async function orgContext(db, who) {
  const { uid } = who;
  const userSnap = await db.collection("users").doc(uid).get();
  let user = userSnap.exists ? userSnap.data() : {};
  if (!Array.isArray(user.orgIds) || user.orgIds.length === 0) {
    const made = await ensurePersonalOrg(db, { uid, email: who.email, displayName: who.displayName });
    if (made.refused === "signups_closed") return { ok: false, status: 403, code: "signups_closed", error: "New signups are closed at the moment." };
    user = (await db.collection("users").doc(uid).get()).data() || {};
  }

  const candidates = [user.activeOrgId, ...(user.orgIds || [])].filter(Boolean);
  for (const orgId of [...new Set(candidates)]) {
    // eslint-disable-next-line no-await-in-loop
    const [orgSnap, memberSnap] = await Promise.all([orgRef(db, orgId).get(), orgRef(db, orgId).collection("members").doc(uid).get()]);
    if (!orgSnap.exists || !memberSnap.exists) continue;
    const org = { id: orgId, ...orgSnap.data() };
    if (org.status === ORG_STATUS.DELETED) continue;
    if (org.status === ORG_STATUS.SUSPENDED) {
      return { ok: false, status: 403, code: "org_suspended", error: `${org.name || "This organisation"} is suspended. Contact support.` };
    }
    const member = memberSnap.data();
    // eslint-disable-next-line no-await-in-loop
    const role = await getRole(db, member.roleId);
    return {
      ok: true,
      orgId,
      org,
      member,
      role,
      permissions: role?.scope === SCOPES.ORG ? role.permissions || [] : [],
    };
  }
  return { ok: false, status: 403, code: "no_org", error: "You aren't a member of an organisation." };
}

/** Every organisation an account belongs to, for the switcher. */
export async function membershipsOf(db, uid) {
  const userSnap = await db.collection("users").doc(uid).get();
  const ids = userSnap.exists ? userSnap.data()?.orgIds || [] : [];
  if (!ids.length) return [];
  const orgs = await db.getAll(...ids.map((id) => orgRef(db, id)));
  const members = await db.getAll(...ids.map((id) => orgRef(db, id).collection("members").doc(uid)));
  return orgs
    .map((o, i) => (o.exists && members[i].exists ? { id: o.id, name: o.data().name, status: o.data().status, roleId: members[i].data().roleId } : null))
    .filter((o) => o && o.status !== ORG_STATUS.DELETED);
}

export async function setActiveOrg(db, uid, orgId) {
  if (typeof orgId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(orgId)) return false;
  const member = await orgRef(db, orgId).collection("members").doc(uid).get();
  if (!member.exists) return false;
  await db.collection("users").doc(uid).set({ activeOrgId: orgId }, { merge: true });
  return true;
}

// ---------------------------------------------------------------------------
// Members, seats and ownership
// ---------------------------------------------------------------------------

async function seatCheck(tx, db, orgId, org) {
  const pending = await tx.get(orgRef(db, orgId).collection("invites").where("status", "==", "pending"));
  return seatAccess(org.subscription, { members: org.memberCount || 0, pendingInvites: pending.size });
}

/** Adds someone directly (an admin action). Refuses past the licence's seats. */
export async function addMember(db, { orgId, uid, email = null, displayName = null, roleId = DEFAULT_ORG_ROLE }) {
  const role = await getRole(db, roleId);
  if (!role || role.scope !== SCOPES.ORG) return { ok: false, error: "That isn't an organisation role." };
  if (roleId === OWNER_ROLE.org) return { ok: false, error: "Ownership is transferred, not assigned." };
  return db.runTransaction(async (tx) => {
    const ref = orgRef(db, orgId);
    const memberRef = ref.collection("members").doc(uid);
    const [orgSnap, memberSnap] = await Promise.all([tx.get(ref), tx.get(memberRef)]);
    if (!orgSnap.exists) return { ok: false, error: "No such organisation." };
    if (memberSnap.exists) return { ok: false, error: "Already a member." };
    const seats = await seatCheck(tx, db, orgId, orgSnap.data());
    if (!seats.allowed) return { ok: false, error: seats.reason, code: "no_seats" };
    tx.set(memberRef, { uid, email, displayName, roleId, joinedAt: FieldValue.serverTimestamp() });
    tx.update(ref, { memberCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    tx.set(db.collection("users").doc(uid), { orgIds: FieldValue.arrayUnion(orgId) }, { merge: true });
    return { ok: true };
  });
}

/** Removes a member. The owner can't be removed; ownership has to move first. */
export async function removeMember(db, { orgId, uid }) {
  return db.runTransaction(async (tx) => {
    const ref = orgRef(db, orgId);
    const memberRef = ref.collection("members").doc(uid);
    const [orgSnap, memberSnap] = await Promise.all([tx.get(ref), tx.get(memberRef)]);
    if (!orgSnap.exists || !memberSnap.exists) return { ok: false, error: "Not a member." };
    if (orgSnap.data().ownerUid === uid) return { ok: false, error: "Transfer ownership before removing the owner." };
    tx.delete(memberRef);
    tx.update(ref, { memberCount: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() });
    tx.set(db.collection("users").doc(uid), { orgIds: FieldValue.arrayRemove(orgId) }, { merge: true });
    return { ok: true, before: memberSnap.data() };
  });
}

export async function changeMemberRole(db, { orgId, uid, roleId }) {
  const role = await getRole(db, roleId);
  if (!role || role.scope !== SCOPES.ORG) return { ok: false, error: "That isn't an organisation role." };
  if (roleId === OWNER_ROLE.org) return { ok: false, error: "Ownership is transferred, not assigned." };
  return db.runTransaction(async (tx) => {
    const ref = orgRef(db, orgId);
    const memberRef = ref.collection("members").doc(uid);
    const [orgSnap, memberSnap] = await Promise.all([tx.get(ref), tx.get(memberRef)]);
    if (!orgSnap.exists || !memberSnap.exists) return { ok: false, error: "Not a member." };
    if (orgSnap.data().ownerUid === uid) return { ok: false, error: "The owner's role changes only by transferring ownership." };
    tx.update(memberRef, { roleId });
    return { ok: true, before: memberSnap.data().roleId, after: roleId };
  });
}

/** Hands the organisation to another existing member; the old owner becomes an admin. */
export async function transferOwnership(db, { orgId, toUid }) {
  return db.runTransaction(async (tx) => {
    const ref = orgRef(db, orgId);
    const orgSnap = await tx.get(ref);
    if (!orgSnap.exists) return { ok: false, error: "No such organisation." };
    const fromUid = orgSnap.data().ownerUid;
    if (fromUid === toUid) return { ok: false, error: "They already own it." };
    const [toSnap, fromSnap] = await Promise.all([
      tx.get(ref.collection("members").doc(toUid)),
      tx.get(ref.collection("members").doc(fromUid)),
    ]);
    if (!toSnap.exists) return { ok: false, error: "Ownership can only go to an existing member." };
    tx.update(ref, { ownerUid: toUid, updatedAt: FieldValue.serverTimestamp() });
    tx.update(toSnap.ref, { roleId: OWNER_ROLE.org });
    if (fromSnap.exists) tx.update(fromSnap.ref, { roleId: "org_admin" });
    return { ok: true, before: fromUid, after: toUid };
  });
}

/** A new organisation, owned by an existing account (an admin action). */
export async function createOrg(db, { name, ownerUid, ownerEmail = null, ownerDisplayName = null }) {
  await ensureBuiltInRoles(db);
  const ref = db.collection("orgs").doc();
  const batch = db.batch();
  batch.set(ref, {
    name: String(name).slice(0, 80),
    nameLower: String(name).slice(0, 80).toLowerCase(),
    ownerUid,
    status: ORG_STATUS.ACTIVE,
    subscription: null,
    memberCount: 1,
    personal: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(ref.collection("members").doc(ownerUid), {
    uid: ownerUid,
    email: ownerEmail,
    displayName: ownerDisplayName,
    roleId: OWNER_ROLE.org,
    joinedAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.collection("users").doc(ownerUid), { orgIds: FieldValue.arrayUnion(ref.id) }, { merge: true });
  await batch.commit();
  return ref.id;
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

/**
 * An invitation, holding a seat while it's pending. Returns the plaintext
 * token once, for the email; only its hash is stored, so a leaked database
 * read can't be turned into an accepted invitation.
 */
export async function createInvite(db, { orgId, email, roleId = DEFAULT_ORG_ROLE, invitedBy }) {
  const role = await getRole(db, roleId);
  if (!role || role.scope !== SCOPES.ORG || roleId === OWNER_ROLE.org) return { ok: false, error: "That role can't be offered in an invitation." };
  const address = String(email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address) || address.length > 320) return { ok: false, error: "That isn't an email address." };

  const token = randomBytes(24).toString("base64url");
  const result = await db.runTransaction(async (tx) => {
    const ref = orgRef(db, orgId);
    const orgSnap = await tx.get(ref);
    if (!orgSnap.exists) return { ok: false, error: "No such organisation." };
    const dupe = await tx.get(ref.collection("invites").where("email", "==", address).where("status", "==", "pending"));
    if (!dupe.empty) return { ok: false, error: "There's already a pending invitation for that address." };
    const seats = await seatCheck(tx, db, orgId, orgSnap.data());
    if (!seats.allowed) return { ok: false, error: seats.reason, code: "no_seats" };
    const inviteRef = ref.collection("invites").doc();
    tx.set(inviteRef, {
      email: address,
      roleId,
      tokenHash: hashToken(token),
      status: "pending",
      invitedBy: invitedBy || null,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    });
    return { ok: true, inviteId: inviteRef.id, orgName: orgSnap.data().name };
  });
  return result.ok ? { ...result, token } : result;
}

/**
 * Accepts an invitation as the signed-in account. The invitation must be for
 * that account's own verified address; holding the link isn't enough.
 */
export async function acceptInvite(db, { orgId, inviteId, token, uid, email, emailVerified, displayName = null }) {
  if (!emailVerified) return { ok: false, error: "Confirm your email address before accepting an invitation." };
  return db.runTransaction(async (tx) => {
    const ref = orgRef(db, orgId);
    const inviteRef = ref.collection("invites").doc(inviteId);
    const [orgSnap, inviteSnap, memberSnap] = await Promise.all([tx.get(ref), tx.get(inviteRef), tx.get(ref.collection("members").doc(uid))]);
    if (!orgSnap.exists || !inviteSnap.exists) return { ok: false, error: "That invitation doesn't exist." };
    const inv = inviteSnap.data();
    if (inv.status !== "pending") return { ok: false, error: "That invitation has already been used or withdrawn." };
    if (inv.tokenHash !== hashToken(token)) return { ok: false, error: "That invitation link isn't valid." };
    const expires = inv.expiresAt?.toMillis ? inv.expiresAt.toMillis() : Date.parse(inv.expiresAt);
    if (expires < Date.now()) return { ok: false, error: "That invitation has expired. Ask for a new one." };
    if (String(email || "").toLowerCase() !== inv.email) return { ok: false, error: `This invitation is for ${inv.email}. Sign in with that address to accept it.` };
    if (orgSnap.data().status !== ORG_STATUS.ACTIVE) return { ok: false, error: "That organisation isn't active." };
    if (memberSnap.exists) {
      tx.update(inviteRef, { status: "accepted", acceptedAt: FieldValue.serverTimestamp(), acceptedBy: uid });
      return { ok: true, already: true };
    }
    // The pending invitation already held this seat, so no seat check here.
    tx.set(ref.collection("members").doc(uid), { uid, email: inv.email, displayName, roleId: inv.roleId, joinedAt: FieldValue.serverTimestamp() });
    tx.update(ref, { memberCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    tx.update(inviteRef, { status: "accepted", acceptedAt: FieldValue.serverTimestamp(), acceptedBy: uid });
    tx.set(db.collection("users").doc(uid), { orgIds: FieldValue.arrayUnion(orgId), activeOrgId: orgId }, { merge: true });
    return { ok: true, orgName: orgSnap.data().name };
  });
}
