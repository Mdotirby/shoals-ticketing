import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-server";
import { getOrCreateWallet } from "@/lib/fwb/earn";
import { getConfig } from "@/lib/fwb/config";
import { getTierProgress } from "@/lib/fwb/tiers";
import { getStreakInfo } from "@/lib/fwb/streaks";
import { checkExpiration, expireBenefits } from "@/lib/fwb/expiration";
import type { FWBWalletSummary } from "@/lib/types/fwb";

export async function GET(request: Request) {
  try {
    const venueId = request.headers.get("x-venue-id");
    if (!venueId) {
      return NextResponse.json({ error: "x-venue-id header is required" }, { status: 400 });
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Authorization required" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Get or create wallet
    const wallet = await getOrCreateWallet(user.id, venueId, supabase);

    // Check and process expiration
    if (checkExpiration(wallet)) {
      await expireBenefits(wallet.id, supabase);
      // Re-fetch wallet after expiration
      const { data: refreshed, error: refreshError } = await supabase
        .from("fwb_wallets")
        .select("*")
        .eq("id", wallet.id)
        .single();

      if (refreshError || !refreshed) {
        return NextResponse.json({ error: "Failed to refresh wallet" }, { status: 500 });
      }

      Object.assign(wallet, refreshed);
    }

    // Get config and compute summaries
    const config = await getConfig(venueId, supabase);
    const tierProgress = getTierProgress(wallet.lifetime_benefits_earned, config);
    const streakInfo = getStreakInfo(wallet, config);

    // Get tier perks for current tier
    const { data: perks } = await supabase
      .from("fwb_tier_perks")
      .select("*")
      .eq("venue_id", venueId)
      .eq("tier", wallet.current_tier)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    // Get unread notification count
    const { count } = await supabase
      .from("fwb_notifications")
      .select("id", { count: "exact", head: true })
      .eq("wallet_id", wallet.id)
      .eq("is_read", false);

    const summary: FWBWalletSummary = {
      wallet,
      tier_progress: tierProgress,
      streak_info: streakInfo,
      perks: perks || [],
      notifications_unread: count || 0,
    };

    return NextResponse.json(summary);
  } catch (err) {
    console.error("FWB wallet error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
