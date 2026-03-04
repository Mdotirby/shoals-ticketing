import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-server";
import { getOrCreateWallet } from "@/lib/fwb/earn";
import { redeemReward } from "@/lib/fwb/redemption";

export async function POST(request: Request) {
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

    const body = await request.json();
    const { reward_id } = body;

    if (!reward_id) {
      return NextResponse.json({ error: "reward_id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const wallet = await getOrCreateWallet(user.id, venueId, supabase);

    const result = await redeemReward({
      walletId: wallet.id,
      rewardId: reward_id,
      supabase,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("FWB redeem error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("Insufficient") || message.includes("requires")
      ? 400
      : message.includes("not found") || message.includes("no longer active") || message.includes("expired") || message.includes("out of stock")
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
