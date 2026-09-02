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

  // Raw Elements + PaymentIntent, not a Checkout Session — its fields render
  // on our own dark page instead of an un-themeable Stripe-hosted UI.
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(balanceDue * 100), // cents
    currency: "usd",
    description: venue?.name
      ? `${venue.name} — Invoice ${invoice.invoice_number}`
      : `Invoice ${invoice.invoice_number} — Payment for ${invoice.client_name}`,
    metadata: {
      type: "invoice",
      invoice_id: invoice.id,
      venue_id: invoice.venue_id,
      event_id: invoice.event_id,
      source: "invoice",
    },
  });

  return NextResponse.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
}
