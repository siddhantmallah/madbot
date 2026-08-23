"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../providers/AuthProvider";
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
  addActivity,
  setActivityUndone,
  setApprovalStatus,
  updateApproval,
  updateLead,
  addContentItem,
  updateContentItem,
  subscribeCompetitors,
  subscribeJobs,
  addCompetitor,
  updateCompetitor,
  removeCompetitor,
} from "../../lib/sites";
import { diffSnapshots } from "../../lib/auditClient";
import { buildOpportunities } from "../../lib/opportunities";
import { enqueueAndRun } from "../../lib/jobClient";
import { JOB_TYPES } from "../../lib/jobTypes";
import { usageSummary, siteAccess, featureAccess, clampAutonomy } from "../../lib/entitlements";
import { FEATURES, autonomyLabel } from "../../lib/plans";
import Billing from "./screens/Billing";
import LockedFeature from "./screens/LockedFeature";
import { buildSiteInsights, CONTENT_BODY, rewriteContentBody, hostnameOf } from "../../lib/seed";
import { buildDigest, digestData } from "../../lib/digest";
import { MadbotMark, SiteIcon } from "../components/Brand";
import SearchConsolePanel from "./panels/SearchConsolePanel";
import CompetitorPanel from "./panels/CompetitorPanel";
import DigestPanel from "./panels/DigestPanel";
import { SCREEN_TITLES } from "./data";
import OnboardingModal from "./OnboardingModal";
import Growth from "./screens/Growth";
import Opportunities from "./screens/Opportunities";
import Content from "./screens/Content";
import Leads from "./screens/Leads";
import Approvals from "./screens/Approvals";
import Visibility from "./screens/Visibility";
import Autonomy from "./screens/Autonomy";
import ActivityLog from "./screens/ActivityLog";
import AgentRuns from "./screens/AgentRuns";

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
        <span className={active ? "tag" : "tag tag-neutral"} style={{ fontSize: 10, padding: "1px 8px", background: active ? "rgba(10,8,16,.18)" : undefined, color: active ? "var(--color-bg)" : undefined }}>
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function FullScreenLoading() {
  return (
    <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "var(--color-bg)", color: "#fff" }}>
      <span style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid var(--color-accent-300)", borderTopColor: "var(--color-accent)", animation: "sweep 1s linear infinite", display: "block" }} />
    </div>
  );
}

function DashboardInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initialUrl = params.get("url") || "";
  const { user, loading, logOut, connectSearchConsole } = useAuth();

  const [screen, setScreen] = useState("growth");
  const [siteOpen, setSiteOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [signingOut, setSigningOut] = useState(false);

  const [sites, setSites] = useState(null);
  const [activeSiteId, setActiveSiteId] = useState(null);
  const [site, setSite] = useState(null);
  const [activity, setActivity] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [leads, setLeads] = useState([]);
  const [content, setContent] = useState([]);
  const [competitors, setCompetitors] = useState([]);
  const [competitorBusy, setCompetitorBusy] = useState(null);
  const [addingCompetitor, setAddingCompetitor] = useState(false);
  const [digestSentTo, setDigestSentTo] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [jobBusy, setJobBusy] = useState(null);

  // Search Console. The OAuth access token is session-only by design: Firebase
  // hands back no refresh token, so we never persist it and just reconnect.
  const [gsc, setGsc] = useState({ status: "idle", error: "", properties: [], siteUrl: null, data: null });
  const gscTokenRef = useRef(null);
  const [onboardOpen, setOnboardOpen] = useState(false);

  const [aut, setAut] = useState(62);
  const [thr, setThr] = useState(58);
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
    if (!user) return undefined;
    return subscribeSites(user.uid, (list) => {
      setSites(list);
      setActiveSiteId((prev) => (prev && list.some((s) => s.id === prev) ? prev : list[0]?.id || null));
    });
  }, [user]);

  useEffect(() => {
    if (sites !== null && sites.length === 0) setOnboardOpen(true);
  }, [sites]);

  useEffect(() => {
    if (!user || !activeSiteId) {
      setSite(null);
      return undefined;
    }
    return subscribeSite(user.uid, activeSiteId, (s) => {
      setSite(s);
      if (s) {
        setAut(s.autonomy);
        setThr(s.throttle);
        setRules(s.rules || []);
        setVoice(s.voice || "a");
        setPaused(!!s.paused);
        setTakenOpportunities(s.takenOpportunities || {});
        setDismissedOpportunities(s.dismissedOpportunities || {});
      }
    });
  }, [user, activeSiteId]);

  useEffect(() => {
    if (!user || !activeSiteId) {
      setActivity([]);
      return undefined;
    }
    return subscribeActivity(user.uid, activeSiteId, setActivity);
  }, [user, activeSiteId]);

  useEffect(() => {
    if (!user || !activeSiteId) {
      setApprovals([]);
      return undefined;
    }
    return subscribeApprovals(user.uid, activeSiteId, setApprovals);
  }, [user, activeSiteId]);

  useEffect(() => {
    if (!user || !activeSiteId) {
      setLeads([]);
      return undefined;
    }
    return subscribeLeads(user.uid, activeSiteId, setLeads);
  }, [user, activeSiteId]);

  useEffect(() => {
    if (!user || !activeSiteId) {
      setContent([]);
      return undefined;
    }
    return subscribeContent(user.uid, activeSiteId, setContent);
  }, [user, activeSiteId]);

  useEffect(() => {
    if (!user || !activeSiteId) {
      setCompetitors([]);
      return undefined;
    }
    return subscribeCompetitors(user.uid, activeSiteId, setCompetitors);
  }, [user, activeSiteId]);

  useEffect(() => {
    if (!user || !activeSiteId) {
      setJobs([]);
      return undefined;
    }
    return subscribeJobs(user.uid, activeSiteId, setJobs);
  }, [user, activeSiteId]);

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
    if (!user) return;
    const offSub = subscribeSubscription(user.uid, setSubscription);
    const offBilling = subscribeBilling(user.uid, setBilling);
    return () => {
      offSub();
      offBilling();
    };
  }, [user]);

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
  const opportunities = useMemo(() => (site ? buildOpportunities(site) : null), [site]);
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
      await updateSiteSettings(user.uid, activeSiteId, {
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
      addActivity(user.uid, activeSiteId, {
        k: "seo",
        text: `Re-read ${hostnameOf(site.url)} — score ${data.score}, ${data.counts.critical} critical`,
        why: "You asked for a fresh audit",
        result: `Score ${data.score}`,
      });
      setToast(`Audit refreshed — score ${data.score}, ${data.counts.critical} critical finding${data.counts.critical === 1 ? "" : "s"}.`);
    } finally {
      setRerunning(false);
    }
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
    updateSiteSettings(user.uid, activeSiteId, { autonomy: allowed });
  }
  function commitThr() {
    if (user && activeSiteId) updateSiteSettings(user.uid, activeSiteId, { throttle: thr });
  }
  function saveRules(updater) {
    setRules((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (user && activeSiteId) updateSiteSettings(user.uid, activeSiteId, { rules: next });
      return next;
    });
  }
  function saveVoice(v) {
    setVoice(v);
    if (user && activeSiteId) updateSiteSettings(user.uid, activeSiteId, { voice: v });
  }
  function togglePause() {
    setPaused((p) => {
      const next = !p;
      if (user && activeSiteId) updateSiteSettings(user.uid, activeSiteId, { paused: next });
      return next;
    });
  }
  function toggleUndo(id, undone) {
    if (user && activeSiteId) setActivityUndone(user.uid, activeSiteId, id, undone);
  }
  function approve(id) {
    if (user && activeSiteId) setApprovalStatus(user.uid, activeSiteId, id, "yes");
  }
  function decline(id) {
    if (user && activeSiteId) setApprovalStatus(user.uid, activeSiteId, id, "no");
  }
  function editApproval(id, patch) {
    if (user && activeSiteId) updateApproval(user.uid, activeSiteId, id, patch);
  }

  function takeOpportunity(oppId) {
    if (!user || !activeSiteId) return;
    setTakenOpportunities((prev) => ({ ...prev, [oppId]: true }));
    updateSiteSettings(user.uid, activeSiteId, { [`takenOpportunities.${oppId}`]: true });
    const opp = opportunities?.nodes?.[oppId];
    if (opp) {
      addActivity(user.uid, activeSiteId, {
        k: "seo",
        text: `Queued: ${opp.title}`,
        why: opp.fix || "You told me to go get it",
        result: "Queued",
      });
    }
  }
  function dismissOpportunity(oppId) {
    if (!user || !activeSiteId) return;
    setDismissedOpportunities((prev) => ({ ...prev, [oppId]: true }));
    updateSiteSettings(user.uid, activeSiteId, { [`dismissedOpportunities.${oppId}`]: true });
  }

  function sendLead(id) {
    if (!user || !activeSiteId) return;
    updateLead(user.uid, activeSiteId, id, { status: "sent" });
    const lead = leads.find((l) => l.id === id);
    if (lead) {
      addActivity(user.uid, activeSiteId, {
        k: "lead",
        text: `Marked outreach to ${lead.co} as sent (no email delivered)`,
        why: lead.why,
        result: "Marked sent",
      });
    }
  }
  function declineLead(id) {
    if (user && activeSiteId) updateLead(user.uid, activeSiteId, id, { status: "declined" });
  }
  function saveLeadDraft(id, draft) {
    if (user && activeSiteId) updateLead(user.uid, activeSiteId, id, { draft });
  }

  function publishContent(id) {
    if (!user || !activeSiteId) return;
    updateContentItem(user.uid, activeSiteId, id, { status: "published" });
    const item = content.find((c) => c.id === id);
    if (item) {
      addActivity(user.uid, activeSiteId, {
        k: "content",
        text: `Marked "${item.title}" as published (not live on your site)`,
        why: "You approved this piece",
        result: "Marked published",
      });
    }
  }
  function rewriteContent(id) {
    if (!user || !activeSiteId) return;
    const item = content.find((c) => c.id === id);
    if (!item || !insights) return;
    const nextCount = (item.rewriteCount || 0) + 1;
    updateContentItem(user.uid, activeSiteId, id, {
      body: rewriteContentBody(item.kind, insights.name, nextCount),
      rewriteCount: nextCount,
    });
  }
  // Whether the server actually has a key, asked once rather than assumed.
  const [writingEnabled, setWritingEnabled] = useState(false);
  const [writingId, setWritingId] = useState(null);
  const [writeError, setWriteError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/generate-content")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setWritingEnabled(!!d.configured);
      })
      .catch(() => {});
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
          item: { title: item.title, kind: item.kind, angle: item.angle || null },
          site: {
            name: insights?.name,
            domain: insights?.domain,
            description: site.description || "",
            rules,
            voice,
            findings: site.audit?.findings || [],
          },
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setWriteError(data.error || "Couldn't write that piece.");
        return;
      }
      await updateContentItem(user.uid, activeSiteId, item.id, {
        article: data.article,
        words: data.words,
        model: data.model,
        writtenAt: new Date(),
      });
      await addActivity(user.uid, activeSiteId, {
        k: "content",
        text: `Wrote "${item.title}" — ${data.words} words`,
        why: item.angle ? `Your angle: ${item.angle}` : `Drafted as a ${item.kind} piece`,
        result: "Drafted",
        undo: true,
      });
      setToast(`"${item.title}" drafted — ${data.words} words.`);
    } catch (err) {
      setWriteError(err?.message || "Writing failed.");
    } finally {
      setWritingId(null);
    }
  }

  async function askForPiece({ topic, kind, day, angle }) {
    if (!user || !activeSiteId || !insights) return;
    setAsking(true);
    try {
      const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      await addContentItem(user.uid, activeSiteId, {
        day,
        dayName: dayNames[day],
        date: String(12 + day),
        title: topic,
        kind,
        meta: "you asked for this",
        angle: angle || null,
        body: angle
          ? `${angle}. ${CONTENT_BODY[kind] ? CONTENT_BODY[kind](insights.name) : ""}`.trim()
          : (CONTENT_BODY[kind] || CONTENT_BODY.Support)(insights.name),
        requested: true,
      });
      await addActivity(user.uid, activeSiteId, {
        k: "content",
        text: `Added "${topic}" to the ${dayNames[day]} plan at your request`,
        why: angle ? `Your angle: ${angle}` : "You asked for it",
        result: "Planned",
      });
      setToast(`"${topic}" added to the plan.`);
    } finally {
      setAsking(false);
    }
  }

  async function gscCall(action, extra = {}) {
    const res = await fetch("/api/search-console", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: gscTokenRef.current, action, ...extra }),
    });
    return res.json();
  }

  async function loadGscSummary(propertyUrl) {
    setGsc((s) => ({ ...s, status: "loading", error: "" }));
    const data = await gscCall("summary", { siteUrl: propertyUrl });
    if (!data.ok) {
      setGsc((s) => ({ ...s, status: "error", error: data.error, needsReconnect: !!data.needsReconnect }));
      return;
    }
    setGsc((s) => ({ ...s, status: "ready", siteUrl: propertyUrl, data }));
    if (user && activeSiteId) updateSiteSettings(user.uid, activeSiteId, { gscProperty: propertyUrl });
  }

  async function handleConnectSearchConsole() {
    setGsc((s) => ({ ...s, status: "connecting", error: "" }));
    try {
      gscTokenRef.current = await connectSearchConsole();
      const listed = await gscCall("sites");
      if (!listed.ok) {
        setGsc((s) => ({ ...s, status: "error", error: listed.error }));
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
      const res = await fetch(`/api/snapshot?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!data.ok) return { error: data.error };
      await addCompetitor(user.uid, activeSiteId, { url: data.snapshot.url, snapshot: data.snapshot });
      addActivity(user.uid, activeSiteId, {
        k: "link",
        text: `Started watching ${hostnameOf(url)} for changes`,
        why: "You added them as a competitor",
        result: "Watching",
      });
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
      const res = await fetch(`/api/snapshot?url=${encodeURIComponent(c.url)}`);
      const data = await res.json();
      if (!data.ok) return;
      const changes = diffSnapshots(c.snapshot, data.snapshot);
      await updateCompetitor(user.uid, activeSiteId, c.id, {
        snapshot: data.snapshot,
        changes,
        lastCheckedAt: new Date(),
      });
      if (changes.length) {
        addActivity(user.uid, activeSiteId, {
          k: "link",
          text: `${hostnameOf(c.url)} changed: ${changes[0].text}`,
          why: "Detected by comparing against the previous snapshot",
          result: `${changes.length} change${changes.length === 1 ? "" : "s"}`,
        });
        setToast(`${hostnameOf(c.url)} changed — ${changes[0].text}`);
      }
    } finally {
      setCompetitorBusy(null);
    }
  }

  // Every agent action goes through the job engine, so it gets a lease, step
  // trace, retry policy and an audit record for free.
  async function startJob(type, params) {
    if (!user || !activeSiteId) return;
    setJobBusy(type);
    try {
      const out = await enqueueAndRun(
        user.uid,
        activeSiteId,
        { type, params },
        {
          getIdToken: () => user.getIdToken(),
          onActivity: (entry) => addActivity(user.uid, activeSiteId, entry),
        }
      );
      if (out.completed) setToast(out.outcome?.summary || "Run finished.");
      else if (out.retrying) setToast("That run hit a problem and is queued to retry.");
      else if (out.failed) setToast(out.error || "That run failed.");
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
  const [visQuestions, setVisQuestions] = useState(null);
  const [visPlanning, setVisPlanning] = useState(false);
  const [visError, setVisError] = useState(null);

  // A different site's questions must not linger on screen.
  useEffect(() => {
    setVisQuestions(null);
    setVisError(null);
  }, [activeSiteId]);

  async function planVisibility() {
    if (!user || !site?.intelligence) return;
    setVisPlanning(true);
    setVisError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/visibility/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, intel: site.intelligence }),
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

  async function runVisibilityCheck() {
    if (!site || !visQuestions?.questions?.length) return;
    await startJob(JOB_TYPES.AI_VISIBILITY, {
      domain: site.intelligence?.domain || insights.domain,
      brandName: site.intelligence?.business?.name || null,
      questions: visQuestions.questions,
    });
    // Drop the approved set so the primary button can't fire a second paid run
    // on a stray click.
    setVisQuestions(null);
  }

  async function toggleAutoVisibility(next) {
    if (!user || !activeSiteId) return;
    try {
      await updateSiteSettings(user.uid, activeSiteId, { autoVisibility: next });
      setToast(next ? "MADBOT will re-check this weekly." : "Weekly re-checks turned off.");
    } catch (err) {
      setToast(String(err?.message || err));
    }
  }

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
      const { subject, html, text } = buildDigest({
        site,
        activity,
        approvals,
        leads,
        content,
        competitors,
        search: gsc.status === "ready" ? gsc.data : null,
      });
      const idToken = await user.getIdToken();
      const res = await fetch("/api/send-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, subject, html, text }),
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

  if (loading || (user && sites === null)) return <FullScreenLoading />;
  if (!user) return null;

  const displayName = user.displayName || user.email || "you";

  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateColumns: "236px 1fr", fontSize: 15, color: "var(--color-text)", background: "var(--color-bg)", overflow: "hidden" }}>
      <aside style={{ background: "var(--color-surface)", padding: "18px 14px 14px", display: "flex", flexDirection: "column", gap: 16, borderRight: "1px solid var(--color-divider)", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 6px" }}>
          <MadbotMark size={29} />
          <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 21, letterSpacing: "-.005em", color: "#fff" }}>madbot</span>
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

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }} aria-label="Sections">
          <NavButton label="Growth" active={screen === "growth"} onClick={() => go("growth")} />
          <NavButton label="Opportunities" active={screen === "opps"} onClick={() => go("opps")} />
          <NavButton label="Content" active={screen === "content"} onClick={() => go("content")} />
          <NavButton label="Leads" active={screen === "leads"} onClick={() => go("leads")} />
          <NavButton label="Approvals" badge={pendingCount} active={screen === "appr"} onClick={() => go("appr")} />
          <NavButton label="AI visibility" active={screen === "vis"} onClick={() => go("vis")} />
          <NavButton label="Autonomy" active={screen === "aut"} onClick={() => go("aut")} />
          <NavButton label="Agent runs" badge={jobs.filter((j) => ["running","verifying","queued"].includes(j.status)).length || undefined} active={screen === "runs"} onClick={() => go("runs")} />
          <NavButton label="Activity log" active={screen === "log"} onClick={() => go("log")} />
          <NavButton label="Billing" active={screen === "billing"} onClick={() => go("billing")} />
        </nav>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => go("aut")}
            style={{ border: 0, cursor: "pointer", textAlign: "left", background: "var(--color-accent-2-100)", borderRadius: 26, padding: 14, fontFamily: "var(--font-body)" }}
          >
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 14, marginBottom: 3 }}>Brand voice</div>
            <div style={{ fontSize: 11.5, color: "var(--color-accent-2-800)", lineHeight: 1.45 }}>
              {voice ? "Preference saved. Pick again any time." : "Tell me which sample sounds like you."}
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

      <main style={{ overflow: "auto", position: "relative" }}>
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 26px",
            background: "rgba(10,8,16,.88)",
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
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
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
                    {!paused ? <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "currentColor", animation: "pulseRing 2.2s ease-out infinite" }} /> : null}
                  </span>
                  {paused ? "Paused by you" : "Engine running"}
                </span>
                <button className="btn btn-secondary" onClick={togglePause} style={{ fontWeight: 600, fontSize: 13 }}>
                  {paused ? "Resume" : "Pause"}
                </button>
              </>
            ) : null}
          </div>
        </header>

        <div style={{ padding: "26px 30px 56px" }}>
          {site && insights ? (
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
                      onRemove={(id) => removeCompetitor(user.uid, activeSiteId, id)}
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
                  onSeeBilling={() => go("billing")}
                />
              )}
              {screen === "content" && access.content.allowed && (
                <Content
                  items={content}
                  onPublish={publishContent}
                  onRewrite={rewriteContent}
                  onAskForPiece={askForPiece}
                  asking={asking}
                  onWrite={writeContent}
                  writingId={writingId}
                  writingEnabled={writingEnabled}
                  writeError={writeError}
                />
              )}
              {screen === "leads" && !access.leads.allowed && (
                <LockedFeature
                  title="Lead discovery"
                  what="Companies matching your ideal customer, with outreach drafted."
                  access={access.leads}
                  onSeeBilling={() => go("billing")}
                />
              )}
              {screen === "leads" && access.leads.allowed && (
                <Leads leads={leads} onSend={sendLead} onDecline={declineLead} onSaveDraft={saveLeadDraft} />
              )}
              {screen === "appr" && (
                <Approvals approvals={approvals} onApprove={approve} onDecline={decline} onEdit={editApproval} goAutonomy={() => go("aut")} />
              )}
              {screen === "vis" && !access.visibility.allowed && (
                <LockedFeature
                  title="AI search visibility"
                  what="Whether an assistant names you when buyers ask about what you sell."
                  access={access.visibility}
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
                  autoOn={!!site?.autoVisibility}
                  onToggleAuto={toggleAutoVisibility}
                />
              )}
              {screen === "aut" && (
                <Autonomy
                  aut={aut}
                  setAut={setAut}
                  onCommitAut={commitAut}
                  thr={thr}
                  setThr={setThr}
                  onCommitThr={commitThr}
                  rules={rules}
                  setRules={saveRules}
                  voice={voice}
                  setVoice={saveVoice}
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
              {screen === "billing" && <Billing usage={usage} billing={billing} siteCount={siteCount} />}
            </>
          ) : (
            <div className="text-muted" style={{ fontSize: 14 }}>Connect a site to get started.</div>
          )}
        </div>

        {toast ? (
          <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 60, width: 352, animation: "rise .35s cubic-bezier(.2,.8,.2,1)" }}>
            <div className="card elev-lg" style={{ padding: 18, gap: 10, background: "var(--color-accent-2-100)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--color-accent-2-500)", flex: "none", animation: "drift 3s ease-in-out infinite" }} />
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 16 }}>Update</div>
                <button className="btn btn-ghost" onClick={() => setToast(null)} style={{ marginLeft: "auto", color: "var(--color-accent-2-800)", fontSize: 16, paddingInline: 4 }}>×</button>
              </div>
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--color-accent-2-900)", lineHeight: 1.5 }}>{toast}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" onClick={() => go("opps")} style={{ background: "var(--color-accent-2-600)", fontSize: 13 }}>Do more of this</button>
                <button className="btn btn-ghost" onClick={() => setToast(null)} style={{ color: "var(--color-accent-2-800)", fontSize: 13 }}>Later</button>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {onboardOpen && user ? (
        <OnboardingModal
          uid={user.uid}
          canSkip={(sites || []).length > 0}
          initialUrl={(sites || []).length === 0 ? initialUrl : ""}
          onClose={() => setOnboardOpen(false)}
          onFinish={(newSiteId, text) => {
            setActiveSiteId(newSiteId);
            setOnboardOpen(false);
            setScreen("growth");
            setToast(text);
          }}
        />
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardInner />
    </Suspense>
  );
}
