"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../providers/AuthProvider";
import { OrgProvider, useOrg } from "../providers/OrgProvider";
import {
  subscribeSites,
  subscribeSite,
  subscribeActivity,
  subscribeApprovals,
  subscribeLeads,
  subscribeContent,
  updateSiteSettings,
  subscribeSubscription,
  subscribeBilling,
  subscribeUsage,
  addActivity,
  setActivityUndone,
  setApprovalStatus,
  updateApproval,
  updateLead,
  addApproval,
  addContentItem,
  updateContentItem,
  subscribeCompetitors,
  subscribeJobs,
  addCompetitor,
  updateCompetitor,
  removeCompetitor,
  subscribeSocialPosts,
  addSocialPost,
  updateSocialPost,
  deleteSocialPost,
  subscribeListings,
  saveListing,
} from "../../lib/sites";
import { diffSnapshots } from "../../lib/auditClient";
import { actionFor, briefFor, buildOpportunities } from "../../lib/opportunities";
import { suggestContent } from "../../lib/contentSuggestions";
import { effectivePolicy, retentionFor } from "../../lib/dataPolicy";
import { closeAbandonedJobs, enqueueAndRun, isLive } from "../../lib/jobClient";
import { JOB_TYPES } from "../../lib/jobTypes";
import { usageSummary, siteAccess, featureAccess, clampAutonomy } from "../../lib/entitlements";
import { FEATURES, autonomyLabel } from "../../lib/plans";
import { useRegion } from "../../lib/useRegion";
import Billing from "./screens/Billing";
import LockedFeature from "./screens/LockedFeature";
import { buildSiteInsights, CONTENT_BODY, hostnameOf } from "../../lib/seed";
import { digestData } from "../../lib/digest";
import { MadbotMark, SiteIcon } from "../components/Brand";
import ThemeToggle from "../components/ThemeToggle";
import SearchConsolePanel from "./panels/SearchConsolePanel";
import CompetitorPanel from "./panels/CompetitorPanel";
import DigestPanel from "./panels/DigestPanel";
import { SCREEN_TITLES } from "./data";
import OnboardingModal from "./OnboardingModal";
import AccountNotices from "./panels/AccountNotices";
import Growth from "./screens/Growth";
import Opportunities from "./screens/Opportunities";
import Content from "./screens/Content";
import Leads from "./screens/Leads";
import Approvals from "./screens/Approvals";
import Visibility from "./screens/Visibility";
import Autonomy from "./screens/Autonomy";
import ActivityLog from "./screens/ActivityLog";
import AgentRuns from "./screens/AgentRuns";
import Social from "./screens/Social";
import Listings from "./screens/Listings";
import { POST_STATUS } from "../../lib/social";
import { LISTING_STATUS } from "../../lib/listings";

function NavButton({ label, badge, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "9px 13px",
        border: 0,
        borderRadius: 999,
        cursor: "pointer",
        textAlign: "left",
        font: "600 13.5px var(--font-body)",
        background: active ? "var(--color-accent)" : "transparent",
        color: active ? "var(--color-bg)" : "var(--color-text)",
      }}
    >
      {label}
      {badge !== undefined ? (
        <span className={active ? "tag" : "tag tag-neutral"} style={{ fontSize: 10, padding: "1px 8px", background: active ? "var(--scrim-none)" : undefined, color: active ? "var(--color-bg)" : undefined }}>
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function FullScreenLoading() {
  return (
    <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "var(--color-bg)", color: "var(--fg)" }}>
      <span style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid var(--color-accent-300)", borderTopColor: "var(--color-accent)", animation: "sweep 1s linear infinite", display: "block" }} />
    </div>
  );
}

/**
 * When there's no organisation to work in: it's suspended, signups are closed,
 * or the membership is gone. Says which, offers any other organisation the
 * person belongs to, and a way out.
 */
function OrgProblem({ message, memberships, onSwitch, onSignOut }) {
  const others = (memberships || []).filter((m) => m.status === "active");
  return (
    <main id="main" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--color-bg)", color: "var(--color-text)" }}>
      <div className="card" style={{ maxWidth: 460, padding: 28, gap: 14 }}>
        <span className="card-kicker">Organisation</span>
        <h1 style={{ margin: 0, fontSize: 24 }}>Nothing to open right now</h1>
        <p role="alert" style={{ margin: 0, lineHeight: 1.6, color: "var(--fg-80)" }}>{message}</p>
        {others.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="mono">Your other organisations</span>
            {others.map((m) => (
              <button key={m.id} type="button" className="btn btn-secondary" onClick={() => onSwitch(m.id)}>
                Open {m.name}
              </button>
            ))}
          </div>
        ) : null}
        <button type="button" className="btn btn-ghost" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </main>
  );
}

/**
 * One live list under the active site (activity, approvals, leads…), stamped
 * with the site it was loaded for. A site switch shows an empty list until the
 * new site's arrives, rather than the previous site's data, and nothing is
 * cleared inside an effect.
 */
function useSiteList(subscribe, orgId, siteId) {
  const key = orgId && siteId ? `${orgId}/${siteId}` : null;
  const [state, setState] = useState({ key: null, items: [] });
  useEffect(() => {
    if (!key) return undefined;
    return subscribe(orgId, siteId, (items) => setState({ key, items }));
  }, [subscribe, key, orgId, siteId]);
  return state.key === key ? state.items : EMPTY_LIST;
}
const EMPTY_LIST = [];

/**
 * State that belongs to one key (a site, an organisation) and starts again at
 * `initial` when the key changes. An answer that arrives late for the old key
 * is ignored rather than shown under the new one. `initial` must be a
 * constant: it is compared by identity.
 */
function useKeyedState(key, initial) {
  const [state, setState] = useState({ key, value: initial });
  const value = state.key === key ? state.value : initial;
  const set = useCallback(
    (next) =>
      setState((prev) => {
        const base = prev.key === key ? prev.value : initial;
        return { key, value: typeof next === "function" ? next(base) : next };
      }),
    [key, initial]
  );
  return [value, set];
}
const GITHUB_UNKNOWN = { checked: false, connected: false, repo: null };

function DashboardInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initialUrl = params.get("url") || "";
  const { user, loading, logOut, connectSearchConsole } = useAuth();
  // The organisation this person is working in. Every path below is the
  // organisation's (lib/orgs.js), and nothing subscribes until it is known.
  const orgCtx = useOrg();
  const orgId = orgCtx.status === "ready" ? orgCtx.org.id : null;

  // One region lookup for the whole dashboard, passed to anything that shows
  // a price.
  const { region } = useRegion();

  const [screen, setScreen] = useState("growth");
  const [siteOpen, setSiteOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [signingOut, setSigningOut] = useState(false);

  const [sites, setSites] = useState(null);
  const [activeSiteId, setActiveSiteId] = useState(null);
  const siteKey = user && orgId && activeSiteId ? `${orgId}/${activeSiteId}` : null;
  const [site, setSite] = useKeyedState(siteKey, null);
  const activity = useSiteList(subscribeActivity, user && orgId ? orgId : null, activeSiteId);
  const approvals = useSiteList(subscribeApprovals, user && orgId ? orgId : null, activeSiteId);
  const leads = useSiteList(subscribeLeads, user && orgId ? orgId : null, activeSiteId);
  const content = useSiteList(subscribeContent, user && orgId ? orgId : null, activeSiteId);
  const competitors = useSiteList(subscribeCompetitors, user && orgId ? orgId : null, activeSiteId);
  const [competitorBusy, setCompetitorBusy] = useState(null);
  const [addingCompetitor, setAddingCompetitor] = useState(false);
  const [digestSentTo, setDigestSentTo] = useState(null);
  const jobs = useSiteList(subscribeJobs, user && orgId ? orgId : null, activeSiteId);
  // Once per site visit, close runs that were abandoned (lib/jobClient.js
  // closeAbandonedJobs), so the list and the "in flight" count tell the truth.
  // A run whose lease is still held, in another tab, is left alone.
  const sweptSite = useRef(null);
  useEffect(() => {
    if (!siteKey || !jobs.length || sweptSite.current === siteKey) return;
    sweptSite.current = siteKey;
    closeAbandonedJobs(orgId, activeSiteId, jobs).catch(() => {});
  }, [siteKey, jobs, orgId, activeSiteId]);
  const [jobBusy, setJobBusy] = useState(null);

  // Social. `socialNetworks` stays null until the status call answers, so the
  // screen can say "checking" rather than flashing "not connected" at someone
  // whose accounts are connected fine.
  const socialPosts = useSiteList(subscribeSocialPosts, user && orgId ? orgId : null, activeSiteId);
  const [socialNetworks, setSocialNetworks] = useKeyedState(siteKey, null);
  const [drafting, setDrafting] = useState(false);
  const [socialPublishingId, setSocialPublishingId] = useState(null);

  const listings = useSiteList(subscribeListings, user && orgId ? orgId : null, activeSiteId);
  const [writingListingId, setWritingListingId] = useState(null);

  // Search Console. The OAuth access token is session-only by design: Firebase
  // hands back no refresh token, so we never persist it and just reconnect.
  // Stamped with the site it was loaded for. Switching sites used to keep the
  // previous site's traffic on screen, feed it into the new site's
  // opportunities and digest, and let Refresh save site A's property onto
  // site B. Read through `gsc` below, which is empty for any other site.
  const [gscState, setGscState] = useState({ siteId: null, status: "idle", error: "", properties: [], siteUrl: null, data: null });
  const gscTokenRef = useRef(null);
  const GSC_EMPTY = { status: "idle", error: "", properties: [], siteUrl: null, data: null };
  const gsc = gscState.siteId === activeSiteId ? gscState : { ...GSC_EMPTY, siteId: activeSiteId };
  // Updates apply to the active site's state, starting fresh if the stored
  // state belongs to another site.
  const setGsc = (update) =>
    setGscState((prev) => {
      const base = prev.siteId === activeSiteId ? prev : { ...GSC_EMPTY, siteId: activeSiteId };
      return { ...(typeof update === "function" ? update(base) : update), siteId: activeSiteId };
    });
  const [sitesError, setSitesError] = useState(null);
  const [sitesRetry, setSitesRetry] = useState(0);
  const jobsInFlight = useRef(new Set());
  // null: decide from the data (open when there are no sites yet); after that,
  // whatever the person chose.
  const [onboardChoice, setOnboardOpen] = useState(null);
  const onboardOpen = onboardChoice ?? (sites !== null && sites.length === 0);

  const [aut, setAut] = useState(62);
  const [rules, setRules] = useState([]);
  const [voice, setVoice] = useState("a");
  const [paused, setPaused] = useState(false);
  const [takenOpportunities, setTakenOpportunities] = useState({});
  const [dismissedOpportunities, setDismissedOpportunities] = useState({});

  const [zoom, setZoom] = useState(1);
  // Null until the user picks; the panel falls back to the top finding.
  const [sel, setSel] = useState(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !orgId) return undefined;
    return subscribeSites(
      orgId,
      (list) => {
        setSitesError(null);
        setSites(list);
        setActiveSiteId((prev) => (prev && list.some((s) => s.id === prev) ? prev : list[0]?.id || null));
      },
      (err) =>
        setSitesError(
          /permission/i.test(String(err?.code || err?.message))
            ? "Your sites couldn't be read: the database refused access. If you were just added to this organisation, sign out and back in."
            : "Your sites couldn't be loaded. Check your connection and try again."
        )
    );
  }, [user, orgId, sitesRetry]);

  useEffect(() => {
    if (!siteKey) return undefined;
    return subscribeSite(orgId, activeSiteId, (s) => {
      setSite(s);
      if (s) {
        setAut(s.autonomy);
        setRules(s.rules || []);
        setVoice(s.voice || "a");
        setPaused(!!s.paused);
        setTakenOpportunities(s.takenOpportunities || {});
        setDismissedOpportunities(s.dismissedOpportunities || {});
      }
    });
  }, [siteKey, orgId, activeSiteId, setSite]);

  // Connection state for the social accounts. Not a snapshot listener: the
  // integration documents are server-only in the rules, precisely because they
  // hold live posting credentials, so this reads the safe summary the API
  // returns instead.
  useEffect(() => {
    if (!siteKey) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const idToken = await user.getIdToken();
        const res = await fetch(`/api/integrations/social?siteId=${encodeURIComponent(activeSiteId)}`, {
          headers: { "x-id-token": idToken },
        });
        const data = await res.json();
        if (!cancelled) setSocialNetworks(data.ok ? data.networks : []);
      } catch {
        if (!cancelled) setSocialNetworks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, orgId, activeSiteId]);


  // There is deliberately no background timer writing invented activity here.
  // The feed only grows when something real happens — a fetch at setup, or an
  // action the user takes. Faking "wins" on an interval is how a dashboard
  // starts lying to the person paying for it.

  // The licence. Read-only here — Firestore rules refuse client writes to it,
  // and the server checks it again before doing any paid work. These gates are
  // for clarity, not security.
  const [subscription, setSubscription] = useState(null);
  const [billing, setBilling] = useState([]);

  useEffect(() => {
    if (!user || !orgId) return;
    const offSub = subscribeSubscription(orgId, setSubscription);
    const offBilling = subscribeBilling(orgId, setBilling);
    return () => {
      offSub();
      offBilling();
    };
  }, [user, orgId]);

  // What the account has actually spent this month, so the allowance isn't a
  // number that only exists on the pricing page. Account-wide, because that is
  // what the allowance is.
  const [usageNow, setUsageNow] = useKeyedState(user && orgId ? orgId : null, null);
  // A stable key, so the subscription only restarts when the set of sites does.
  const siteIdsKey = (sites || []).map((s) => s.id).join(",");
  useEffect(() => {
    if (!user || !orgId) return undefined;
    return subscribeUsage(orgId, siteIdsKey ? siteIdsKey.split(",") : [], setUsageNow);
  }, [user, orgId, siteIdsKey]);

  const siteCount = (sites || []).length;
  const usage = useMemo(() => usageSummary(subscription, { siteCount }), [subscription, siteCount]);
  const canAddSite = useMemo(() => siteAccess(subscription, siteCount), [subscription, siteCount]);
  const autonomyCap = usage.plan.maxAutonomy;
  const access = useMemo(
    () => ({
      content: featureAccess(subscription, FEATURES.CONTENT),
      leads: featureAccess(subscription, FEATURES.LEADS),
      visibility: featureAccess(subscription, FEATURES.AI_VISIBILITY),
      competitors: featureAccess(subscription, FEATURES.COMPETITORS),
      social: featureAccess(subscription, FEATURES.SOCIAL),
      listings: featureAccess(subscription, FEATURES.LISTINGS),
    }),
    [subscription]
  );

  /** Opens onboarding, or explains why it can't be opened. */
  function requestAddSite() {
    if (!canAddSite.allowed) {
      setToast(canAddSite.reason);
      setScreen("billing");
      return;
    }
    setOnboardOpen(true);
  }

  const insights = useMemo(() => (site ? buildSiteInsights(site) : null), [site]);
  // Competitor diffs and Search Console now feed the opportunity map too. GSC
  // lives in session state rather than on the site document, so it's passed in
  // rather than read from the site.
  const opportunities = useMemo(
    () =>
      site
        ? buildOpportunities(site, {
            competitors,
            search: gsc.status === "ready" ? gsc.data : null,
          })
        : null,
    [site, competitors, gsc.status, gsc.data]
  );
  const [rerunning, setRerunning] = useState(false);
  const [asking, setAsking] = useState(false);

  // Re-reads the live site and replaces the stored audit, so the opportunity
  // map reflects the site as it is now rather than as it was at signup.
  async function rerunAudit() {
    if (!user || !activeSiteId || !site) return;
    setRerunning(true);
    try {
      const res = await fetch(`/api/audit?url=${encodeURIComponent(site.url)}`);
      const data = await res.json();
      if (!data.ok) {
        setToast(data.error || "Couldn't read the site just now.");
        return;
      }
      await updateSiteSettings(orgId, activeSiteId, {
        audit: {
          score: data.score,
          counts: data.counts,
          findings: data.findings,
          stats: data.stats,
          ranAt: new Date().toISOString(),
        },
        title: data.title || site.title,
        faviconUrl: data.faviconUrl || site.faviconUrl || null,
      });
      persist(addActivity(orgId, activeSiteId, {
        k: "seo",
        text: `Re-read ${hostnameOf(site.url)} — score ${data.score}, ${data.counts.critical} critical`,
        why: "You asked for a fresh audit",
        result: `Score ${data.score}`,
      }), "log the audit");
      setToast(`Audit refreshed — score ${data.score}, ${data.counts.critical} critical finding${data.counts.critical === 1 ? "" : "s"}.`);
    } catch (err) {
      setToast(`The audit didn't finish: ${err?.message || "try again"}.`);
    } finally {
      setRerunning(false);
    }
  }

  /**
   * Writes the screen fires without waiting go through here. About twenty of
   * them had no catch, so a refusal (a role without permission, a rule, the
   * network) vanished and the screen kept showing a change that never saved.
   */
  function persist(write, what) {
    return Promise.resolve(write).catch((err) => {
      const code = String(err?.code || "");
      setToast(
        code.includes("permission-denied")
          ? `Couldn't ${what}: your role in this organisation doesn't allow it.`
          : `Couldn't ${what}. ${err?.message || "Try again."}`
      );
    });
  }

  function go(k) {
    setScreen(k);
    setSiteOpen(false);
    setToast(null);
  }

  function commitAut() {
    if (!user || !activeSiteId) return;
    // The dial can be dragged past the plan's ceiling, but what gets saved is
    // clamped and the user is told why — silently snapping the handle back
    // reads as a broken control.
    const allowed = clampAutonomy(subscription, aut);
    if (allowed !== aut) {
      setAut(allowed);
      setToast(`${usage.plan.name} stops at "${autonomyLabel(autonomyCap)}". Saved at that level.`);
    }
    persist(updateSiteSettings(orgId, activeSiteId, { autonomy: allowed }), "save the autonomy level");
  }
  // The write happens outside the state updater: React may run an updater
  // twice, and this used to write the rules from inside one.
  function saveRules(updater) {
    const next = typeof updater === "function" ? updater(rules) : updater;
    setRules(next);
    if (user && activeSiteId) persist(updateSiteSettings(orgId, activeSiteId, { rules: next }), "save your rules");
  }
  function saveVoice(v) {
    setVoice(v);
    if (user && activeSiteId) persist(updateSiteSettings(orgId, activeSiteId, { voice: v }), "save the voice");
  }
  function togglePause() {
    const next = !paused;
    setPaused(next);
    if (user && activeSiteId) {
      persist(updateSiteSettings(orgId, activeSiteId, { paused: next }), next ? "pause" : "resume");
      setToast(next ? "Paused: nothing runs on a schedule until you resume. Anything you start yourself still runs." : "Resumed.");
    }
  }
  function toggleUndo(id, undone) {
    if (user && activeSiteId) persist(setActivityUndone(orgId, activeSiteId, id, undone), "update that entry");
  }
  function approve(id) {
    if (!user || !activeSiteId) return;
    persist(setApprovalStatus(orgId, activeSiteId, id, "yes"), "approve that");
    // An approved draft is now the customer's to send from their own mail app.
    // Reflect that on the lead, so its card stops saying the draft is waiting.
    const a = approvals.find((x) => x.id === id);
    if (a?.leadId) persist(updateLead(orgId, activeSiteId, a.leadId, { status: "approved" }), "update the lead");
  }
  function decline(id) {
    if (user && activeSiteId) persist(setApprovalStatus(orgId, activeSiteId, id, "no"), "decline that");
  }
  function editApproval(id, patch) {
    if (user && activeSiteId) persist(updateApproval(orgId, activeSiteId, id, patch), "save your changes");
  }

  // What taking an opportunity did: "content" (a piece planned and written),
  // "fix" (the change drafted into Approvals) or "list" (on the owner's list).
  async function markTaken(opp, how, activity) {
    setTakenOpportunities((prev) => ({ ...prev, [opp.id]: how }));
    await updateSiteSettings(orgId, activeSiteId, { [`takenOpportunities.${opp.id}`]: how });
    if (activity) await addActivity(orgId, activeSiteId, activity);
  }

  const [fixingId, setFixingId] = useState(null);

  /**
   * "Start the work" on an opportunity. It used to only set a flag that
   * nothing read. Now it does what the opportunity calls for (lib/opportunities
   * actionFor): plans and writes a piece, drafts the exact fix into Approvals,
   * or, for hosting-side work no draft can do, puts it on the owner's list.
   */
  async function takeOpportunity(oppId) {
    if (!user || !activeSiteId) return;
    const opp = opportunities?.nodes?.[oppId];
    if (!opp) return;
    const action = actionFor(opp);
    try {
      if (action.kind === "content") {
        if (!access.content.allowed) {
          await markTaken(opp, "list", { k: "seo", text: `Added to your list: ${opp.title}`, why: opp.fix || "", result: "On your list" });
          setToast(`${access.content.reason || "Writing isn't included in your plan."} It's on your list instead.`);
          return;
        }
        const brief = briefFor(opp, site);
        await markTaken(opp, "content");
        await planAndWrite({ ...brief, why: `From an opportunity: ${opp.title}`, opportunityId: opp.id });
        return;
      }
      if (action.kind === "fix") {
        await draftFixFor(opp);
        return;
      }
      await markTaken(opp, "list", { k: "seo", text: `Added to your list: ${opp.title}`, why: opp.fix || "", result: "On your list" });
      setToast("On your list. It's a change for your hosting or server, so re-run the audit once it's done to confirm it took.");
    } catch (err) {
      setToast(`Couldn't start that: ${err?.message || err}`);
    }
  }

  async function draftFixFor(opp) {
    setFixingId(opp.id);
    try {
      const res = await fetch("/api/opportunities/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken: await user.getIdToken(),
          siteId: activeSiteId,
          opportunity: { id: opp.id, title: opp.title, detail: opp.detail || null, fix: opp.fix || null, area: opp.area || null, source: opp.source || null },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setToast(data.error || "Couldn't draft that fix.");
        return;
      }
      await addApproval(orgId, activeSiteId, {
        kind: "fix",
        title: opp.title,
        body: data.fix.summary,
        fix: data.fix,
        opportunityId: opp.id,
      });
      await markTaken(opp, "fix", {
        k: "seo",
        text: `Drafted the fix for: ${opp.title}`,
        why: data.fix.summary,
        result: "Waiting in Approvals",
      });
      setToast("The fix is drafted and waiting in Approvals, with exactly where it goes.");
    } finally {
      setFixingId(null);
    }
  }

  // Suggested content: computed from what's been measured, never stored, so it
  // can't go stale (lib/contentSuggestions.js).
  const contentSuggestions = useMemo(
    () => (site ? suggestContent(site, { competitors, search: gsc.status === "ready" ? gsc.data : null, existing: content }) : []),
    [site, competitors, gsc.status, gsc.data, content]
  );

  async function acceptSuggestion(s, { write = true } = {}) {
    if (!user || !activeSiteId) return;
    try {
      await planAndWrite({ title: s.title, kind: s.kind, angle: s.angle, why: s.why, suggestionId: s.id }, { write });
    } catch (err) {
      setToast(`Couldn't add that: ${err?.message || err}`);
    }
  }

  async function dismissSuggestion(id) {
    if (!user || !activeSiteId) return;
    try {
      await updateSiteSettings(orgId, activeSiteId, { [`dismissedSuggestions.${id}`]: true });
    } catch (err) {
      setToast(`Couldn't hide that: ${err?.message || err}`);
    }
  }

  /**
   * Plans a piece with a real brief and, where writing is on, writes it at
   * once. Used by opportunities and suggestions; "Ask for a piece" is the
   * manual route to the same place.
   */
  async function planAndWrite({ title, kind, angle, why, opportunityId = null, suggestionId = null }, { write = true } = {}) {
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const day = (new Date().getDay() + 6) % 7;
    const ref = await addContentItem(orgId, activeSiteId, {
      day,
      dayName: dayNames[day],
      title,
      kind,
      angle,
      body: angle,
      meta: opportunityId ? "from an opportunity" : suggestionId ? "suggested from your data" : "you asked for this",
      opportunityId,
      suggestionId,
      requested: true,
    });
    await addActivity(orgId, activeSiteId, {
      k: "content",
      text: `Planned "${title}"`,
      why: why || "You asked for it",
      result: write && writingEnabled ? "Writing now" : "Planned",
    });
    if (write && writingEnabled) {
      setToast(`Writing "${title}". It takes a minute or two; it'll be on the Content screen.`);
      await writeContent({ id: ref.id, title, kind, angle });
    } else {
      setToast(`"${title}" is planned on the Content screen.`);
    }
    return ref.id;
  }
  function dismissOpportunity(oppId) {
    if (!user || !activeSiteId) return;
    setDismissedOpportunities((prev) => ({ ...prev, [oppId]: true }));
    persist(updateSiteSettings(orgId, activeSiteId, { [`dismissedOpportunities.${oppId}`]: true }), "hide that");
  }

  // sendLead and saveLeadDraft are gone. sendLead marked a lead "sent" while
  // delivering nothing, which was honest in its wording and confusing in
  // practice. Outreach now goes to Approvals and is sent from there, so there
  // is one path and it actually delivers.
  // A declined lead is kept only as long as a rejected one should be, and
  // qualification skips it (Leads.js). It used to keep the 90-day active
  // retention, and could still be qualified, spending a lead credit.
  function declineLead(id) {
    if (!user || !activeSiteId) return;
    const lead = leads.find((l) => l.id === id);
    const r = retentionFor({ status: "declined", policy: effectivePolicy(site?.dataPolicy) });
    persist(
      updateLead(orgId, activeSiteId, id, {
        status: "declined",
        ...(lead?.provenance ? { provenance: { ...lead.provenance, status: "rejected", retentionUntil: r.retentionUntil, retentionNote: r.note } } : {}),
      }),
      "decline that company"
    );
  }

  // No GitHub repo connected: publishing is honestly just a status flag, and
  // says so. Once a repo is connected, publishGithub takes over below.
  function publishContent(id) {
    if (!user || !activeSiteId) return;
    persist(updateContentItem(orgId, activeSiteId, id, { status: "published" }), "mark it published");
    const item = content.find((c) => c.id === id);
    if (item) {
      persist(
        addActivity(orgId, activeSiteId, {
          k: "content",
          text: `Marked "${item.title}" as published (not live on your site)`,
          why: "You approved this piece",
          result: "Marked published",
        }),
        "log that"
      );
    }
  }

  // ---- publish by GitHub PR ----
  const [github, setGithub] = useKeyedState(siteKey, GITHUB_UNKNOWN);
  const [connectingGithub, setConnectingGithub] = useState(false);
  const [githubError, setGithubError] = useState("");
  const [publishingId, setPublishingId] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!siteKey) return undefined;
    user.getIdToken().then((idToken) =>
      fetch(`/api/integrations/github?siteId=${activeSiteId}`, { headers: { "x-id-token": idToken } })
        .then((r) => r.json())
        .then((d) => {
          if (alive) setGithub({ checked: true, connected: !!d.connected, repo: d.repo || null, defaultBranch: d.defaultBranch || null });
        })
        .catch(() => {
          if (alive) setGithub({ checked: true, connected: false, repo: null });
        })
    );
    return () => {
      alive = false;
    };
  }, [user, orgId, activeSiteId]);

  async function connectGithub({ token, repo, contentPath }) {
    if (!user || !activeSiteId) return;
    setConnectingGithub(true);
    setGithubError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/integrations/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, siteId: activeSiteId, token, repo, contentPath: contentPath || null }),
      });
      const data = await res.json();
      if (!data.ok) {
        setGithubError(data.error || "Couldn't connect that repository.");
        return false;
      }
      setGithub({ checked: true, connected: true, repo: data.repo, defaultBranch: data.defaultBranch });
      setToast(`Connected to ${data.repo}. Publishing opens a pull request there.`);
      return true;
    } catch (err) {
      setGithubError(String(err?.message || err));
      return false;
    } finally {
      setConnectingGithub(false);
    }
  }

  async function disconnectGithub() {
    if (!user || !activeSiteId) return;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/integrations/github", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, siteId: activeSiteId }),
      });
      const data = await res.json().catch(() => ({}));
      // It used to show "disconnected" whatever the server said.
      if (!res.ok || data.ok === false) {
        setToast(data.error || "Couldn't disconnect GitHub. It's still connected; try again.");
        return;
      }
      setGithub({ checked: true, connected: false, repo: null });
      setToast("GitHub disconnected.");
    } catch {
      setToast("Couldn't reach the server, so GitHub is still connected. Try again.");
    }
  }

  async function publishViaGithub(id) {
    if (!user || !activeSiteId) return;
    setPublishingId(id);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/publish/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, siteId: activeSiteId, contentId: id }),
      });
      const data = await res.json();
      if (!data.ok) {
        setToast(data.error || "Couldn't open a pull request.");
        return;
      }
      const item = content.find((c) => c.id === id);
      await addActivity(orgId, activeSiteId, {
        k: "content",
        text: `Opened a pull request for "${item?.title || "a piece"}"`,
        why: "Publishing is by pull request, so nothing goes live without a review",
        result: `PR #${data.prNumber}`,
      });
      setToast(`Pull request opened — nothing is live until it's merged.`);
    } catch (err) {
      setToast(String(err?.message || err));
    } finally {
      setPublishingId(null);
    }
  }
  // "Try another angle" is gone. It rotated through two or three canned sentences
  // and called that a rewrite — a fake of the real thing, which is "Write it".
  // Whether the model features can actually run — probed, not assumed. A key
  // that exists but has been disabled or revoked used to report as ready, so
  // every button was enabled and every click failed with an uninterpretable 401.
  // Whether the server can use a model at all, from /api/ai-status, which makes
  // one live call and caches it: a revoked or out-of-credit key is still
  // present in the environment, so checking presence would report everything
  // ready and then every button would fail with a 401 nobody can interpret.
  // Asked once per page (it used to be asked twice, by two effects).
  const [ai, setAi] = useState({ state: "checking", ready: false, message: null });
  const writingEnabled = ai.ready;
  const socialAiConfigured = !!ai.ready;
  // Why it can't run, in the server's own words, so the screen says "the key is
  // being rejected" rather than a generic "unavailable".
  const aiStatusMessage = ai.ready ? null : ai.message || null;
  const [writingId, setWritingId] = useState(null);
  const [writeError, setWriteError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/ai-status")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setAi(d);
      })
      .catch(() => {
        if (alive) setAi({ state: "unreachable", ready: false, message: "Couldn't check whether AI features are available." });
      });
    return () => {
      alive = false;
    };
  }, []);

  async function writeContent(item) {
    if (!user || !activeSiteId || !site) return;
    setWritingId(item.id);
    setWriteError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          siteId: activeSiteId,
          item: { title: item.title, kind: item.kind, angle: item.angle || null },
          site: {
            name: insights?.name,
            domain: insights?.domain,
            description: site.description || "",
            rules,
            voice,
            // Real pages for the pipeline's internal-linking stage. Without
            // these it can only invent plausible-looking paths, which the
            // pipeline itself then strips — better to give it the real list.
            pages: site.intelligence?.structure?.topPages || [],
          },
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setWriteError(data.error || "Couldn't write that piece.");
        return;
      }
      await updateContentItem(orgId, activeSiteId, item.id, {
        article: data.article,
        title: data.title || item.title,
        description: data.description || null,
        words: data.words,
        faqs: data.faqs || [],
        schema: data.schema || null,
        internalLinks: data.internalLinks || [],
        sources: data.sources || [],
        factCheck: data.factCheck || null,
        // A piece with unsupported claims doesn't publish with one click —
        // Content.js gates the publish button on this.
        publishable: !!data.publishable,
        needsReview: !!data.needsReview,
        writtenAt: new Date(),
      });
      const flagged = data.factCheck?.unsupportedCount || 0;
      await addActivity(orgId, activeSiteId, {
        k: "content",
        text: `Wrote "${data.title || item.title}" — ${data.words} words`,
        why: item.angle ? `Your angle: ${item.angle}` : `Researched, drafted and fact-checked as a ${item.kind} piece`,
        result: flagged ? `${flagged} claim${flagged === 1 ? "" : "s"} need review` : "Drafted, all claims checked",
        undo: true,
      });
      setToast(
        flagged
          ? `"${data.title || item.title}" drafted — ${data.words} words, ${flagged} claim${flagged === 1 ? "" : "s"} to check before publishing.`
          : `"${data.title || item.title}" drafted — ${data.words} words, every claim checked.`
      );
    } catch (err) {
      setWriteError(err?.message || "Writing failed.");
    } finally {
      setWritingId(null);
    }
  }

  async function askForPiece({ topic, kind, day, angle }) {
    if (!user || !activeSiteId) return;
    if (!insights) {
      setToast("The site hasn't been read yet, so there's nothing to plan from. Run a crawl first.");
      return;
    }
    setAsking(true);
    try {
      const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      await addContentItem(orgId, activeSiteId, {
        day,
        dayName: dayNames[day],
        title: topic,
        kind,
        meta: "you asked for this",
        angle: angle || null,
        body: angle
          ? `${angle}. ${CONTENT_BODY[kind] ? CONTENT_BODY[kind](insights.name) : ""}`.trim()
          : (CONTENT_BODY[kind] || CONTENT_BODY.Support)(insights.name),
        requested: true,
      });
      await addActivity(orgId, activeSiteId, {
        k: "content",
        text: `Added "${topic}" to the ${dayNames[day]} plan at your request`,
        why: angle ? `Your angle: ${angle}` : "You asked for it",
        result: "Planned",
      });
      setToast(`"${topic}" added to the plan.`);
    } catch (err) {
      setToast(`Couldn't add that piece: ${err?.message || "try again"}.`);
    } finally {
      setAsking(false);
    }
  }

  // Never throws: a network failure comes back as { ok: false }, so no caller
  // can be left on "loading".
  async function gscCall(action, extra = {}) {
    try {
      const res = await fetch("/api/search-console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: await user.getIdToken(), token: gscTokenRef.current, action, ...extra }),
      });
      return await res.json().catch(() => ({ ok: false, error: `The server answered ${res.status}.` }));
    } catch {
      return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    }
  }

  async function loadGscSummary(propertyUrl) {
    setGsc((s) => ({ ...s, status: "loading", error: "" }));
    const data = await gscCall("summary", { siteUrl: propertyUrl });
    if (!data.ok) {
      setGsc((s) => ({ ...s, status: "error", error: data.error, needsReconnect: !!data.needsReconnect, enableUrl: data.enableUrl || null }));
      return;
    }
    setGsc((s) => ({ ...s, status: "ready", siteUrl: propertyUrl, data }));
    if (user && activeSiteId) persist(updateSiteSettings(orgId, activeSiteId, { gscProperty: propertyUrl }), "remember the Search Console property");
  }

  async function handleConnectSearchConsole() {
    setGsc((s) => ({ ...s, status: "connecting", error: "" }));
    try {
      gscTokenRef.current = await connectSearchConsole();
      const listed = await gscCall("sites");
      if (!listed.ok) {
        setGsc((s) => ({ ...s, status: "error", error: listed.error, enableUrl: listed.enableUrl || null }));
        return;
      }
      const properties = listed.sites || [];
      // If one of their verified properties matches this site, skip the picker.
      const auto =
        properties.find((p) => p.siteUrl.replace(/^sc-domain:/, "").includes(hostnameOf(site?.url || ""))) || null;
      if (auto) {
        setGsc((s) => ({ ...s, properties }));
        await loadGscSummary(auto.siteUrl);
      } else {
        setGsc((s) => ({ ...s, status: "choosing", properties }));
      }
    } catch (err) {
      const code = err?.code || "";
      const friendly = code.includes("popup-closed")
        ? "Sign-in window closed before Google finished."
        : code.includes("popup-blocked")
        ? "Your browser blocked the popup — allow popups and try again."
        : err?.message || "Couldn't connect to Google.";
      setGsc((s) => ({ ...s, status: "idle", error: friendly }));
    }
  }

  async function addCompetitorSite(url) {
    if (!user || !activeSiteId) return { error: "No site selected." };
    setAddingCompetitor(true);
    try {
      const res = await fetch(`/api/snapshot?url=${encodeURIComponent(url)}`, {
        headers: { "x-id-token": await user.getIdToken() },
      });
      const data = await res.json();
      if (!data.ok) return { error: data.error };
      await addCompetitor(orgId, activeSiteId, { url: data.snapshot.url, snapshot: data.snapshot });
      persist(addActivity(orgId, activeSiteId, {
        k: "link",
        text: `Started watching ${hostnameOf(url)} for changes`,
        why: "You added them as a competitor",
        result: "Watching",
      }), "log that");
      return {};
    } catch {
      return { error: "Couldn't reach that site." };
    } finally {
      setAddingCompetitor(false);
    }
  }

  async function checkCompetitor(c) {
    if (!user || !activeSiteId) return;
    setCompetitorBusy(c.id);
    try {
      const res = await fetch(`/api/snapshot?url=${encodeURIComponent(c.url)}`, {
        headers: { "x-id-token": await user.getIdToken() },
      });
      const data = await res.json();
      // It used to return silently here, so a failed check looked like "no change".
      if (!data.ok) {
        setToast(`Couldn't check ${hostnameOf(c.url)}: ${data.error || "the site didn't answer"}.`);
        return;
      }
      const changes = diffSnapshots(c.snapshot, data.snapshot);
      await updateCompetitor(orgId, activeSiteId, c.id, {
        snapshot: data.snapshot,
        changes,
        lastCheckedAt: new Date(),
      });
      if (changes.length) {
        persist(addActivity(orgId, activeSiteId, {
          k: "link",
          text: `${hostnameOf(c.url)} changed: ${changes[0].text}`,
          why: "Detected by comparing against the previous snapshot",
          result: `${changes.length} change${changes.length === 1 ? "" : "s"}`,
        }), "log that");
        setToast(`${hostnameOf(c.url)} changed — ${changes[0].text}`);
      } else {
        setToast(`No change on ${hostnameOf(c.url)} since the last check.`);
      }
    } catch {
      setToast(`Couldn't check ${hostnameOf(c.url)} just now. Try again shortly.`);
    } finally {
      setCompetitorBusy(null);
    }
  }

  // Every agent action goes through the job engine, so it gets a lease, step
  // trace, retry policy and an audit record for free.
  async function startJob(type, params, siteIdOverride) {
    // A siteId can be passed explicitly for the one caller that fires right
    // after connecting a site, before activeSiteId's state update has landed —
    // React state set a line above isn't visible in this closure yet.
    const targetSiteId = siteIdOverride || activeSiteId;
    if (!user || !targetSiteId) return;
    // One run of a kind at a time. The busy state disables the button, but
    // only after a render; two clicks in quick succession both got through and
    // ran two paid searches five seconds apart.
    const runKey = `${targetSiteId}:${type}`;
    if (jobsInFlight.current.has(runKey)) return;
    jobsInFlight.current.add(runKey);
    setJobBusy(type);
    try {
      const out = await enqueueAndRun(
        orgId,
        targetSiteId,
        { type, params },
        {
          getIdToken: () => user.getIdToken(),
          onActivity: (entry) => addActivity(orgId, targetSiteId, entry),
        }
      );
      if (out.completed) setToast(out.outcome?.summary || "Run finished.");
      else if (out.retrying) setToast("That run hit a problem and is queued to retry.");
      else if (out.failed) setToast(out.error || "That run failed.");
      return out;
    } catch (err) {
      // Most often an unpublished Firestore rule for the jobs collection.
      const msg = String(err?.message || err);
      setToast(
        /insufficient permissions/i.test(msg)
          ? "Firestore is refusing to store jobs — the jobs/pages rules need publishing."
          : msg
      );
    } finally {
      setJobBusy(null);
      jobsInFlight.current.delete(runKey);
    }
  }

  const runCrawl = () => site && startJob(JOB_TYPES.CRAWL_SITE, { url: site.url, maxPages: 20 });
  const runAuditJob = () => site && startJob(JOB_TYPES.AUDIT_SITE, { url: site.url });
  const runCompetitorScan = () =>
    startJob(JOB_TYPES.COMPETITOR_SCAN, {
      competitors: competitors.map((c) => ({ id: c.id, url: c.url, snapshot: c.snapshot || null })),
    });

  // Two steps on purpose: working out the questions is cheap, answering them
  // with live web search is not. The user sees and approves the questions
  // before anything expensive runs.
  // Per site: a different site's questions must not linger on screen.
  const [visQuestions, setVisQuestions] = useKeyedState(activeSiteId, null);
  const [visPlanning, setVisPlanning] = useState(false);
  const [visError, setVisError] = useKeyedState(activeSiteId, null);

  async function planVisibility() {
    if (!user || !site?.intelligence) return;
    setVisPlanning(true);
    setVisError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/visibility/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, siteId: activeSiteId }),
      });
      const data = await res.json();
      if (data.ok) setVisQuestions(data);
      else setVisError(data.error || "Couldn't work out the questions.");
    } catch (err) {
      setVisError(String(err?.message || err));
    } finally {
      setVisPlanning(false);
    }
  }

  // ---- leads ----
  const [buildingProfile, setBuildingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [draftingOutreachId, setDraftingOutreachId] = useState(null);
  const buyerProfile = site?.buyerProfile || null;

  async function buildProfile() {
    if (!user || !site?.intelligence) return;
    setBuildingProfile(true);
    setProfileError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/leads/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, siteId: activeSiteId }),
      });
      const data = await res.json();
      if (data.ok) await updateSiteSettings(orgId, activeSiteId, { buyerProfile: data.profile });
      else setProfileError(data.error || "Couldn't work out a buyer profile.");
    } catch (err) {
      setProfileError(String(err?.message || err));
    } finally {
      setBuildingProfile(false);
    }
  }

  function saveDataPolicy(next) {
    if (!user || !activeSiteId) return;
    persist(updateSiteSettings(orgId, activeSiteId, { dataPolicy: next }), "save your data rules");
    setToast("Data rules updated.");
  }

  function saveProfile(next) {
    if (!user || !activeSiteId) return;
    persist(updateSiteSettings(orgId, activeSiteId, { buyerProfile: next }), "save the buyer profile");
    setToast(next.needsConfirmation ? "Saved." : "Buyer profile confirmed.");
  }

  const discoverLeads = () => startJob(JOB_TYPES.LEAD_DISCOVER, { profile: buyerProfile, max: 30 });

  const qualifyLeads = (companies) =>
    startJob(JOB_TYPES.LEAD_QUALIFY, {
      profile: buyerProfile,
      customerDomain: site?.intelligence?.domain || insights?.domain,
      // Never a company the owner declined: qualifying costs a lead credit
      // per company, and it used to spend one on these.
      companies: (companies || []).filter((c) => c.status !== "declined").map((c) => ({
        name: c.co,
        domain: c.domain,
        signals: c.signals || null,
        why: c.why || null,
      })),
    });

  /**
   * Outreach is drafted, never sent. The draft goes to Approvals and a person
   * presses send — at every autonomy level, deliberately. An unattended agent
   * cold-emailing strangers from the customer's own domain risks their sending
   * reputation and makes any complaint theirs to answer.
   */
  async function draftOutreach(lead) {
    if (!user || !activeSiteId) return;
    setDraftingOutreachId(lead.id);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/leads/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          siteId: activeSiteId,
          lead: {
            co: lead.co,
            domain: lead.domain,
            contactEmail: lead.contactEmail,
            contactIsGeneric: lead.contactIsGeneric,
            problemYouSolve: lead.problemYouSolve,
            why: lead.why,
            openingLine: lead.openingLine,
            intentSignals: lead.intentSignals || [],
          },
          profile: buyerProfile,
          site: {
            name: site?.intelligence?.business?.name || insights?.name,
            domain: site?.intelligence?.domain || insights?.domain,
            summary: site?.intelligence?.business?.description || site?.description || "",
            voice,
            rules,
          },
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setToast(data.error || "Couldn't draft that email.");
        return;
      }
      // A real subject and body now, not a one-line opener. Approvals renders
      // exactly these fields, and "Approve" opens them in the customer's own
      // mail client.
      await addApproval(orgId, activeSiteId, {
        kind: "outreach",
        title: `Outreach to ${lead.co || lead.domain}`,
        subject: data.subject,
        body: data.body,
        confidence: data.confidence,
        claims: data.claims || [],
        to: lead.contactEmail,
        leadId: lead.id,
        leadName: lead.co || lead.domain,
        why: lead.why || null,
        provenance: lead.provenance || null,
      });
      await updateLead(orgId, activeSiteId, lead.id, { status: "drafted" });
      setToast("Draft is waiting in Approvals. Nothing has been sent.");
    } catch (err) {
      setToast(String(err?.message || err));
    } finally {
      setDraftingOutreachId(null);
    }
  }

  async function runVisibilityCheck() {
    if (!site || !visQuestions?.questions?.length) return;
    const out = await startJob(JOB_TYPES.AI_VISIBILITY, {
      domain: site.intelligence?.domain || insights.domain,
      brandName: site.intelligence?.business?.name || null,
      questions: visQuestions.questions,
    });
    // Drop the approved set only once it has been used, so the button can't
    // fire a second paid run on a stray click. A failed run keeps them: they
    // cost credits to draft, and the person shouldn't pay twice.
    if (out?.completed) setVisQuestions(null);
  }

  async function toggleAutoVisibility(next) {
    if (!user || !activeSiteId) return;
    try {
      await updateSiteSettings(orgId, activeSiteId, { autoVisibility: next });
      setToast(next ? "MADBOT will re-check this weekly." : "Weekly re-checks turned off.");
    } catch (err) {
      setToast(String(err?.message || err));
    }
  }

  // --- Social ---------------------------------------------------------------

  /**
   * Drafts a set of posts and stores each one separately.
   *
   * One document per network rather than one per run, because they are approved,
   * edited, published and retried individually from here on — a LinkedIn post
   * can go out while the Instagram one is still waiting for an image.
   */
  async function draftSocial({ source, link, networkIds }) {
    if (!user || !activeSiteId) return;
    setDrafting(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/social/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          siteId: activeSiteId,
          site: {
            name: site?.intelligence?.business?.name || site?.title,
            domain: site?.intelligence?.domain || insights?.domain,
            summary: site?.intelligence?.business?.summary || site?.description,
            voice,
            rules,
          },
          source,
          link,
          networkIds,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setToast(data.error || "Couldn't draft those.");
        return;
      }

      const failures = (data.posts || []).filter((p) => p.error);
      await Promise.all(
        (data.posts || [])
          .filter((p) => !p.error)
          .map((p) =>
            addSocialPost(orgId, activeSiteId, {
              networkId: p.networkId,
              text: p.text,
              imageBrief: p.imageBrief,
              altText: p.altText,
              firstComment: p.firstComment,
              confidence: p.confidence,
              guardrail: p.guardrail || null,
              angle: data.chosenAngle?.hook || null,
              link: link || null,
              source: String(source).slice(0, 2000),
              status: POST_STATUS.DRAFTED,
            })
          )
      );

      // Same shape as every other feed entry — {k, text, why, result}. The first
      // version wrote {kind, title, detail} and rendered as an empty row.
      const drafted = data.posts.filter((p) => !p.error).length;
      await addActivity(orgId, activeSiteId, {
        k: "social",
        text: `Drafted ${drafted} social post${drafted === 1 ? "" : "s"}`,
        why: data.chosenAngle?.hook ? `Angle: ${data.chosenAngle.hook}` : "You asked for drafts",
        result: "Waiting for approval",
      });

      setToast(
        failures.length
          ? `Drafted ${data.posts.length - failures.length}. ${failures.length} failed: ${failures[0].error}`
          : "Drafted. Nothing goes out until you approve it."
      );
    } catch (err) {
      setToast(String(err?.message || err));
    } finally {
      setDrafting(false);
    }
  }

  const editSocialPost = (postId, patch) => persist(updateSocialPost(orgId, activeSiteId, postId, patch), "save the post");
  const approveSocialPost = (postId) => persist(updateSocialPost(orgId, activeSiteId, postId, { status: POST_STATUS.APPROVED, approvedAt: new Date() }), "approve the post");
  const declineSocialPost = (postId) => persist(deleteSocialPost(orgId, activeSiteId, postId), "delete the post");

  async function publishSocialPost(post) {
    if (!user || !activeSiteId) return;
    setSocialPublishingId(post.id);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/social/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, siteId: activeSiteId, postId: post.id }),
      });
      const data = await res.json();
      setToast(data.ok ? (data.warning ? data.warning : "Posted.") : data.error || "Couldn't post that.");
    } catch (err) {
      setToast(String(err?.message || err));
    } finally {
      setSocialPublishingId(null);
    }
  }

  async function connectSocial(provider, token) {
    if (!user || !activeSiteId) return;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/integrations/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, siteId: activeSiteId, provider, token }),
      });
      const data = await res.json();
      if (!data.ok) {
        setToast(data.error || "Couldn't connect that.");
        return;
      }
      setToast(
        data.needsAuthorChoice
          ? "Connected. Pick whether posts go out as you or as the Page before posting."
          : data.needsPageChoice
          ? "Connected. Pick which Page to post to."
          : "Connected."
      );
      await refreshSocialNetworks();
    } catch (err) {
      setToast(String(err?.message || err));
    }
  }

  async function disconnectSocial(provider) {
    if (!user || !activeSiteId) return;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/integrations/social", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, siteId: activeSiteId, provider }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        setToast(data.error || "Couldn't disconnect that account. It's still connected; try again.");
        return;
      }
      setToast("Disconnected. Nothing already posted is affected.");
    } catch {
      setToast("Couldn't reach the server, so the account is still connected. Try again.");
      return;
    }
    await refreshSocialNetworks();
  }

  async function refreshSocialNetworks() {
    if (!user || !activeSiteId) return;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/integrations/social?siteId=${encodeURIComponent(activeSiteId)}`, {
        headers: { "x-id-token": idToken },
      });
      const data = await res.json();
      setSocialNetworks(data.ok ? data.networks : []);
    } catch {
      setToast("Couldn't refresh your social connections. Reload to try again.");
    }
  }

  // --- Directory listings -----------------------------------------------------

  async function writeListingCopy(directoryId) {
    if (!user || !activeSiteId) return;
    setWritingListingId(directoryId);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/listings/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          siteId: activeSiteId,
          directoryId,
          site: {
            name: site?.intelligence?.business?.name || site?.title,
            domain: site?.intelligence?.domain || insights?.domain,
            // business.description and structure.topPages are what the crawl
            // stores. This sent business.summary and intelligence.pages, which
            // don't exist, so the writer only ever saw the meta description.
            summary: [site?.intelligence?.business?.category, site?.intelligence?.business?.description || site?.description].filter(Boolean).join(". ") || null,
            pages: site?.intelligence?.structure?.topPages || [],
            voice,
            rules,
          },
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setToast(data.error || "Couldn't write that one.");
        return;
      }
      const before = listings.find((l) => l.id === directoryId)?.status;
      await saveListing(orgId, activeSiteId, directoryId, {
        copy: data.copy,
        claims: data.claims || [],
        problems: data.problems || [],
        // Rewriting the copy of a listing that is already submitted or live
        // doesn't un-submit it.
        status: !before || before === LISTING_STATUS.NOT_STARTED ? LISTING_STATUS.DRAFTED : before,
      });
      setToast(data.ready ? "Written. Check it, then paste it into their form." : "Written, but something is over a limit — see the notes.");
    } catch (err) {
      setToast(String(err?.message || err));
    } finally {
      setWritingListingId(null);
    }
  }

  const saveListingCopy = async (directoryId, patch) => {
    try {
      await saveListing(orgId, activeSiteId, directoryId, patch);
      setToast("Saved.");
    } catch (err) {
      setToast(`Couldn't save that: ${err?.message || err}`);
    }
  };
  const setListingStatus = async (directoryId, status) => {
    try {
      await saveListing(orgId, activeSiteId, directoryId, { status });
    } catch (err) {
      setToast(`Couldn't change the status: ${err?.message || err}`);
    }
  };

  async function handleSignOut() {
    setSigningOut(true);
    await logOut();
    router.replace("/login");
  }

  const [sendingDigest, setSendingDigest] = useState(false);
  async function sendDigestNow() {
    if (!user || !site) return;
    setSendingDigest(true);
    try {
      // The server builds the email from its own records; the only thing it
      // can't read for itself is Search Console, which sends numbers only.
      const search =
        gsc.status === "ready" && gsc.data?.current
          ? {
              current: {
                clicks: gsc.data.current.clicks || 0,
                impressions: gsc.data.current.impressions || 0,
                position: gsc.data.current.position ?? null,
              },
              previous: gsc.data.previous
                ? {
                    clicks: gsc.data.previous.clicks || 0,
                    impressions: gsc.data.previous.impressions || 0,
                    position: gsc.data.previous.position ?? null,
                  }
                : null,
            }
          : null;
      const idToken = await user.getIdToken();
      const res = await fetch("/api/send-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, siteId: activeSiteId, search }),
      });
      const data = await res.json();
      if (data.ok) setDigestSentTo(data.to);
      setToast(data.ok ? `Digest sent to ${data.to}.` : data.error || "Couldn't send the digest.");
    } catch (err) {
      setToast(err?.message || "Couldn't send the digest.");
    } finally {
      setSendingDigest(false);
    }
  }

  const pendingCount = approvals.filter((a) => a.status === "pending").length;
  // What is genuinely in flight, so the header and the Growth feed say
  // "working" only when something is — not a spinner that never stops.
  // Only runs that are really in progress: an abandoned one (the page that
  // drove it was closed) used to count as "in flight" for ever.
  const runningJobs = jobs.filter((j) => isLive(j)).length;

  if (loading) return <FullScreenLoading />;
  if (!user) return null;
  if (orgCtx.status === "error") {
    return <OrgProblem message={orgCtx.error} memberships={orgCtx.memberships} onSwitch={orgCtx.switchOrg} onSignOut={handleSignOut} />;
  }
  if (sitesError) {
    return (
      <main id="main" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--color-bg)", color: "var(--color-text)" }}>
        <div className="card" style={{ maxWidth: 460, padding: 28, gap: 14 }}>
          <span className="card-kicker">Your sites</span>
          <h1 style={{ margin: 0, fontSize: 24 }}>Couldn&apos;t load your sites</h1>
          <p role="alert" style={{ margin: 0, lineHeight: 1.6, color: "var(--fg-80)" }}>{sitesError}</p>
          <button type="button" className="btn btn-primary" style={{ color: "var(--on-accent)" }} onClick={() => setSitesRetry((n) => n + 1)}>
            Try again
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </main>
    );
  }
  if (!orgId || sites === null) return <FullScreenLoading />;

  const displayName = user.displayName || user.email || "you";

  return (
    <div className="shell product" style={{ height: "100vh", fontSize: 15, color: "var(--color-text)", background: "var(--color-bg)", overflow: "hidden" }}>
      <aside className="shell-nav" style={{ background: "var(--color-surface)", padding: "18px 14px 14px", display: "flex", flexDirection: "column", gap: 16, borderRight: "1px solid var(--color-divider)", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 6px" }}>
          <MadbotMark size={29} />
          <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 21, letterSpacing: "-.005em", color: "var(--fg)" }}>madbot</span>
        </div>
        {/* Which organisation this is, and the role held in it. A switcher only
            when there is something to switch to. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--color-divider)" }}>
          <span className="mono" style={{ fontSize: 10.5 }}>Organisation · {orgCtx.role?.name}</span>
          {orgCtx.memberships.length > 1 ? (
            <label style={{ display: "flex", flexDirection: "column" }}>
              <span className="sr-only">Switch organisation</span>
              <select
                className="input"
                value={orgId}
                onChange={(e) => orgCtx.switchOrg(e.target.value)}
                style={{ minHeight: 34, fontSize: 13.5, paddingBlock: 0 }}
              >
                {orgCtx.memberships.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.status !== "active"}>
                    {m.name}
                    {m.status !== "active" ? " (suspended)" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{orgCtx.org.name}</span>
          )}
          {!orgCtx.can("work.run") ? (
            <span style={{ fontSize: 11.5, lineHeight: 1.45, color: "var(--fg-60)" }}>
              View only: your role can see everything here but not change it.
            </span>
          ) : null}
        </div>

        <div style={{ position: "relative" }}>
          <button
            className="btn btn-secondary"
            onClick={() => setSiteOpen((v) => !v)}
            disabled={!site}
            style={{ width: "100%", justifyContent: "space-between", background: "var(--color-bg)", fontWeight: 600, fontSize: 13, minWidth: 0 }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden", minWidth: 0, flex: 1 }}>
              {site ? <SiteIcon site={site} size={16} /> : <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-accent-2-600)", flex: "none" }} />}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                {site ? hostnameOf(site.url) : "No site yet"}
              </span>
            </span>
            <span style={{ opacity: 0.5, fontSize: 11, flex: "none" }}>{sites?.length || 0} site{sites?.length === 1 ? "" : "s"}</span>
          </button>
          {siteOpen ? (
            <div className="card elev-lg" style={{ position: "absolute", top: 44, left: 0, right: 0, zIndex: 30, padding: 8, gap: 2, background: "var(--color-bg)", animation: "pop .18s ease-out" }}>
              {(sites || []).map((s) => (
                <button
                  key={s.id}
                  className="btn btn-ghost"
                  onClick={() => { setActiveSiteId(s.id); setSiteOpen(false); }}
                  style={{ justifyContent: "flex-start", gap: 8, color: "var(--color-text)", fontWeight: 600, fontSize: 13 }}
                >
                  <SiteIcon site={s} size={16} />
                  {hostnameOf(s.url)}
                </button>
              ))}
              <div className="hr" style={{ margin: "6px 0" }} />
              <button className="btn btn-ghost" onClick={() => { requestAddSite(); setSiteOpen(false); }} style={{ justifyContent: "flex-start", fontSize: 13, fontWeight: 600 }}>
                + Connect a new site
              </button>
            </div>
          ) : null}
        </div>

        <nav className="nav-links" style={{ display: "flex", flexDirection: "column", gap: 2 }} aria-label="Sections">
          <NavButton label="Growth" active={screen === "growth"} onClick={() => go("growth")} />
          <NavButton label="Opportunities" active={screen === "opps"} onClick={() => go("opps")} />
          <NavButton label="Content" active={screen === "content"} onClick={() => go("content")} />
          <NavButton label="Social" active={screen === "social"} onClick={() => go("social")} />
          <NavButton label="Listings" active={screen === "listings"} onClick={() => go("listings")} />
          <NavButton label="Lead intelligence" active={screen === "leads"} onClick={() => go("leads")} />
          <NavButton label="Approvals" badge={pendingCount} active={screen === "appr"} onClick={() => go("appr")} />
          <NavButton label="AI visibility" active={screen === "vis"} onClick={() => go("vis")} />
          <NavButton label="Autonomy" active={screen === "aut"} onClick={() => go("aut")} />
          <NavButton label="Agent runs" badge={runningJobs || undefined} active={screen === "runs"} onClick={() => go("runs")} />
          <NavButton label="Activity log" active={screen === "log"} onClick={() => go("log")} />
          <NavButton label="Billing" active={screen === "billing"} onClick={() => go("billing")} />
        </nav>

        <div className="nav-aside" style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => go("aut")}
            style={{ border: 0, cursor: "pointer", textAlign: "left", background: "var(--color-accent-2-100)", borderRadius: 26, padding: 14, fontFamily: "var(--font-body)" }}
          >
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 14, marginBottom: 3 }}>Brand voice</div>
            <div style={{ fontSize: 11.5, color: "var(--color-accent-2-800)", lineHeight: 1.45 }}>
              {voice === "a" ? "Short and direct. Change it any time." : "Thorough and professional. Change it any time."}
            </div>
          </button>
          <button className="btn btn-secondary" onClick={requestAddSite} style={{ fontWeight: 600, fontSize: 12.5 }}>
            Connect another site
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 6px 0" }}>
            <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--color-accent-2-400)", flex: "none", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>
              {displayName.slice(0, 2).toUpperCase()}
            </span>
            <span style={{ fontSize: 12.5, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {displayName}
            </span>
            <button className="btn btn-ghost" onClick={handleSignOut} disabled={signingOut} style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600 }}>
              {signingOut ? "…" : "Sign out"}
            </button>
          </div>
        </div>
      </aside>

      <main id="main" style={{ overflow: "auto", position: "relative" }}>
        <header
          className="dash-header"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 26px",
            background: "var(--scrim)",
            backdropFilter: "blur(8px)",
            borderBottom: "1px solid var(--color-divider)",
          }}
        >
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 17 }}>{SCREEN_TITLES[screen] || "Growth"}</div>
          {site ? (
            <span className="tag tag-neutral" style={{ fontSize: 11, gap: 6 }}>
              <SiteIcon site={site} size={13} />
              {hostnameOf(site.url)}
            </span>
          ) : null}
          {/* The plan is always on screen. Nobody should have to go looking for
              what they're paying for or how long a trial has left. */}
          <button
            onClick={() => go("billing")}
            className="tag"
            style={{
              fontSize: 11,
              cursor: "pointer",
              border: 0,
              gap: 6,
              background: usage.trialing
                ? "var(--color-accent-200)"
                : usage.plan.id === "free" || usage.plan.id === "lapsed"
                ? "var(--color-neutral-200)"
                : "var(--color-accent-2-200)",
              color: usage.trialing
                ? "var(--color-accent-900)"
                : usage.plan.id === "free" || usage.plan.id === "lapsed"
                ? "var(--color-neutral-800)"
                : "var(--color-accent-2-800)",
            }}
          >
            {usage.trialing
              ? `Trial · ${usage.trialDaysLeft} day${usage.trialDaysLeft === 1 ? "" : "s"} left`
              : usage.plan.name}
          </button>

          {!ai.ready && ai.state !== "checking" ? (
            <span
              className="tag"
              title={ai.message || ""}
              style={{ fontSize: 10.5, background: "var(--color-accent-100)", color: "var(--color-accent-800)" }}
            >
              {ai.state === "absent" ? "AI off" : ai.state === "rejected" ? "AI key rejected" : "AI unavailable"}
            </span>
          ) : null}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <ThemeToggle compact />
            {site ? (
              <>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 14px",
                    borderRadius: 999,
                    background: paused ? "var(--color-neutral-200)" : "var(--color-accent-2-200)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: paused ? "var(--color-neutral-700)" : "var(--color-accent-2-800)",
                  }}
                >
                  <span style={{ position: "relative", width: 9, height: 9, flex: "none" }}>
                    <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "currentColor" }} />
                    {!paused && runningJobs > 0 ? <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "currentColor", animation: "pulseRing 2.2s ease-out infinite" }} /> : null}
                  </span>
                  {paused ? "Paused by you" : runningJobs > 0 ? `${runningJobs} run${runningJobs === 1 ? "" : "s"} in flight` : "Engine idle"}
                </span>
                <button className="btn btn-secondary" onClick={togglePause} style={{ fontWeight: 600, fontSize: 13 }}>
                  {paused ? "Resume" : "Pause"}
                </button>
              </>
            ) : null}
          </div>
        </header>

        <div style={{ padding: "26px 30px 56px" }}>
          {/* Anything the account is quietly missing, said out loud. Renders
              nothing when there is nothing to say. */}
          <AccountNotices />

          {/* Billing sits outside the site guard on purpose. It is an account
              screen, not a site screen, and it is where the data export and
              deletion controls live. Behind the guard, an account with no site
              could not see its plan and could not exercise its access or
              erasure rights at all, which is not a layout preference. */}
          {screen === "billing" ? (
            <Billing usage={usage} billing={billing} siteCount={siteCount} metered={usageNow} region={region} />
          ) : site && insights ? (
            <>
              {screen === "growth" && (
                <Growth
                  site={site}
                  domain={insights.domain}
                  activity={activity}
                  content={content}
                  leads={leads}
                  approvals={approvals}
                  pendingCount={pendingCount}
                  goApprovals={() => go("appr")}
                  goLog={() => go("log")}
                  feedTop={activity.slice(0, 6)}
                  onUndo={toggleUndo}
                  paused={paused}
                  runningJobs={runningJobs}
                  searchPanel={
                    <SearchConsolePanel
                      state={gsc}
                      domain={insights.domain}
                      onConnect={handleConnectSearchConsole}
                      onPickProperty={loadGscSummary}
                      onRefresh={() => loadGscSummary(gsc.siteUrl)}
                    />
                  }
                  competitorPanel={
                    <CompetitorPanel
                      competitors={competitors}
                      onAdd={addCompetitorSite}
                      onCheck={checkCompetitor}
                      onRemove={(id) => persist(removeCompetitor(orgId, activeSiteId, id), "remove that competitor")}
                      busyId={competitorBusy}
                      adding={addingCompetitor}
                    />
                  }
                  digestPanel={
                    <DigestPanel
                      digest={digestData({
                        site,
                        activity,
                        approvals,
                        leads,
                        content,
                        competitors,
                        search: gsc.status === "ready" ? gsc.data : null,
                      })}
                      onSend={sendDigestNow}
                      sending={sendingDigest}
                      lastSentTo={digestSentTo}
                    />
                  }
                />
              )}
              {screen === "opps" && (
                <Opportunities
                  zoom={zoom}
                  setZoom={setZoom}
                  sel={sel}
                  setSel={setSel}
                  taken={takenOpportunities}
                  dismissed={dismissedOpportunities}
                  onTake={takeOpportunity}
                  onDismiss={dismissOpportunity}
                  fixingId={fixingId}
                  writingId={writingId}
                  canWrite={access.content.allowed}
                  opportunities={opportunities}
                  siteName={insights.name}
                  domain={insights.domain}
                  onRerunAudit={rerunAudit}
                  rerunning={rerunning}
                />
              )}
              {screen === "content" && !access.content.allowed && (
                <LockedFeature
                  title="Content & calendar"
                  what="Researched, written and published articles."
                  access={access.content}
                  usage={usage}
                  region={region}
                  onSeeBilling={() => go("billing")}
                />
              )}
              {screen === "content" && access.content.allowed && (
                <Content
                  items={content}
                  onPublish={publishContent}
                  onAskForPiece={askForPiece}
                  asking={asking}
                  onWrite={writeContent}
                  writingId={writingId}
                  writingEnabled={writingEnabled}
                  writeError={writeError}
                  github={github}
                  onConnectGithub={connectGithub}
                  onDisconnectGithub={disconnectGithub}
                  connectingGithub={connectingGithub}
                  githubError={githubError}
                  onPublishViaGithub={publishViaGithub}
                  publishingId={publishingId}
                  suggestions={contentSuggestions}
                  onAcceptSuggestion={acceptSuggestion}
                  onDismissSuggestion={dismissSuggestion}
                />
              )}
              {screen === "social" && !access.social.allowed && (
                <LockedFeature
                  title="Social"
                  what="Posts written to each network's own shape, held until you approve them."
                  access={access.social}
                  usage={usage}
                  region={region}
                  onSeeBilling={() => go("billing")}
                />
              )}
              {screen === "social" && access.social.allowed && (
                <Social
                  posts={socialPosts}
                  networks={socialNetworks}
                  aiConfigured={socialAiConfigured}
                  aiMessage={aiStatusMessage}
                  contentPieces={content.filter((c) => c.article)}
                  onDraft={draftSocial}
                  onEdit={editSocialPost}
                  onApprove={approveSocialPost}
                  onDecline={declineSocialPost}
                  onPublish={publishSocialPost}
                  onConnect={connectSocial}
                  onDisconnect={disconnectSocial}
                  drafting={drafting}
                  publishingId={socialPublishingId}
                />
              )}

              {screen === "listings" && !access.listings.allowed && (
                <LockedFeature
                  title="Directory listings"
                  what="Copy written to each directory's exact form, and a record of where you've submitted."
                  access={access.listings}
                  usage={usage}
                  region={region}
                  onSeeBilling={() => go("billing")}
                />
              )}
              {screen === "listings" && access.listings.allowed && (
                <Listings
                  listings={listings}
                  site={site}
                  aiConfigured={socialAiConfigured}
                  aiMessage={aiStatusMessage}
                  onWrite={writeListingCopy}
                  onSave={saveListingCopy}
                  onStatus={setListingStatus}
                  writingId={writingListingId}
                />
              )}

              {screen === "leads" && !access.leads.allowed && (
                <LockedFeature
                  title="Lead intelligence"
                  what="Companies matching your ideal customer, with outreach drafted."
                  access={access.leads}
                  usage={usage}
                  region={region}
                  onSeeBilling={() => go("billing")}
                />
              )}
              {screen === "leads" && access.leads.allowed && (
                <Leads
                  leads={leads}
                  profile={buyerProfile}
                  onBuildProfile={buildProfile}
                  onSaveProfile={saveProfile}
                  onDiscover={discoverLeads}
                  onQualify={qualifyLeads}
                  onDraftOutreach={draftOutreach}
                  onDecline={declineLead}
                  busy={
                    jobBusy === JOB_TYPES.LEAD_DISCOVER
                      ? "discover"
                      : jobBusy === JOB_TYPES.LEAD_QUALIFY
                      ? "qualify"
                      : draftingOutreachId
                      ? "outreach"
                      : null
                  }
                  buildingProfile={buildingProfile}
                  profileError={profileError}
                  hasCrawl={!!site?.intelligence}
                  aiReady={ai.ready}
                  leadSearch={site?.leadSearch || null}
                  onRunCrawl={runCrawl}
                  crawling={jobBusy === JOB_TYPES.CRAWL_SITE}
                  domain={insights?.domain}
                />
              )}
              {screen === "appr" && (
                <Approvals
                  approvals={approvals}
                  onApprove={approve}
                  onDecline={decline}
                  onEdit={editApproval}
                  socialWaiting={socialPosts.filter((p) => p.status === POST_STATUS.DRAFTED).length}
                  goSocial={() => go("social")}
                />
              )}
              {screen === "vis" && !access.visibility.allowed && (
                <LockedFeature
                  title="AI search visibility"
                  what="Whether an assistant names you when buyers ask about what you sell."
                  access={access.visibility}
                  usage={usage}
                  region={region}
                  onSeeBilling={() => go("billing")}
                />
              )}
              {screen === "vis" && access.visibility.allowed && (
                <Visibility
                  domain={insights.domain}
                  visibility={site?.aiVisibility || null}
                  plan={visQuestions}
                  planning={visPlanning}
                  planError={visError}
                  onPlan={planVisibility}
                  onRunCheck={runVisibilityCheck}
                  running={jobBusy === JOB_TYPES.AI_VISIBILITY}
                  writingEnabled={writingEnabled}
                  hasCrawl={!!site?.intelligence}
                  aiState={ai.state}
                  aiMessage={ai.message}
                  autoOn={!!site?.autoVisibility}
                  onToggleAuto={toggleAutoVisibility}
                  onRunCrawl={runCrawl}
                  crawling={jobBusy === JOB_TYPES.CRAWL_SITE}
                />
              )}
              {screen === "aut" && (
                <Autonomy
                  aut={aut}
                  setAut={setAut}
                  onCommitAut={commitAut}
                  rules={rules}
                  setRules={saveRules}
                  voice={voice}
                  setVoice={saveVoice}
                  dataPolicy={site?.dataPolicy || null}
                  onDataPolicyChange={saveDataPolicy}
                  brandName={insights.name}
                />
              )}
              {screen === "runs" && (
                <AgentRuns
                  jobs={jobs}
                  onRunCrawl={runCrawl}
                  onRunAudit={runAuditJob}
                  onRunCompetitorScan={runCompetitorScan}
                  busy={jobBusy}
                  domain={insights.domain}
                  competitorCount={competitors.length}
                />
              )}
              {screen === "log" && <ActivityLog feedAll={activity} onToggleUndo={toggleUndo} />}
            </>
          ) : (
            <div className="text-muted" style={{ fontSize: 14 }}>Connect a site to get started.</div>
          )}
        </div>

        {/* Always rendered, so screen readers announce each new message: a
            live region added together with its text is often not read out.
            Fits a 375px phone (it was a fixed 352px wide at 24px from the
            edge). */}
        <div role="status" aria-live="polite" aria-atomic="true" style={{ position: "fixed", right: "clamp(12px, 3vw, 24px)", bottom: "clamp(12px, 3vw, 24px)", zIndex: 75, width: "min(352px, calc(100vw - 24px))" }}>
          {toast ? (
            <div className="card elev-lg" style={{ padding: 18, gap: 10, background: "var(--color-accent-2-100)", animation: "rise .35s cubic-bezier(.2,.8,.2,1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--color-accent-2-500)", flex: "none" }} />
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 16 }}>Update</div>
                <button type="button" className="btn btn-ghost" aria-label="Dismiss this message" onClick={() => setToast(null)} style={{ marginLeft: "auto", color: "var(--color-accent-2-800)", fontSize: 16, paddingInline: 4 }}>
                  ×
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--color-accent-2-900)", lineHeight: 1.5, overflowWrap: "anywhere" }}>{toast}</p>
            </div>
          ) : null}
        </div>
      </main>

      {onboardOpen && user ? (
        <OnboardingModal
          uid={orgId}
          // Always dismissible. It used to be a wall for anyone with no site
          // yet, which trapped them on the one screen they could not use and
          // out of the one holding their plan and their data controls.
          canSkip
          initialUrl={(sites || []).length === 0 ? initialUrl : ""}
          onClose={() => setOnboardOpen(false)}
          onFinish={(newSiteId, siteUrl, text) => {
            setActiveSiteId(newSiteId);
            setOnboardOpen(false);
            setScreen("growth");
            setToast(text);
            startJob(JOB_TYPES.CRAWL_SITE, { url: siteUrl, maxPages: 20 }, newSiteId);
          }}
        />
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <OrgProvider>
        <DashboardInner />
      </OrgProvider>
    </Suspense>
  );
}
