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

    // Look up event from Supabase
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id,title,venue,date,price")
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    const stripe = getStripe();

    // Calculate fees
    const ticketPrice = Math.round(event.price * 100); // Convert to cents
    const processingFee = Math.round(ticketPrice * 0.025); // 2.5% ticketing fee
    const taxRate = 0.09; // 9% sales tax
    const taxAmount = Math.round(ticketPrice * taxRate);

    // Determine the return URL based on the request origin
    const origin = request.headers.get("origin") || "https://shoals-ticketing.vercel.app";

    // Create embedded checkout session
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      mode: "payment",
      return_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${event.title} — General Admission`,
              description: `${event.venue} • ${new Date(event.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
            },
            unit_amount: ticketPrice,
          },
          quantity,
        },
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Processing Fee",
            },
            unit_amount: processingFee,
          },
          quantity,
        },
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Sales Tax",
            },
            unit_amount: taxAmount,
          },
          quantity,
        },
      ],
      metadata: {
        event_id: event.id,
        event_title: event.title,
        quantity: String(quantity),
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
