import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET: fetch a single trackable link with analytics
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  try {
    const { id, linkId } = await params;
    const admin = createAdminClient();

    // Fetch the link
    const { data: link, error: linkError } = await admin
      .from("trackable_links")
      .select("*")
      .eq("id", linkId)
      .eq("event_id", id)
      .single();

    if (linkError || !link) {
      return NextResponse.json(
        { error: linkError?.message || "Link not found" },
        { status: 404 }
      );
    }

    // Fetch all events for this link for detailed analytics
    const { data: events, error: eventsError } = await admin
      .from("trackable_link_events")
      .select("*")
      .eq("link_id", linkId)
      .order("created_at", { ascending: false });

    if (eventsError) {
      // Return the link without analytics if events query fails
      return NextResponse.json({ ...link, analytics: null }, { status: 200 });
    }

    const allEvents = events ?? [];
    const clicks = allEvents.filter(
      (e: { event_type: string }) => e.event_type === "click"
    );
    const conversions = allEvents.filter(
      (e: { event_type: string }) => e.event_type === "conversion"
    );

    // Unique clicks by distinct ip_address
    const uniqueIps = new Set(
      clicks
        .map((e: { ip_address: string | null }) => e.ip_address)
        .filter(Boolean)
    );

    // Clicks by day (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const clicksByDay: Record<string, number> = {};
    for (const click of clicks) {
      const date = new Date(click.created_at);
      if (date >= thirtyDaysAgo) {
        const dayKey = date.toISOString().split("T")[0];
        clicksByDay[dayKey] = (clicksByDay[dayKey] || 0) + 1;
      }
    }

    // Total revenue from conversions
    const totalRevenue = conversions.reduce(
      (sum: number, e: { revenue_amount: number | null }) =>
        sum + (Number(e.revenue_amount) || 0),
      0
    );

    // Click-to-conversion rate
    const totalClicks = clicks.length;
    const totalConversions = conversions.length;
    const conversionRate =
      totalClicks > 0
        ? ((totalConversions / totalClicks) * 100).toFixed(1)
        : "0";

    return NextResponse.json(
      {
        ...link,
        analytics: {
          total_clicks: totalClicks,
          unique_clicks: uniqueIps.size,
          clicks_by_day: clicksByDay,
          total_conversions: totalConversions,
          total_revenue: totalRevenue,
          conversion_rate: conversionRate,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH: update a trackable link
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  try {
    const { id, linkId } = await params;
    const admin = createAdminClient();
    const body = await request.json();

    // Only allow specific fields to be updated
    const allowedFields = ["label", "source", "medium", "campaign", "is_active"];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const { data, error } = await admin
      .from("trackable_links")
      .update(updates)
      .eq("id", linkId)
      .eq("event_id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
