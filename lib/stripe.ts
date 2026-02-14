import Stripe from "stripe";

// Stripe is initialized lazily to avoid build errors when env vars aren't set yet
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY is not set. Add it to your .env.local and Vercel environment variables."
      );
    }
    _stripe = new Stripe(key, {
      typescript: true,
    });
  }
  return _stripe;
}
