import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase-server";
import { resolveVenueFees } from "@/lib/checkout-helpers";
import { resolveTierFees, unlocksTier, type FeeMode, type TierFeeOverrides } from "@/lib/fees/tierFees";
import { surchargeCents } from "@/lib/fees/rates";
import { salesWindowFor, canSell } from "@/lib/salesWindow";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      event_id,
      tier_id,
      unlock_code,
      quantity = 1,
      buyer_name,
      buyer_email,
      buyer_phone,
      buyer_zip,
    } = body;

    // Email is OPTIONAL at the door, deliberately. This used to 400 without
    // one, which meant a walk-up who did not want to give an address could not
    // be sold a ticket on the reader — while the cash path next to it took the
    // same sale with a first and last name. The card buyer is standing at the
    // door and walks in on the spot; the email is a receipt, not the entry
    // pass. Every downstream use of it in the webhook is already guarded by
    // `if (customerEmail)`.
    if (!event_id || !buyer_name) {
      return NextResponse.json(
        { error: "event_id and buyer_name are required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Fetch event
    const { data: event } = await admin
      .from("events")
      .select("id, title, venue, date, price, venue_id, event_venue_id, facility_fee_enabled, tax_method, fees_included_in_price")
      .eq("id", event_id)
      .single();

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // ── The box-office window ──────────────────────────────────────────
    // Opens at noon Central on show day and closes at midnight — after that
    // the show has happened and the till stops too. Advance sales for future
    // shows are unaffected; the window governs who owns the show ON THE DAY.
    // See lib/salesWindow.ts.
    const salesWindow = salesWindowFor(event.date);
    if (!canSell(event.date, "box_office")) {
      return NextResponse.json(
        { error: salesWindow.reason ?? "This event is no longer on sale." },
        { status: 403 }
      );
    }

    // Resolve ticket price — use tier if specified
    let ticketPriceDollars = event.price || 0;
    let tierName = "GA";
    let tierFeeModes: TierFeeOverrides | null = null;
    if (tier_id) {
      let { data: tier, error: tierError } = await admin
        .from("ticket_tiers")
        .select("price, tier_name, service_fee_mode, facility_fee_mode, unlock_code")
        .eq("id", tier_id)
        .single();
      if (tierError && /service_fee_mode|facility_fee_mode|unlock_code|column .* does not exist/i.test(tierError.message)) {
        const retry = await admin.from("ticket_tiers").select("price, tier_name").eq("id", tier_id).single();
        tier = retry.data ? { ...retry.data, service_fee_mode: null, facility_fee_mode: null, unlock_code: null } : null;
        tierError = retry.error;
      }
      if (tier) {
        // The code authorises the sale, not the payment method — a staffed
        // till is not on its own permission to sell the code tier.
        if (!unlocksTier(tier.unlock_code, unlock_code)) {
          return NextResponse.json({ error: "That tier needs an unlock code." }, { status: 403 });
        }
        ticketPriceDollars = tier.price;
        tierName = tier.tier_name;
        const asMode = (v: unknown): FeeMode | null =>
          v === "added" || v === "included" || v === "waived" ? v : null;
        tierFeeModes = {
          service_fee_mode: asMode(tier.service_fee_mode),
          facility_fee_mode: asMode(tier.facility_fee_mode),
        };
      }
    }

    // Resolve venue fees (same logic as online checkout), then let the TIER
    // override them — a waived fee must be waived at the door too, or the same
    // ticket costs two different amounts depending on which till sold it.
    const venueFees = await resolveVenueFees(admin, event);
    const tierFees = resolveTierFees(
      {
        ticketingFee: venueFees.ticketingFee,
        facilityFee: venueFees.facilityFee,
        feesIncludedInPrice: venueFees.feesIncludedInPrice,
        facilityFeeEnabled: event.facility_fee_enabled,
      },
      tierFeeModes,
    );
    const fees = {
      ...venueFees,
      ticketingFee: tierFees.service.charged,
      facilityFee: tierFees.facility.charged,
      // `charged` already encodes "included" as zero.
      feesIncludedInPrice: false,
    };

    // Fee math — card-present uses $0.05 flat fee instead of $0.30
    const ticketPriceCents = Math.round(ticketPriceDollars * 100);
    const ticketingFeeCents = Math.round(fees.ticketingFee * 100);
    const facilityFeeCents = Math.round(fees.facilityFee * 100);
    const effectiveTaxRate = fees.taxMethod === "divisor" ? 0 : fees.taxRate;
    const taxCents = Math.round(ticketPriceCents * effectiveTaxRate);
    const subtotalBeforeStripe = fees.feesIncludedInPrice
      ? (ticketPriceCents + taxCents) * quantity
      : (ticketPriceCents + ticketingFeeCents + facilityFeeCents + taxCents) * quantity;
    // Card-present is a genuinely different rate (2.7% + $0.05), not a stale
    // copy of the online one — the rate card keeps the two apart.
    const stripeFeeCents = surchargeCents(
      subtotalBeforeStripe,
      undefined,
      "terminal"
    );
    // When fees are baked into the ticket price, the venue absorbs the card
    // processing fee too — charge exactly the sticker price, no surcharge.
    const totalCents = fees.feesIncludedInPrice
      ? subtotalBeforeStripe
      : subtotalBeforeStripe + stripeFeeCents;

    const stripe = getStripe();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "usd",
      payment_method_types: ["card_present"],
      capture_method: "automatic",
      metadata: {
        event_id: event.id,
        event_title: event.title,
        venue_id: event.venue_id || "",
        quantity: String(quantity),
        tier_id: tier_id || "",
        tier_name: tierName,
        buyer_name: buyer_name || "",
        buyer_email: buyer_email || "",
        buyer_phone: buyer_phone || "",
        buyer_zip: buyer_zip || "",
        // What the show EARNS — zero for a waived fee, by design.
        ticketing_fee: String(tierFees.service.earned),
        facility_fee: String(tierFees.facility.earned),
        venue_rebate: String(fees.venueRebate),
        tax_rate: String(fees.taxRate),
        tax_method: fees.taxMethod,
        fees_included_in_price: fees.feesIncludedInPrice ? "true" : "false",
        source: "terminal",
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      totalCents,
      breakdown: {
        ticketPriceCents,
        ticketingFeeCents,
        facilityFeeCents,
        taxCents,
        stripeFeeCents,
        totalCents,
        quantity,
      },
    });
  } catch (err) {
    console.error("[terminal/payment-intent]", err);
    return NextResponse.json({ error: "Failed to create payment intent" }, { status: 500 });
  }
}
