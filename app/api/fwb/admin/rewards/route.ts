import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { verifyAdminAuth } from "@/lib/fwb/admin-auth";
import { notifyRewardDrop } from "@/lib/fwb/notifications";

export async function GET(request: Request) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const supabase = createAdminClient();

    const { data: rewards, error } = await supabase
      .from("fwb_rewards")
      .select("*")
      .eq("venue_id", auth.venueId!)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(rewards || []);
  } catch (err) {
    console.error("FWB admin rewards GET error:", err);
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
    const { reward_name, reward_cost_in_benefits, reward_type, inventory_limit, expiration_date, description, min_tier, image_url, notify } = body;

    if (!reward_name || !reward_cost_in_benefits || !reward_type) {
      return NextResponse.json(
        { error: "reward_name, reward_cost_in_benefits, and reward_type are required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: reward, error } = await supabase
      .from("fwb_rewards")
      .insert({
        venue_id: auth.venueId!,
        reward_name,
        reward_cost_in_benefits,
        reward_type,
        inventory_limit: inventory_limit || null,
        inventory_remaining: inventory_limit || null,
        expiration_date: expiration_date || null,
        description: description || null,
        min_tier: min_tier || "casual_friend",
        image_url: image_url || null,
        is_active: true,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Optionally notify all venue members about the new reward
    if (notify) {
      try {
        await notifyRewardDrop(auth.venueId!, reward_name, supabase);
      } catch (notifyErr) {
        console.error("Failed to send reward drop notifications:", notifyErr);
        // Don't fail the request if notifications fail
      }
    }

    return NextResponse.json(reward, { status: 201 });
  } catch (err) {
    console.error("FWB admin rewards POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
