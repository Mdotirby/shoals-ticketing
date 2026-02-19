import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/contracts — list contracts, optional ?venue_id= filter
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");

  let query = admin
    .from("contracts")
    .select("*")
    .order("created_at", { ascending: false });

  if (venueId) {
    query = query.eq("venue_id", venueId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? [], { status: 200 });
}

// POST /api/contracts — create a contract (from offer data or uploaded)
export async function POST(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();

  if (!body.venue_id) {
    return NextResponse.json(
      { error: "venue_id is required" },
      { status: 400 }
    );
  }

  // If offer_id provided, snapshot deal terms from the offer
  let offerSnapshot: Record<string, unknown> = {};
  if (body.offer_id) {
    const { data: offer } = await admin
      .from("artist_offers")
      .select(
        "guarantee, deal_type, backend_percentage, deposit_amount, event_date, venue_id"
      )
      .eq("id", body.offer_id)
      .single();

    if (offer) {
      offerSnapshot = {
        guarantee: offer.guarantee ?? null,
        deal_type: offer.deal_type ?? null,
        backend_percentage: offer.backend_percentage ?? null,
        deposit_amount: offer.deposit_amount ?? null,
      };
    }
  }

  const { data, error } = await admin
    .from("contracts")
    .insert({
      offer_id: body.offer_id || null,
      event_id: body.event_id || null,
      venue_id: body.venue_id,
      source: body.source || "generated",
      guarantee: body.guarantee ?? offerSnapshot.guarantee ?? null,
      deal_type: body.deal_type ?? offerSnapshot.deal_type ?? null,
      backend_percentage:
        body.backend_percentage ?? offerSnapshot.backend_percentage ?? null,
      bonus_structure: body.bonus_structure || null,
      radius_clause: body.radius_clause || null,
      deposit_amount:
        body.deposit_amount ?? offerSnapshot.deposit_amount ?? null,
      deposit_paid: body.deposit_paid ?? false,
      file_url: body.file_url || null,
      file_name: body.file_name || null,
      version: body.version || 1,
      custom_clauses: body.custom_clauses || null,
      status: body.status || "draft",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
