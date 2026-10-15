// Who may do what. Permission keys, the roles built from them, and the pure
// checks the server, the Firestore rules and the UI all agree on.
//
// Client-safe: no server imports. The UI reads this to hide what a person
// can't do; the server and the rules are what actually refuse it.
//
// Two scopes, kept apart on purpose:
//
//   platform   the people who run MADBOT, in /admin
//   org        the people who use it, inside one organisation
//
// A role belongs to exactly one scope and may only hold that scope's keys, so
// a custom org role can never be handed a platform permission by accident.
//
// Mirrors Lawzer's console (src/lib/admin/access.ts): an Owner who can do
// everything, an Admin who can do everything except manage other admins, and
// nobody may act on the Owner. Lawzer stops at fixed capability flags; this
// goes one step further, as decided on 2026-10-14, with keys that roles are
// composed from, so custom roles are possible.

export const SCOPES = { PLATFORM: "platform", ORG: "org" };

/** Every permission, with what it lets someone do. The key is the contract. */
export const PERMISSIONS = {
  platform: {
    "platform.dashboard.read": "See the admin dashboard",
    "platform.users.read": "See users, their profiles and activity",
    "platform.users.write": "Invite, suspend, reactivate, delete and reset users",
    "platform.orgs.read": "See organisations, members and usage",
    "platform.orgs.write": "Create, edit and suspend organisations, change members and owners",
    "platform.licenses.manage": "Issue, change and revoke licences",
    "platform.roles.manage": "Create and edit roles",
    "platform.flags.manage": "Turn features on and off",
    "platform.usage.read": "See usage and quota across organisations",
    "platform.audit.read": "Read the admin audit log",
    "platform.audit.export": "Export the admin audit log",
    "platform.settings.manage": "Change platform settings",
    "platform.health.read": "See system health and error logs",
    "platform.admins.manage": "Grant and revoke admin access",
  },
  org: {
    "sites.read": "See the organisation's sites and everything in them",
    "sites.manage": "Add and remove sites, and change their settings",
    "work.run": "Run jobs and write content, leads, listings and social drafts",
    "approvals.decide": "Approve or decline what is waiting for a decision",
    "publish": "Publish to connected accounts and open pull requests",
    "integrations.manage": "Connect and disconnect GitHub and social accounts",
    "billing.read": "See the plan, usage and billing history",
    "members.read": "See who is in the organisation",
    "members.manage": "Invite, remove and change the role of members",
    "org.manage": "Rename the organisation and change its settings",
  },
};

const ALL_PLATFORM = Object.keys(PERMISSIONS.platform);
const ALL_ORG = Object.keys(PERMISSIONS.org);

/**
 * Roles that always exist. They can't be edited or deleted, so the console
 * can't lock everyone out of itself and an org always has an owner role.
 */
export const BUILT_IN_ROLES = {
  platform_owner: {
    id: "platform_owner",
    scope: SCOPES.PLATFORM,
    name: "Owner",
    description: "Everything, including who else is an admin. Set by ADMIN_UIDS, not from the console.",
    permissions: ALL_PLATFORM,
  },
  platform_admin: {
    id: "platform_admin",
    scope: SCOPES.PLATFORM,
    name: "Admin",
    description: "Everything except managing admins and roles.",
    permissions: ALL_PLATFORM.filter((p) => p !== "platform.admins.manage" && p !== "platform.roles.manage"),
  },
  platform_support: {
    id: "platform_support",
    scope: SCOPES.PLATFORM,
    name: "Support",
    description: "Read-only: users, organisations, usage, audit log and health.",
    permissions: [
      "platform.dashboard.read",
      "platform.users.read",
      "platform.orgs.read",
      "platform.usage.read",
      "platform.audit.read",
      "platform.health.read",
    ],
  },
  org_owner: {
    id: "org_owner",
    scope: SCOPES.ORG,
    name: "Owner",
    description: "Everything in the organisation. Exactly one per organisation.",
    permissions: ALL_ORG,
  },
  org_admin: {
    id: "org_admin",
    scope: SCOPES.ORG,
    name: "Admin",
    description: "Everything except transferring ownership.",
    permissions: ALL_ORG,
  },
  org_member: {
    id: "org_member",
    scope: SCOPES.ORG,
    name: "Member",
    description: "Does the work and decides approvals. Can't manage members, billing or connections.",
    permissions: ["sites.read", "work.run", "approvals.decide", "publish", "members.read"],
  },
  org_viewer: {
    id: "org_viewer",
    scope: SCOPES.ORG,
    name: "Viewer",
    description: "Sees everything, changes nothing.",
    permissions: ["sites.read", "members.read", "billing.read"],
  },
};

export const OWNER_ROLE = { platform: "platform_owner", org: "org_owner" };
export const DEFAULT_ORG_ROLE = "org_member";

export function isBuiltIn(roleId) {
  return Object.hasOwn(BUILT_IN_ROLES, roleId);
}

/**
 * Checks a role definition is well-formed for its scope. Returns null when it
 * is, or the first problem found. Used before any custom role is saved.
 */
export function validateRole({ scope, name, permissions }) {
  if (scope !== SCOPES.PLATFORM && scope !== SCOPES.ORG) return "A role must be a platform role or an organisation role.";
  if (typeof name !== "string" || !name.trim() || name.length > 60) return "A role needs a name of 60 characters or fewer.";
  if (!Array.isArray(permissions) || permissions.length === 0) return "A role needs at least one permission.";
  const allowed = PERMISSIONS[scope];
  const foreign = permissions.filter((p) => !Object.hasOwn(allowed, p));
  if (foreign.length) return `Not ${scope === SCOPES.ORG ? "an organisation" : "a platform"} permission: ${foreign.join(", ")}.`;
  if (new Set(permissions).size !== permissions.length) return "A permission is listed twice.";
  return null;
}

/** Does this set of permissions include `key`? */
export function has(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

/**
 * May an admin act on another platform admin? The Lawzer rule: nobody acts on
 * an owner, and only someone who can manage admins acts on another admin.
 * Acting on yourself (suspending, demoting) is refused too, so the last
 * person able to get in can't lock themselves out by accident.
 */
export function canActOnAdmin(actor, target) {
  if (!target) return true;
  if (actor.uid === target.uid) return false;
  if (target.roleId === OWNER_ROLE.platform) return false;
  return has(actor.permissions, "platform.admins.manage");
}
