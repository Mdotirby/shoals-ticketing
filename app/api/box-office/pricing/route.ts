import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/can";
import { tenantScope, DENY } from "@/lib/auth/tenant";
import { resolveVenueFees } from "@/lib/checkout-helpers";
import { resolveTierFees, type FeeMode } from "@/lib/fees/tierFees";
import { createAdminClient } from "@/lib/supabase-server";

const cents = (n: unknown) => Math.round((Number(n) || 0) * 100);
const asMode = (v: unknown): FeeMode | null =>
  v === "added" || v === "included" || v === "waived" ? v : null;

// GET /api/box-office/pricing?event_id= — what one ticket costs on the reader,
// per tier, resolved the way /api/terminal/payment-intent resolves it.
export async function GET(request: Request) {
  const guard = await requireCapability("door_sales_comps");
  if (!guard.ok) return guard.response;

  const eventId = new URL(request.url).searchParams.get("event_id");
  if (!eventId) return NextResponse.json({ error: "event_id is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("id, price, venue_id, event_venue_id, facility_fee_enabled, tax_method, fees_included_in_price")
    .eq("id", eventId)
    .maybeSingle();
  // The id alone is not a boundary (lib/auth/tenant.ts).
  const scope = tenantScope(guard.actor, event?.venue_id ?? null);
  if (!event || scope === DENY || (scope !== null && scope !== event.venue_id)) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const venue = await resolveVenueFees(admin, event);
  const taxRate = venue.taxMethod === "divisor" ? 0 : venue.taxRate;

  const unit = (priceDollars: unknown, modes: { service_fee_mode: FeeMode | null; facility_fee_mode: FeeMode | null } | null) => {
    const fees = resolveTierFees(
      {
        ticketingFee: venue.ticketingFee,
        facilityFee: venue.facilityFee,
        feesIncludedInPrice: venue.feesIncludedInPrice,
        facilityFeeEnabled: event.facility_fee_enabled,
      },
      modes,
    );
    const faceCents = cents(priceDollars);
    return {
      faceCents,
      serviceCents: cents(fees.service.charged),
      facilityCents: cents(fees.facility.charged),
      taxCents: Math.round(faceCents * taxRate),
    };
  };

  let { data: tiers, error } = await admin
    .from("ticket_tiers")
    .select("id, price, service_fee_mode, facility_fee_mode")
    .eq("event_id", eventId);
  if (error) {
    // A database without the fee-mode columns prices every tier the event's way.
    const retry = await admin.from("ticket_tiers").select("id, price").eq("event_id", eventId);
    tiers = (retry.data ?? []).map((t) => ({ ...t, service_fee_mode: null, facility_fee_mode: null }));
    error = retry.error;
  }

  return NextResponse.json({
    event: unit(event.price, null),
    tiers: Object.fromEntries(
      (tiers ?? []).map((t) => [
        t.id,
        unit(t.price, { service_fee_mode: asMode(t.service_fee_mode), facility_fee_mode: asMode(t.facility_fee_mode) }),
      ]),
    ),
  });
}
