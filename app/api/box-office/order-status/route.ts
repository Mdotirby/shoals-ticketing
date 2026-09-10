import { createAdminClient } from "@/lib/supabase-server";
import { requireCapability } from "@/lib/auth/can";
import { NextResponse } from "next/server";

/**
 * GET /api/box-office/order-status?payment_intent=pi_…
 *
 * Did the ticket actually get issued?
 *
 * The reader saying "approved" only means Stripe took the money. The order,
 * the ticket and the ledger row are written by the webhook, seconds later and
 * out of band — and if that webhook fails, nothing on the POS says so. The
 * card is charged, the customer walks in, and the first anyone knows is at
 * settlement. That is exactly how 54 sales ended up with no ledger row (see
 * REBUILD-REPORT.md), and at the door it is worse, because there is a person
 * standing there who could be handed a comp or re-run.
 *
 * So the POS polls this until the ticket exists, and shows the customer's
 * money as landed only when it does.
 */
export async function GET(request: Request) {
  const guard = await requireCapability("door_sales_comps");
  if (!guard.ok) return guard.response;

  const paymentIntent = new URL(request.url).searchParams.get("payment_intent");
  if (!paymentIntent) {
    return NextResponse.json({ error: "payment_intent is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select("id, quantity, total_amount, status")
    .eq("stripe_payment_intent_id", paymentIntent)
    .maybeSingle();

  if (!order) return NextResponse.json({ issued: false, stage: "awaiting_webhook" });

  const [{ count: ticketCount }, { data: ledger }] = await Promise.all([
    admin.from("tickets").select("id", { count: "exact", head: true }).eq("order_id", order.id),
    admin.from("settlement_ledger").select("id").eq("order_id", order.id).limit(1),
  ]);

  return NextResponse.json({
    issued: (ticketCount ?? 0) > 0,
    stage: (ticketCount ?? 0) > 0 ? "issued" : "order_created",
    orderId: order.id,
    tickets: ticketCount ?? 0,
    quantity: order.quantity,
    // Surfaced so a ledger failure is visible AT THE DOOR rather than at
    // settlement. It does not block the sale — the ticket is valid either way.
    ledgerWritten: (ledger ?? []).length > 0,
  });
}
