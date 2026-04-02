import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// POST: record a conversion for a trackable link (called during checkout)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = createAdminClient();
    const body = await request.json();

    if (!body.slug) {
      return NextResponse.json(
        { error: "slug is required" },
        { status: 400 }
      );
    }

    // Look up the link by slug and verify it belongs to this event
    const { data: link, error: linkError } = await admin
      .from("trackable_links")
      .select("*")
      .eq("slug", body.slug)
      .eq("event_id", id)
      .single();

    if (linkError || !link) {
      return NextResponse.json(
        { error: "Trackable link not found for this event" },
        { status: 404 }
      );
    }

    const revenueAmount = Number(body.revenue_amount) || 0;

    // Insert the conversion event
    const { error: insertError } = await admin
      .from("trackable_link_events")
      .insert({
        link_id: link.id,
        event_type: "conversion",
        order_id: body.order_id || null,
        revenue_amount: revenueAmount,
      });

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to record conversion: " + insertError.message },
        { status: 500 }
      );
    }

    // Update denormalized counters — use atomic RPC with fallback
    const { error: rpcErr } = await admin.rpc("increment_trackable_link_conversion", {
      link_row_id: link.id,
      revenue_amt: revenueAmount,
    });

    if (rpcErr) {
      // Fallback: non-atomic increment
      const { error: updateError } = await admin
        .from("trackable_links")
        .update({
          conversions: (link.conversions || 0) + 1,
          revenue: Number(link.revenue || 0) + revenueAmount,
        })
        .eq("id", link.id);

      if (updateError) {
        console.error("[trackable-link] Conversion counter update failed:", updateError.message);
        return NextResponse.json(
          { error: "Conversion recorded but counter update failed: " + updateError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
