/**
 * Retrieves seat_ids from either a Stripe Checkout Session or a PaymentIntent,
 * depending on which ID is stored on the order (inline checkout stores `pi_…`,
 * embedded checkout stores `cs_…`).
 */
import { getStripe } from "@/lib/stripe";

export async function getSeatIdsFromStripe(stripeReferenceId: string): Promise<string[]> {
  const stripe = getStripe();
  let rawSeatIds: string | null | undefined;

  if (stripeReferenceId.startsWith("pi_")) {
    const pi = await stripe.paymentIntents.retrieve(stripeReferenceId);
    rawSeatIds = pi.metadata?.seat_ids;
  } else if (stripeReferenceId.startsWith("cs_")) {
    const session = await stripe.checkout.sessions.retrieve(stripeReferenceId);
    rawSeatIds = session.metadata?.seat_ids;
  } else {
    throw new Error(`Unknown Stripe ID format: ${stripeReferenceId}`);
  }

  if (!rawSeatIds) return [];
  const parsed = JSON.parse(rawSeatIds);
  return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
}
