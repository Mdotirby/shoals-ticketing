import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/auctions/[id] — single auction with item count
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("auctions")
    .select("*, venues(name), events(title), auction_items(id)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Auction not found" }, { status: 404 });
  }

  const auction = {
    ...data,
    venue_name: (data.venues as Record<string, unknown>)?.name || null,
    event_title: (data.events as Record<string, unknown>)?.title || null,
    item_count: Array.isArray(data.auction_items) ? data.auction_items.length : 0,
    venues: undefined,
    events: undefined,
    auction_items: undefined,
  };

  return NextResponse.json(auction);
}

// PUT /api/auctions/[id] — update auction
export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = createAdminClient();
  const body = await request.json();

  const allowedFields = [
    "name", "description", "logo_url", "event_id",
    "auction_open", "auction_close", "status",
    "anti_snipe_enabled", "anti_snipe_minutes", "host_fee_percent",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("auctions")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/auctions/[id]
export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = createAdminClient();

  const { error } = await supabase.from("auctions").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
