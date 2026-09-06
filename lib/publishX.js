// Publishing to X.
//
// Server-only: handles an OAuth 2.0 user-context token.
//
// The thing to know before wiring this up: posting is not available on the free
// API tier. A free-tier token authenticates fine, reads fine, and returns 403
// on every write. That failure looks like a scope problem and isn't one — no
// amount of re-authorising fixes it, because the account needs a paid plan.
// checkConnection says so in those words rather than letting someone spend an
// afternoon on it.

const API = "https://api.x.com/2";
const UPLOAD = "https://upload.twitter.com/1.1";

async function x(token, path, init = {}, base = API) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // X reports errors in three different shapes depending on the endpoint's
    // vintage. Checking all three beats showing the customer "[object Object]".
    const detail =
      data?.detail ||
      data?.title ||
      data?.errors?.[0]?.message ||
      data?.error ||
      `X returned ${res.status}`;
    const err = new Error(detail);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/** Whether this token can post, and as whom. */
export async function checkConnection({ token }) {
  try {
    const me = await x(token, "/users/me?user.fields=username,name,verified,verified_type", { method: "GET" });
    const user = me?.data;
    if (!user) return { ok: false, error: "X accepted the token but returned no account." };

    // Premium accounts get the 25,000-character limit. Reading it here means the
    // composer holds the right ceiling instead of assuming the strict one for
    // everybody or the generous one for nobody.
    const premium = !!user.verified && user.verified_type !== "none";

    return {
      ok: true,
      id: user.id,
      username: user.username,
      name: user.name,
      premium,
      // Deliberately not claimed as true. The only way to know whether writes
      // are allowed is to attempt one, and this check must not post anything.
      canPost: null,
      note: "Write access needs a paid API tier. If posts fail with 403, that is the tier, not the token.",
    };
  } catch (err) {
    if (err.status === 401) return { ok: false, error: "X rejected that token. It may have expired — reconnect." };
    if (err.status === 403) {
      return {
        ok: false,
        error: "X refused this token. The usual cause is a free API tier, which cannot post — Basic or above is required.",
      };
    }
    if (err.status === 429) return { ok: false, error: "X is rate-limiting this app. Try again shortly." };
    return { ok: false, error: String(err.message || err) };
  }
}

/**
 * Uploads an image and returns its media id.
 *
 * Still on the v1.1 upload host: the v2 media endpoints do not cover every case
 * this needs, and v1.1 upload remains the documented route for attaching media
 * to a v2 post.
 */
export async function uploadImage({ token, bytes, contentType = "image/png" }) {
  const form = new FormData();
  form.append("media", new Blob([bytes], { type: contentType }));

  const res = await fetch(`${UPLOAD}/media/upload.json`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.errors?.[0]?.message || `Image upload failed (${res.status}).`);
  return data.media_id_string;
}

/**
 * Posts.
 *
 * `replyTo` exists so a thread can be built by calling this repeatedly, and so
 * the "first comment" a draft may carry — the place a link goes when it would
 * hurt the reach of the post itself — lands as a reply rather than being
 * dropped.
 */
export async function publishPost({ token, text, mediaIds = [], replyTo = null }) {
  const body = { text };
  if (mediaIds.length) body.media = { media_ids: mediaIds };
  if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo };

  try {
    const data = await x(token, "/tweets", { method: "POST", body: JSON.stringify(body) });
    const id = data?.data?.id;
    return { ok: true, id, url: id ? `https://x.com/i/status/${id}` : null };
  } catch (err) {
    if (err.status === 403) {
      return {
        ok: false,
        status: 403,
        error: "X refused the post. On a free API tier this is expected — posting requires Basic or above.",
      };
    }
    if (err.status === 429) {
      return { ok: false, status: 429, error: "X rate limit reached. The post was not sent; it stays queued." };
    }
    return { ok: false, error: String(err.message || err), status: err.status || null };
  }
}
