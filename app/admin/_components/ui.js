"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Talking to /api/admin
// ---------------------------------------------------------------------------

/**
 * One call to the admin API. The session lives in httpOnly cookies, so there
 * is no token to pass; an ended session sends the browser back to sign in.
 * Throws an Error carrying the server's own message on any refusal.
 */
export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.status === 401) {
    window.location.assign("/admin/login");
    throw new Error("Your console session has ended.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `The server answered ${res.status}.`);
  return data;
}

/** Loads `path` (null skips), with loading, error and reload. */
export function useAdminData(path) {
  const [tick, setTick] = useState(0);
  // Each answer is stamped with the request it answers; until the current
  // one's arrives, this is loading (keeping the last data on screen).
  const key = path ? `${tick}:${path}` : null;
  const [state, setState] = useState({ key: null, error: null, data: null });
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    api(path)
      .then((data) => alive && setState({ key, error: null, data }))
      .catch((err) => alive && setState({ key, error: err.message, data: null }));
    return () => {
      alive = false;
    };
  }, [key, path]);
  const loading = !!key && state.key !== key;
  return { loading, error: loading ? null : state.error, data: state.data, reload: useCallback(() => setTick((t) => t + 1), []) };
}

/**
 * Server-side pagination with Previous and Next: keeps the cursors it has
 * been through, since a Firestore cursor only goes forward.
 */
