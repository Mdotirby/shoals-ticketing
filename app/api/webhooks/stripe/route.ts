// Requires: npm install resend
// Set RESEND_API_KEY in .env.local and Vercel env vars
// Set RESEND_FROM_EMAIL e.g. "tickets@venuecore.live"

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import Stripe from "stripe";
import { v4 as uuidv4 } from "uuid";
import { sendTicketEmail } from "@/lib/email/ticket-email";
import { buildSeatAssignments } from "@/lib/seating/buildAssignments";
import { earnBenefits } from "@/lib/fwb/earn";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require("qrcode");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// ── GoTrue admin lookup by email (service-role REST endpoint) ────────────────
async function lookupUserIdByEmail(email: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(`email.eq.${email}`)}`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.users?.[0]?.id as string) ?? null;
  } catch {
    return null;
  }
}

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
  seatHoldSession,
  fwbOptIn,
  trackingRef,
  stripeReferenceId,
  stripePaymentIntentId,
  ticketingFee,
  venueRebate,
  taxRate,
  taxMethod,
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
  seatIdsRaw: string | null;       // legacy: seat UUIDs in metadata (small purchases)
  seatHoldSession: string | null; // new: browser session used to hold the seats
  fwbOptIn: boolean;
  trackingRef: string | null;
  stripeReferenceId: string;
  stripePaymentIntentId?: string | null;
  ticketingFee: number;
  venueRebate: number;
  taxRate: number;
  taxMethod: string;
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
        stripe_payment_intent_id: stripePaymentIntentId || null,
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

    // ── Finalize reserved seats ──────────────────────────────────────────────
    // Primary path: look up by seat_hold_session (no metadata size limit).
    // Fallback: legacy seat_ids field (kept for backward compat with old sessions).
    if (seatHoldSession) {
      try {
        const { data: mapRow } = await admin
          .from("event_layout_maps").select("layout_id")
          .eq("event_id", eventId).eq("enabled", true).single();
        if (mapRow?.layout_id) {
          const { data: secs } = await admin
            .from("sections").select("id").eq("layout_id", mapRow.layout_id);
          const sectionIds = (secs || []).map((s: { id: string }) => s.id);
          if (sectionIds.length) {
            await admin.from("seats")
              .update({ status: "sold", order_id: order.id, held_until: null, held_session: null })
              .eq("held_session", seatHoldSession)
              .eq("status", "held")
              .in("section_id", sectionIds);
          }
        }
      } catch (e) {
        console.error("Failed to finalize seats by session:", e);
      }
    } else if (seatIdsRaw) {
      try {
        const seatIds: string[] = JSON.parse(seatIdsRaw);
        if (Array.isArray(seatIds) && seatIds.length > 0) {
          await admin.from("seats")
            .update({ status: "sold", order_id: order.id })
            .in("id", seatIds);
        }
      } catch (e) {
        console.error("Failed to finalize seats by id list:", e);
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
    // ticket_revenue = face value only (ticket price × qty, before fees/tax/stripe)
    const totalTicketingFee = Math.round(ticketingFee * quantity * 100) / 100;
    const stripeFee = Math.round((totalAmount * 0.027 + 0.30) * 100) / 100;
    const effectiveTaxRate = taxMethod === "divisor" ? 0 : taxRate;
    // Solve for face value: gross = face*(1+taxRate) + ticketingFee + stripeFee
    const ticketRevenue = effectiveTaxRate > 0
      ? Math.round(((totalAmount - totalTicketingFee - stripeFee) / (1 + effectiveTaxRate)) * 100) / 100
      : Math.round((totalAmount - totalTicketingFee - stripeFee) * 100) / 100;
    const taxCollected = Math.round(ticketRevenue * effectiveTaxRate * 100) / 100;

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
      net_to_venue: totalAmount - totalTicketingFee - stripeFee + venueRebate,
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

    // 7. FWB opt-in — subscribe to newsletter + Laylo SMS list
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

      // Subscribe phone to Laylo SMS list if phone provided
      if (customerPhone && process.env.LAYLO_API_KEY) {
        try {
          const digits = customerPhone.replace(/\D/g, "");
          const e164 = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : null;
          if (e164) {
            const layloRes = await fetch("https://laylo.com/api/graphql", {
              method: "POST",
              headers: { "Authorization": `Bearer ${process.env.LAYLO_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ query: `mutation { subscribeToUser(phoneNumber: "${e164}") }` }),
            });
            const layloJson = await layloRes.json();
            if (layloJson.errors) {
              console.error("Laylo FWB subscribe error:", layloJson.errors);
            } else {
              console.log(`Laylo SMS subscribed: ${e164}`);
            }
          }
        } catch (err) {
          console.error("Laylo FWB subscribe error (non-fatal):", err);
        }
      }
    }

    // 8. Look up seat assignments — tables show as "Table X", individual seats show row+number
    let seatAssignments: { section: string; row: string; seat: string }[] | undefined;
    try {
      const assignments = await buildSeatAssignments(admin, order.id);
      if (assignments.length > 0) seatAssignments = assignments;
    } catch (e) {
      console.error("Failed to look up seat assignments for email:", e);
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

    // 10. FWB benefits earn — credit points if buyer opted in and has an account
    if (fwbOptIn && customerEmail && eventData?.venue_id) {
      try {
        const userId = await lookupUserIdByEmail(customerEmail.toLowerCase());
        if (userId) {
          await earnBenefits({
            userId,
            venueId: eventData.venue_id,
            amountSpent: totalAmount,
            eventId,
            orderId: order.id,
            supabase: admin,
          });
          console.log(`FWB benefits earned for user ${userId} on order ${order.id}`);
        }
      } catch (err) {
        console.error("FWB earn error (non-fatal):", err);
      }
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

    // ── Handle Billing Correction Payment ──
    // Fired when a customer pays the correct amount after an overcharge/refund.
    // Updates the existing order — does NOT create new tickets or seat assignments.
    if (session.metadata?.type === "billing_correction") {
      const existingOrderId = session.metadata.order_id;
      if (existingOrderId) {
        const correctedAmount = (session.amount_total || 0) / 100;
        await admin
          .from("orders")
          .update({
            status: "paid",
            total_amount: correctedAmount,
            stripe_checkout_session_id: session.id,
            notes: `Billing correction payment received on ${new Date().toLocaleDateString("en-US")}. Corrected total: $${correctedAmount.toFixed(2)}.`,
          })
          .eq("id", existingOrderId);
        console.log(`Billing correction: order ${existingOrderId} reinstated at $${correctedAmount}`);
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
      seatHoldSession: session.metadata?.seat_hold_session || null,
      fwbOptIn,
      trackingRef: session.metadata?.tracking_ref || null,
      stripeReferenceId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      ticketingFee: parseFloat(session.metadata?.ticketing_fee || "3"),
      venueRebate: parseFloat(session.metadata?.venue_rebate || "0"),
      taxRate: parseFloat(session.metadata?.tax_rate || "0.09"),
      taxMethod: session.metadata?.tax_method || "additive",
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
        source: (meta.source as string) || "inline_checkout",
        promoCodeId: meta.promo_code_id || null,
        promoCode: meta.promo_code || null,
        seatIdsRaw: meta.seat_ids || null,
        seatHoldSession: meta.seat_hold_session || null,
        fwbOptIn: meta.fwb_opt_in === "true",
        taxMethod: meta.tax_method || "additive",
        trackingRef: meta.tracking_ref || null,
        stripeReferenceId: paymentIntent.id,
        stripePaymentIntentId: paymentIntent.id,
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
      const isFullRefund = charge.amount_refunded >= charge.amount;

      // Find original order via payment_intent (stored in stripe_checkout_session_id for PI-based orders)
      const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
      if (pi) {
        // Look up order by payment intent ID — check both columns since:
        // - inline checkout stores pi_xxx in stripe_checkout_session_id
        // - embedded checkout stores pi_xxx in stripe_payment_intent_id
        let { data: order } = await admin
          .from("orders")
          .select("id, event_id")
          .eq("stripe_payment_intent_id", pi)
          .maybeSingle();

        if (!order) {
          const fallback = await admin
            .from("orders")
            .select("id, event_id")
            .eq("stripe_checkout_session_id", pi)
            .maybeSingle();
          order = fallback.data;
        }

        if (order) {
          // Update order status — full refund = refunded, partial = keep paid
          if (isFullRefund) {
            await admin
              .from("orders")
              .update({ status: "refunded" })
              .eq("id", order.id);
          }

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
          console.log(`Refund $${refundAmount} recorded for order ${order.id}${isFullRefund ? " — marked refunded" : ""}`);
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
