import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * POST /api/admin/orders/backfill-zips
 *
 * One-time backfill endpoint. For every order with customer_zip = NULL:
 *
 *  - If the order has a stripe_checkout_session_id → fetches the CheckoutSession
 *    and reads customer_details.address.postal_code (billing address was required)
 *
 *  - If the order only has a stripe_payment_intent_id → fetches the PaymentIntent
 *    and reads charges.data[0].billing_details.address.postal_code (may be null
 *    for older orders where zip was never collected)
 *
 * Returns a summary of how many were updated vs. skipped.
 *
 * Safe to call multiple times — only touches orders still missing a zip.
 */
export async function POST() {
  const admin = createAdminClient();

  // Fetch all orders with no zip that have at least one Stripe reference
  const { data: orders, error } = await admin
    .from("orders")
    .select("id, stripe_checkout_session_id, stripe_payment_intent_id")
    .is("customer_zip", null)
    .or("stripe_checkout_session_id.neq.,stripe_payment_intent_id.neq.")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ message: "No orders with missing zip found.", updated: 0, skipped: 0 });
  }

  let updated = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const order of orders) {
    try {
      let zip: string | null = null;

      // ── Strategy 1: Checkout Session (billing_address_collection was required) ──
      if (order.stripe_checkout_session_id) {
        const session = await stripe.checkout.sessions.retrieve(
          order.stripe_checkout_session_id,
          { expand: ["customer_details"] }
        );
        zip = session.customer_details?.address?.postal_code ?? null;
      }

      // ── Strategy 2: PaymentIntent charges billing details ──
      if (!zip && order.stripe_payment_intent_id) {
        const pi = await stripe.paymentIntents.retrieve(
          order.stripe_payment_intent_id,
          { expand: ["charges"] }
        );

        // Check metadata first (new orders will have buyer_zip in metadata)
        if (pi.metadata?.buyer_zip) {
          zip = pi.metadata.buyer_zip;
        } else {
          // Fall back to card billing details from the charge
          const charges = (pi as Stripe.PaymentIntent & { charges?: { data: Stripe.Charge[] } }).charges;
          const firstCharge = charges?.data?.[0];
          zip = firstCharge?.billing_details?.address?.postal_code ?? null;
        }
      }

      if (zip) {
        await admin
          .from("orders")
          .update({ customer_zip: zip })
          .eq("id", order.id);
        updated++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`Backfill failed for order ${order.id}:`, err);
      failures.push(order.id);
      skipped++;
    }
  }

  return NextResponse.json({
    message: `Backfill complete. ${updated} updated, ${skipped} skipped (no zip available on Stripe).`,
    updated,
    skipped,
    failures: failures.length > 0 ? failures : undefined,
    totalProcessed: orders.length,
  });
}
