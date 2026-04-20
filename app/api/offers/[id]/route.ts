import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// Whitelist of columns that exist on artist_offers. Keep in sync with
// plans/offers-expansion-migration.sql + plans/offer-tax-columns-migration.sql.
// Unknown keys from the client are silently dropped so that future form drift
// cannot break saves.
const ALLOWED_COLUMNS = new Set<string>([
  // Identity / linkage
  "artist_name", "venue", "venue_address", "venue_contact", "venue_phone",
  "event_date", "venue_id", "event_venue_id",
  // Agency
  "agency", "agent_name", "agent_phone", "agent_email",
  // Show details
  "day_of_event", "num_shows", "show_length", "show_time", "billing",
  "show_lineup",
  // Deal
  "guarantee", "deal_type", "backend_percentage", "other_terms",
  "radius_distance", "radius_days_prior", "radius_days_after",
  "production_by", "deposit_pct", "deposit_amount", "deposit_due",
  "balance_due", "merch_split", "merch_seller",
  "comps", "artist_comps", "marketing_comps",
  // Scaling + expenses
  "ticket_scaling", "fixed_expenses", "variable_expenses",
  // Totals
  "total_fixed", "total_variable", "total_expenses",
  "gross_potential", "adj_gross",
  "tax_rate", "tax_amount", "tax_method",
  "net_potential", "splitpoint", "artist_backend", "pot_walkout",
  "offer_valid_days",
  // Meta
  "terms", "notes", "status", "created_by",
]);

// GET: single offer
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("artist_offers")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "PGRST116" ? 404 : 500 }
    );
  }

  return NextResponse.json(data);
}

// PUT: update offer
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const body = (await request.json()) as Record<string, unknown>;

  // Only keep keys that exist on the artist_offers table. This protects
  // against form state containing derived/unknown fields (e.g. client-only
  // cached fees that aren't columns) that would otherwise cause the whole
  // update to fail with a "column not found" error.
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_COLUMNS.has(key)) {
      updates[key] = value;
    }
  }

  const { data, error } = await admin
    .from("artist_offers")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error(`PUT /api/offers/${id} failed:`, error.message, error.code, error.details);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE: delete offer
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { error } = await admin
    .from("artist_offers")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
