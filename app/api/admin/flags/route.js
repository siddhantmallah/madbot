import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../../../../lib/firebaseAdmin";
import { adminRoute, ok, reply } from "../../../../lib/adminApi";
import { readJson, z } from "../../../../lib/apiGuard";
import { recordAdminAction } from "../../../../lib/adminAudit";
import { CACHE_MS, FLAGGABLE, invalidatePlatformCache } from "../../../../lib/platform";
import { FEATURE_LABELS } from "../../../../lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The global switch for every feature. A switched-off feature is refused on
 * the server (licenseServer.authorize) and skipped by the scheduler, for every
 * organisation without its own override. Flags take away; they never grant
 * what a licence doesn't include.
 */
export const GET = adminRoute("platform.dashboard.read", async () => {
  const snap = await adminDb().collection("platform").doc("flags").get();
  const stored = snap.exists ? snap.data() : {};
  return ok({
    flags: FLAGGABLE.map((key) => ({
      key,
      label: FEATURE_LABELS[key] || key,
      enabled: typeof stored[key]?.enabled === "boolean" ? stored[key].enabled : true,
      updatedAt: stored[key]?.updatedAt?.toDate?.().toISOString() || null,
    })),
    propagationSeconds: CACHE_MS / 1000,
  });
});

const Body = z.object({ key: z.string().max(40), enabled: z.boolean() });

export const PUT = adminRoute("platform.flags.manage", async ({ request, admin }) => {
  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  if (!FLAGGABLE.includes(body.data.key)) return reply(400, "Unknown feature.");
  const ref = adminDb().collection("platform").doc("flags");
  const before = (await ref.get()).data()?.[body.data.key]?.enabled ?? true;
  await ref.set({ [body.data.key]: { enabled: body.data.enabled, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid } }, { merge: true });
  invalidatePlatformCache();
  await recordAdminAction({
    admin,
    request,
    action: "flag.set",
    targetType: "flag",
    targetId: body.data.key,
    targetLabel: FEATURE_LABELS[body.data.key] || body.data.key,
    before: { enabled: before },
    after: { enabled: body.data.enabled },
  });
  return ok();
});
