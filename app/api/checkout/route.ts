import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { v4 as uuidv4 } from "uuid";
import { pastEventReason } from "@/lib/events/closeout";
import { resolveVenueFees, validatePresaleCode, eventRequiresSeating } from "@/lib/checkout-helpers";
import { OPERATOR_DOMAIN_MAP } from "@/lib/operators";

// Stripe charges 2.7% + $0.30 per transaction
const STRIPE_PERCENT_FEE = 0.027;
const STRIPE_FLAT_FEE_CENTS = 30;

export async function POST(request: Request) {
  try {
    const purchaseOrigin = request.headers.get("origin") || request.headers.get("referer") || "";
    const purchaseOriginHost = purchaseOrigin.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
    const purchaseOperatorSlug = OPERATOR_DOMAIN_MAP[purchaseOriginHost] ?? "venuecore";

    const body = await request.json();
    const { event_id, quantity = 1, buyer_name, buyer_email, buyer_phone, buyer_zip, fwb_opt_in, promo_code, presale_code, seat_ids, session_id: buyerSessionId, tracking_ref, utm_source, utm_medium, utm_campaign } = body;

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
      .select("id,title,venue,date,price,venue_id,event_venue_id,facility_fee_enabled,on_sale_at,closed_out_at,tax_method,start_time,fees_included_in_price")
      .eq("id", event_id)
      .single();
    if (eventError && /closed_out_at|tax_method|fees_included_in_price|column .* does not exist/i.test(eventError.message)) {
      const retry = await admin
        .from("events")
        .select("id,title,venue,date,price,venue_id,event_venue_id,facility_fee_enabled,on_sale_at")
        .eq("id", event_id)
        .single();
      event = retry.data ? { ...retry.data, closed_out_at: null, tax_method: null, start_time: null, fees_included_in_price: false } : null;
      eventError = retry.error;
    }

    if (eventError || !event) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    // Guard: reject if tickets are not yet on sale, unless a valid presale code was supplied
    if (event.on_sale_at && new Date(event.on_sale_at) > new Date()) {
      const presaleOk = presale_code ? await validatePresaleCode(admin, event_id, presale_code) : false;
      if (!presaleOk) {
        return NextResponse.json(
          { error: "Tickets are not yet on sale" },
          { status: 403 }
        );
      }
    }

    // Guard: reject if the show has already happened or has been closed out.
    const closeoutReason = pastEventReason({
      date: event.date,
      closed_out_at: (event as { closed_out_at?: string | null }).closed_out_at ?? null,
      start_time: (event as { start_time?: string | null }).start_time ?? null,
    });
    if (closeoutReason) {
      return NextResponse.json({ error: closeoutReason }, { status: 410 });
    }

    // Guard: reserved-seating events require a seat selection (authoritative
    // server-side backstop — see create-intent for rationale).
    if (!(Array.isArray(seat_ids) && seat_ids.length > 0)) {
      if (await eventRequiresSeating(admin, event_id)) {
        return NextResponse.json(
          { error: "Please select your seat(s) from the map before checking out." },
          { status: 400 }
        );
      }
    }

    // Fetch venue-specific fees via shared helper (event_venues → venues → defaults)
    const fees = await resolveVenueFees(admin, event);
    const { ticketingFee, facilityFee, venueRebate, taxRate, taxMethod, feesIncludedInPrice } = fees;

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
    // Resolve a hold-session id that's guaranteed non-empty even if the client
    // didn't send one (e.g. sessionStorage cleared, a resumed checkout tab, a
    // cart-recovery link opened fresh) — the seats table and Stripe metadata
    // must always agree on the same id, or the webhook can never find the
    // seats it just held and the order ships with none assigned.
    const holdSessionId = buyerSessionId || uuidv4();

    let reservedSeatIds: string[] = [];
    if (Array.isArray(seat_ids) && seat_ids.length > 0) {
      // Verify seats are still available or held by this same session (already reserved on the seating page)
      const { data: seatCheck } = await admin
        .from("seats")
        .select("id, status, held_session")
        .in("id", seat_ids);

      const unavailable = (seatCheck || []).filter((s: { status: string; held_session?: string | null }) =>
        s.status !== "available" && s.held_session !== holdSessionId
      );
      if (unavailable.length > 0) {
        return NextResponse.json(
          { error: "Some seats are no longer available. Please re-select.", unavailable: unavailable.map((s: { id: string }) => s.id) },
          { status: 409 }
        );
      }

      // Release stale holds from this session's earlier attempts — but only
      // ones NOT part of the current request — before re-holding, so the
      // webhook can't sweep in extra seats (over-allocation). Scoping this to
      // seats outside the current seat_ids (rather than wiping everything
      // under the session unconditionally) means a retry or duplicate
      // submission for the SAME seats can never release seats that a
      // still-in-flight Stripe charge for those same seats depends on right
      // before its webhook finalizes them.
      const { data: sessionHeld } = await admin
        .from("seats")
        .select("id")
        .eq("held_session", holdSessionId)
        .eq("status", "held");
      const requested = new Set(seat_ids);
      const staleIds = (sessionHeld || [])
        .map((s: { id: string }) => s.id)
        .filter((id: string) => !requested.has(id));
      if (staleIds.length > 0) {
        await admin.from("seats")
          .update({ status: "available", held_until: null, held_session: null })
          .in("id", staleIds);
      }

      // Temporarily hold seats (4 min) so no one else grabs them during checkout
      const heldUntil = new Date(Date.now() + 4 * 60 * 1000).toISOString();
      await admin.from("seats").update({
        status: "held",
        held_until: heldUntil,
        held_session: holdSessionId,
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
    // One billing unit per table (sells_as_table) or per seat (regular assigned seating)
    let billingUnits: Array<{ sectionName: string; priceCents: number; labels: string[] }> = [];

    if (isAssignedSeating) {
      // Look up seat details + section prices from the new seating tables
      const { data: seatDetails } = await admin
        .from("seats")
        .select("id, row_label, seat_number, section_id, object_id")
        .in("id", reservedSeatIds);

      const sectionIds = [...new Set((seatDetails || []).map((s: { section_id: string }) => s.section_id))];
      const { data: sectionDetails } = sectionIds.length
        ? await admin.from("sections").select("id, name, price_cents, sells_as_table, type").in("id", sectionIds)
        : { data: [] };

      const sectionMap = new Map<string, { name: string; price_cents: number; sells_as_table: boolean }>();
      for (const sec of sectionDetails || []) {
        // Treat as a table unit if sells_as_table is true OR if the section type is "table"
        const isTable = !!sec.sells_as_table || sec.type === "table";
        sectionMap.set(sec.id, { name: sec.name, price_cents: sec.price_cents, sells_as_table: isTable });
      }

      // For sells_as_table sections, price_cents is the price for the whole table — not per seat.
      // Track each table object (object_id) as one billing unit so we charge the table price once.
      const seenTableObjects = new Set<string>();
      const tableObjectUnitIdx = new Map<string, number>();

      for (const seat of seatDetails || []) {
        const sec = sectionMap.get(seat.section_id);
        const priceCents = sec?.price_cents ?? Math.round(event.price * 100);
        const secName = sec?.name ?? "Section";
        const label = `${secName} | ${seat.row_label} | Seat ${seat.seat_number}`;
        seatLabels.push(label);
        seatSectionNames.push(secName);

        if (sec?.sells_as_table && seat.object_id) {
          if (!seenTableObjects.has(seat.object_id)) {
            seenTableObjects.add(seat.object_id);
            tableObjectUnitIdx.set(seat.object_id, billingUnits.length);
            billingUnits.push({ sectionName: secName, priceCents, labels: [label] });
          } else {
            // Additional seat in the same table — attach label to the existing unit
            billingUnits[tableObjectUnitIdx.get(seat.object_id)!].labels.push(label);
          }
        } else {
          billingUnits.push({ sectionName: secName, priceCents, labels: [label] });
        }
      }

      const seatTotalCents = billingUnits.reduce((s, u) => s + u.priceCents, 0);
      effectiveQuantity = billingUnits.length;
      ticketPriceCents = effectiveQuantity > 0 ? Math.round(seatTotalCents / effectiveQuantity) : 0;

      // Safety guard: billing unit count must never exceed seat count.
      // If somehow more units were created than seats passed in, something is wrong — abort.
      if (effectiveQuantity > reservedSeatIds.length) {
        console.error(`PRICING GUARD: effectiveQuantity ${effectiveQuantity} > seat count ${reservedSeatIds.length}`);
        return NextResponse.json({ error: "Pricing calculation error. Please try again." }, { status: 500 });
      }
    } else {
      ticketPriceCents = Math.round(event.price * 100);
    }

    const discountedTicketPriceCents = Math.max(0, ticketPriceCents - discountCentsPerTicket);
    const ticketingFeeCents = Math.round(ticketingFee * 100);
    const facilityFeeCents = Math.round(facilityFee * 100);

    // Divisor = tax baked into face price; don't add it again at checkout.
    const effectiveTaxRate = taxMethod === "divisor" ? 0 : taxRate;
    const taxCents = Math.round(discountedTicketPriceCents * effectiveTaxRate);

    // Calculate Stripe processing fee on the total. Skip re-adding fees
    // already baked into the ticket price.
    const subtotalBeforeStripeFee = feesIncludedInPrice
      ? (discountedTicketPriceCents + taxCents) * effectiveQuantity
      : (discountedTicketPriceCents + ticketingFeeCents + facilityFeeCents + taxCents) * effectiveQuantity;
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
      // Group billing units by section name + unit price for Stripe line items.
      // Each billing unit is one table (sells_as_table) or one individual seat.
      const lineItemGroups = new Map<string, { name: string; count: number; priceCents: number; labels: string[] }>();
      for (const unit of billingUnits) {
        const discountedUnitPrice = Math.max(0, unit.priceCents - discountCentsPerTicket);
        const key = `${unit.sectionName}:${discountedUnitPrice}`;
        const existing = lineItemGroups.get(key);
        if (existing) {
          existing.count++;
          existing.labels.push(...unit.labels);
        } else {
          lineItemGroups.set(key, { name: unit.sectionName, count: 1, priceCents: discountedUnitPrice, labels: [...unit.labels] });
        }
      }

      for (const [, group] of lineItemGroups) {
        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: {
              name: `${event.title} — ${group.name}`,
              description: group.labels.join(", "),
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

    // When fees are baked into the ticket price, don't charge them again as
    // separate line items — they're already inside the ticket's unit_amount above.
    if (!feesIncludedInPrice && ticketingFeeCents > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: { name: "Ticketing Fee" },
          unit_amount: ticketingFeeCents,
        },
        quantity: effectiveQuantity,
      });
    }

    if (!feesIncludedInPrice && facilityFeeCents > 0) {
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

    // When fees are baked into the ticket price, the venue absorbs the card
    // processing fee too — don't charge it as a separate line item.
    if (!feesIncludedInPrice && stripeFeeCents > 0) {
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
        fees_included_in_price: feesIncludedInPrice ? "true" : "false",
        buyer_name: buyer_name || "",
        buyer_phone: buyer_phone || "",
        buyer_zip: buyer_zip || "",
        fwb_opt_in: fwb_opt_in ? "true" : "false",
        source: "online",
        promo_code: promoCodeStr,
        promo_code_id: promoCodeId,
        // seat_hold_session replaces seat_ids in metadata — avoids Stripe's 500-char
        // per-value limit which breaks when purchasing 2+ tables (16+ seat UUIDs).
        // The webhook looks up held seats by this session ID instead. Always the
        // resolved holdSessionId (never the raw, possibly-missing client
        // buyerSessionId) so this can never go blank while seats are held.
        seat_hold_session: isAssignedSeating ? holdSessionId : "",
        is_assigned_seating: isAssignedSeating ? "true" : "false",
        tracking_ref: tracking_ref || "",
        utm_source: utm_source || "",
        utm_medium: utm_medium || "",
        utm_campaign: utm_campaign || "",
        operator_slug: purchaseOperatorSlug,
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