export function useCursorPages(basePath) {
  // New filters (a new basePath) start again from the first page.
  const [nav, setNav] = useState({ base: basePath, stack: [null] });
  const stack = nav.base === basePath ? nav.stack : [null];
  const cursor = stack[stack.length - 1];
  const sep = basePath.includes("?") ? "&" : "?";
  const path = cursor ? `${basePath}${sep}cursor=${encodeURIComponent(cursor)}` : basePath;
  const data = useAdminData(path);
  return {
    ...data,
    page: stack.length,
    hasPrev: stack.length > 1,
    hasNext: !!data.data?.next,
    next: () => data.data?.next && setNav({ base: basePath, stack: [...stack, data.data.next] }),
    prev: () => setNav({ base: basePath, stack: stack.length > 1 ? stack.slice(0, -1) : stack }),
  };
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

export function PageHead({ title, sub, children }) {
  return (
    <header className="adm-head">
      <div>
        <h1>{title}</h1>
        {sub ? <p className="adm-sub">{sub}</p> : null}
      </div>
      {children ? <div className="adm-actions">{children}</div> : null}
    </header>
  );
}

export function Stat({ label, value }) {
  return (
    <div className="adm-stat">
      <span>{label}</span>
      <b>{value ?? "—"}</b>
    </div>
  );
}

const TONE = {
  active: "is-good",
  trialing: "is-good",
  ok: "is-good",
  enabled: "is-good",
  near: "is-warn",
  past_due: "is-warn",
  pending: "is-warn",
  suspended: "is-bad",
  deleted: "is-bad",
  revoked: "is-bad",
  expired: "is-bad",
  exhausted: "is-bad",
  failed: "is-bad",
  disabled: "is-bad",
  late: "is-bad",
};

export function Pill({ value, tone }) {
  return <span className={`adm-pill ${tone || TONE[String(value).toLowerCase()] || ""}`}>{String(value ?? "—").replace(/_/g, " ")}</span>;
}

export function Spinner({ label = "Loading…" }) {
  return (
    <p className="adm-note" role="status" aria-live="polite">
      {label}
    </p>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="adm-empty">
      <b>{title}</b>
      {children ? <div style={{ marginTop: 4 }}>{children}</div> : null}
    </div>
  );
}

export function ErrorBox({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="adm-error" role="alert">
      {message}
      {onRetry ? (
        <>
          {" "}
          <button type="button" className="btn btn-ghost" onClick={onRetry} style={{ padding: "0 4px", minHeight: 0 }}>
            Try again
          </button>
        </>
      ) : null}
    </div>
  );
}

/** A table that scrolls inside its own box on a narrow screen rather than the page. */
export function Table({ caption, head, children }) {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Pager({ pages }) {
  if (!pages.hasPrev && !pages.hasNext) return null;
  return (
    <nav className="adm-pager" aria-label="Pages">
      <span>Page {pages.page}</span>
      <button type="button" className="btn btn-secondary" disabled={!pages.hasPrev || pages.loading} onClick={pages.prev}>
        Previous
      </button>
      <button type="button" className="btn btn-secondary" disabled={!pages.hasNext || pages.loading} onClick={pages.next}>
        Next
      </button>
    </nav>
  );
}

/** Loading, then the error or the empty state, then the content. */
export function Loadable({ state, empty, children }) {
  if (state.loading && !state.data) return <Spinner />;
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />;
  if (empty) return empty;
  return children;
}

export function Meter({ used, allowance }) {
  const share = allowance > 0 ? used / allowance : 0;
  const tone = share >= 1 ? "is-bad" : share >= 0.8 ? "is-warn" : "";
  return (
    <div className={`adm-meter ${tone}`} role="img" aria-label={`${used} of ${allowance} used`}>
      <span style={{ width: `${Math.min(100, Math.round(share * 100))}%` }} />
    </div>
  );
}

export function when(isoString) {
  if (!isoString) return "—";
  const d = new Date(isoString);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function day(isoString) {
  if (!isoString) return "—";
  const d = new Date(isoString);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

// ---------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------

const ConfirmContext = createContext(null);

/**
 * `const confirm = useConfirm(); if (!(await confirm({...}))) return;`
 *
 * Every destructive action asks first. `typeToConfirm` makes the admin type a
 * word (an email, an organisation's name) back, for the ones that can't be
 * casually undone. `reason` asks for a note that goes into the audit log.
 */
export function ConfirmProvider({ children }) {
  const [ask, setAsk] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setAsk({ ...opts, resolve })), []);
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {ask ? <ConfirmDialog {...ask} onDone={(v) => { ask.resolve(v); setAsk(null); }} /> : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}

function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, typeToConfirm = null, reason = false, onDone }) {
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const box = useRef(null);
  const opener = useRef(typeof document !== "undefined" ? document.activeElement : null);

  useEffect(() => {
    const first = box.current?.querySelector("input, textarea, button");
    first?.focus();
    const back = opener.current;
    return () => back?.focus?.();
  }, []);

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      onDone(false);
    }
    // Keep focus inside the dialog.
    if (e.key === "Tab") {
      const items = [...box.current.querySelectorAll("input, textarea, button:not([disabled])")];
      if (!items.length) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
  }

  const ready = !typeToConfirm || typed.trim().toLowerCase() === String(typeToConfirm).trim().toLowerCase();
  return (
    <div className="adm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onDone(false)}>
      <div ref={box} className="adm-dialog" role="dialog" aria-modal="true" aria-labelledby="adm-confirm-title" onKeyDown={onKey}>
        <h2 id="adm-confirm-title">{title}</h2>
        {message ? <p className="adm-note" style={{ fontSize: 14 }}>{message}</p> : null}
        {typeToConfirm ? (
          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 13 }}>
            <span>
              Type <b>{typeToConfirm}</b> to confirm
            </span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
        ) : null}
        {reason ? (
          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 13 }}>
            <span>Reason (kept in the audit log)</span>
            <textarea className="input" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        ) : null}
        <div className="adm-actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={() => onDone(false)}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? "btn btn-primary" : "btn btn-primary"}
            style={{ color: "var(--on-accent)", ...(danger ? { background: "var(--color-accent-700)" } : {}) }}
            disabled={!ready}
            onClick={() => onDone(reason ? { note } : true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A one-line result after an action: what happened, or why it didn't. */
export function useNotice() {
  const [notice, setNotice] = useState(null);
  const show = useCallback((kind, text) => setNotice({ kind, text, at: Date.now() }), []);
  const node = notice ? (
    <div role={notice.kind === "error" ? "alert" : "status"} aria-live="polite" className={notice.kind === "error" ? "adm-error" : "adm-card"} style={{ marginBottom: 12 }}>
      {notice.text}
    </div>
  ) : null;
  return { show, node, clear: () => setNotice(null) };
}

/** Runs an admin action with its notice: the server's message on failure, `done` on success. */
export function useAction(notice) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (fn, done) => {
      setBusy(true);
      notice.clear();
      try {
        const out = await fn();
        if (done) notice.show("ok", typeof done === "function" ? done(out) : done);
        return out;
      } catch (err) {
        notice.show("error", err.message);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [notice]
  );
  return { busy, run };
}
