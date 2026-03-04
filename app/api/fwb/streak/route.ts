import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-server";
import { getOrCreateWallet } from "@/lib/fwb/earn";
import { getConfig } from "@/lib/fwb/config";
import { getStreakInfo } from "@/lib/fwb/streaks";

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
    const wallet = await getOrCreateWallet(user.id, venueId, supabase);
    const config = await getConfig(venueId, supabase);
    const streakInfo = getStreakInfo(wallet, config);

    return NextResponse.json({ streak_info: streakInfo });
  } catch (err) {
    console.error("FWB streak error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
