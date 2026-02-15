import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import Stripe from "stripe";
import { v4 as uuidv4 } from "uuid";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require("qrcode");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const admin = createAdminClient();

    const eventId = session.metadata?.event_id;
    const quantity = parseInt(session.metadata?.quantity || "1");
    const customerEmail = session.customer_details?.email || session.customer_email || "";
    const customerName = session.customer_details?.name || "";

    if (!eventId) {
      console.error("No event_id in session metadata");
      return NextResponse.json({ received: true });
    }

    try {
      // 1. Create order record
      const { data: order, error: orderError } = await admin
        .from("orders")
        .insert({
          event_id: eventId,
          customer_name: customerName,
          customer_email: customerEmail,
          quantity,
          total_amount: (session.amount_total || 0) / 100,
          stripe_checkout_session_id: session.id,
          status: "completed",
        })
        .select()
        .single();

      if (orderError) {
        console.error("Failed to create order:", orderError.message);
        return NextResponse.json({ received: true, error: orderError.message });
      }

      // 2. Create ticket records with unique QR codes
      const tickets = [];
      for (let i = 0; i < quantity; i++) {
        const qrCode = uuidv4();
        const qrDataUrl = await QRCode.toDataURL(
          `https://venuecore.live/tickets/${qrCode}`,
          { width: 300, margin: 2 }
        );

        tickets.push({
          order_id: order.id,
          event_id: eventId,
          customer_name: customerName,
          customer_email: customerEmail,
          qr_code: qrCode,
          qr_data_url: qrDataUrl,
          is_scanned: false,
        });
      }

      const { error: ticketError } = await admin
        .from("tickets")
        .insert(tickets);

      if (ticketError) {
        console.error("Failed to create tickets:", ticketError.message);
      }

      console.log(`✅ Order ${order.id} created with ${quantity} tickets for event ${eventId}`);
    } catch (err) {
      console.error("Webhook processing error:", err);
    }
  }

  return NextResponse.json({ received: true });
}
