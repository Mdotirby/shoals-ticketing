import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { verifyAdminAuth } from "@/lib/fwb/admin-auth";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await request.json();
    const supabase = createAdminClient();

    const { data: perk, error } = await supabase
      .from("fwb_tier_perks")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("venue_id", auth.venueId!)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!perk) {
      return NextResponse.json({ error: "Tier perk not found" }, { status: 404 });
    }

    return NextResponse.json(perk);
  } catch (err) {
    console.error("FWB admin tier-perk PUT error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("fwb_tier_perks")
      .delete()
      .eq("id", id)
      .eq("venue_id", auth.venueId!);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("FWB admin tier-perk DELETE error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
