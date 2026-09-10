import { createAdminClient } from "@/lib/supabase-server";
import { resolveVenueFees } from "@/lib/checkout-helpers";
import { computeLedgerAmounts } from "@/lib/settlement/ledger";
import { requireCapability } from "@/lib/auth/can";
import { writeAudit } from "@/lib/auth/audit";
import { NextResponse } from "next/server";

/**
 * POST /api/events/[id]/revenue-summary/backfill
 *
 * Writes settlement_ledger sale rows for paid orders that have none.
 *
 * ── WHAT THIS USED TO DO, AND WHY IT CHANGED ────────────────────────────────
 * The previous version's docstring said "only inserts rows for orders with no
 * ledger entry". It did not. It ran
 *
 *     DELETE FROM settlement_ledger WHERE event_id = $1 AND type = 'sale'
 *
 * and rebuilt every row from scratch. Three things were wrong with that on
 * live data:
 *
 *   1. It destroyed stripe_fee_actual, stripe_net and
 *      stripe_balance_transaction_id — the only independent record of what
 *      Stripe really took — on every correct row, and never recomputed them.
 *   2. It hardcoded the ONLINE card rate for every order, ignoring both
 *      orders.source (it selected the column and never read it) and the
 *      2026-08-14 rate cutover. Replaying a Terminal door sale, or anything
 *      sold before the cutover, restated its face value.
 *   3. Cash sales write their own all-zero ledger rows at the point of sale.
 *      Deleting and rebuilding them as Stripe orders invented a card
 *      surcharge and a ticketing fee that the buyer never paid.
 *
 * So it is additive now. It never deletes. `mode=recalculate` still exists for
 * the original purpose — correcting rows written by older, wronger arithmetic
 * — but does it as an UPDATE that leaves the Stripe actuals and the
 * originating stripe_event_id alone.
 *
 * Fee math is shared with the Stripe webhook (lib/settlement/ledger.ts) rather
 * than duplicated here, which is how the two drifted apart in the first place.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // This writes financial records. It was previously unauthenticated.
  const guard = await requireCapability("view_settlement", { write: true });
  if (!guard.ok) return guard.response;

  const { id: eventId } = await params;
  const mode = new URL(req.url).searchParams.get("mode") === "recalculate"
    ? "recalculate"
    : "fill";
  const admin = createAdminClient();

  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id, price, venue_id, event_venue_id, facility_fee_enabled, tax_method, fees_included_in_price")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const fees = await resolveVenueFees(admin, event);

  const { data: orders, error: ordersError } = await admin
    .from("orders")
    .select("id, total_amount, quantity, stripe_checkout_session_id, source, created_at")
    .eq("event_id", eventId)
    .eq("status", "paid");

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }
  if (!orders || orders.length === 0) {
    return NextResponse.json({ filled: 0, recalculated: 0, message: "No paid orders found" });
  }

  // One read for the whole event rather than a query per order. Reversals are
  // kept separate: an order with only a refund row still needs its sale row.
  const { data: ledgerRows } = await admin
    .from("settlement_ledger")
    .select("id, order_id, type")
    .eq("event_id", eventId);

  const saleRowByOrder = new Map<string, string>();
  for (const r of ledgerRows ?? []) {
    if (!r.order_id) continue;
    if (r.type === "refund" || r.type === "dispute") continue;
    if (!saleRowByOrder.has(r.order_id)) saleRowByOrder.set(r.order_id, r.id);
  }

  type OrderRow = {
    id: string;
    total_amount: number;
    quantity: number;
    stripe_checkout_session_id: string | null;
    source: string | null;
    created_at: string;
  };

  const amountsFor = (order: OrderRow) =>
    computeLedgerAmounts({
      totalAmount: Number(order.total_amount) || 0,
      quantity: Number(order.quantity) || 1,
      ticketingFee: fees.ticketingFee,
      facilityFee: fees.facilityFee,
      venueRebate: fees.venueRebate,
      taxRate: fees.taxRate,
      taxMethod: fees.taxMethod,
      feesIncludedInPrice: fees.feesIncludedInPrice,
      source: order.source ?? "online",
      // The rate in force WHEN THE CARD WAS CHARGED, not now. Without this a
      // pre-cutover order is unwound at 2.9% though it was surcharged at 2.7%.
      at: new Date(order.created_at),
    });

  const missing = (orders as OrderRow[]).filter((o) => !saleRowByOrder.has(o.id));

  const rows = missing.map((order) => {
    const a = amountsFor(order);
    return {
      order_id: order.id,
      event_id: eventId,
      venue_id: event.venue_id || null,
      stripe_session_id: order.stripe_checkout_session_id || null,
      gross_amount: Number(order.total_amount) || 0,
      ticket_revenue: a.ticketRevenue,
      ticketing_fee: a.totalTicketingFee,
      facility_fee: a.totalFacilityFee,
      venue_rebate: a.totalVenueRebate,
      tax_collected: a.taxCollected,
      stripe_fee: a.surchargeCollected,
      net_to_venue: a.netToVenue,
      net_to_platform: a.netToPlatform,
      type: "sale",
    };
  });

  if (rows.length > 0) {
    const { error: insertError } = await admin.from("settlement_ledger").insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  // Restate rows that already exist, without touching what Stripe told us.
  let recalculated = 0;
  if (mode === "recalculate") {
    for (const order of orders as OrderRow[]) {
      const rowId = saleRowByOrder.get(order.id);
      if (!rowId) continue;
      const a = amountsFor(order);
      const { error } = await admin
        .from("settlement_ledger")
        .update({
          gross_amount: Number(order.total_amount) || 0,
          ticket_revenue: a.ticketRevenue,
          ticketing_fee: a.totalTicketingFee,
          facility_fee: a.totalFacilityFee,
          venue_rebate: a.totalVenueRebate,
          tax_collected: a.taxCollected,
          stripe_fee: a.surchargeCollected,
          net_to_venue: a.netToVenue,
          net_to_platform: a.netToPlatform,
        })
        .eq("id", rowId);
      if (!error) recalculated += 1;
    }
  }

  const filledGross =
    Math.round(rows.reduce((s, r) => s + r.gross_amount, 0) * 100) / 100;

  await writeAudit(guard.actor, {
    action: "settlement_ledger.backfill",
    targetType: "event",
    targetId: eventId,
    venueId: event.venue_id ?? null,
    detail: { mode, filled: rows.length, recalculated, filled_gross: filledGross },
  });

  return NextResponse.json({
    filled: rows.length,
    filled_gross: filledGross,
    recalculated,
    paid_orders: orders.length,
    message:
      rows.length === 0 && recalculated === 0
        ? "Every paid order already has a ledger row — nothing to do"
        : `Wrote ${rows.length} missing ledger row${rows.length === 1 ? "" : "s"}` +
          ` ($${filledGross.toFixed(2)})` +
          (recalculated ? `, restated ${recalculated} existing row${recalculated === 1 ? "" : "s"}` : ""),
  });
}
