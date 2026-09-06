// Publishing to LinkedIn.
//
// Server-only: this handles an OAuth access token, which is a live credential
// for posting under the customer's name.
//
// LinkedIn has two generations of posting API live at once. This uses the
// versioned /rest/posts one, because the older /v2/ugcPosts is on its way out
// and the newer one is what new apps are granted. Versioned endpoints require
// the LinkedIn-Version header on every call and reject the request outright
// without it — the single most common reason a first integration returns 426.

const API = "https://api.linkedin.com";

// LinkedIn dates its API versions and supports each for about a year. Pinning
// it here rather than sending "latest" means an upstream change breaks at a
// time we choose, when someone bumps this line and reads the changelog.
const VERSION = "202411";

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  };
}

async function li(token, path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...headers(token), ...(init.headers || {}) },
  });

  // A successful post returns 201 with the id in a header and an empty body,
  // so parsing unconditionally would throw on the happy path.
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!res.ok) {
    const err = new Error(data?.message || `LinkedIn returned ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return { data, headers: res.headers };
}

/**
 * Whether this token can actually post, and as whom.
 *
 * Called before a token is stored, for the same reason the GitHub integration
 * does it: a scope problem found now is a sentence in the connect dialog, and
 * found later it is a failed publish with nothing to point at.
 */
export async function checkConnection({ token }) {
  try {
    // The OIDC endpoint, which needs only the `openid profile` scopes every
    // sign-in grants. Using a posting endpoint to test would need a real post.
    const { data: me } = await li(token, "/v2/userinfo", { method: "GET" });

    let organizations = [];
    try {
      // Pages the signed-in member administers. A failure here is not fatal —
      // plenty of accounts post as a person and never touch an org page.
      const { data: acls } = await li(
        token,
        "/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=20",
        { method: "GET" }
      );
      organizations = (acls?.elements || [])
        .map((el) => el.organization)
        .filter(Boolean)
        .map((urn) => ({ urn, id: String(urn).split(":").pop() }));
    } catch {
      organizations = [];
    }

    return {
      ok: true,
      memberUrn: me?.sub ? `urn:li:person:${me.sub}` : null,
      name: me?.name || null,
      organizations,
      canPostAsMember: !!me?.sub,
      canPostAsOrganization: organizations.length > 0,
    };
  } catch (err) {
    if (err.status === 401) return { ok: false, error: "LinkedIn rejected that token. It may have expired — reconnect." };
    if (err.status === 403) {
      return {
        ok: false,
        error: "The token is valid but lacks posting scope. The app needs w_member_social, or w_organization_social to post as a Page.",
      };
    }
    if (err.status === 426) {
      return { ok: false, error: `LinkedIn requires a version header this build does not send (pinned at ${VERSION}).` };
    }
    return { ok: false, error: String(err.message || err) };
  }
}

/**
 * Uploads one image and returns its URN.
 *
 * Three legs: ask LinkedIn where to put it, PUT the bytes there, then reference
 * the URN in the post. The upload URL is single-use and short-lived, so this
 * cannot be split across requests.
 */
export async function uploadImage({ token, ownerUrn, bytes, contentType = "image/png" }) {
  const { data: init } = await li(token, "/rest/images?action=initializeUpload", {
    method: "POST",
    body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }),
  });

  const uploadUrl = init?.value?.uploadUrl;
  const imageUrn = init?.value?.image;
  if (!uploadUrl || !imageUrn) throw new Error("LinkedIn did not return an upload target.");

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body: bytes,
  });
  if (!put.ok) throw new Error(`Image upload failed (${put.status}).`);

  return imageUrn;
}

/**
 * Posts.
 *
 * `authorUrn` decides whether this appears as the person or the Page, and it is
 * required rather than defaulted. Guessing wrong here publishes a company
 * announcement to someone's personal profile, which is not a bug you can fix
 * after the fact.
 */
export async function publishPost({ token, authorUrn, text, imageUrn = null, altText = null }) {
  if (!authorUrn) throw new Error("No author given — a LinkedIn post must say whether it is the person or the Page.");

  const body = {
    author: authorUrn,
    commentary: text,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  if (imageUrn) {
    body.content = { media: { id: imageUrn, altText: altText || "" } };
  }

  try {
    const { data, headers: resHeaders } = await li(token, "/rest/posts", {
      method: "POST",
      body: JSON.stringify(body),
    });

    // The id comes back in a header on 201, not the body.
    const id = resHeaders.get("x-restli-id") || resHeaders.get("x-linkedin-id") || data?.id || null;
    return {
      ok: true,
      id,
      url: id ? `https://www.linkedin.com/feed/update/${id}` : null,
    };
  } catch (err) {
    return { ok: false, error: String(err.message || err), status: err.status || null };
  }
}
