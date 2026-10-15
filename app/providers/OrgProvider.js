"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";

const OrgContext = createContext(null);

const IDLE = { status: "idle", org: null, role: null, permissions: [], memberships: [], error: null, code: null };

/** One round trip to /api/orgs/me, resolved to the provider state. Never throws. */
async function fetchOrg(user, switchTo) {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch("/api/orgs/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(switchTo ? { idToken, switchTo } : { idToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ...IDLE, status: "error", memberships: data.memberships || [], error: data.error || "Couldn't load your organisation.", code: data.code || null };
    }
    return {
      status: "ready",
      org: data.org,
      role: data.role,
      permissions: data.permissions || [],
      memberships: data.memberships || [],
      maintenance: data.maintenance || null,
      error: null,
      code: null,
    };
  } catch {
    return { ...IDLE, status: "error", error: "Couldn't reach the server. Check your connection and reload." };
  }
}

/**
 * Which organisation the signed-in person is working in, their role and what
 * it lets them do.
 *
 * Asked of the server (/api/orgs/me), never worked out here: the server
 * decides the active organisation from the membership it holds, and is the
 * one that refuses anything the role doesn't allow. `can()` below exists so
 * the screen doesn't offer a button that will only be refused.
 */
export function OrgProvider({ children }) {
  const { user } = useAuth();
  // The state is stamped with the uid it was loaded for, so a different (or
  // no) account reads as loading (or idle) until its own answer arrives,
  // without resetting state inside an effect.
  const [state, setState] = useState({ ...IDLE, uid: null });

  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    fetchOrg(user).then((next) => alive && setState({ ...next, uid: user.uid }));
    return () => {
      alive = false;
    };
  }, [user]);

  const load = useCallback(
    async (switchTo) => {
      if (!user) return;
      setState((s) => ({ ...s, status: "loading", error: null }));
      const next = await fetchOrg(user, switchTo);
      setState({ ...next, uid: user.uid });
    },
    [user]
  );

  const current = !user ? IDLE : state.uid === user.uid ? state : { ...IDLE, status: "loading" };
  const can = useCallback((permission) => current.permissions.includes(permission), [current.permissions]);
  const switchOrg = useCallback((orgId) => load(orgId), [load]);

  return <OrgContext.Provider value={{ ...current, can, switchOrg, reload: () => load() }}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within OrgProvider");
  return ctx;
}
