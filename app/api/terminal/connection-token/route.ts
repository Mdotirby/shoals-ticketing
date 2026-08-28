import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

// Called by the Terminal SDK on launch to authenticate the reader session.
// No auth required — the secret is short-lived and useless without the SDK.
// Smart Readers (e.g. Stripe Reader S700) require the token to be scoped to
// the Location the reader is registered under, or the SDK can't connect to it.
export async function POST() {
  try {
    const stripe = getStripe();
    const location = process.env.STRIPE_TERMINAL_LOCATION_ID;
    const token = await stripe.terminal.connectionTokens.create(
      location ? { location } : undefined
    );
    return NextResponse.json({ secret: token.secret });
  } catch (err) {
    console.error("[terminal/connection-token]", err);
    return NextResponse.json({ error: "Failed to create connection token" }, { status: 500 });
  }
}
