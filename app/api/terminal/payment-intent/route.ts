import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase-server";
import { resolveVenueFees } from "@/lib/checkout-helpers";

// Card-present rate: 2.7% + $0.05 (vs online 2.7% + $0.30)
const TERMINAL_PERCENT_FEE = 0.027;
const TERMINAL_FLAT_FEE_CENTS = 5;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      event_id,
      tier_id,
      quantity = 1,
      buyer_name,
      buyer_email,
      buyer_phone,
      buyer_zip,
    } = body;

    if (!event_id || !buyer_name || !buyer_email) {
      return NextResponse.json(
        { error: "event_id, buyer_name, and buyer_email are required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Fetch event
    const { data: event } = await admin
      .from("events")
      .select("id, title, venue, date, price, venue_id, event_venue_id, facility_fee_enabled, tax_method")
      .eq("id", event_id)
      .single();

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Resolve ticket price — use tier if specified
    let ticketPriceDollars = event.price || 0;
    let tierName = "GA";
    if (tier_id) {
      const { data: tier } = await admin
        .from("ticket_tiers")
        .select("price, tier_name")
        .eq("id", tier_id)
        .single();
      if (tier) {
        ticketPriceDollars = tier.price;
        tierName = tier.tier_name;
      }
    }

    // Resolve venue fees (same logic as online checkout)
    const fees = await resolveVenueFees(admin, event);

    // Fee math — card-present uses $0.05 flat fee instead of $0.30
    const ticketPriceCents = Math.round(ticketPriceDollars * 100);
    const ticketingFeeCents = Math.round(fees.ticketingFee * 100);
    const facilityFeeCents = Math.round(fees.facilityFee * 100);
    const effectiveTaxRate = fees.taxMethod === "divisor" ? 0 : fees.taxRate;
    const taxCents = Math.round(ticketPriceCents * effectiveTaxRate);
    const subtotalBeforeStripe =
      (ticketPriceCents + ticketingFeeCents + facilityFeeCents + taxCents) * quantity;
    const stripeFeeCents = Math.round(
      subtotalBeforeStripe * TERMINAL_PERCENT_FEE + TERMINAL_FLAT_FEE_CENTS
    );
    const totalCents = subtotalBeforeStripe + stripeFeeCents;

    const stripe = getStripe();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "usd",
      payment_method_types: ["card_present"],
      capture_method: "automatic",
      metadata: {
        event_id: event.id,
        event_title: event.title,
        venue_id: event.venue_id || "",
        quantity: String(quantity),
        tier_id: tier_id || "",
        tier_name: tierName,
        buyer_name: buyer_name || "",
        buyer_email: buyer_email || "",
        buyer_phone: buyer_phone || "",
        buyer_zip: buyer_zip || "",
        ticketing_fee: String(fees.ticketingFee),
        facility_fee: String(fees.facilityFee),
        venue_rebate: String(fees.venueRebate),
        tax_rate: String(fees.taxRate),
        tax_method: fees.taxMethod,
        source: "terminal",
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      totalCents,
      breakdown: {
        ticketPriceCents,
        ticketingFeeCents,
        facilityFeeCents,
        taxCents,
        stripeFeeCents,
        totalCents,
        quantity,
      },
    });
  } catch (err) {
    console.error("[terminal/payment-intent]", err);
    return NextResponse.json({ error: "Failed to create payment intent" }, { status: 500 });
  }
}
