import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import Stripe from "stripe";

// Stripe charges 2.9% + $0.30 per transaction
const STRIPE_PERCENT_FEE = 0.029;
const STRIPE_FLAT_FEE_CENTS = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { event_id, quantity = 1, buyer_name, buyer_email, buyer_phone, fwb_opt_in, promo_code, seat_ids, session_id: buyerSessionId } = body;

    if (!event_id) {
      return NextResponse.json(
        { error: "event_id is required" },
        { status: 400 }
      );
    }

    // Look up event + venue fees from Supabase
    const admin = createAdminClient();
    const { data: event, error: eventError } = await admin
      .from("events")
      .select("id,title,venue,date,price,venue_id,event_venue_id,facility_fee_enabled")
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    // Fetch venue-specific fees — prefer event_venues, fall back to venues
    let ticketingFee = 3.0;
    let facilityFee = 0;
    let venueRebate = 0;
    let taxRate = 0.095;
    let feesResolved = false;

    // 1. Try event_venues first (per physical venue)
    if (event.event_venue_id) {
      const { data: evData } = await admin
        .from("event_venues")
        .select("ticketing_fee, facility_fee, tax_rate")
        .eq("id", event.event_venue_id)
        .single();
      if (evData) {
        if (evData.ticketing_fee != null) { ticketingFee = evData.ticketing_fee; feesResolved = true; }
        if (evData.facility_fee != null && event.facility_fee_enabled !== false) { facilityFee = evData.facility_fee; }
        if (evData.tax_rate != null) { taxRate = evData.tax_rate; feesResolved = true; }
      }
    }

    // 2. Fall back to venues table if event_venues didn't resolve fees
    if (!feesResolved && event.venue_id) {
      const { data: venueData } = await admin
        .from("venues")
        .select("ticketing_fee, facility_fee, venue_rebate, tax_rate")
        .eq("id", event.venue_id)
        .single();

      if (venueData) {
        ticketingFee = venueData.ticketing_fee ?? 3.0;
        facilityFee = venueData.facility_fee ?? 0;
        venueRebate = venueData.venue_rebate ?? 0;
        taxRate = venueData.tax_rate ?? 0.095;
      }
    }

    // 3. If facility_fee_enabled is false, force facilityFee = 0
    if (event.facility_fee_enabled === false) {
      facilityFee = 0;
    }

    // ── Promo code validation ──
    let promoCodeId = "";
    let promoCodeStr = "";
    let discountCentsPerTicket = 0;

    if (promo_code) {
      const { data: promo } = await admin
        .from("promo_codes")
        .select("*")
        .eq("event_id", event_id)
        .eq("code", promo_code.toUpperCase().trim())
        .eq("active", true)
        .single();

      if (promo) {
        // Check expiry
        const notExpired = !promo.expires_at || new Date(promo.expires_at) >= new Date();
        // Check max uses
        const hasUsesLeft = promo.max_uses === null || promo.current_uses < promo.max_uses;

        if (notExpired && hasUsesLeft) {
          promoCodeId = promo.id;
          promoCodeStr = promo.code;

          if (promo.discount_type === "fixed") {
            discountCentsPerTicket = Math.round(parseFloat(promo.discount_value) * 100);
          } else if (promo.discount_type === "percentage") {
            discountCentsPerTicket = Math.round(event.price * 100 * (parseFloat(promo.discount_value) / 100));
          }
        }
      }
    }

    // ── Reserved seating: hold seats if seat_ids provided ──
    let reservedSeatIds: string[] = [];
    if (Array.isArray(seat_ids) && seat_ids.length > 0) {
      // Reserve seats via the seating API
      const reserveRes = await fetch(
        `${request.headers.get("origin") || "https://shoals-ticketing.vercel.app"}/api/seating/events/${event_id}/reserve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seat_ids,
            session_id: buyerSessionId || null,
          }),
        }
      );
      if (!reserveRes.ok) {
        const reserveData = await reserveRes.json();
        return NextResponse.json(
          { error: reserveData.error || "Failed to reserve seats" },
          { status: 409 }
        );
      }
      reservedSeatIds = seat_ids;
    }

    const stripe = getStripe();

    const ticketPriceCents = Math.round(event.price * 100);
    const discountedTicketPriceCents = Math.max(0, ticketPriceCents - discountCentsPerTicket);
    const ticketingFeeCents = Math.round(ticketingFee * 100);
    const facilityFeeCents = Math.round(facilityFee * 100);

    // Calculate tax on discounted ticket price
    const taxCents = Math.round(discountedTicketPriceCents * taxRate);

    // Calculate Stripe processing fee on the total (discounted ticket + ticketing fee + facility fee + tax)
    const subtotalBeforeStripeFee = (discountedTicketPriceCents + ticketingFeeCents + facilityFeeCents + taxCents) * quantity;
    const stripeFeeCents = Math.round(
      subtotalBeforeStripeFee * STRIPE_PERCENT_FEE + STRIPE_FLAT_FEE_CENTS
    );

    const origin =
      request.headers.get("origin") || "https://shoals-ticketing.vercel.app";

    // Build line items
    const lineItems: Array<{
      price_data: {
        currency: string;
        product_data: { name: string; description?: string };
        unit_amount: number;
      };
      quantity: number;
    }> = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${event.title} — General Admission`,
            description: `${event.venue} • ${new Date(event.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
          },
          unit_amount: discountedTicketPriceCents,
        },
        quantity,
      },
    ];

    // Add discount as a visible line item (negative amounts not supported in Stripe line items,
    // so we show the discounted price above and add an informational $0 line if there's a discount)
    if (discountCentsPerTicket > 0 && promoCodeStr) {
      const totalDiscountCents = discountCentsPerTicket * quantity;
      // Stripe doesn't support negative line items in embedded checkout,
      // so we already applied the discount to the ticket price above.
      // Add a $0 informational line item showing what was saved
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: `Promo: ${promoCodeStr} (−$${(totalDiscountCents / 100).toFixed(2)} saved)`,
          },
          unit_amount: 0,
        },
        quantity: 1,
      });
    }

    if (ticketingFeeCents > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: { name: "Ticketing Fee" },
          unit_amount: ticketingFeeCents,
        },
        quantity,
      });
    }

    if (facilityFeeCents > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: { name: "Facility Fee" },
          unit_amount: facilityFeeCents,
        },
        quantity,
      });
    }

    if (taxCents > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: `Sales Tax (${(taxRate * 100).toFixed(1)}%)`,
          },
          unit_amount: taxCents,
        },
        quantity,
      });
    }

    if (stripeFeeCents > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: { name: "Processing Fee" },
          unit_amount: stripeFeeCents,
        },
        quantity: 1, // Flat per-transaction, not per-ticket
      });
    }

    // Create embedded checkout session
    const sessionOptions: Stripe.Checkout.SessionCreateParams = {
      ui_mode: "embedded",
      mode: "payment",
      return_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      line_items: lineItems,
      metadata: {
        event_id: event.id,
        event_title: event.title,
        venue_id: event.venue_id || "",
        quantity: String(quantity),
        ticketing_fee: String(ticketingFee),
        facility_fee: String(facilityFee),
        venue_rebate: String(venueRebate),
        tax_rate: String(taxRate),
        buyer_name: buyer_name || "",
        buyer_phone: buyer_phone || "",
        fwb_opt_in: fwb_opt_in ? "true" : "false",
        source: "online",
        promo_code: promoCodeStr,
        promo_code_id: promoCodeId,
        seat_ids: reservedSeatIds.length > 0 ? JSON.stringify(reservedSeatIds) : "",
      },
    };

    // Pre-fill customer email if provided
    if (buyer_email) {
      sessionOptions.customer_email = buyer_email;
    }

    const session = await stripe.checkout.sessions.create(sessionOptions);

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
