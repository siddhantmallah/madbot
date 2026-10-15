import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../../../../lib/firebaseAdmin";
import { adminRoute, ok } from "../../../../lib/adminApi";
import { readJson, z } from "../../../../lib/apiGuard";
import { recordAdminAction } from "../../../../lib/adminAudit";
import { CACHE_MS, DEFAULT_SETTINGS, invalidatePlatformCache, platformSettings } from "../../../../lib/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Platform settings. Branding is not here on purpose: it lives in
 * lib/company.js, which the published legal pages render from, so the two
 * can't drift (decided 2026-10-14).
 */
export const GET = adminRoute("platform.dashboard.read", async () => {
  invalidatePlatformCache();
  return ok({ settings: await platformSettings(), defaults: DEFAULT_SETTINGS, propagationSeconds: CACHE_MS / 1000 });
});

const Template = z.object({
  subject: z.string().max(150).optional(),
  intro: z.string().max(1000).optional(),
});

const Body = z.object({
  signupOpen: z.boolean().optional(),
  maintenance: z.object({ on: z.boolean(), message: z.string().max(500).default("") }).optional(),
  emailTemplates: z.object({ welcome: Template.optional(), verify: Template.optional() }).optional(),
});

export const PUT = adminRoute("platform.settings.manage", async ({ request, admin }) => {
  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  const ref = adminDb().collection("platform").doc("settings");
  const before = (await ref.get()).data() || {};
  await ref.set({ ...body.data, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid }, { merge: true });
  invalidatePlatformCache();
  const changed = Object.keys(body.data);
  await recordAdminAction({
    admin,
    request,
    action: "settings.update",
    targetType: "settings",
    targetId: "platform",
    targetLabel: changed.join(", "),
    before: Object.fromEntries(changed.map((k) => [k, before[k] ?? null])),
    after: body.data,
  });
  return ok();
});
