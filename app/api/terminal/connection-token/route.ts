import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

// Called by the iOS Terminal SDK on launch to authenticate the reader session.
// No auth required — the secret is short-lived and useless without the SDK.
export async function POST() {
  try {
    const stripe = getStripe();
    const token = await stripe.terminal.connectionTokens.create();
    return NextResponse.json({ secret: token.secret });
  } catch (err) {
    console.error("[terminal/connection-token]", err);
    return NextResponse.json({ error: "Failed to create connection token" }, { status: 500 });
  }
}
