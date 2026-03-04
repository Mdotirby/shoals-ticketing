import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { verifyAdminAuth } from "@/lib/fwb/admin-auth";
import { TIER_ORDER } from "@/lib/types/fwb";
import type { FWBTier, FWBTierPerk } from "@/lib/types/fwb";

export async function GET(request: Request) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const supabase = createAdminClient();

    const { data: perks, error } = await supabase
      .from("fwb_tier_perks")
      .select("*")
      .eq("venue_id", auth.venueId!)
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by tier
    const grouped: Record<string, FWBTierPerk[]> = {};
    for (const tier of TIER_ORDER) {
      grouped[tier] = [];
    }
    for (const perk of (perks || []) as FWBTierPerk[]) {
      if (grouped[perk.tier]) {
        grouped[perk.tier].push(perk);
      }
    }

    return NextResponse.json(grouped);
  } catch (err) {
    console.error("FWB admin tier-perks GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const { tier, perk_name, perk_description } = body;

    if (!tier || !perk_name) {
      return NextResponse.json(
        { error: "tier and perk_name are required" },
        { status: 400 }
      );
    }

    if (!TIER_ORDER.includes(tier as FWBTier)) {
      return NextResponse.json(
        { error: `Invalid tier. Must be one of: ${TIER_ORDER.join(", ")}` },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Get next sort_order for this tier
    const { data: existing } = await supabase
      .from("fwb_tier_perks")
      .select("sort_order")
      .eq("venue_id", auth.venueId!)
      .eq("tier", tier)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSort = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

    const { data: perk, error } = await supabase
      .from("fwb_tier_perks")
      .insert({
        venue_id: auth.venueId!,
        tier,
        perk_name,
        perk_description: perk_description || null,
        sort_order: nextSort,
        is_active: true,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(perk, { status: 201 });
  } catch (err) {
    console.error("FWB admin tier-perks POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
