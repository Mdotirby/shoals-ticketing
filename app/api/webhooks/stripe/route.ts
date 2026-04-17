// Requires: npm install resend
// Set RESEND_API_KEY in .env.local and Vercel env vars
// Set RESEND_FROM_EMAIL e.g. "tickets@venuecore.live"

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import Stripe from "stripe";
import { v4 as uuidv4 } from "uuid";
import { sendTicketEmail } from "@/lib/email/ticket-email";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require("qrcode");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// ── Shared order-creation function ──────────────────────────────────────────
// Called by both checkout.session.completed and payment_intent.succeeded handlers
async function processTicketOrder({
  admin,
  stripeWebhookEventId,
  eventId,
  quantity,
  customerName,
  customerEmail,
  customerPhone,
  customerZip,
  totalAmount,
  source,
  promoCodeId,
  promoCode,
  seatIdsRaw,
  fwbOptIn,
  trackingRef,
  stripeReferenceId,
  ticketingFee,
  venueRebate,
  taxRate,
  tierId,
}: {
  admin: ReturnType<typeof createAdminClient>;
  stripeWebhookEventId: string;
  eventId: string;
  quantity: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerZip: string | null;
  totalAmount: number;
  source: string;
  promoCodeId: string | null;
  promoCode: string | null;
  seatIdsRaw: string | null;
  fwbOptIn: boolean;
  trackingRef: string | null;
  stripeReferenceId: string;
  ticketingFee: number;
  venueRebate: number;
  taxRate: number;
  tierId: string | null;
}): Promise<void> {
  // Idempotency: skip if order already exists for this stripe reference
  const { data: existing } = await admin
    .from("orders")
    .select("id")
    .eq("stripe_checkout_session_id", stripeReferenceId)
    .maybeSingle();

  if (existing) {
    console.log(`Order already exists for ${stripeReferenceId} — skipping`);
    return;
  }

  try {
    // Fetch event details + venue slug for email
    const { data: eventData } = await admin
      .from("events")
      .select("title, date, venue, venue_id")
      .eq("id", eventId)
      .single();

    let venueSlug = "tickets";
    if (eventData?.venue_id) {
      const { data: venueData } = await admin
        .from("venues")
        .select("slug")
        .eq("id", eventData.venue_id)
        .single();
      if (venueData?.slug) venueSlug = venueData.slug;
    }

    // 1. Create order record
    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert({
        event_id: eventId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone || null,
        quantity,
        total_amount: totalAmount,
        stripe_checkout_session_id: stripeReferenceId,
        status: "paid",
        fwb_opt_in: fwbOptIn,
        source,
        promo_code_id: promoCodeId || null,
        tracking_link_slug: trackingRef || null,
        customer_zip: customerZip,
      })
      .select()
      .single();

    if (orderError) {
      console.error("Failed to create order:", orderError.message);
      return;
    }

    // ── Finalize reserved seats if seat_ids present ──
    if (seatIdsRaw) {
      try {
        const seatIds: string[] = JSON.parse(seatIdsRaw);
        if (Array.isArray(seatIds) && seatIds.length > 0) {
          // Mark seats as sold and link to order (V3: no seat_reservations table)
          await admin
            .from("seats")
            .update({ status: "sold", order_id: order.id })
            .in("id", seatIds);
        }
      } catch (e) {
        console.error("Failed to finalize reserved seats:", e);
      }
    }

    // 2. Resolve ticket tier — use explicit tierId if provided, otherwise look up default
    let ticketTypeId: string | null = tierId;
    if (!ticketTypeId) {
      const { data: defaultTier } = await admin
        .from("ticket_tiers")
        .select("id")
        .eq("event_id", eventId)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      ticketTypeId = defaultTier?.id || null;
    }

    // 3. Create ticket records with unique QR codes
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
        ticket_type_id: ticketTypeId,
        customer_name: customerName,
        customer_email: customerEmail,
        qr_code: qrCode,
        qr_data_url: qrDataUrl,
        is_scanned: false,
      });
    }

    const { data: createdTickets, error: ticketError } = await admin
      .from("tickets")
      .insert(tickets)
      .select();

    if (ticketError) {
      console.error("Failed to create tickets:", ticketError.message, ticketError.details, ticketError.hint);
      return;
    }

    // 4. Write settlement ledger entry
    const ticketRevenue = totalAmount;
    const totalTicketingFee = ticketingFee * quantity;
    const taxCollected = Math.round(ticketRevenue * taxRate * 100) / 100;
    const stripeFee = Math.round((totalAmount * 0.029 + 0.30) * 100) / 100;

    await admin.from("settlement_ledger").insert({
      order_id: order.id,
      event_id: eventId,
      venue_id: eventData?.venue_id || null,
      stripe_session_id: stripeReferenceId,
      stripe_event_id: stripeWebhookEventId,
      gross_amount: totalAmount,
      ticket_revenue: ticketRevenue,
      ticketing_fee: totalTicketingFee,
      venue_rebate: venueRebate,
      tax_collected: taxCollected,
      stripe_fee: stripeFee,
      net_to_venue: ticketRevenue - totalTicketingFee - stripeFee + venueRebate,
      net_to_platform: totalTicketingFee - venueRebate,
      type: "sale",
    });

    // Increment promo code usage if applicable
    if (promoCodeId && promoCode) {
      const { data: currentPromo } = await admin
        .from("promo_codes")
        .select("current_uses")
        .eq("id", promoCodeId)
        .single();
      if (currentPromo) {
        await admin
          .from("promo_codes")
          .update({ current_uses: (currentPromo.current_uses || 0) + 1 })
          .eq("id", promoCodeId);
      }
      console.log(`Promo code ${promoCode} usage incremented`);
    }

    console.log(`Order ${order.id} + ledger entry created for event ${eventId}`);

    // 4b. Record trackable link conversion if tracking_ref is present
    if (trackingRef) {
      try {
        const { data: tLink } = await admin
          .from("trackable_links")
          .select("id, conversions, revenue")
          .eq("slug", trackingRef)
          .eq("event_id", eventId)
          .maybeSingle();

        if (tLink) {
          // Insert conversion event
          await admin.from("trackable_link_events").insert({
            link_id: tLink.id,
            event_type: "conversion",
            order_id: order.id,
            revenue_amount: totalAmount,
          });

          // Atomic increment via RPC, fallback to read-then-write
          const { error: rpcErr } = await admin.rpc("increment_trackable_link_conversion", {
            link_row_id: tLink.id,
            revenue_amt: totalAmount,
          });

          if (rpcErr) {
            await admin.from("trackable_links").update({
              conversions: (tLink.conversions || 0) + 1,
              revenue: Number(tLink.revenue || 0) + totalAmount,
            }).eq("id", tLink.id);
          }

          console.log(`Trackable link conversion recorded for slug "${trackingRef}" on order ${order.id}`);
        } else {
          console.warn(`Trackable link slug "${trackingRef}" not found for event ${eventId}`);
        }
      } catch (tErr) {
        console.error("Failed to record trackable link conversion:", tErr);
      }
    }

    // 5. Upsert customer profile (for LFV tracking)
    if (customerEmail) {
      const email = customerEmail.toLowerCase();
      const nameParts = customerName.split(" ");
      const { data: existingProfile } = await admin
        .from("customer_profiles")
        .select("id, total_orders, total_spend, first_order_at, events_attended")
        .eq("email", email)
        .maybeSingle();

      if (existingProfile) {
        const newOrderCount = (existingProfile.total_orders || 0) + 1;
        const newSpend = (parseFloat(existingProfile.total_spend) || 0) + totalAmount;
        const newEventsAttended = (existingProfile.events_attended || 0) + 1;
        let segment = "one_timer";
        if (newEventsAttended >= 4) segment = "whale";
        else if (newEventsAttended >= 2) segment = "loyalist";
        else if (newOrderCount >= 2) segment = "repeat";

        await admin.from("customer_profiles").update({
          total_orders: newOrderCount,
          total_spend: newSpend,
          last_order_at: new Date().toISOString(),
          events_attended: newEventsAttended,
          lfv_segment: segment,
          updated_at: new Date().toISOString(),
          ...(customerZip ? { zip: customerZip } : {}),
        }).eq("id", existingProfile.id);
      } else {
        await admin.from("customer_profiles").upsert({
          email,
          first_name: nameParts[0] || null,
          last_name: nameParts.slice(1).join(" ") || null,
          total_orders: 1,
          total_spend: totalAmount,
          first_order_at: new Date().toISOString(),
          last_order_at: new Date().toISOString(),
          events_attended: 1,
          lfv_segment: "one_timer",
          ...(customerZip ? { zip: customerZip } : {}),
        }, { onConflict: "email" });
      }
    }

    // 6. Mark any cart abandonment as recovered
    if (customerEmail) {
      await admin.from("cart_abandonment").update({ recovered: true })
        .eq("customer_email", customerEmail.toLowerCase())
        .eq("event_id", eventId)
        .eq("recovered", false);
    }

    // 7. FWB opt-in — subscribe to newsletter
    if (fwbOptIn && customerEmail) {
      const nameParts = customerName.split(" ");
      await admin.from("newsletter_subscribers").upsert({
        email: customerEmail.toLowerCase(),
        first_name: nameParts[0] || null,
        last_name: nameParts.slice(1).join(" ") || null,
        phone: customerPhone || null,
        source: "checkout_fwb",
        is_fwb_subscriber: true,
        venue_id: eventData?.venue_id || null,
      }, { onConflict: "email" });
      console.log(`FWB opt-in for ${customerEmail}`);
    }

    // 8. Look up reserved seat details if applicable
    let seatAssignments: { section: string; row: string; seat: string }[] | undefined;
    if (seatIdsRaw) {
      try {
        const parsedSeatIds: string[] = JSON.parse(seatIdsRaw);
        if (Array.isArray(parsedSeatIds) && parsedSeatIds.length > 0) {
          // Fetch seat details with row and section info
          // V3: seats have section_id + row_label directly
          const { data: seatDetails } = await admin
            .from("seats")
            .select("id, seat_number, row_label, section_id")
            .in("id", parsedSeatIds);

          if (seatDetails && seatDetails.length > 0) {
            const sectionIds = [...new Set(seatDetails.map((s: { section_id: string }) => s.section_id))];
            const { data: sectionData } = await admin
              .from("sections")
              .select("id, name")
              .in("id", sectionIds);

            const sectionMap = new Map((sectionData || []).map((s: { id: string; name: string }) => [s.id, s.name]));

            seatAssignments = seatDetails.map((seat: { section_id: string; row_label: string; seat_number: number }) => ({
              section: sectionMap.get(seat.section_id) || "Section",
              row: seat.row_label,
              seat: String(seat.seat_number),
            }));

            seatAssignments.sort((a, b) =>
              a.section.localeCompare(b.section) ||
              a.row.localeCompare(b.row) ||
              a.seat.localeCompare(b.seat, undefined, { numeric: true })
            );
          }
        }
      } catch (e) {
        console.error("Failed to look up seat assignments for email:", e);
      }
    }

    // 9. Send confirmation email via Resend
    if (customerEmail && createdTickets && createdTickets.length > 0 && eventData) {
      await sendTicketEmail({
        to: customerEmail,
        customerName,
        eventTitle: eventData.title,
        eventDate: eventData.date,
        eventVenue: eventData.venue,
        ticketCount: quantity,
        totalAmount,
        qrDataUrl: createdTickets[0].qr_data_url,
        ticketId: createdTickets[0].qr_code,
        venueSlug,
        seatAssignments,
      });
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
  }
}

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

  const admin = createAdminClient();

  // ── Idempotent event check (log AFTER success so retries work) ──
  const { data: existingEvent } = await admin
    .from("stripe_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();

  if (existingEvent) {
    console.log(`Stripe event ${event.id} already processed — skipping`);
    return NextResponse.json({ received: true });
  }

  // ── checkout.session.completed ──
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    // ── Handle Auction Checkout ──
    if (session.metadata?.type === "auction") {
      const auctionOrderId = session.metadata.auction_order_id;
      if (auctionOrderId) {
        await admin
          .from("auction_orders")
          .update({
            status: "paid",
            stripe_payment_intent_id: session.payment_intent as string,
            stripe_transaction_id: session.id,
          })
          .eq("id", auctionOrderId);
        console.log(`Auction order ${auctionOrderId} marked as paid`);
      }
      return NextResponse.json({ received: true });
    }

    // ── Handle Invoice Payment ──
    if (session.metadata?.type === "invoice") {
      const invoiceId = session.metadata.invoice_id;
      if (invoiceId) {
        const paymentAmount = (session.amount_total || 0) / 100;

        // Create payment record
        await admin
          .from("invoice_payments")
          .insert({
            invoice_id: invoiceId,
            venue_id: session.metadata.venue_id,
            amount: paymentAmount,
            payment_method: "stripe",
            type: "payment",
            stripe_payment_intent_id: session.payment_intent as string,
            stripe_charge_id: session.id,
            notes: `Stripe checkout payment`,
            received_at: new Date().toISOString(),
          });

        // Update invoice totals
        const { data: invoice } = await admin
          .from("invoices")
          .select("total, amount_paid")
          .eq("id", invoiceId)
          .single();

        if (invoice) {
          const newAmountPaid = Number(invoice.amount_paid || 0) + paymentAmount;
          const newBalanceDue = Number(invoice.total) - newAmountPaid;
          const newStatus = newBalanceDue <= 0 ? "paid" : "partial";

          await admin
            .from("invoices")
            .update({
              amount_paid: newAmountPaid,
              balance_due: Math.max(0, newBalanceDue),
              status: newStatus,
              ...(newStatus === "paid" ? { paid_at: new Date().toISOString() } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq("id", invoiceId);

          console.log(`Invoice ${invoiceId} payment of $${paymentAmount} recorded — status: ${newStatus}`);
        }
      }
      return NextResponse.json({ received: true });
    }

    // ── Handle Event Ticket Checkout ──
    const eventId = session.metadata?.event_id;
    const quantity = parseInt(session.metadata?.quantity || "1");
    const customerEmail = session.customer_details?.email || session.customer_email || "";
    const customerName = session.metadata?.buyer_name || session.customer_details?.name || "";
    const customerPhone = session.metadata?.buyer_phone || session.customer_details?.phone || "";
    const customerZip = session.customer_details?.address?.postal_code || null;
    const fwbOptIn = session.metadata?.fwb_opt_in === "true";
    const totalAmount = (session.amount_total || 0) / 100;
    const source = session.metadata?.source || "online";
    const promoCodeId = session.metadata?.promo_code_id || null;
    const promoCode = session.metadata?.promo_code || null;

    if (!eventId) {
      console.error("No event_id in session metadata");
      return NextResponse.json({ received: true });
    }

    await processTicketOrder({
      admin,
      stripeWebhookEventId: event.id,
      eventId,
      quantity,
      customerName,
      customerEmail,
      customerPhone,
      customerZip,
      totalAmount,
      source,
      promoCodeId,
      promoCode,
      seatIdsRaw: session.metadata?.seat_ids || null,
      fwbOptIn,
      trackingRef: session.metadata?.tracking_ref || null,
      stripeReferenceId: session.id,
      ticketingFee: parseFloat(session.metadata?.ticketing_fee || "3"),
      venueRebate: parseFloat(session.metadata?.venue_rebate || "0"),
      taxRate: parseFloat(session.metadata?.tax_rate || "0.09"),
      tierId: null,
    });
  }

  // ── payment_intent.succeeded (inline checkout via Card Elements) ──
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    // Only process PaymentIntents from inline checkout to avoid
    // interfering with Checkout Session–based flows or other PI sources
    if (paymentIntent.metadata?.source === "inline_checkout") {
      const meta = paymentIntent.metadata;
      const eventId = meta.event_id;

      if (!eventId) {
        console.error("No event_id in PaymentIntent metadata (inline_checkout)");
        return NextResponse.json({ received: true });
      }

      await processTicketOrder({
        admin,
        stripeWebhookEventId: event.id,
        eventId,
        quantity: parseInt(meta.quantity || "1"),
        customerName: meta.buyer_name || "",
        customerEmail: meta.buyer_email || "",
        customerPhone: meta.buyer_phone || "",
        customerZip: meta.buyer_zip || null,
        totalAmount: (paymentIntent.amount || 0) / 100,
        source: "inline_checkout",
        promoCodeId: meta.promo_code_id || null,
        promoCode: meta.promo_code || null,
        seatIdsRaw: meta.seat_ids || null,
        fwbOptIn: false,
        trackingRef: meta.tracking_ref || null,
        stripeReferenceId: paymentIntent.id,
        ticketingFee: parseFloat(meta.ticketing_fee || "3"),
        venueRebate: parseFloat(meta.venue_rebate || "0"),
        taxRate: parseFloat(meta.tax_rate || "0.09"),
        tierId: meta.tier_id || null,
      });
    }
  }

  // ── charge.refunded ──
  if (event.type === "charge.refunded") {
    try {
      const charge = event.data.object as Stripe.Charge;
      const refundAmount = (charge.amount_refunded || 0) / 100;

      // Find original order via payment_intent
      const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
      if (pi) {
        const { data: order } = await admin
          .from("orders")
          .select("id, event_id")
          .eq("stripe_checkout_session_id", pi)
          .maybeSingle();

        if (order) {
          await admin.from("settlement_ledger").insert({
            order_id: order.id,
            event_id: order.event_id,
            stripe_event_id: event.id,
            gross_amount: -refundAmount,
            ticket_revenue: -refundAmount,
            ticketing_fee: 0,
            venue_rebate: 0,
            tax_collected: 0,
            stripe_fee: 0,
            net_to_venue: -refundAmount,
            net_to_platform: 0,
            type: "refund",
          });
          console.log(`Refund $${refundAmount} recorded for order ${order.id}`);
        }
      }
    } catch (err) {
      console.error("Refund processing error:", err);
    }
  }

  // ── charge.dispute.created ──
  if (event.type === "charge.dispute.created") {
    try {
      const dispute = event.data.object as Stripe.Dispute;
      const disputeAmount = (dispute.amount || 0) / 100;

      await admin.from("settlement_ledger").insert({
        stripe_event_id: event.id,
        gross_amount: -disputeAmount,
        ticket_revenue: -disputeAmount,
        ticketing_fee: 0,
        venue_rebate: 0,
        tax_collected: 0,
        stripe_fee: 0,
        net_to_venue: -disputeAmount,
        net_to_platform: 0,
        type: "dispute",
      });
      console.log(`Dispute $${disputeAmount} recorded (${event.id})`);
    } catch (err) {
      console.error("Dispute processing error:", err);
    }
  }

  // ── Log event AFTER successful processing (so failed events can be retried) ──
  await admin.from("stripe_events").insert({
    id: event.id,
    type: event.type,
    payload: JSON.parse(JSON.stringify(event.data.object)),
  });

  return NextResponse.json({ received: true });
}
