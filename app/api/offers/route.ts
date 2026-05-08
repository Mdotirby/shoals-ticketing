import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET: list offers, optional ?venue_id= filter
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");

  let query = admin
    .from("artist_offers")
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

// POST: create an offer with all expanded fields
export async function POST(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();

  const { data, error } = await admin
    .from("artist_offers")
    .insert({
      artist_name: body.artist_name,
      venue: body.venue || null,
      venue_address: body.venue_address || null,
      venue_contact: body.venue_contact || null,
      venue_phone: body.venue_phone || null,
      event_date: body.event_date || null,
      venue_id: body.venue_id || null,
      event_venue_id: body.event_venue_id || null,
      event_id: body.event_id || null,
      // Agency
      agency: body.agency || null,
      agent_name: body.agent_name || null,
      agent_phone: body.agent_phone || null,
      agent_email: body.agent_email || null,
      // Show
      day_of_event: body.day_of_event || null,
      num_shows: body.num_shows || 1,
      show_length: body.show_length || null,
      show_time: body.show_time || null,
      billing: body.billing || "100% Headline",
      show_lineup: body.show_lineup || [],
      // Deal
      guarantee: body.guarantee || null,
      deal_type: body.deal_type || null,
      backend_percentage: body.backend_percentage || null,
      other_terms: body.other_terms || null,
      radius_distance: body.radius_distance || null,
      radius_days_prior: body.radius_days_prior || null,
      radius_days_after: body.radius_days_after || null,
      production_by: body.production_by || null,
      deposit_pct: body.deposit_pct || null,
      deposit_amount: body.deposit_amount || null,
      deposit_due: body.deposit_due || null,
      balance_due: body.balance_due || "Day of Show",
      merch_split: body.merch_split || null,
      merch_seller: body.merch_seller || null,
      comps: body.comps || 0,
      artist_comps: body.artist_comps || 0,
      marketing_comps: body.marketing_comps || 0,
      // Scaling + Expenses
      ticket_scaling: body.ticket_scaling || [],
      fixed_expenses: body.fixed_expenses || [],
      variable_expenses: body.variable_expenses || [],
      // Totals
      total_fixed: body.total_fixed || 0,
      total_variable: body.total_variable || 0,
      total_expenses: body.total_expenses || 0,
      gross_potential: body.gross_potential || 0,
      adj_gross: body.adj_gross || 0,
      tax_rate: body.tax_rate || 0,
      net_potential: body.net_potential || 0,
      splitpoint: body.splitpoint || 0,
      artist_backend: body.artist_backend || 0,
      pot_walkout: body.pot_walkout || 0,
      offer_valid_days: body.offer_valid_days || 14,
      // Meta
      terms: body.terms || null,
      notes: body.notes || null,
      status: body.status || "draft",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
