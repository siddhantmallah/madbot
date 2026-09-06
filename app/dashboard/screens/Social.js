import { useEffect, useMemo, useState } from "react";
import { NETWORKS, NETWORK_ORDER, POST_STATUS, effectiveLength, charLimitFor, postStatusStyle, validatePost } from "../../../lib/social";

/**
 * Connecting an account.
 *
 * A pasted token rather than an OAuth redirect, deliberately and for now. Every
 * one of these networks requires a reviewed app before it will issue a token
 * through a redirect, and until those reviews land a paste box is the difference
 * between a feature that works for someone willing to generate a token by hand
 * and a feature that works for nobody. The token is verified before it is
 * stored and never comes back.
 */
function ConnectDialog({ network, onSubmit, onClose, busy }) {
  const [token, setToken] = useState("");
  const net = NETWORKS[network.networkId];

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(4,3,7,.78)", backdropFilter: "blur(5px)", display: "grid", placeItems: "center", padding: 24 }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <form
        className="card elev-lg"
        onSubmit={(e) => {
          e.preventDefault();
          if (token.trim()) onSubmit(network.provider, token.trim());
        }}
        style={{ width: "min(520px,100%)", padding: 26, gap: 14, background: "var(--color-bg)", border: "1px solid var(--color-divider)", animation: "rise .3s cubic-bezier(.2,.8,.2,1)" }}
      >
        <h3 style={{ margin: 0, fontSize: 22 }}>Connect {net.label}</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }} className="text-muted">
          {net.setupNote}
        </p>

        <div className="field">
          <label htmlFor="social-token">Access token</label>
          <input
            className="input"
            id="social-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste the token"
            required
            autoFocus
            style={{ fontSize: 14 }}
          />
          <p className="text-muted" style={{ margin: "5px 0 0", fontSize: 12 }}>
            Checked against {net.label} before it&apos;s saved, so a wrong scope is caught now rather than at the moment a post
            should have gone out. It&apos;s never shown again.
          </p>
        </div>

        <a href={net.setupUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5 }}>
          Where to get one →
        </a>

        <div style={{ display: "flex", gap: 9, paddingTop: 2 }}>
          <button className="btn btn-primary" type="submit" disabled={busy || !token.trim()}>
            {busy ? "Checking…" : "Connect"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function NetworkRow({ network, onConnect, onDisconnect }) {
  const net = NETWORKS[network.networkId];

  // Three different states that all look like "off" and have three different
  // fixes: nobody can use it here, this site hasn't connected it, or it is
  // connected but missing something it needs.
  const state = !network.configured
    ? { label: "Not set up on this server", tone: "neutral" }
    : !network.connected
    ? { label: "Not connected", tone: "neutral" }
    : !network.usable
    ? { label: "Needs attention", tone: "warn" }
    : { label: network.account ? `Connected as ${network.account}` : "Connected", tone: "ok" };

  return (
    <div
      className="card"
      style={{ padding: 15, gap: 8, display: "flex", flexDirection: "column", opacity: network.configured ? 1 : 0.62 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 14 }}>{net.label}</strong>
        <span
          className="tag"
          style={{
            fontSize: 10.5,
            background:
              state.tone === "ok" ? "var(--color-accent-2-100)" : state.tone === "warn" ? "var(--color-accent-200)" : "var(--color-neutral-100)",
            color:
              state.tone === "ok" ? "var(--color-accent-2-800)" : state.tone === "warn" ? "var(--color-accent-900)" : "var(--color-neutral-800)",
          }}
        >
          {state.label}
        </span>
        {network.premium ? <span className="tag tag-outline" style={{ fontSize: 10 }}>Premium — {charLimitFor("x", { premium: true }).toLocaleString()} chars</span> : null}

        <div style={{ marginLeft: "auto", display: "flex", gap: 7 }}>
          {network.configured && !network.connected ? (
            <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => onConnect(network)}>
              Connect
            </button>
          ) : null}
          {network.connected ? (
            <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => onDisconnect(network.provider)}>
              Disconnect
            </button>
          ) : null}
        </div>
      </div>

      {!network.configured ? (
        <p className="text-muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
          This deployment has no {net.label} app credentials ({network.missing.join(", ")}), so nobody can connect it yet.{" "}
          <a href={net.setupUrl} target="_blank" rel="noreferrer">
            Register an app
          </a>{" "}
          and set them on the server. {net.setupNote}
        </p>
      ) : network.reason ? (
        <p className="text-muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
          {network.reason}
        </p>
      ) : null}
    </div>
  );
}

