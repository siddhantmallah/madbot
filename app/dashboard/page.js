"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { APPR_DATA, BASE_FEED, DEFAULT_RULES, POOL_FEED, SCREEN_TITLES } from "./data";
import OnboardingModal from "./OnboardingModal";
import Growth from "./screens/Growth";
import Opportunities from "./screens/Opportunities";
import Content from "./screens/Content";
import Leads from "./screens/Leads";
import Approvals from "./screens/Approvals";
import Visibility from "./screens/Visibility";
import Autonomy from "./screens/Autonomy";
import ActivityLog from "./screens/ActivityLog";

const SITES = [
  { id: "certnotify.com", label: "certnotify.com" },
  { id: "docs.certnotify.com", label: "docs.certnotify.com" },
  { id: "statuspage.io/cert", label: "statuspage.io/cert" },
];

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

export default function DashboardPage() {
  const [screen, setScreen] = useState("growth");
  const [onboard, setOnboard] = useState(false);
  const [site, setSite] = useState("certnotify.com");
  const [siteOpen, setSiteOpen] = useState(false);
  const [paused, setPaused] = useState(false);

  const [aut, setAut] = useState(62);
  const [thr, setThr] = useState(58);
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState("kw");
  const [taken, setTaken] = useState({});

  const [extra, setExtra] = useState([]);
  const [mins, setMins] = useState(0);
  const [toast, setToast] = useState(null);
  const [undone, setUndone] = useState({});
  const [appr, setAppr] = useState({});
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [voice, setVoice] = useState("a");

  useEffect(() => {
    const id = setInterval(() => {
      setExtra((prev) => {
        const item = { ...POOL_FEED[prev.length % POOL_FEED.length], id: "x" + prev.length, m: 0, fresh: true };
        const shifted = prev.map((e) => ({ ...e, m: e.m + 6, fresh: false }));
        if (item.k === "win") setToast(item.text);
        return [item, ...shifted].slice(0, 5);
      });
      setMins((m) => m + 6);
    }, 5600);
    return () => clearInterval(id);
  }, []);

  const pendingCount = useMemo(() => APPR_DATA.filter((a) => !appr[a.id]).length, [appr]);

  const feedAll = useMemo(
    () => [...extra, ...BASE_FEED.map((b) => ({ ...b, m: b.m + mins }))],
    [extra, mins]
  );
  const feedTop = feedAll.slice(0, 6);
  const actionCount = 112 + extra.length;

  function go(k) {
    setScreen(k);
    setSiteOpen(false);
    setToast(null);
  }

  function toggleUndo(id) {
    setUndone((u) => ({ ...u, [id]: !u[id] }));
  }

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
          <button className="btn btn-secondary" onClick={() => setSiteOpen((v) => !v)} style={{ width: "100%", justifyContent: "space-between", background: "var(--color-bg)", fontWeight: 600, fontSize: 13 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-accent-2-600)", flex: "none" }} />
              {site}
            </span>
            <span style={{ opacity: 0.5, fontSize: 11 }}>3 sites</span>
          </button>
          {siteOpen ? (
            <div className="card elev-lg" style={{ position: "absolute", top: 44, left: 0, right: 0, zIndex: 30, padding: 8, gap: 2, background: "var(--color-bg)", animation: "pop .18s ease-out" }}>
              {SITES.map((s) => (
                <button
                  key={s.id}
                  className="btn btn-ghost"
                  onClick={() => { setSite(s.id); setSiteOpen(false); }}
                  style={{ justifyContent: "flex-start", color: "var(--color-text)", fontWeight: 600, fontSize: 13 }}
                >
                  {s.label}
                </button>
              ))}
              <div className="hr" style={{ margin: "6px 0" }} />
              <button className="btn btn-ghost" onClick={() => { setOnboard(true); setSiteOpen(false); }} style={{ justifyContent: "flex-start", fontSize: 13, fontWeight: 600 }}>
                + Connect a new site
              </button>
            </div>
          ) : null}
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }} aria-label="Sections">
          <NavButton label="Growth" active={screen === "growth"} onClick={() => go("growth")} />
          <NavButton label="Opportunities" badge={83} active={screen === "opps"} onClick={() => go("opps")} />
          <NavButton label="Content" badge={9} active={screen === "content"} onClick={() => go("content")} />
          <NavButton label="Leads" badge={43} active={screen === "leads"} onClick={() => go("leads")} />
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
          <button className="btn btn-secondary" onClick={() => setOnboard(true)} style={{ fontWeight: 600, fontSize: 12.5 }}>
            Replay the 60-second setup
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 6px 0" }}>
            <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--color-accent-2-400)", flex: "none", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>PR</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.25 }}>
              Priya Raman
              <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,.45)" }}>Owner</span>
            </span>
            <Link href="/login" className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600 }}>Sign out</Link>
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
          <span className="tag tag-neutral" style={{ fontSize: 11 }}>{site}</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
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
            <button className="btn btn-secondary" onClick={() => setPaused((p) => !p)} style={{ fontWeight: 600, fontSize: 13 }}>
              {paused ? "Resume" : "Pause"}
            </button>
          </div>
        </header>

        <div style={{ padding: "26px 30px 56px" }}>
          {screen === "growth" && (
            <Growth actionCount={actionCount} pendingCount={pendingCount} goApprovals={() => go("appr")} goLog={() => go("log")} feedTop={feedTop} undone={undone} onUndo={toggleUndo} paused={paused} />
          )}
          {screen === "opps" && (
            <Opportunities pendingCount={pendingCount} zoom={zoom} setZoom={setZoom} sel={sel} setSel={setSel} taken={taken} setTaken={setTaken} />
          )}
          {screen === "content" && <Content />}
          {screen === "leads" && <Leads />}
          {screen === "appr" && <Approvals appr={appr} setAppr={setAppr} goAutonomy={() => go("aut")} />}
          {screen === "vis" && <Visibility />}
          {screen === "aut" && (
            <Autonomy aut={aut} setAut={setAut} thr={thr} setThr={setThr} rules={rules} setRules={setRules} voice={voice} setVoice={setVoice} />
          )}
          {screen === "log" && <ActivityLog feedAll={feedAll} undone={undone} onToggleUndo={toggleUndo} />}
        </div>

        {toast ? (
          <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 60, width: 352, animation: "rise .35s cubic-bezier(.2,.8,.2,1)" }}>
            <div className="card elev-lg" style={{ padding: 18, gap: 10, background: "var(--color-accent-2-100)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--color-accent-2-500)", flex: "none", animation: "drift 3s ease-in-out infinite" }} />
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 16 }}>A win just landed</div>
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

      {onboard ? (
        <OnboardingModal
          aut={aut}
          setAut={setAut}
          onClose={() => setOnboard(false)}
          onFinish={(text) => {
            setOnboard(false);
            setScreen("growth");
            setToast(text);
          }}
        />
      ) : null}
    </div>
  );
}
