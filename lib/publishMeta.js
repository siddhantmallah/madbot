// Publishing to Facebook Pages and Instagram Business accounts.
//
// Server-only: handles a Page access token.
//
// Both run on the Graph API and share an app, but they publish nothing alike:
//
//   Facebook — one call. Text is enough.
//   Instagram — two calls, and text is never enough. You create a media
//     container from a publicly reachable image URL, then publish the container.
//     Instagram's servers fetch that URL themselves, so a signed URL, a
//     localhost URL, or anything behind auth fails at Meta's end with an error
//     that does not say which of those it was.
//
// That asymmetry is why the two live in one file: anyone changing the Instagram
// path needs the Facebook path in front of them to see what is genuinely
// different.

const API = "https://graph.facebook.com";

// Graph API versions are supported for about two years and then start
// returning errors. Pinned so the break happens on a line someone edits.
const VERSION = "v21.0";

async function graph(path, { token, method = "GET", params = {}, body = null } = {}) {
  const url = new URL(`${API}/${VERSION}${path}`);
  if (method === "GET") {
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  }
  url.searchParams.set("access_token", token);

  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : method === "POST" ? new URLSearchParams(params) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const e = data?.error || {};
    const err = new Error(e.message || `Meta returned ${res.status}`);
    err.status = res.status;
    err.code = e.code;
    err.subcode = e.error_subcode;
    err.body = data;
    throw err;
  }
  return data;
}

/**
 * What this token can reach: which Pages, and which of those have an Instagram
 * Business account attached.
 *
 * An Instagram account that is personal rather than Business simply does not
 * appear here — there is no API that can post to a personal account, so a Page
 * coming back with `instagram: null` is usually an account-type problem rather
 * than a permissions one, and the UI says that.
 */
export async function checkConnection({ token }) {
  try {
    const pages = await graph("/me/accounts", {
      token,
      params: { fields: "id,name,access_token,instagram_business_account{id,username}" },
    });

    const list = (pages?.data || []).map((p) => ({
      id: p.id,
      name: p.name,
      // Each Page has its own token, and it is the Page token — not the user
      // token used to list them — that posts. Storing the user token and
      // wondering why publishing 403s is the classic first mistake here.
      pageToken: p.access_token || null,
      instagram: p.instagram_business_account
        ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username }
        : null,
    }));

    return {
      ok: true,
      pages: list,
      canPostFacebook: list.some((p) => p.pageToken),
      canPostInstagram: list.some((p) => p.instagram && p.pageToken),
      note: list.length
        ? null
        : "This account administers no Pages the app can see. Instagram posting also needs the Instagram account converted to Business and linked to a Page.",
    };
  } catch (err) {
    if (err.code === 190) return { ok: false, error: "Meta rejected that token. It has expired or been revoked — reconnect." };
    if (err.code === 200 || err.status === 403) {
      return {
        ok: false,
        error: "The token lacks permissions. Posting needs pages_manage_posts, and Instagram also needs instagram_content_publish.",
      };
    }
    return { ok: false, error: String(err.message || err) };
  }
}

/** Posts to a Facebook Page. `pageToken` is the Page's own token, not the user's. */
export async function publishFacebook({ pageToken, pageId, text, link = null, imageUrl = null }) {
  try {
    // A Page post with a photo goes to a different edge than one without, and
    // posting to /feed with a picture parameter silently drops the image.
    if (imageUrl) {
      const data = await graph(`/${pageId}/photos`, {
        token: pageToken,
        method: "POST",
        params: { url: imageUrl, caption: text },
      });
      const id = data?.post_id || data?.id;
      return { ok: true, id, url: id ? `https://www.facebook.com/${id}` : null };
    }

    const data = await graph(`/${pageId}/feed`, {
      token: pageToken,
      method: "POST",
      params: { message: text, ...(link ? { link } : {}) },
    });
    return { ok: true, id: data?.id, url: data?.id ? `https://www.facebook.com/${data.id}` : null };
  } catch (err) {
    return { ok: false, error: String(err.message || err), code: err.code || null };
  }
}

/**
 * Posts to Instagram. Two legs, and the image is not optional.
 *
 * `imageUrl` must be public and unauthenticated: Instagram's own servers fetch
 * it. It also has to still be there when they do, so a URL that expires in
 * sixty seconds will work in testing and fail in production.
 */
export async function publishInstagram({ pageToken, igUserId, caption, imageUrl }) {
  if (!imageUrl) {
    return {
      ok: false,
      error: "Instagram has no text-only post. This needs a public image URL before it can be published.",
      code: "image_required",
    };
  }

  try {
    const container = await graph(`/${igUserId}/media`, {
      token: pageToken,
      method: "POST",
      params: { image_url: imageUrl, caption },
    });
    if (!container?.id) return { ok: false, error: "Instagram did not return a media container." };

    const published = await graph(`/${igUserId}/media_publish`, {
      token: pageToken,
      method: "POST",
      params: { creation_id: container.id },
    });

    return {
      ok: true,
      id: published?.id,
      // Getting the shortcode back needs another call; the id is enough to
      // record what was published and to delete it later.
      url: published?.id ? `https://www.instagram.com/p/${published.id}` : null,
    };
  } catch (err) {
    // 9004 is Instagram failing to fetch the image, which is the single most
    // common failure and the least self-explanatory.
    if (err.subcode === 2207052 || err.code === 9004) {
      return { ok: false, error: "Instagram could not fetch that image. The URL must be public, permanent and unauthenticated.", code: "image_unreachable" };
    }
    return { ok: false, error: String(err.message || err), code: err.code || null };
  }
}
