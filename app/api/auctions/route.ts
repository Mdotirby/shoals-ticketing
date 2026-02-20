import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

// GET /api/auctions — list auctions (optionally filter by venue_id)
export async function GET(request: Request) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");

  let query = supabase
    .from("auctions")
    .select("*, venues(name), events(title)")
    .order("created_at", { ascending: false });

  if (venueId) {
    query = query.eq("venue_id", venueId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten joined fields
  const auctions = (data || []).map((a: Record<string, unknown>) => ({
    ...a,
    venue_name: (a.venues as Record<string, unknown>)?.name || null,
    event_title: (a.events as Record<string, unknown>)?.title || null,
    venues: undefined,
    events: undefined,
  }));

  return NextResponse.json(auctions);
}

// POST /api/auctions — create a new auction
export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();

  const {
    venue_id,
    event_id,
    name,
    description,
    logo_url,
    auction_open,
    auction_close,
    anti_snipe_enabled,
    anti_snipe_minutes,
    host_fee_percent,
  } = body;

  if (!venue_id || !name || !auction_open || !auction_close) {
    return NextResponse.json(
      { error: "venue_id, name, auction_open, and auction_close are required." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("auctions")
    .insert({
      venue_id,
      event_id: event_id || null,
      name,
      description: description || null,
      logo_url: logo_url || null,
      auction_open,
      auction_close,
      status: "draft",
      anti_snipe_enabled: anti_snipe_enabled ?? true,
      anti_snipe_minutes: anti_snipe_minutes ?? 2,
      host_fee_percent: host_fee_percent ?? 8.0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
