/**
 * Ad Engine — single aggregate read for the event-scoped UI.
 * Returns: validation status, active campaigns, recent perf totals,
 * active overrides, budget cap. All from aggregated tables only.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { getEventPerformance, validatePreLaunch } from "@/modules/ad-engine";
import { getEventMeta } from "@/services/core-data";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const db = createAdminClient();

  const event = await getEventMeta(eventId);
  if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });

  const [assetsCount, videosCount, hooksCount, creativesCount, cap, campaigns, overrides, decisions, perf] =
    await Promise.all([
      db
        .from("ad_engine_assets")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId),
      db
        .from("ad_engine_assets")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("kind", "video"),
      db
        .from("ad_engine_hooks")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("active", true),
      db
        .from("ad_engine_creatives")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId),
      db.from("ad_engine_budget_caps").select("*").eq("event_id", eventId).maybeSingle(),
      db
        .from("ad_engine_campaigns")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false }),
      db
        .from("ad_engine_overrides")
        .select("*")
        .eq("event_id", eventId)
        .eq("active", true),
      db
        .from("ad_engine_decision_log")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(20),
      getEventPerformance(eventId),
    ]);

  const metaValidation = await validatePreLaunch({
    event_id: eventId,
    platform: "meta",
    venue_id: event.venue_id ?? undefined,
  });

  return NextResponse.json({
    event,
    counts: {
      assets: assetsCount.count ?? 0,
      videos: videosCount.count ?? 0,
      hooks: hooksCount.count ?? 0,
      creatives: creativesCount.count ?? 0,
    },
    budget_cap: cap.data ?? null,
    campaigns: campaigns.data ?? [],
    overrides: overrides.data ?? [],
    decisions: decisions.data ?? [],
    performance: perf,
    validation_meta: metaValidation,
  });
}
