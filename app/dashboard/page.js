"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../providers/AuthProvider";
import {
  subscribeSites,
  subscribeSite,
  subscribeActivity,
  subscribeApprovals,
  updateSiteSettings,
  addActivity,
  setActivityUndone,
  setApprovalStatus,
} from "../../lib/sites";
import { buildSiteInsights, ACTIVITY_POOL, hostnameOf, siteDisplayName } from "../../lib/seed";
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

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, logOut } = useAuth();

  const [screen, setScreen] = useState("growth");
  const [siteOpen, setSiteOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [signingOut, setSigningOut] = useState(false);

  const [sites, setSites] = useState(null);
  const [activeSiteId, setActiveSiteId] = useState(null);
  const [site, setSite] = useState(null);
  const [activity, setActivity] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [onboardOpen, setOnboardOpen] = useState(false);

  const [aut, setAut] = useState(62);
  const [thr, setThr] = useState(58);
  const [rules, setRules] = useState([]);
  const [voice, setVoice] = useState("a");
  const [paused, setPaused] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState("kw");
  const [taken, setTaken] = useState({});

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

  const poolIndexRef = useRef(0);
  useEffect(() => {
    if (!user || !activeSiteId || !site || paused) return undefined;
    const domain = hostnameOf(site.url);
    const name = siteDisplayName(site);
    const pool = ACTIVITY_POOL(domain, name);
    const id = setInterval(() => {
      const item = pool[poolIndexRef.current % pool.length];
      poolIndexRef.current += 1;
      addActivity(user.uid, activeSiteId, item).then(() => {
        if (item.k === "win") setToast(item.text);
      });
    }, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeSiteId, site?.id, paused]);

  const insights = useMemo(() => (site ? buildSiteInsights(site) : null), [site]);

  function go(k) {
    setScreen(k);
    setSiteOpen(false);
    setToast(null);
  }

  function commitAut() {
    if (user && activeSiteId) updateSiteSettings(user.uid, activeSiteId, { autonomy: aut });
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

  async function handleSignOut() {
    setSigningOut(true);
    await logOut();
    router.replace("/login");
  }

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  if (loading || (user && sites === null)) return <FullScreenLoading />;
  if (!user) return null;

  const displayName = user.displayName || user.email || "you";

  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateColumns: "236px 1fr", fontSize: 15, color: "var(--color-text)", background: "var(--color-bg)", overflow: "hidden" }}>
      <aside style={{ background: "var(--color-surface)", padding: "18px 14px 14px", display: "flex", flexDirection: "column", gap: 16, borderRight: "1px solid var(--color-divider)", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 6px" }}>
          <span style={{ position: "relative", width: 29, height: 29, borderRadius: "50%", border: "1.8px solid #E4EC1B", display: "grid", placeItems: "center", flex: "none" }}>
            <span style={{ width: 13, height: 13, border: "1.8px solid #E4EC1B", transform: "rotate(45deg)", display: "block" }} />
          </span>
          <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 21, letterSpacing: "-.005em", color: "#fff" }}>madbot</span>
        </div>

        <div style={{ position: "relative" }}>
          <button
            className="btn btn-secondary"
            onClick={() => setSiteOpen((v) => !v)}
            disabled={!site}
            style={{ width: "100%", justifyContent: "space-between", background: "var(--color-bg)", fontWeight: 600, fontSize: 13 }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-accent-2-600)", flex: "none" }} />
              {site ? siteDisplayName(site) : "No site yet"}
            </span>
            <span style={{ opacity: 0.5, fontSize: 11 }}>{sites?.length || 0} site{sites?.length === 1 ? "" : "s"}</span>
          </button>
          {siteOpen ? (
            <div className="card elev-lg" style={{ position: "absolute", top: 44, left: 0, right: 0, zIndex: 30, padding: 8, gap: 2, background: "var(--color-bg)", animation: "pop .18s ease-out" }}>
              {(sites || []).map((s) => (
                <button
                  key={s.id}
                  className="btn btn-ghost"
                  onClick={() => { setActiveSiteId(s.id); setSiteOpen(false); }}
                  style={{ justifyContent: "flex-start", color: "var(--color-text)", fontWeight: 600, fontSize: 13 }}
                >
                  {hostnameOf(s.url)}
                </button>
              ))}
              <div className="hr" style={{ margin: "6px 0" }} />
              <button className="btn btn-ghost" onClick={() => { setOnboardOpen(true); setSiteOpen(false); }} style={{ justifyContent: "flex-start", fontSize: 13, fontWeight: 600 }}>
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
          <NavButton label="Activity log" active={screen === "log"} onClick={() => go("log")} />
        </nav>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => go("aut")}
            style={{ border: 0, cursor: "pointer", textAlign: "left", background: "var(--color-accent-2-100)", borderRadius: 26, padding: 14, fontFamily: "var(--font-body)" }}
          >
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 14, marginBottom: 3 }}>Brand voice: {voice === "a" ? 91 : 88}% you</div>
            <div style={{ fontSize: 11.5, color: "var(--color-accent-2-800)", lineHeight: 1.45 }}>
              Teach me 3 more pages and I&apos;ll stop sounding like a robot.
            </div>
          </button>
          <button className="btn btn-secondary" onClick={() => setOnboardOpen(true)} style={{ fontWeight: 600, fontSize: 12.5 }}>
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
          {site ? <span className="tag tag-neutral" style={{ fontSize: 11 }}>{hostnameOf(site.url)}</span> : null}
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
                  actionCount={activity.length}
                  pendingCount={pendingCount}
                  goApprovals={() => go("appr")}
                  goLog={() => go("log")}
                  feedTop={activity.slice(0, 6)}
                  onUndo={toggleUndo}
                  paused={paused}
                />
              )}
              {screen === "opps" && (
                <Opportunities
                  pendingCount={pendingCount}
                  zoom={zoom}
                  setZoom={setZoom}
                  sel={sel}
                  setSel={setSel}
                  taken={taken}
                  setTaken={setTaken}
                  nodeData={insights.nodeData}
                  oppData={insights.oppData}
                  siteName={insights.name}
                />
              )}
              {screen === "content" && <Content dayData={insights.dayData} siteName={insights.name} />}
              {screen === "leads" && <Leads leadData={insights.leadData} />}
              {screen === "appr" && <Approvals approvals={approvals} onApprove={approve} onDecline={decline} goAutonomy={() => go("aut")} />}
              {screen === "vis" && <Visibility engineData={insights.engineData} domain={insights.domain} />}
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
              {screen === "log" && <ActivityLog feedAll={activity} onToggleUndo={toggleUndo} />}
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
