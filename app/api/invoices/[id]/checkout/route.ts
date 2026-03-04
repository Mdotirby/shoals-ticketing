import { createAdminClient } from "@/lib/supabase-server";
import { getStripe } from "@/lib/stripe";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST: Create a Stripe Checkout Session for this invoice
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  // Fetch invoice
  const { data: invoice, error } = await admin
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (invoice.status === "paid") {
    return NextResponse.json({ error: "Invoice is already paid" }, { status: 400 });
  }

  if (invoice.status === "void") {
    return NextResponse.json({ error: "Invoice is voided" }, { status: 400 });
  }

  const balanceDue = Number(invoice.balance_due) || Number(invoice.total) - Number(invoice.amount_paid || 0);

  if (balanceDue <= 0) {
    return NextResponse.json({ error: "No balance due" }, { status: 400 });
  }

  // Get venue info for branding
  const { data: venue } = await admin
    .from("venues")
    .select("name, slug")
    .eq("id", invoice.venue_id)
    .single();

  const stripe = getStripe();

  // Determine the base URL
  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "https://venuecore.live";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Invoice ${invoice.invoice_number}`,
            description: `Payment for ${invoice.client_name}`,
          },
          unit_amount: Math.round(balanceDue * 100), // cents
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: "invoice",
      invoice_id: invoice.id,
      venue_id: invoice.venue_id,
      event_id: invoice.event_id,
    },
    ui_mode: "embedded",
    return_url: `${origin}/pay/${invoice.id}/success?session_id={CHECKOUT_SESSION_ID}`,
    ...(venue?.name ? { payment_intent_data: { description: `${venue.name} — Invoice ${invoice.invoice_number}` } } : {}),
  });

  return NextResponse.json({ clientSecret: session.client_secret });
}