/** One drafted post, with everything wrong with it stated rather than implied. */
function PostCard({ post, onEdit, onApprove, onDecline, onPublish, busy }) {
  const net = NETWORKS[post.networkId];
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(post.text || "");

  const limit = charLimitFor(post.networkId, { premium: post.premium });
  const length = effectiveLength(editing ? text : post.text, post.networkId);
  const over = length > limit;

  // Re-validated live while editing. The post was checked when it was written,
  // but this box is exactly where a 279-character post becomes a 310-character
  // one, and finding that out at publish time is too late.
  const problems = useMemo(
    () => validatePost({ networkId: post.networkId, text: editing ? text : post.text, images: post.imageUrl ? [post.imageUrl] : [], premium: post.premium }),
    [editing, text, post]
  );

  const status = postStatusStyle(post.status);
  const guardrail = post.guardrail;

  return (
    <div className="card elev-sm" style={{ padding: 18, gap: 11, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <span className="tag" style={{ fontSize: 10.5, background: "var(--color-neutral-200)", color: "var(--color-neutral-800)" }}>
          {net?.label || post.networkId}
        </span>
        <span className="tag" style={{ fontSize: 10.5, background: status.bg, color: status.fg }}>
          {status.label}
        </span>
        <span className="text-muted" style={{ fontSize: 11.5, color: over ? "var(--color-accent-900)" : undefined }}>
          {length} / {limit}
        </span>
        {typeof post.confidence === "number" ? (
          <span className="text-muted" style={{ fontSize: 11.5 }}>
            {Math.round(post.confidence * 100)}% sure of the claims
          </span>
        ) : null}
      </div>

      {editing ? (
        <textarea
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ width: "100%", minHeight: 130, fontSize: 13.5, lineHeight: 1.6 }}
        />
      ) : (
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{post.text}</p>
      )}

      {post.firstComment ? (
        <div style={{ background: "var(--color-bg)", borderRadius: 14, padding: 11, fontSize: 12.5 }}>
          <div className="card-kicker" style={{ marginBottom: 3 }}>Posted as a follow-up comment</div>
          <div className="text-muted" style={{ whiteSpace: "pre-wrap" }}>{post.firstComment}</div>
        </div>
      ) : null}

      {post.imageBrief ? (
        <div style={{ background: "var(--color-bg)", borderRadius: 14, padding: 11, fontSize: 12.5 }}>
          <div className="card-kicker" style={{ marginBottom: 3 }}>
            {net?.imageRequired ? "Image required — not made yet" : "Suggested image"}
          </div>
          <div className="text-muted">{post.imageBrief}</div>
        </div>
      ) : null}

      {problems.length ? (
        <ul style={{ margin: 0, paddingLeft: 17, fontSize: 12.5, lineHeight: 1.6, color: "var(--color-accent-900)" }}>
          {problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      ) : null}

      {guardrail?.breaches?.length ? (
        <div style={{ background: "var(--color-accent-100)", borderRadius: 14, padding: 11, fontSize: 12.5 }}>
          <div className="card-kicker" style={{ marginBottom: 4 }}>Breaks your rules</div>
          {guardrail.breaches.map((b, i) => (
            <div key={i} style={{ marginBottom: 5 }}>
              <div style={{ fontWeight: 600 }}>“{b.quote}”</div>
              <div className="text-muted">{b.why}</div>
            </div>
          ))}
        </div>
      ) : null}

      {guardrail?.unsupportedClaims?.length ? (
        <div style={{ background: "var(--color-bg)", borderRadius: 14, padding: 11, fontSize: 12.5 }}>
          <div className="card-kicker" style={{ marginBottom: 3 }}>Claims the source doesn&apos;t back</div>
          <ul style={{ margin: 0, paddingLeft: 17 }} className="text-muted">
            {guardrail.unsupportedClaims.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {post.lastError ? (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--color-accent-900)" }}>{post.lastError}</p>
      ) : null}

      {post.publishedUrl ? (
        <a href={post.publishedUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5 }}>
          See it on {net?.label} →
        </a>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {editing ? (
          <>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12.5 }}
              onClick={() => {
                onEdit(post.id, { text, edited: true });
                setEditing(false);
              }}
            >
              Save
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => { setText(post.text); setEditing(false); }}>
              Cancel
            </button>
          </>
        ) : post.status === POST_STATUS.PUBLISHED ? null : (
          <>
            <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => setEditing(true)}>
              Edit
            </button>
            {post.status === POST_STATUS.APPROVED || post.status === POST_STATUS.FAILED ? (
              <button
                className="btn btn-primary"
                style={{ fontSize: 12.5 }}
                disabled={busy || problems.length > 0}
                onClick={() => onPublish(post)}
                title={problems.length ? "Fix what's listed above first." : undefined}
              >
                {busy ? "Posting…" : post.status === POST_STATUS.FAILED ? "Try again" : `Post to ${net?.label}`}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                style={{ fontSize: 12.5 }}
                disabled={problems.length > 0}
                onClick={() => onApprove(post.id)}
                title={problems.length ? "Fix what's listed above first." : undefined}
              >
                Approve
              </button>
            )}
            <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => onDecline(post.id)}>
              Bin it
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function Social({
  posts = [],
  networks = null,
  aiConfigured,
  aiMessage = null,
  onDraft,
  onEdit,
  onApprove,
  onDecline,
  onPublish,
  onConnect,
  onDisconnect,
  drafting,
  publishingId,
  contentPieces = [],
}) {
  const [source, setSource] = useState("");
  const [link, setLink] = useState("");
  const [picked, setPicked] = useState(["linkedin"]);
  const [connecting, setConnecting] = useState(null);

  // Only offer networks this deployment could actually reach. Offering the rest
  // produces drafts with nowhere to go.
  const available = useMemo(
    () => (networks || []).filter((n) => n.configured),
    [networks]
  );

  useEffect(() => {
    // Keep the selection honest if the connection state changes underneath it.
    setPicked((prev) => {
      const stillOk = prev.filter((id) => available.some((n) => n.networkId === id));
      return stillOk.length ? stillOk : available.slice(0, 1).map((n) => n.networkId);
    });
  }, [available]);

  const waiting = posts.filter((p) => p.status === POST_STATUS.DRAFTED || p.status === POST_STATUS.WAITING_APPROVAL);
  const ready = posts.filter((p) => p.status === POST_STATUS.APPROVED || p.status === POST_STATUS.FAILED);
  const done = posts.filter((p) => p.status === POST_STATUS.PUBLISHED);

  return (
    <section data-screen-label="Social" style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <div>
        <h2 style={{ margin: "0 0 3px" }}>Social</h2>
        <p className="text-muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
          MADBOT writes the posts. You press post — at every autonomy level, on purpose. A published post has been seen
          before you can delete it, and on X it has already been quoted.
        </p>
      </div>

      {/* Accounts */}
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <div className="card-kicker">Accounts</div>
        {networks === null ? (
          <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>Checking connections…</p>
        ) : (
          NETWORK_ORDER.map((id) => {
            const n = (networks || []).find((x) => x.networkId === id);
            return n ? <NetworkRow key={id} network={n} onConnect={setConnecting} onDisconnect={onDisconnect} /> : null;
          })
        )}
      </div>

      {/* Composer */}
      <div className="card elev-sm" style={{ padding: 20, gap: 13, display: "flex", flexDirection: "column" }}>
        <div>
          <h3 style={{ margin: "0 0 3px", fontSize: 17 }}>Write from something</h3>
          <p className="text-muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
            Give it an article, a change you shipped, or a finding. It looks for what&apos;s worth saying and writes each
            network its own version — not one post cut to four lengths.
          </p>
        </div>

        {contentPieces.length ? (
          <div className="field">
            <label htmlFor="social-from-content">Start from something MADBOT wrote</label>
            <select
              className="input"
              id="social-from-content"
              onChange={(e) => {
                const item = contentPieces.find((c) => c.id === e.target.value);
                if (!item) return;
                setSource([item.title, item.description, item.article].filter(Boolean).join("\n\n"));
                if (item.url) setLink(item.url);
              }}
              defaultValue=""
              style={{ fontSize: 13.5 }}
            >
              <option value="" disabled>
                Pick a piece…
              </option>
              {contentPieces.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="social-source">Source material</label>
          <textarea
            className="input"
            id="social-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Paste the article, or describe what happened and what you found."
            style={{ width: "100%", minHeight: 120, fontSize: 13.5, lineHeight: 1.6 }}
          />
        </div>

        <div className="field">
          <label htmlFor="social-link">Link to include (optional)</label>
          <input
            className="input"
            id="social-link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://yoursite.com/the-post"
            style={{ fontSize: 13.5 }}
          />
        </div>

        <div className="field">
          <label>Which networks?</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {available.length === 0 ? (
              <p className="text-muted" style={{ margin: 0, fontSize: 12.5 }}>
                No network is set up on this server yet, so there&apos;s nowhere to post. Drafting still works — the posts
                just wait until an account is connected.
              </p>
            ) : (
              available.map((n) => {
                const on = picked.includes(n.networkId);
                return (
                  <button
                    type="button"
                    key={n.networkId}
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== n.networkId) : [...p, n.networkId]))}
                    className={on ? "tag" : "tag tag-neutral"}
                    style={{ fontSize: 12, cursor: "pointer", background: on ? "var(--color-accent)" : undefined, color: on ? "var(--on-accent)" : undefined }}
                  >
                    {NETWORKS[n.networkId].label}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {!aiConfigured ? (
          <p className="text-muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
            Drafting is off. {aiMessage || "The server can't reach a model right now."} Everything else on this screen
            still works — connecting accounts, editing what's already drafted, and posting it.
          </p>
        ) : null}

        <div>
          <button
            className="btn btn-primary"
            disabled={drafting || !aiConfigured || source.trim().length < 40 || picked.length === 0}
            onClick={() => onDraft({ source: source.trim(), link: link.trim() || null, networkIds: picked })}
          >
            {drafting ? "Writing…" : `Draft ${picked.length} post${picked.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>

      {waiting.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div className="card-kicker">Waiting on you — {waiting.length}</div>
          {waiting.map((p) => (
            <PostCard key={p.id} post={p} onEdit={onEdit} onApprove={onApprove} onDecline={onDecline} onPublish={onPublish} busy={publishingId === p.id} />
          ))}
        </div>
      ) : null}

      {ready.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div className="card-kicker">Approved, not yet posted — {ready.length}</div>
          {ready.map((p) => (
            <PostCard key={p.id} post={p} onEdit={onEdit} onApprove={onApprove} onDecline={onDecline} onPublish={onPublish} busy={publishingId === p.id} />
          ))}
        </div>
      ) : null}

      {done.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div className="card-kicker">Posted — {done.length}</div>
          {done.slice(0, 10).map((p) => (
            <PostCard key={p.id} post={p} onEdit={onEdit} onApprove={onApprove} onDecline={onDecline} onPublish={onPublish} busy={false} />
          ))}
        </div>
      ) : null}

      {posts.length === 0 ? (
        <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
          Nothing drafted yet.
        </p>
      ) : null}

      {connecting ? (
        <ConnectDialog
          network={connecting}
          busy={false}
          onClose={() => setConnecting(null)}
          onSubmit={async (provider, token) => {
            await onConnect(provider, token);
            setConnecting(null);
          }}
        />
      ) : null}
    </section>
  );
}
