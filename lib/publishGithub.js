// Publishing by pull request.
//
// Checking what the connected sites actually run found no CMS at all — all four
// are code-deployed on Vercel, two of them Next.js. So "publish" here means open
// a PR against the repository, not call a CMS API.
//
// That's the safer shape anyway. A PR is reviewable before it goes live,
// revertible after, and leaves a record of what MADBOT proposed and who merged
// it. Pushing to a live site gives you none of that, and pushing straight to the
// default branch is refused outright below — an autonomous agent committing to
// main unreviewed is how you lose a customer's trust in one afternoon.

const API = "https://api.github.com";

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "MADBOT/1.0",
    "Content-Type": "application/json",
  };
}

async function gh(token, path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: headers(token) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.message || `GitHub returned ${res.status}`);
    err.status = res.status;
    err.githubErrors = body?.errors || null;
    throw err;
  }
  return body;
}

/**
 * Checks a connection before anything is written, so a misconfigured repo fails
 * on a button press rather than halfway through publishing.
 *
 * Returns what the token can actually do, because a token that can read but not
 * write looks identical until the moment it matters.
 */
export async function checkConnection({ token, repo }) {
  if (!token) return { ok: false, error: "No GitHub token for this site." };
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || "")) {
    return { ok: false, error: 'Repository must be in "owner/name" form.' };
  }
  try {
    const info = await gh(token, `/repos/${repo}`);
    return {
      ok: true,
      repo: info.full_name,
      defaultBranch: info.default_branch,
      private: info.private,
      // push permission is what publishing needs; pull alone is not enough.
      canWrite: !!info.permissions?.push,
      permissions: info.permissions || null,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err.status === 404
          ? `Can't see ${repo}. Either it doesn't exist or the token has no access to it.`
          : err.message,
      status: err.status || null,
    };
  }
}

/**
 * Where a page should live in this repo, guessed from what's already there.
 *
 * Guessing matters: writing an MDX file into a Pages Router project, or into a
 * repo with no content directory at all, produces a PR that can't merge. When
 * nothing recognisable exists it returns null rather than picking somewhere and
 * hoping.
 */
export async function detectContentPath({ token, repo, branch }) {
  const candidates = [
    { dir: "content/blog", ext: "mdx" },
    { dir: "content/posts", ext: "mdx" },
    { dir: "src/content/blog", ext: "mdx" },
    { dir: "posts", ext: "mdx" },
    { dir: "app/blog", ext: "mdx" },
    { dir: "_posts", ext: "md" },
    { dir: "content", ext: "md" },
  ];
  for (const c of candidates) {
    try {
      const listing = await gh(token, `/repos/${repo}/contents/${c.dir}?ref=${encodeURIComponent(branch)}`);
      if (Array.isArray(listing)) {
        // Copy the extension the repo already uses rather than imposing one.
        const existing = listing.find((f) => /\.mdx?$/.test(f.name || ""));
        return {
          dir: c.dir,
          ext: existing ? existing.name.split(".").pop() : c.ext,
          sampleExisting: existing?.name || null,
          fileCount: listing.length,
        };
      }
    } catch {
      // Missing directory is the normal case; try the next.
    }
  }
  return null;
}

function slugify(title) {
  return (
    String(title)
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 70) || "untitled"
  );
}

/**
 * Opens a pull request adding one article.
 *
 * Never commits to the default branch. Never force-pushes. If the branch
 * already exists the whole thing stops rather than overwriting someone's work —
 * a name collision usually means this already ran, and the second run silently
 * discarding the first would be worse than an error.
 */
export async function publishArticle({ token, repo, article, contentPath, authorNote }) {
  const conn = await checkConnection({ token, repo });
  if (!conn.ok) return { ok: false, stage: "connect", error: conn.error };
  if (!conn.canWrite) {
    return {
      ok: false,
      stage: "connect",
      error: `The token can read ${repo} but not push to it. Publishing needs write access.`,
    };
  }

  const base = conn.defaultBranch;
  const target = contentPath || (await detectContentPath({ token, repo, branch: base }));
  if (!target) {
    return {
      ok: false,
      stage: "locate",
      error:
        "Couldn't find where posts live in this repo. Set the content directory on the site's settings and try again.",
    };
  }

  const slug = slugify(article.title);
  const branch = `madbot/${slug}`.slice(0, 90);
  const filePath = `${target.dir}/${slug}.${target.ext}`;

  try {
    // 1. The commit the new branch will start from.
    const ref = await gh(token, `/repos/${repo}/git/ref/heads/${encodeURIComponent(base)}`);
    const baseSha = ref?.object?.sha;
    if (!baseSha) return { ok: false, stage: "base", error: `Couldn't read the tip of ${base}.` };

    // 2. Refuse rather than clobber.
    try {
      await gh(token, `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
      return {
        ok: false,
        stage: "branch",
        error: `Branch ${branch} already exists. This article looks like it was already published — check its open pull requests.`,
        branch,
      };
    } catch (err) {
      if (err.status !== 404) throw err;
    }

    // 3. Create the branch.
    await gh(token, `/repos/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
    });

    // 4. Write the file onto it.
    const body = renderMarkdown(article, authorNote);
    const put = await gh(token, `/repos/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `Add: ${article.title}`,
        content: Buffer.from(body, "utf8").toString("base64"),
        branch,
      }),
    });

    // 5. Open the PR. Explicitly a draft-style ask, not a merge.
    const pr = await gh(token, `/repos/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title: `MADBOT: ${article.title}`,
        head: branch,
        base,
        body: prDescription(article, filePath, authorNote),
      }),
    });

    return {
      ok: true,
      prUrl: pr.html_url,
      prNumber: pr.number,
      branch,
      filePath,
      commitSha: put?.commit?.sha || null,
      // Stated plainly: nothing is live until a person merges.
      live: false,
      note: "Opened as a pull request. Nothing is published until someone merges it.",
    };
  } catch (err) {
    return { ok: false, stage: "publish", error: err.message, status: err.status || null, branch };
  }
}

function renderMarkdown(article, authorNote) {
  const fm = [
    "---",
    `title: ${JSON.stringify(article.title)}`,
    article.description ? `description: ${JSON.stringify(article.description)}` : null,
    `date: ${new Date().toISOString().slice(0, 10)}`,
    article.tags?.length ? `tags: [${article.tags.map((t) => JSON.stringify(t)).join(", ")}]` : null,
    article.draft === false ? null : "draft: true",
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  // The provenance line stays in the file, not just the PR. Six months later,
  // whoever opens this file should be able to tell where it came from.
  const trail = authorNote ? `\n\n<!-- ${authorNote} -->\n` : "\n";
  return `${fm}\n\n${article.body.trim()}\n${trail}`;
}

function prDescription(article, filePath, authorNote) {
  return [
    `MADBOT drafted this article and opened it for review.`,
    "",
    `**File:** \`${filePath}\``,
    article.description ? `**Summary:** ${article.description}` : null,
    article.wordCount ? `**Length:** ~${article.wordCount} words` : null,
    article.sources?.length
      ? `\n**Checked against:**\n${article.sources.map((s) => `- ${s}`).join("\n")}`
      : null,
    "",
    "It is marked `draft: true` in the front matter, so merging alone won't put it live — remove that when you're happy with it.",
    authorNote ? `\n_${authorNote}_` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
