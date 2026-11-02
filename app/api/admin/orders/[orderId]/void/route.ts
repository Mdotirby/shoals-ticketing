import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/can";
import { tenantScope, DENY } from "@/lib/auth/tenant";
import { createAdminClient } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/auth/audit";
import { voidBlocker, voidReversal } from "@/lib/orders/voidPolicy";
import { voidTicketsForOrder } from "@/lib/tickets/void";

/**
 * POST /api/admin/orders/[orderId]/void
 *
 * Void a cash sale that never happened — rung up by mistake at the box office.
 * No money moves (there was none). The order is marked voided so settlements
 * and the box office stop counting it, its seats go back on sale, its tickets
 * stop scanning, and the ledger gets a reversal row that nets its cash to
 * zero. Policy: lib/orders/voidPolicy.ts.
 *
 * Body: { note?: string }
 */
export async function POST(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const guard = await requireCapability("invoices_payments", { write: true });
  if (!guard.ok) return guard.response;

  const { orderId } = await params;
  const body = await req.json().catch(() => ({}));
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, status, source, notes, total_amount, quantity, event_id, events(venue_id)")
    .eq("id", orderId)
    .maybeSingle();

  const venueId = ((Array.isArray(order?.events) ? order?.events[0] : order?.events) as { venue_id: string | null } | null)?.venue_id ?? null;
  // The id alone is not a boundary (lib/auth/tenant.ts).
  const scope = tenantScope(guard.actor, venueId);
  if (!order || scope === DENY || (scope !== null && scope !== venueId)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const blocked = voidBlocker(order);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });

  // Status first: if the database won't take it, nothing else has changed.
  const stamp = new Date().toLocaleDateString("en-US");
  const line = `Voided ${stamp}: cash sale never happened${note ? ` (${note})` : ""}. Seats released.`;
  const { data: updated, error: updateError } = await admin
    .from("orders")
    .update({ status: "voided", notes: order.notes ? `${order.notes}\n${line}` : line })
    .eq("id", orderId)
    .eq("status", "paid")
    .select("id");

  if (updateError) {
    const missing = /check constraint|violates/i.test(updateError.message);
    return NextResponse.json(
      {
        error: missing
          ? "The database doesn't allow a voided order yet. Run plans/order-void-migration.sql, then try again."
          : `Couldn't void the order: ${updateError.message}`,
      },
      { status: 500 },
    );
  }
  if (!updated?.length) {
    return NextResponse.json({ error: "This order changed while you were looking at it. Reload and try again." }, { status: 409 });
  }

  const { data: releasedSeats } = await admin
    .from("seats")
    .update({ status: "available", order_id: null, ticket_id: null, held_until: null, held_session: null })
    .eq("order_id", orderId)
    .select("id");

  const voided = await voidTicketsForOrder(admin, orderId, "Cash sale voided");

  // Net the order's cash out of the ledger, which every revenue report reads.
  const { data: rows } = await admin
    .from("settlement_ledger")
    .select("gross_amount, ticket_revenue, net_to_venue")
    .eq("order_id", orderId);
  const reversal = voidReversal(rows ?? []);
  let ledgerError: string | null = null;
  if (reversal) {
    const { error } = await admin.from("settlement_ledger").insert({
      order_id: orderId,
      event_id: order.event_id,
      venue_id: venueId,
      ...reversal,
      ticketing_fee: 0,
      facility_fee: 0,
      venue_rebate: 0,
      tax_collected: 0,
      stripe_fee: 0,
      stripe_fee_actual: 0,
      stripe_net: reversal.gross_amount,
      net_to_platform: 0,
      type: "void",
    });
    if (error) ledgerError = error.message;
  }

  await writeAudit(guard.actor, {
    action: "order.voided",
    targetType: "order",
    targetId: orderId,
    venueId,
    detail: {
      amount: Number(order.total_amount) || 0,
      quantity: Number(order.quantity) || 0,
      event_id: order.event_id,
      note: note || null,
      tickets_voided: voided.voided,
      tickets_voided_after_scan: voided.alreadyScanned,
      ledger_reversed: reversal?.gross_amount ?? 0,
      ledger_error: ledgerError,
    },
  });

  return NextResponse.json({
    success: true,
    amount: Number(order.total_amount) || 0,
    seatsReleased: (releasedSeats || []).length,
    ticketsVoided: voided.voided,
    ticketsVoidedAfterScan: voided.alreadyScanned,
    ticketVoidUnsupported: voided.unsupported,
    ledgerError,
  });
}
