// POST: Stripe webhook handler
// Handles: checkout.session.completed
// Creates order + tickets in Supabase, generates QR codes

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // TODO: Phase 3 — handle Stripe webhooks
  // 1. Verify webhook signature using STRIPE_WEBHOOK_SECRET
  // 2. Parse event type
  // 3. On checkout.session.completed:
  //    a. Create order record in Supabase
  //    b. Create ticket records with unique QR codes
  //    c. Update ticket_types quantity_sold
  //    d. Trigger email with ticket delivery
  return NextResponse.json({ received: true });
}
