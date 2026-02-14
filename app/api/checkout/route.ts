// POST: create Stripe Checkout Session
// Body: { event_id, items: [{ ticket_type_id, quantity }], delivery_method }

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // TODO: Phase 3 — create Stripe Checkout Session
  // 1. Validate request body
  // 2. Look up ticket types and check availability
  // 3. Create Stripe Checkout Session with line items
  // 4. Return session URL for redirect
  return NextResponse.json({ message: "Checkout — not wired up yet" });
}
