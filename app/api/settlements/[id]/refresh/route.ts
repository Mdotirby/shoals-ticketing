import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { computeEventAudit } from "@/lib/settlement/audit";

const CC_FEE_NAME = "CC Processing Fee (Stripe, auto)";

/**
 * POST /api/settlements/:id/refresh
 *
 * Re-pulls actual ticket sales / fees / tax from the event config + orders for
 * the settlement's linked event and rewrites:
 *   • ticket_audit (per-tier sold/comps/gross/per-ticket fees)
 *   • total_gross, ticketing_fees, facility_fees, taxes, cc_fees
 *   • tickets_sold_count, comp_count, comp_face_value
 *   • adj_gross + net_receipts (recomputed from new totals)
 *   • Auto-managed "CC Processing Fee (Stripe, auto)" expense row — created
 *     on first refresh, updated on subsequent refreshes. The user can rename
 *     or delete it (it'll come back on the next refresh under the canonical
 *     name unless they want to take ownership of the line item).
 *
 * Does NOT touch:
 *   • Deal terms (guarantee, backend %, deal type, splitpoint, bonus, radius)
 *   • Other expenses (only the CC auto-row)
 *   • Deposits
 *   • Ancillary / merch
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

  // 3. Recompute downstream numbers using the venue tax rate by default; if
  //    the user has saved an override (non-zero), keep it.
  const taxRate =
    settlement.tax_rate && settlement.tax_rate > 0
      ? Number(settlement.tax_rate)
      : audit.tax_rate;
  const taxMethod = settlement.tax_method || audit.tax_method;
  // Tax is recomputed from the live audit (which itself uses the event config).
  const adjGross =
    audit.total_gross - audit.ticketing_fees - audit.facility_fees;
  const taxes = audit.taxes;
  const netReceipts = adjGross - taxes;

  // 4. Update the settlement row
  const { data: updated, error: updErr } = await admin
    .from("settlements")
    .update({
      ticket_audit: audit.audit,
      total_gross: audit.total_gross,
      ticketing_fees: audit.ticketing_fees,
      facility_fees: audit.facility_fees,
      cc_fees: audit.cc_fees,
      taxes,
      tax_rate: taxRate,
      tax_method: taxMethod,
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

  // 5. Auto-manage the "CC Processing Fee (Stripe, auto)" expense row.
  //    Update if it exists, insert if not. Only mess with this exact-named
  //    row — anything the user renames is theirs to keep.
  const { data: existingExp } = await admin
    .from("settlement_expenses")
    .select("id")
    .eq("settlement_id", id)
    .eq("name", CC_FEE_NAME)
    .maybeSingle();

  if (existingExp) {
    await admin
      .from("settlement_expenses")
      .update({
        actual_amount: audit.cc_fees,
        category: "fixed",
        notes: "Auto-populated by Refresh from Orders. Stripe ~2.9% + $0.30/order.",
      })
      .eq("id", existingExp.id);
  } else if (audit.cc_fees > 0) {
    // Find max sort_order so we append at the bottom
    const { data: existing } = await admin
      .from("settlement_expenses")
      .select("sort_order")
      .eq("settlement_id", id)
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextOrder = existing && existing.length > 0 ? (existing[0].sort_order ?? 0) + 1 : 0;
    await admin.from("settlement_expenses").insert({
      settlement_id: id,
      name: CC_FEE_NAME,
      category: "fixed",
      estimated_amount: 0,
      actual_amount: audit.cc_fees,
      rate: 0,
      sort_order: nextOrder,
      notes: "Auto-populated by Refresh from Orders. Stripe ~2.9% + $0.30/order.",
    });
  }

  // Return the same shape as GET so the client can hydrate expenses/deposits.
  const [expensesRes, depositsRes] = await Promise.all([
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

  return NextResponse.json(
    {
      ...updated,
      expenses: expensesRes.data ?? [],
      deposits: depositsRes.data ?? [],
    },
    { status: 200 }
  );
}
