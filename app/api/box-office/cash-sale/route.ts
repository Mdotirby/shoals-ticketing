import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { v4 as uuidv4 } from "uuid";
const QRCode = require("qrcode");

/**
 * POST /api/box-office/cash-sale
 *
 * Records a door cash sale directly — no Stripe, no webhook, no
 * PaymentIntent. Cash carries no fees, no tax, no card surcharge: the whole
 * face value is the money, full stop, and it's logged synchronously the
 * moment the sale happens rather than reconstructed after the fact.
 *
 * Cash tickets are auto-checked-in (is_scanned: true) — the buyer is already
 * standing at the register, there's no email to hunt down and no QR to
 * scan separately. This also means they count toward the drop count
 * (GET /api/events/:id/drop-count, which just counts is_scanned=true)
 * immediately.
 *
 * Only a name is required — no email, no phone. A synthetic placeholder
 * email satisfies the NOT NULL constraint on orders/tickets.customer_email;
 * nothing ever sends to it (this route never calls the ticket-delivery
 * email, unlike the Stripe webhook path).
 *
 * computeEventAudit (lib/settlement/audit.ts) reads these orders the same
 * way it reads online/terminal ones — sourcing face value from the
 * settlement_ledger row written here — but excludes them from stripe_gross
 * and the Stripe-cost estimate/actual logic, since cash never touches
 * Stripe and has nothing to reconcile against.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      event_id,
      tier_id,
      quantity = 1,
      buyer_first_name,
      buyer_last_name,
      operator_slug,
    } = body;

    const qty = Number(quantity);
    const firstName = String(buyer_first_name || "").trim();
    const lastName = String(buyer_last_name || "").trim();

    if (!event_id) {
      return NextResponse.json({ error: "event_id is required" }, { status: 400 });
    }
    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "First and last name are required" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(qty) || qty < 1) {
      return NextResponse.json({ error: "Quantity must be at least 1" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: event } = await admin
      .from("events")
      .select("id, title, price, venue_id")
      .eq("id", event_id)
      .single();
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Resolve face price — same lookup order as terminal: tier if specified,
    // otherwise the event's own price. No fee/tax resolution: cash has none.
    let ticketPrice = Number(event.price) || 0;
    let tierName = "GA";
    if (tier_id) {
      const { data: tier } = await admin
        .from("ticket_tiers")
        .select("price, tier_name")
        .eq("id", tier_id)
        .single();
      if (tier) {
        ticketPrice = Number(tier.price) || 0;
        tierName = tier.tier_name;
      }
    }

    const totalAmount = Math.round(ticketPrice * qty * 100) / 100;
    const customerName = `${firstName} ${lastName}`.trim();
    // Never sent to — this route doesn't call the ticket-delivery email.
    // Only satisfies the NOT NULL constraint on customer_email.
    const customerEmail = `cash+${uuidv4()}@noemail.venuecore.internal`;
    const reference = `cash_${uuidv4()}`;

    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert({
        event_id,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: null,
        quantity: qty,
        total_amount: totalAmount,
        stripe_checkout_session_id: reference,
        stripe_payment_intent_id: null,
        status: "paid",
        source: "cash",
        operator_slug: operator_slug || "venuecore",
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error("Failed to create cash order:", orderError?.message);
      return NextResponse.json({ error: "Failed to record cash sale" }, { status: 500 });
    }

    // Tickets — auto-checked-in, same QR generation as every other path so
    // there's a real scannable ticket if anyone ever needs to look one up,
    // even though door cash buyers never need to present it to get in.
    const now = new Date().toISOString();
    const tickets = [];
    for (let i = 0; i < qty; i++) {
      const qrCode = uuidv4();
      const qrDataUrl = await QRCode.toDataURL(
        `https://venuecore.live/tickets/${qrCode}`,
        { width: 300, margin: 2 }
      );
      tickets.push({
        order_id: order.id,
        event_id,
        ticket_type_id: tier_id || null,
        customer_name: customerName,
        customer_email: customerEmail,
        qr_code: qrCode,
        qr_data_url: qrDataUrl,
        is_scanned: true,
        scanned_at: now,
      });
    }

    const { error: ticketError } = await admin.from("tickets").insert(tickets);
    if (ticketError) {
      console.error("Failed to create cash tickets:", ticketError.message);
      // Order already exists and is the money record — don't fail the sale
      // over ticket rows; the settlement still reconciles off the order +
      // ledger. Non-fatal, but loud.
    }

    // Ledger — the audit's source of truth. Every fee/tax field is a real,
    // written zero (not a gap to estimate around): cash genuinely has none.
    const { error: ledgerError } = await admin.from("settlement_ledger").insert({
      order_id: order.id,
      event_id,
      venue_id: event.venue_id || null,
      stripe_session_id: reference,
      gross_amount: totalAmount,
      ticket_revenue: totalAmount,
      ticketing_fee: 0,
      facility_fee: 0,
      venue_rebate: 0,
      tax_collected: 0,
      stripe_fee: 0,
      stripe_fee_actual: 0,
      stripe_net: totalAmount,
      net_to_venue: totalAmount,
      net_to_platform: 0,
      type: "sale",
    });
    if (ledgerError) {
      console.error(
        `SETTLEMENT LEDGER WRITE FAILED for cash order ${order.id} (event ${event_id}): ${ledgerError.message}`
      );
    }

    return NextResponse.json({
      order_id: order.id,
      customer_name: customerName,
      quantity: qty,
      tier_name: tierName,
      price: ticketPrice,
      total_amount: totalAmount,
    });
  } catch (err) {
    console.error("[box-office/cash-sale]", err);
    return NextResponse.json({ error: "Failed to record cash sale" }, { status: 500 });
  }
}
