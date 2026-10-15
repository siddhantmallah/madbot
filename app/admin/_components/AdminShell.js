"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { BUILT_IN_ROLES } from "../../../lib/rbac";
import { ConfirmProvider, api } from "./ui";

const AdminContext = createContext(null);

/** The signed-in admin and what their role allows, for hiding what they can't do. The server refuses it regardless. */
export function useAdmin() {
  return useContext(AdminContext);
}

// The console's sections, in the order the brief lists them. Each is shown
// only to a role that can open it; the API behind it checks again.
const SECTIONS = [
  { href: "/admin", label: "Dashboard", perm: "platform.dashboard.read" },
  { href: "/admin/users", label: "Users", perm: "platform.users.read" },
  { href: "/admin/orgs", label: "Organisations", perm: "platform.orgs.read" },
  { href: "/admin/roles", label: "Roles & permissions", perm: "platform.dashboard.read" },
  { href: "/admin/licences", label: "Licences & plans", perm: "platform.orgs.read" },
  { href: "/admin/flags", label: "Feature flags", perm: "platform.dashboard.read" },
  { href: "/admin/usage", label: "Usage & billing", perm: "platform.usage.read" },
  { href: "/admin/audit", label: "Audit log", perm: "platform.audit.read" },
  { href: "/admin/settings", label: "Settings", perm: "platform.dashboard.read" },
  { href: "/admin/health", label: "System health", perm: "platform.health.read" },
  { href: "/admin/admins", label: "Admins", perm: "platform.dashboard.read" },
];

export default function AdminShell({ admin, children }) {
  const pathname = usePathname();
  const [leaving, setLeaving] = useState(false);
  const can = (perm) => admin.permissions.includes(perm);
  const roleName = BUILT_IN_ROLES[admin.roleId]?.name || admin.roleId;

  async function signOut() {
    setLeaving(true);
    try {
      await api("/api/admin/session", { method: "DELETE" });
    } finally {
      window.location.assign("/admin/login");
    }
  }

  return (
    <AdminContext.Provider value={{ ...admin, can }}>
      <ConfirmProvider>
        <div className="adm">
          <div className="adm-shell">
            <nav className="adm-rail" aria-label="Console sections">
              <div className="adm-rail-id">
                <b style={{ fontSize: 15 }}>MADBOT</b>
                <span className="adm-note">Platform console — reaches every organisation</span>
              </div>
              {SECTIONS.filter((s) => can(s.perm)).map((s) => {
                const active = s.href === "/admin" ? pathname === "/admin" : pathname === s.href || pathname.startsWith(`${s.href}/`);
                return (
                  <Link key={s.href} href={s.href} aria-current={active ? "page" : undefined}>
                    {s.label}
                  </Link>
                );
              })}
            </nav>
            <div className="adm-main">
              <div className="adm-top" style={{ marginBottom: 14 }}>
                <span className="adm-pill is-good">{roleName}</span>
                <span>{admin.email}</span>
                <Link href="/dashboard" style={{ color: "var(--fg-80)" }}>
                  My workspace
                </Link>
                <button type="button" className="btn btn-secondary" onClick={signOut} disabled={leaving} title="Also signs you out of MADBOT on your other devices">
                  {leaving ? "Signing out…" : "Sign out"}
                </button>
              </div>
              <main id="main">{children}</main>
            </div>
          </div>
        </div>
      </ConfirmProvider>
    </AdminContext.Provider>
  );
}
