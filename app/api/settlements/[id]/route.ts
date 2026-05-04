import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/settlements/:id — single settlement with expenses and deposits
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const [settlementRes, expensesRes, depositsRes] = await Promise.all([
    admin.from("settlements").select("*").eq("id", id).single(),
    admin
      .from("settlement_expenses")
      .select("*")
      .eq("settlement_id", id)
      .order("sort_order", { ascending: true }),
    admin
      .from("settlement_deposits")
      .select("*")
      .eq("settlement_id", id)
      .order("date", { ascending: true }),
  ]);

  if (settlementRes.error) {
    return NextResponse.json(
      { error: settlementRes.error.message },
      { status: settlementRes.error.code === "PGRST116" ? 404 : 500 }
    );
  }

  return NextResponse.json({
    ...settlementRes.data,
    expenses: expensesRes.data ?? [],
    deposits: depositsRes.data ?? [],
  });
}

// Whitelist of writable columns on the settlements table. Any field in the
// PUT payload that's not on this list is silently dropped — keeps us resilient
// to clients sending fields that don't exist yet (e.g. a column added in a
// migration that hasn't been run on this DB).
const WRITABLE_COLUMNS = new Set([
  // Status
  "status",
  "finalized_at",
  "finalized_by",
  // Source
  "source",
  // Manual entry fields (external settlements)
  "manual_gross",
  "manual_tickets_sold",
  "manual_ticket_price",
  "manual_ticketing_fee",
  "manual_facility_fee",
  "manual_tax_rate",
  "manual_tax_method",
  "manual_processing_fee",
  // Event snapshot
  "event_title",
  "event_date",
  // Deal terms
  "artist_name",
  "guarantee",
  "deal_type",
  "backend_percentage",
  "bonus_structure",
  "radius_clause",
  // Audit + financials
  "ticket_audit",
  "tickets_sold_count",
  "comp_count",
  "comp_face_value",
  "total_gross",
  "ticketing_fees",
  "facility_fees",
  "cc_fees",
  "ticketing_fee_per_ticket",
  "facility_fee_per_ticket",
  "adj_gross",
  "taxes",
  "tax_rate",
  "tax_method",
  "net_receipts",
  "total_expenses",
  "splitpoint",
  "artist_backend",
  "artist_total",
  "deposit_paid",
  "cash_advance",
  "balance_due",
  // Ancillary
  "bar_revenue",
  "concessions_revenue",
  "merch_commission",
  "ticketing_rebate",
  "parking_revenue",
  "sponsorship_revenue",
  "other_ancillary",
  "venue_total_revenue",
  "venue_net_profit",
  // Merch settlement
  "merch_items",
  "merch_discounts",
  "merch_split_venue_pct",
  "merch_tax_rate",
  "merch_tax_method",
  "merch_tax_payer",
  "merch_seller_fee",
  "merch_seller_fee_payer",
  "merch_total_gross",
  "merch_total_tax",
  "merch_total_net",
  "merch_venue_share",
  "merch_artist_share",
]);

// PUT /api/settlements/:id — update settlement fields.
//
// Resilient: filters the payload against a column whitelist so that:
//   1. Immutable fields (id, created_at, event_id, venue_id) can never be changed
//   2. Unknown fields don't crash the save (graceful degradation if a migration
//      hasn't been run yet on this environment)
//   3. If Supabase still rejects (e.g. column hasn't been added yet), we retry
//      without the columns it complained about.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  // Build an updates object containing only writable columns
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (WRITABLE_COLUMNS.has(k)) updates[k] = v;
  }

  // If finalizing, set finalized_at
  if (updates.status === "finalized" && !updates.finalized_at) {
    updates.finalized_at = new Date().toISOString();
  }

  const tryUpdate = async (payload: Record<string, unknown>) =>
    admin
      .from("settlements")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

  let { data, error } = await tryUpdate(updates);

  // If a column doesn't exist (migration not run), peel it off and retry.
  // Supabase reports this as "Could not find the 'xxx' column of 'settlements'"
  // or "column \"xxx\" of relation \"settlements\" does not exist".
  let attempts = 0;
  while (error && attempts < 12) {
    const message = error.message || "";
    const colMatch =
      /column\s+"?([a-z_]+)"?\s+(?:of relation\s+"?settlements"?\s+)?does not exist/i.exec(message) ||
      /Could not find the\s+'?([a-z_]+)'?\s+column/i.exec(message);
    if (!colMatch) break;
    const badCol = colMatch[1];
    if (!(badCol in updates)) break;
    delete updates[badCol];
    attempts++;
    const res = await tryUpdate(updates);
    data = res.data;
    error = res.error;
  }

  if (error) {
    return NextResponse.json(
      { error: error.message, details: error.details ?? null, hint: error.hint ?? null },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
