import { getStripe } from "@/lib/stripe";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { event_id, quantity = 1 } = body;

    if (!event_id) {
      return NextResponse.json(
        { error: "event_id is required" },
        { status: 400 }
      );
    }

    // Look up event from Supabase (includes per-event ticketing fee)
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id,title,venue,date,price,ticketing_fee,venue_rebate")
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    const stripe = getStripe();

    // Use per-event ticketing fee (flat dollar amount, default $3.00)
    const ticketPriceCents = Math.round(event.price * 100);
    const ticketingFeeCents = Math.round((event.ticketing_fee ?? 3.0) * 100);

    // Determine the return URL based on the request origin
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
          unit_amount: ticketPriceCents,
        },
        quantity,
      },
    ];

    // Only add ticketing fee line item if fee > 0
    if (ticketingFeeCents > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: "Ticketing Fee",
          },
          unit_amount: ticketingFeeCents,
        },
        quantity,
      });
    }

    // Create embedded checkout session
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      mode: "payment",
      return_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      line_items: lineItems,
      metadata: {
        event_id: event.id,
        event_title: event.title,
        quantity: String(quantity),
        ticketing_fee: String(event.ticketing_fee ?? 3.0),
        venue_rebate: String(event.venue_rebate ?? 0),
      },
    });

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
