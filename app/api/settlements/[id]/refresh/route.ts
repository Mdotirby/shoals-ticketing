import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { computeEventAudit } from "@/lib/settlement/audit";
import { settlementWaterfall } from "@/lib/settlement/model";

// Legacy auto-expense names from earlier iterations. These are now deleted on
// refresh because CC fees flow through the Gross→Net walk, not as an expense.
const LEGACY_CC_FEE_NAMES = [
  "CC Processing Fee (Stripe, auto)",
  "CC Processing Fee (auto)",
];

/**
 * POST /api/settlements/:id/refresh
 *
 * Re-pulls live ticket sales / fees / tax from the event config + orders for
 * the linked event and rewrites the audit + fee totals.
 *
 * Math model — see lib/settlement/model.ts, which owns the definition:
 *   Gross Receipts   (all-in ticket gross: face + service + facility)
 *     − Service Fees   (venue config × billing units)
 *     − Facility Fees  (venue config × billing units)
 *   = Adjusted Gross   (the artist's face value)
 *     − Sales Tax      (divisor only — multiplier tax was charged on top)
 *   = Net Receipts     (artist split base)
 *
 * The card surcharge is NOT part of this walk: the buyer funds it and it goes
 * to Stripe, so it was never in the ticket gross being split. It used to be
 * derived as a residual here, which quietly absorbed every upstream error.
 *
 * Does NOT touch deal terms, expenses, deposits, ancillary, or merch.
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
  if (settlement.source === "external") {
    return NextResponse.json(
      { error: "Manual settlements do not pull from orders — edit the figures directly." },
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
  // One shared waterfall so this can't drift from the settlement page again.
  const { adjGross, taxes, netReceipts } = settlementWaterfall({
    totalGross: audit.total_gross,
    ticketingFees: audit.ticketing_fees,
    facilityFees: audit.facility_fees,
    taxRate,
    taxMethod,
  });

  // 4. Update the settlement row
  const { data: updated, error: updErr } = await admin
    .from("settlements")
    .update({
      ticket_audit: audit.audit,
      total_gross: audit.total_gross,
      ticketing_fees: audit.ticketing_fees,
      facility_fees: audit.facility_fees,
      cc_fees: audit.cc_fees,
      cc_fees_actual: audit.cc_fees_actual,
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

  // 5. Clean up any legacy auto-CC-expense rows from earlier iterations.
  //    CC fees now flow through the Gross→Net walk on the settlement page,
  //    so they shouldn't double-count as an expense line item too.
  await admin
    .from("settlement_expenses")
    .delete()
    .eq("settlement_id", id)
    .in("name", LEGACY_CC_FEE_NAMES);

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
