import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import {
  resolveVenueFees,
  validatePromoCode,
  validateAndHoldSeats,
  calculateFees,
} from "@/lib/checkout-helpers";
import { pastEventReason } from "@/lib/events/closeout";

/**
 * POST /api/checkout/create-intent
 *
 * Creates a Stripe PaymentIntent for inline (Elements) checkout on landing pages.
 * Uses the SAME fee calculation logic as the Checkout Session route.
 *
 * Request body:
 *   { eventId, tierId?, quantity, buyerName, buyerEmail, buyerPhone, promoCode?, selectedSeats?, sessionId? }
 *
 * Response:
 *   { clientSecret, paymentIntentId, orderDetails: { subtotal, ticketingFee, facilityFee, tax, processingFee, discount, total } }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      eventId,
      tierId,
      quantity = 1,
      buyerName,
      buyerEmail,
      buyerPhone,
      buyerZip,
      fwbOptIn,
      promoCode,
      selectedSeats,
      sessionId,
      trackingRef,
    } = body;

    // ── Validate required fields ──────────────────────────────────────────
    if (!eventId) {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }
    if (!buyerName || !buyerEmail) {
      return NextResponse.json(
        { error: "buyerName and buyerEmail are required" },
        { status: 400 }
      );
    }
    if (quantity < 1 || quantity > 20) {
      return NextResponse.json(
        { error: "quantity must be between 1 and 20" },
        { status: 400 }
      );
    }

    // ── Fetch event from Supabase ─────────────────────────────────────────
    const admin = createAdminClient();
    // Try with closed_out_at (closeout migration); fall back without it.
    let { data: event, error: eventError } = await admin
      .from("events")
      .select("id, title, venue, date, price, venue_id, event_venue_id, facility_fee_enabled, on_sale_at, closed_out_at, tax_method")
      .eq("id", eventId)
      .single();
    if (eventError && /closed_out_at|tax_method|column .* does not exist/i.test(eventError.message)) {
      const retry = await admin
        .from("events")
        .select("id, title, venue, date, price, venue_id, event_venue_id, facility_fee_enabled, on_sale_at")
        .eq("id", eventId)
        .single();
      event = retry.data ? { ...retry.data, closed_out_at: null, tax_method: null } : null;
      eventError = retry.error;
    }

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Guard: reject if tickets are not yet on sale
    if (event.on_sale_at && new Date(event.on_sale_at) > new Date()) {
      return NextResponse.json(
        { error: "Tickets are not yet on sale" },
        { status: 403 }
      );
    }

    // Guard: reject if the show has already happened or has been closed out.
    const closeoutReason = pastEventReason({
      date: event.date,
      closed_out_at: (event as { closed_out_at?: string | null }).closed_out_at ?? null,
    });
    if (closeoutReason) {
      return NextResponse.json({ error: closeoutReason }, { status: 410 });
    }

    // ── Resolve ticket price (tier or event-level) ────────────────────────
    let ticketPriceDollars = event.price;
    let tierName = "General Admission";

    if (tierId) {
      const { data: tier, error: tierError } = await admin
        .from("ticket_tiers")
        .select("id, tier_name, price, capacity")
        .eq("id", tierId)
        .eq("event_id", eventId)
        .single();

      if (tierError || !tier) {
        return NextResponse.json(
          { error: "Ticket tier not found" },
          { status: 404 }
        );
      }

      // Guard: reject if tier is sold out.
      // Count rows in tickets (one row per physical ticket) rather than orders,
      // because orders.tier_id is not persisted — ticket_type_id is the authoritative field.
      if (tier.capacity > 0) {
        const { count: soldCount } = await admin
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId)
          .eq("ticket_type_id", tierId);
        if ((soldCount ?? 0) + quantity > tier.capacity) {
          return NextResponse.json(
            { error: "This ticket type is sold out" },
            { status: 409 }
          );
        }
      }

      ticketPriceDollars = tier.price;
      tierName = tier.tier_name;
    }

    // ── Resolve venue fees ────────────────────────────────────────────────
    const fees = await resolveVenueFees(admin, event);

    // ── Validate promo code ───────────────────────────────────────────────
    let promoResult: { promoCodeId: string; promoCodeStr: string; discountCentsPerTicket: number } | null = null;
    if (promoCode) {
      promoResult = await validatePromoCode(admin, eventId, promoCode, ticketPriceDollars);
      // Don't fail the request if the promo is invalid — just ignore it.
      // The client can show a validation error separately via /api/promo-codes/validate.
    }

    // ── Handle reserved seating ───────────────────────────────────────────
    let reservedSeatIds: string[] = [];
    let seatLabels: string[] = [];
    let seatSectionNames: string[] = [];
    let effectiveQuantity = quantity;
    let ticketPriceCents = Math.round(ticketPriceDollars * 100);

    if (Array.isArray(selectedSeats) && selectedSeats.length > 0) {
      const seatResult = await validateAndHoldSeats(
        admin,
        selectedSeats,
        ticketPriceDollars,
        sessionId
      );

      if (seatResult.error) {
        return NextResponse.json(
          { error: seatResult.error, unavailable: seatResult.unavailable },
          { status: 409 }
        );
      }

      const sr = seatResult.result!;
      reservedSeatIds = sr.reservedSeatIds;
      seatLabels = sr.seatLabels;
      seatSectionNames = sr.seatSectionNames;
      // Use billing unit count: 1 per table (sells_as_table) or 1 per individual seat
      effectiveQuantity = sr.billingUnitCount;
      ticketPriceCents = effectiveQuantity > 0 ? Math.round(sr.seatTotalCents / effectiveQuantity) : 0;

      // Safety guard: billing unit count must never exceed seat count
      if (effectiveQuantity > reservedSeatIds.length) {
        console.error(`PRICING GUARD: effectiveQuantity ${effectiveQuantity} > seat count ${reservedSeatIds.length}`);
        return NextResponse.json({ error: "Pricing calculation error. Please try again." }, { status: 500 });
      }
    }

    // ── Calculate all fees ────────────────────────────────────────────────
    // Divisor = tax baked into face price; don't add it again at checkout.
    const effectiveTaxRate = fees.taxMethod === "divisor" ? 0 : fees.taxRate;
    const breakdown = calculateFees({
      ticketPriceCents,
      discountCentsPerTicket: promoResult?.discountCentsPerTicket ?? 0,
      ticketingFee: fees.ticketingFee,
      facilityFee: fees.facilityFee,
      taxRate: effectiveTaxRate,
      quantity: effectiveQuantity,
    });

    // NOTE: Promo code usage is incremented in the Stripe webhook (processTicketOrder)
    // to avoid double-counting if the payment fails after intent creation.

    // ── Create Stripe PaymentIntent ───────────────────────────────────────
    // Stripe minimum charge is $0.50. Guard before calling to surface a clear error.
    if (breakdown.totalCents < 50) {
      console.error(`create-intent: totalCents ${breakdown.totalCents} is below Stripe minimum. ticketPriceCents=${ticketPriceCents} effectiveQuantity=${effectiveQuantity}`);
      return NextResponse.json(
        { error: "Order total is below the minimum charge amount. Please contact support." },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const isAssignedSeating = reservedSeatIds.length > 0;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: breakdown.totalCents,
      currency: "usd",
      ...(buyerEmail ? { receipt_email: buyerEmail } : {}),
      metadata: {
        event_id: event.id,
        event_title: event.title,
        tier_id: tierId || "",
        tier_name: tierName,
        venue_id: event.venue_id || "",
        quantity: String(effectiveQuantity),
        ticketing_fee: String(fees.ticketingFee),
        facility_fee: String(fees.facilityFee),
        venue_rebate: String(fees.venueRebate),
        tax_rate: String(fees.taxRate),
        tax_method: fees.taxMethod,
        buyer_name: buyerName || "",
        buyer_email: buyerEmail || "",
        buyer_phone: buyerPhone || "",
        buyer_zip: buyerZip || "",
        source: "inline_checkout",
        fwb_opt_in: fwbOptIn ? "true" : "false",
        promo_code: promoResult?.promoCodeStr || "",
        promo_code_id: promoResult?.promoCodeId || "",
        discount_per_ticket_cents: String(promoResult?.discountCentsPerTicket || 0),
        // seat_hold_session replaces seat_ids — avoids Stripe's 500-char metadata limit
        seat_hold_session: (isAssignedSeating && sessionId) ? sessionId : "",
        is_assigned_seating: isAssignedSeating ? "true" : "false",
        tracking_ref: trackingRef || "",
        // Fee breakdown (cents) for webhook/reconciliation
        subtotal_cents: String(breakdown.discountedTicketPriceCents * effectiveQuantity),
        ticketing_fee_cents: String(breakdown.ticketingFeeCents * effectiveQuantity),
        facility_fee_cents: String(breakdown.facilityFeeCents * effectiveQuantity),
        tax_cents: String(breakdown.taxCents * effectiveQuantity),
        processing_fee_cents: String(breakdown.stripeFeeCents),
        total_cents: String(breakdown.totalCents),
      },
    });

    // ── Build order details for the client (dollars) ──────────────────────
    const orderDetails = {
      subtotal: (breakdown.discountedTicketPriceCents * effectiveQuantity) / 100,
      ticketingFee: (breakdown.ticketingFeeCents * effectiveQuantity) / 100,
      facilityFee: (breakdown.facilityFeeCents * effectiveQuantity) / 100,
      tax: (breakdown.taxCents * effectiveQuantity) / 100,
      processingFee: breakdown.stripeFeeCents / 100,
      discount: (breakdown.discountCentsPerTicket * effectiveQuantity) / 100,
      total: breakdown.totalCents / 100,
    };

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      orderDetails,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Create PaymentIntent error:", msg);
    return NextResponse.json(
      { error: `Payment failed: ${msg}` },
      { status: 500 }
    );
  }
}
