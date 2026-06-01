import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * GET /api/events/[id]/revenue-summary
 *
 * Sums the settlement_ledger for this event to produce a quick revenue
 * breakdown: ticket revenue, service fees, taxes, processing fees, refunds,
 * and net to venue. Refunds reduce all totals automatically since the webhook
 * inserts negative ledger rows on charge.refunded.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from("settlement_ledger")
    .select("gross_amount, ticket_revenue, ticketing_fee, tax_collected, stripe_fee, net_to_venue, type")
    .eq("event_id", eventId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sum = (field: keyof typeof rows[0]) =>
    (rows || []).reduce((acc, row) => acc + (Number(row[field]) || 0), 0);

  const sales = (rows || []).filter((r) => r.type === "sale");
  const refundRows = (rows || []).filter((r) => r.type === "refund");

  const grossRevenue     = sum("gross_amount");      // net of refunds (refund rows are negative)
  const ticketRevenue    = sum("ticket_revenue");    // face value, net of refunds
  const serviceFeesGross = sales.reduce((acc, r) => acc + (Number(r.ticketing_fee) || 0), 0);
  const taxCollected     = sum("tax_collected");
  const processingFees   = sales.reduce((acc, r) => acc + (Number(r.stripe_fee) || 0), 0);
  const netToVenue       = sum("net_to_venue");
  const refundTotal      = refundRows.reduce((acc, r) => acc + Math.abs(Number(r.gross_amount) || 0), 0);

  return NextResponse.json({
    grossRevenue,
    ticketRevenue,
    serviceFeesGross,
    taxCollected,
    processingFees,
    netToVenue,
    refundTotal,
    saleCount: sales.length,
    refundCount: refundRows.length,
  });
}
