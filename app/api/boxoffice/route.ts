import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import Stripe from "stripe";

// Stripe charges 2.7% + $0.30 per transaction
const STRIPE_PERCENT_FEE = 0.027;
const STRIPE_FLAT_FEE_CENTS = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { event_id, quantity = 1, tier_id, buyer_name, buyer_email, buyer_phone } = body;

    if (!event_id) {
      return NextResponse.json({ error: "event_id is required" }, { status: 400 });
    }
    if (!buyer_name || !buyer_email) {
      return NextResponse.json({ error: "buyer_name and buyer_email are required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Look up event + venue fees
    const { data: event, error: eventError } = await admin
      .from("events")
      .select("id,title,venue,date,price,venue_id,event_type")
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Determine ticket price from tier or event default
    let ticketPrice = event.price;
    let tierName = "General Admission";

    if (tier_id) {
      const { data: tier } = await admin
        .from("ticket_tiers")
        .select("id, tier_name, price, capacity")
        .eq("id", tier_id)
        .eq("event_id", event_id)
        .single();

      if (tier) {
        ticketPrice = tier.price;
        tierName = tier.tier_name;
      }
    }

    // Fetch venue-specific fees
    let ticketingFee = 3.0;
    let facilityFee = 0;
    let venueRebate = 0;
    let taxRate = 0.095;

    if (event.venue_id) {
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

    const stripe = getStripe();

    const ticketPriceCents = Math.round(ticketPrice * 100);
    const ticketingFeeCents = Math.round(ticketingFee * 100);
    const facilityFeeCents = Math.round(facilityFee * 100);
    const taxCents = Math.round(ticketPriceCents * taxRate);

    const subtotalBeforeStripeFee = (ticketPriceCents + ticketingFeeCents + facilityFeeCents + taxCents) * quantity;
    const stripeFeeCents = Math.round(
      subtotalBeforeStripeFee * STRIPE_PERCENT_FEE + STRIPE_FLAT_FEE_CENTS
    );

    const origin = request.headers.get("origin") || "https://shoals-ticketing.vercel.app";

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
            name: `${event.title} — ${tierName}`,
            description: `${event.venue} • ${new Date(event.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} • Box Office Sale`,
          },
          unit_amount: ticketPriceCents,
        },
        quantity,
      },
    ];

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
          product_data: { name: `Sales Tax (${(taxRate * 100).toFixed(1)}%)` },
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
        quantity: 1,
      });
    }

    // Create embedded checkout session with box_office source
    const sessionOptions: Stripe.Checkout.SessionCreateParams = {
      ui_mode: "embedded",
      mode: "payment",
      billing_address_collection: "required",
      return_url: `${origin}/boxoffice/success?session_id={CHECKOUT_SESSION_ID}`,
      line_items: lineItems,
      metadata: {
        event_id: event.id,
        event_title: event.title,
        venue_id: event.venue_id || "",
        quantity: String(quantity),
        tier_id: tier_id || "",
        ticketing_fee: String(ticketingFee),
        facility_fee: String(facilityFee),
        venue_rebate: String(venueRebate),
        tax_rate: String(taxRate),
        buyer_name: buyer_name || "",
        buyer_phone: buyer_phone || "",
        source: "box_office",
        fwb_opt_in: "false",
      },
    };

    if (buyer_email) {
      sessionOptions.customer_email = buyer_email;
    }

    const session = await stripe.checkout.sessions.create(sessionOptions);

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error("Box office checkout error:", err);
    return NextResponse.json(
      { error: "Failed to create box office checkout session" },
      { status: 500 }
    );
  }
}
