/**
 * Pre-launch validation — enforces the spec's minimums:
 *   >= 3 creatives, >= 1 video, >= 2 hooks
 * Also requires a budget cap row + identity for the platform.
 */
import { createAdminClient } from "@/lib/supabase-server";
import { AD_ENGINE } from "../constants";
import type { AdPlatform, PreLaunchValidation } from "../types";

export async function validatePreLaunch(opts: {
  event_id: string;
  platform: AdPlatform;
  venue_id?: string | null;
}): Promise<PreLaunchValidation> {
  const db = createAdminClient();

  const [creatives, videos, hooks, cap, identity] = await Promise.all([
    db.from("ad_engine_creatives").select("id", { count: "exact", head: true }).eq("event_id", opts.event_id),
    db
      .from("ad_engine_creatives")
      .select("id, asset:ad_engine_assets(kind)", { count: "exact" })
      .eq("event_id", opts.event_id),
    db
      .from("ad_engine_hooks")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .or(`event_id.eq.${opts.event_id}${opts.venue_id ? `,and(event_id.is.null,venue_id.eq.${opts.venue_id})` : ""}`),
    db.from("ad_engine_budget_caps").select("id").eq("event_id", opts.event_id).maybeSingle(),
    db
      .from("ad_engine_identities")
      .select("id")
      .eq("platform", opts.platform)
      .eq("active", true)
      .eq("venue_id", opts.venue_id ?? "")
      .maybeSingle(),
  ]);

  const creativesCount = creatives.count ?? 0;
  const videoRows = (videos.data ?? []) as Array<{ asset?: { kind?: string } | null }>;
  const videosCount = videoRows.filter((r) => r.asset?.kind === "video").length;
  const hooksCount = hooks.count ?? 0;

  const checks = {
    creatives: {
      required: AD_ENGINE.MIN_CREATIVES,
      have: creativesCount,
      ok: creativesCount >= AD_ENGINE.MIN_CREATIVES,
    },
    videos: {
      required: AD_ENGINE.MIN_VIDEOS,
      have: videosCount,
      ok: videosCount >= AD_ENGINE.MIN_VIDEOS,
    },
    hooks: {
      required: AD_ENGINE.MIN_HOOKS,
      have: hooksCount,
      ok: hooksCount >= AD_ENGINE.MIN_HOOKS,
    },
    budget_cap_set: { ok: Boolean(cap.data) },
    identity_selected: { ok: Boolean(identity.data) },
  } satisfies PreLaunchValidation["checks"];

  const missing: string[] = [];
  if (!checks.creatives.ok)
    missing.push(`need ${AD_ENGINE.MIN_CREATIVES} creatives (have ${creativesCount})`);
  if (!checks.videos.ok)
    missing.push(`need ${AD_ENGINE.MIN_VIDEOS} video creative (have ${videosCount})`);
  if (!checks.hooks.ok)
    missing.push(`need ${AD_ENGINE.MIN_HOOKS} hooks (have ${hooksCount})`);
  if (!checks.budget_cap_set.ok) missing.push("no budget cap row for event");
  if (!checks.identity_selected.ok)
    missing.push(`no active ${opts.platform} identity for venue`);

  return {
    ready: missing.length === 0,
    checks,
    missing,
  };
}
