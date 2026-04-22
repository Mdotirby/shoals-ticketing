/**
 * Campaign Builder — orchestrates:
 *   pre-launch validation → create campaign row →
 *   persist creatives link → call platform adapter →
 *   store external ids.
 *
 * Enforces BUDGET HARD WALLS up front (campaign.daily_budget_cap can
 * never exceed event-level daily_cap_total; same for total cap).
 */
import { createAdminClient } from "@/lib/supabase-server";
import { getAdapter } from "../integrations";
import type { AdPlatform, Campaign, CampaignMode, Creative } from "../types";
import { validatePreLaunch } from "./preLaunch";

export type BuildInput = {
  event_id: string;
  venue_id?: string | null;
  platform: AdPlatform;
  identity_id?: string | null;
  name: string;
  mode: CampaignMode;
  daily_budget: number;
  total_budget: number;
  creative_ids: string[];              // selected creatives to attach
  notes?: string | null;
  launch?: boolean;                    // if false, leaves in 'draft'
};

export type BuildResult =
  | { ok: true; campaign: Campaign; validation: Awaited<ReturnType<typeof validatePreLaunch>> }
  | {
      ok: false;
      reason: string;
      validation?: Awaited<ReturnType<typeof validatePreLaunch>>;
    };

export async function buildCampaign(input: BuildInput): Promise<BuildResult> {
  const db = createAdminClient();

  // 1) validation
  const validation = await validatePreLaunch({
    event_id: input.event_id,
    platform: input.platform,
    venue_id: input.venue_id,
  });
  if (!validation.ready) {
    return { ok: false, reason: `pre-launch failed: ${validation.missing.join("; ")}`, validation };
  }

  // 2) hard-wall budget check
  const { data: capRow } = await db
    .from("ad_engine_budget_caps")
    .select("*")
    .eq("event_id", input.event_id)
    .maybeSingle();
  if (!capRow) return { ok: false, reason: "no budget cap row for event", validation };
  const cap = capRow as { daily_cap_total: number; campaign_cap_total: number };

  // Sum existing active/pending campaigns for the same event to avoid stacking.
  const { data: siblings } = await db
    .from("ad_engine_campaigns")
    .select("daily_budget_cap,total_budget_cap,status")
    .eq("event_id", input.event_id)
    .in("status", ["active", "pending_validation", "draft"]);

  const siblingsDaily = ((siblings ?? []) as Array<{ daily_budget_cap: number }>).reduce(
    (s, r) => s + Number(r.daily_budget_cap || 0),
    0
  );
  const siblingsTotal = ((siblings ?? []) as Array<{ total_budget_cap: number }>).reduce(
    (s, r) => s + Number(r.total_budget_cap || 0),
    0
  );

  if (siblingsDaily + input.daily_budget > cap.daily_cap_total) {
    return {
      ok: false,
      reason: `daily budget hard wall: ${siblingsDaily + input.daily_budget} > ${cap.daily_cap_total}`,
      validation,
    };
  }
  if (siblingsTotal + input.total_budget > cap.campaign_cap_total) {
    return {
      ok: false,
      reason: `total budget hard wall: ${siblingsTotal + input.total_budget} > ${cap.campaign_cap_total}`,
      validation,
    };
  }

  // 3) resolve identity (required)
  let identityId = input.identity_id ?? null;
  if (!identityId) {
    const { data } = await db
      .from("ad_engine_identities")
      .select("id")
      .eq("platform", input.platform)
      .eq("active", true)
      .eq("venue_id", input.venue_id ?? "")
      .limit(1)
      .maybeSingle();
    identityId = data ? (data as { id: string }).id : null;
  }
  if (!identityId) return { ok: false, reason: "no identity available for platform", validation };

  // 4) insert campaign row (draft)
  const { data: campRow, error: campErr } = await db
    .from("ad_engine_campaigns")
    .insert({
      event_id: input.event_id,
      venue_id: input.venue_id ?? null,
      identity_id: identityId,
      platform: input.platform,
      name: input.name,
      mode: input.mode,
      status: input.launch ? "pending_validation" : "draft",
      daily_budget_cap: input.daily_budget,
      total_budget_cap: input.total_budget,
      current_daily_budget: input.daily_budget,
      current_total_spend: 0,
      notes: input.notes ?? null,
    })
    .select()
    .single();
  if (campErr || !campRow) return { ok: false, reason: campErr?.message ?? "insert failed", validation };
  const campaign = campRow as Campaign;

  // 5) link creatives
  if (input.creative_ids.length > 0) {
    await db.from("ad_engine_campaign_creatives").insert(
      input.creative_ids.map((cid) => ({
        campaign_id: campaign.id,
        creative_id: cid,
        status: "active",
      }))
    );
  }

  if (!input.launch) return { ok: true, campaign, validation };

  // 6) call the platform adapter
  const { data: idRow } = await db
    .from("ad_engine_identities")
    .select("external_id,access_token")
    .eq("id", identityId)
    .maybeSingle();
  const { data: creatives } = await db
    .from("ad_engine_creatives")
    .select("*")
    .in("id", input.creative_ids);

  const adapter = getAdapter(input.platform);
  let external_campaign_id: string | null = null;
  try {
    const out = await adapter.createCampaign({
      campaign,
      creatives: (creatives ?? []) as Creative[],
      identity_external_id: (idRow as { external_id: string } | null)?.external_id ?? "",
      access_token: (idRow as { access_token: string | null } | null)?.access_token ?? "",
    });
    external_campaign_id = out.external_campaign_id;

    await db
      .from("ad_engine_campaigns")
      .update({
        external_campaign_id,
        status: "active",
        launched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);

    if (Object.keys(out.external_ad_ids).length > 0) {
      for (const [creative_id, ext_ad_id] of Object.entries(out.external_ad_ids)) {
        await db
          .from("ad_engine_campaign_creatives")
          .update({ external_ad_id: ext_ad_id })
          .eq("campaign_id", campaign.id)
          .eq("creative_id", creative_id);
      }
    }
  } catch (e) {
    await db
      .from("ad_engine_campaigns")
      .update({ status: "failed", notes: `launch failed: ${String((e as Error).message)}` })
      .eq("id", campaign.id);
    return { ok: false, reason: `platform launch failed: ${(e as Error).message}`, validation };
  }

  return { ok: true, campaign: { ...campaign, external_campaign_id, status: "active" }, validation };
}
