import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { computeEventAudit } from "@/lib/settlement/audit";

/**
 * POST /api/settlements/:id/refresh
 *
 * Re-pulls actual ticket sales / fees / tax from the `orders` table for the
 * settlement's linked event and rewrites:
 *   • ticket_audit (per-tier sold/comps/gross)
 *   • total_gross, ticketing_fees, facility_fees, taxes, cc_fees
 *   • tickets_sold_count, comp_count, comp_face_value
 *   • adj_gross + net_receipts (recomputed from new totals)
 *
 * Does NOT touch:
 *   • Deal terms (guarantee, backend %, deal type, splitpoint, bonus structure,
 *     radius clause)  — those are user-edited values
 *   • Expenses or deposits
 *   • Ancillary revenue
 *   • Tax rate / tax method (preserved unless body.tax_rate / tax_method given)
 *
 * Refuses to run on finalized settlements.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  // 1. Load the settlement
  const { data: settlement, error: loadErr } = await admin
    .from("settlements")
    .select("*")
    .eq("id", id)
    .single();

  if (loadErr || !settlement) {
    return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
  }
  if (settlement.status === "finalized") {
    return NextResponse.json(
      { error: "Cannot refresh a finalized settlement" },
      { status: 400 }
    );
  }

  // 2. Re-run the audit
  const audit = await computeEventAudit(admin, settlement.event_id);

  // 3. Recompute downstream numbers using whatever tax_rate is currently saved
  //    (so user overrides aren't stomped). We DO update tax_rate if the
  //    venue config has changed since creation AND the saved value was 0.
  const taxRate =
    settlement.tax_rate && settlement.tax_rate > 0
      ? Number(settlement.tax_rate)
      : audit.tax_rate;

  const adjGross =
    audit.total_gross - audit.ticketing_fees - audit.facility_fees;
  const netReceipts = adjGross - audit.taxes;

  const { data: updated, error: updErr } = await admin
    .from("settlements")
    .update({
      ticket_audit: audit.audit,
      total_gross: audit.total_gross,
      ticketing_fees: audit.ticketing_fees,
      facility_fees: audit.facility_fees,
      cc_fees: audit.cc_fees,
      taxes: audit.taxes,
      tax_rate: taxRate,
      ticketing_fee_per_ticket: audit.ticketing_fee_per_ticket,
      facility_fee_per_ticket: audit.facility_fee_per_ticket,
      tickets_sold_count: audit.tickets_sold_count,
      comp_count: audit.comp_count,
      comp_face_value: audit.comp_face_value,
      adj_gross: adjGross,
      net_receipts: netReceipts,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json(updated, { status: 200 });
}
