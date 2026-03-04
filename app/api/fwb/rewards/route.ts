import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { getAvailableRewards } from "@/lib/fwb/redemption";

export async function GET(request: Request) {
  try {
    const venueId = request.headers.get("x-venue-id");
    if (!venueId) {
      return NextResponse.json({ error: "x-venue-id header is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const rewards = await getAvailableRewards(venueId, supabase);

    return NextResponse.json(rewards);
  } catch (err) {
    console.error("FWB rewards error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
