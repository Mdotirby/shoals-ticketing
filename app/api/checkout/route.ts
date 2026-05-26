import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { pastEventReason } from "@/lib/events/closeout";
import { resolveVenueFees } from "@/lib/checkout-helpers";

// Stripe charges 2.7% + $0.30 per transaction
const STRIPE_PERCENT_FEE = 0.027;
const STRIPE_FLAT_FEE_CENTS = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { event_id, quantity = 1, buyer_name, buyer_email, buyer_phone, fwb_opt_in, promo_code, seat_ids, session_id: buyerSessionId, tracking_ref } = body;

    if (!event_id) {
      return NextResponse.json(
        { error: "event_id is required" },
        { status: 400 }
      );
    }

    // Look up event + venue fees from Supabase
    const admin = createAdminClient();
    let { data: event, error: eventError } = await admin
      .from("events")
      .select("id,title,venue,date,price,venue_id,event_venue_id,facility_fee_enabled,on_sale_at,closed_out_at")
      .eq("id", event_id)
      .single();
    if (eventError && /closed_out_at|column .* does not exist/i.test(eventError.message)) {
      const retry = await admin
        .from("events")
        .select("id,title,venue,date,price,venue_id,event_venue_id,facility_fee_enabled,on_sale_at")
        .eq("id", event_id)
        .single();
      event = retry.data ? { ...retry.data, closed_out_at: null } : null;
      eventError = retry.error;
    }

    if (eventError || !event) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
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

    // Fetch venue-specific fees via shared helper (event_venues → venues → defaults)
    const fees = await resolveVenueFees(admin, event);
    const { ticketingFee, facilityFee, venueRebate, taxRate, taxMethod } = fees;

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

    // ── Reserved seating: pass seat_ids through to Stripe metadata ──
    // Seats are NOT pre-reserved here — they get marked sold by the webhook on payment success.
    // This avoids the double-reserve error.
    let reservedSeatIds: string[] = [];
    if (Array.isArray(seat_ids) && seat_ids.length > 0) {
      // Verify seats are still available
      const { data: seatCheck } = await admin
        .from("seats")
        .select("id, status")
        .in("id", seat_ids);

      const unavailable = (seatCheck || []).filter((s: { status: string }) => s.status !== "available");
      if (unavailable.length > 0) {
        return NextResponse.json(
          { error: "Some seats are no longer available. Please re-select.", unavailable: unavailable.map((s: { id: string }) => s.id) },
          { status: 409 }
        );
      }

      // Temporarily hold seats (10 min) so no one else grabs them during checkout
      const heldUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await admin.from("seats").update({
        status: "held",
        held_until: heldUntil,
        held_session: buyerSessionId || null,
      }).in("id", seat_ids);

      reservedSeatIds = seat_ids;
    }

    const stripe = getStripe();

    // ── Determine pricing: assigned seating uses section prices, GA uses event price ──
    const isAssignedSeating = reservedSeatIds.length > 0;
    let seatLabels: string[] = [];
    let seatSectionNames: string[] = [];
    let ticketPriceCents: number;
    let effectiveQuantity = quantity;

    if (isAssignedSeating) {
      // Look up seat details + section prices from the new seating tables
      const { data: seatDetails } = await admin
        .from("seats")
        .select("id, row_label, seat_number, section_id")
        .in("id", reservedSeatIds);

      const sectionIds = [...new Set((seatDetails || []).map((s: { section_id: string }) => s.section_id))];
      const { data: sectionDetails } = sectionIds.length
        ? await admin.from("sections").select("id, name, price_cents").in("id", sectionIds)
        : { data: [] };

      const sectionMap = new Map<string, { name: string; price_cents: number }>();
      for (const sec of sectionDetails || []) {
        sectionMap.set(sec.id, { name: sec.name, price_cents: sec.price_cents });
      }

      // Calculate total from actual section prices
      let seatTotalCents = 0;
      for (const seat of seatDetails || []) {
        const sec = sectionMap.get(seat.section_id);
        const priceCents = sec?.price_cents || Math.round(event.price * 100);
        seatTotalCents += priceCents;
        const label = `${sec?.name || "Section"} | ${seat.row_label} | Seat ${seat.seat_number}`;
        seatLabels.push(label);
        seatSectionNames.push(sec?.name || "Section");
      }

      // For assigned seating, use average per-seat price for fee calculation
      effectiveQuantity = reservedSeatIds.length;
      ticketPriceCents = Math.round(seatTotalCents / effectiveQuantity);
    } else {
      ticketPriceCents = Math.round(event.price * 100);
    }

    const discountedTicketPriceCents = Math.max(0, ticketPriceCents - discountCentsPerTicket);
    const ticketingFeeCents = Math.round(ticketingFee * 100);
    const facilityFeeCents = Math.round(facilityFee * 100);

    // Divisor = tax baked into face price; don't add it again at checkout.
    const effectiveTaxRate = taxMethod === "divisor" ? 0 : taxRate;
    const taxCents = Math.round(discountedTicketPriceCents * effectiveTaxRate);

    // Calculate Stripe processing fee on the total
    const subtotalBeforeStripeFee = (discountedTicketPriceCents + ticketingFeeCents + facilityFeeCents + taxCents) * effectiveQuantity;
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
    }> = [];

    if (isAssignedSeating) {
      // For assigned seating: show each seat as a line item (or grouped by section)
      const sectionGroups = new Map<string, { name: string; count: number; priceCents: number }>();
      for (let i = 0; i < seatLabels.length; i++) {
        const secName = seatSectionNames[i];
        const existing = sectionGroups.get(secName);
        if (existing) {
          existing.count++;
        } else {
          sectionGroups.set(secName, { name: secName, count: 1, priceCents: discountedTicketPriceCents });
        }
      }

      for (const [, group] of sectionGroups) {
        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: {
              name: `${event.title} — ${group.name}`,
              description: seatLabels.filter((_, i) => seatSectionNames[i] === group.name).join(", "),
            },
            unit_amount: group.priceCents,
          },
          quantity: group.count,
        });
      }
    } else {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: `${event.title} — General Admission`,
            description: `${event.venue} • ${new Date(event.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
          },
          unit_amount: discountedTicketPriceCents,
        },
        quantity: effectiveQuantity,
      });
    }

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
        quantity: effectiveQuantity,
      });
    }

    if (facilityFeeCents > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: { name: "Facility Fee" },
          unit_amount: facilityFeeCents,
        },
        quantity: effectiveQuantity,
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
        quantity: effectiveQuantity,
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
      billing_address_collection: "required",
      return_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      line_items: lineItems,
      metadata: {
        event_id: event.id,
        event_title: event.title,
        venue_id: event.venue_id || "",
        quantity: String(effectiveQuantity),
        ticketing_fee: String(ticketingFee),
        facility_fee: String(facilityFee),
        venue_rebate: String(venueRebate),
        tax_rate: String(taxRate),
        tax_method: taxMethod,
        buyer_name: buyer_name || "",
        buyer_phone: buyer_phone || "",
        fwb_opt_in: fwb_opt_in ? "true" : "false",
        source: "online",
        promo_code: promoCodeStr,
        promo_code_id: promoCodeId,
        seat_ids: reservedSeatIds.length > 0 ? JSON.stringify(reservedSeatIds) : "",
        seat_labels: seatLabels.length > 0 ? JSON.stringify(seatLabels) : "",
        seat_sections: seatSectionNames.length > 0 ? JSON.stringify([...new Set(seatSectionNames)]) : "",
        is_assigned_seating: isAssignedSeating ? "true" : "false",
        tracking_ref: tracking_ref || "",
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
