import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { verifyAdminAuth } from "@/lib/fwb/admin-auth";

export async function GET(request: Request) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const supabase = createAdminClient();

    const { data: members, error } = await supabase
      .from("fwb_wallets")
      .select(
        "id, user_id, email, first_name, last_name, current_tier, current_benefits_balance, lifetime_benefits_earned, current_streak_count, created_at"
      )
      .eq("venue_id", auth.venueId!)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("FWB members fetch error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(members ?? []);
  } catch (err) {
    console.error("FWB admin members error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
