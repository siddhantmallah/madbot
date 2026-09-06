// One way in to four networks.
//
// Server-only. Everything here handles live posting credentials.
//
// The dispatcher exists so that callers — the publish route, and later the
// scheduler — never branch on network. Adding a fifth network should mean a new
// publisher file and one case here, not a new `if` in every caller.

import { NETWORKS, validatePost } from "./social";
import * as linkedin from "./publishLinkedIn";
import * as x from "./publishX";
import * as meta from "./publishMeta";

/**
 * Which stored integration document a network reads its credentials from.
 *
 * Instagram and Facebook share one, because they share a Meta app, a Page and a
 * Page token — connecting them separately would ask the customer to do the same
 * OAuth twice and then store the same token under two names.
 */
export const PROVIDER_FOR = {
  linkedin: "linkedin",
  x: "x",
  instagram: "meta",
  facebook: "meta",
};

export function providerFor(networkId) {
  return PROVIDER_FOR[networkId] || null;
}

/**
 * Whether a stored integration is usable for a given network, without calling
 * out to anyone. Used to render connection state and to fail fast before
 * spending a publish attempt.
 */
export function connectionUsable(networkId, integration) {
  if (!integration) return { usable: false, reason: "Not connected." };

  switch (networkId) {
    case "linkedin":
      if (!integration.token) return { usable: false, reason: "No LinkedIn token stored." };
      if (!integration.authorUrn) return { usable: false, reason: "No LinkedIn author chosen — pick the person or the Page." };
      return { usable: true };

    case "x":
      if (!integration.token) return { usable: false, reason: "No X token stored." };
      return { usable: true };

    case "facebook":
      if (!integration.pageToken || !integration.pageId) return { usable: false, reason: "No Facebook Page connected." };
      return { usable: true };

    case "instagram":
      if (!integration.pageToken) return { usable: false, reason: "No Meta Page token stored." };
      if (!integration.igUserId) {
        return {
          usable: false,
          reason: "No Instagram Business account linked to that Page. A personal Instagram account cannot be posted to by any API.",
        };
      }
      return { usable: true };

    default:
      return { usable: false, reason: `${networkId} is not a network MADBOT can post to.` };
  }
}

/**
 * Publishes one post.
 *
 * Validates once more immediately before sending. The draft was checked when it
 * was written, but it can be edited in the approvals queue afterwards, and an
 * edit is exactly when a 280-character post becomes a 310-character one.
 *
 * Never throws: a failed publish has to be recorded against the post rather than
 * unwinding the caller, because the caller is usually iterating over a set and
 * the other three still need to go.
 */
export async function publishTo({ networkId, integration, post }) {
  const net = NETWORKS[networkId];
  if (!net) return { ok: false, error: `Unknown network "${networkId}".` };

  const usable = connectionUsable(networkId, integration);
  if (!usable.usable) return { ok: false, error: usable.reason, code: "not_connected" };

  const problems = validatePost({
    networkId,
    text: post.text,
    images: post.imageUrl ? [post.imageUrl] : [],
    premium: !!integration.premium,
  });
  if (problems.length) return { ok: false, error: problems.join(" "), code: "invalid" };

  try {
    switch (networkId) {
      case "linkedin": {
        const result = await linkedin.publishPost({
          token: integration.token,
          authorUrn: integration.authorUrn,
          text: post.text,
          imageUrn: post.imageUrn || null,
          altText: post.altText || null,
        });
        return result;
      }

      case "x": {
        const result = await x.publishPost({
          token: integration.token,
          text: post.text,
          mediaIds: post.mediaIds || [],
        });
        // A first comment carries the link that would have cost the post reach
        // in the body. If the post landed and the reply didn't, that is still a
        // successful publish — say so, and note what was missed.
        if (result.ok && post.firstComment) {
          const reply = await x.publishPost({
            token: integration.token,
            text: post.firstComment,
            replyTo: result.id,
          });
          if (!reply.ok) return { ...result, warning: `Posted, but the follow-up comment failed: ${reply.error}` };
        }
        return result;
      }

      case "facebook":
        return await meta.publishFacebook({
          pageToken: integration.pageToken,
          pageId: integration.pageId,
          text: post.text,
          link: post.link || null,
          imageUrl: post.imageUrl || null,
        });

      case "instagram":
        return await meta.publishInstagram({
          pageToken: integration.pageToken,
          igUserId: integration.igUserId,
          caption: post.text,
          imageUrl: post.imageUrl || null,
        });

      default:
        return { ok: false, error: `No publisher for ${networkId}.` };
    }
  } catch (err) {
    // A publisher that throws rather than returning is a bug in that publisher,
    // but it must not take the batch down with it.
    return { ok: false, error: String(err?.message || err), code: "publisher_threw" };
  }
}

/** Verifies a token for a provider before it is stored. */
export async function checkProvider(provider, credentials) {
  switch (provider) {
    case "linkedin":
      return await linkedin.checkConnection({ token: credentials.token });
    case "x":
      return await x.checkConnection({ token: credentials.token });
    case "meta":
      return await meta.checkConnection({ token: credentials.token });
    default:
      return { ok: false, error: `Unknown provider "${provider}".` };
  }
}
