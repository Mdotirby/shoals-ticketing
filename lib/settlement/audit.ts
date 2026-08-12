/**
 * Settlement Ticket Audit — single source of truth.
 *
 * Pulls actual order data for the event so settlement totals reconcile
 * against Stripe.
 *
 * ── Pricing basis ────────────────────────────────────────────────────────
 * There are two independent price stores in this system and they do NOT agree:
 *
 *   • ticket_tiers.price   — what an admin typed when setting up tiers
 *   • sections.price_cents — what a reserved-seating checkout actually charges
 *
 * For a seated event the sections table is the money that moved, and a table
 * section (`sells_as_table`) is billed ONCE per table object, not per seat.
 * This audit used to value every ticket row at ticket_tiers.price regardless,
 * which on a $800/table section with 8 seats per table over-stated face value
 * by 8×. On Muscle Shoals Meets: The 90's that produced $61,925 of claimed
 * face value on a show that grossed $46,451.86 — more face value than money
 * that ever existed. So: seats/sections win when a layout is enabled, tiers
 * are the fallback for general-admission events.
 *
 * ── Gross definitions ────────────────────────────────────────────────────
 *   total_gross  — ALL-IN ticket gross: what the buyer paid for admission
 *                  including the service and facility fee, before sales tax
 *                  and before the card surcharge. Matches the offer builder's
 *                  "gross", so `adj_gross = gross − svc − fac` reads correctly
 *                  on both documents.
 *   face_gross   — the artist's face value: total_gross − svc − fac.
 *
 * ── Card fees are measured, not plugged ──────────────────────────────────
 * cc_fees used to be derived as the residual `stripe_gross − face − svc − fac
 * − tax`, explicitly so the page always tied to Stripe. In practice that
 * guaranteed the opposite: every upstream error silently landed in the card
 * fee line, and when the residual went negative the code fell through to a
 * formula and stopped tying to Stripe at all. Now cc_fees is summed from real
 * per-order `settlement_ledger.stripe_fee`, and anything that still doesn't
 * reconcile is reported as `reconciliation_variance` where it can be seen.
 *
 * Data sources:
 *   • orders            — paid / comp / free purchases
 *   • tickets           — per-tier counts (general admission events)
 *   • ticket_tiers      — capacity + face price (general admission events)
 *   • sections + seats  — capacity + real price (reserved seating events)
 *   • settlement_ledger — per-order fee/tax/card breakdown from the webhook
 *   • venues / event_venues — per-event fee + tax config
 *
 * Used by:
 *   • POST /api/settlements          — initial audit on settlement creation
 *   • POST /api/settlements/[id]/refresh — manual "Refresh from Orders" button
 *   • GET  /api/admin/reports/ticket-audit — Reports → Ticket Audit
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TicketAuditRow, TaxMethod } from "@/lib/types/settlement";
import { estimatedStripeCostCents } from "@/lib/fees/rates";

export type AuditTotals = {
  audit: TicketAuditRow[];
  /** ALL-IN ticket gross: face + service + facility, pre-tax, pre-surcharge. */
  total_gross: number;
  /** The artist's face value: total_gross − ticketing_fees − facility_fees. */
  face_gross: number;
  ticketing_fees: number;       // ticketing_fee × billing units
  facility_fees: number;        // facility_fee × billing units
  taxes: number;                // multiplier: face × rate. divisor: backed out of face.
  /** Real card fees, summed from settlement_ledger (not a residual plug). */
  cc_fees: number;
  /** Where cc_fees came from, so the UI can flag incomplete ledger coverage. */
  cc_fees_source: "ledger" | "estimated" | "mixed";
  /** Σ orders.total_amount for paying orders — what Stripe actually collected. */
  stripe_gross: number;
  /**
   * stripe_gross − (face + svc + fac + tax + cc). Should be ~$0. Anything else
   * is a real discrepancy (promo discounts, mis-tagged seats, missing ledger
   * rows) and is surfaced rather than absorbed into the card-fee line.
   */
  reconciliation_variance: number;
  tickets_sold_count: number;   // paying admissions
  /** Billing units actually charged — tables count once, not once per seat. */
  billing_unit_count: number;
  comp_count: number;           // true comps (orders.source = 'comp')
  comp_face_value: number;      // would-be price of comps (excluded from gross)
  /** $0 orders that are NOT comps — free events and 100%-off promo codes. */
  free_count: number;
  ticketing_fee_per_ticket: number; // snapshot of per-unit rate
  facility_fee_per_ticket: number;  // snapshot of per-unit rate
  tax_rate: number;             // venue tax rate snapshot
  tax_method: TaxMethod;
  /** True when svc + fac are baked into the ticket price rather than added. */
  fees_included_in_price: boolean;
  /** Which price store the face value came from. */
  pricing_basis: "seats" | "tiers";
};

type OrderRow = {
  id: string;
  status: string | null;
  source: string | null;
  quantity: number | null;
  total_amount: number | null;
};

type TicketRow = {
  id: string;
  order_id: string | null;
  ticket_type_id: string | null;
};

type TierRow = {
  id: string;
  tier_name: string;
  price: number | null;
  capacity: number | null;
  sort_order?: number | null;
};

type LedgerRow = {
  order_id: string | null;
  ticketing_fee: number | string | null;
  tax_collected: number | string | null;
  stripe_fee: number | string | null;
  type: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (n: unknown) => Number(n ?? 0) || 0;

/**
 * Pull the canonical fee/tax config that was in effect for the event.
 * Mirrors checkout's resolution order: event_venues override → venues fallback,
 * with respect for facility_fee_enabled.
 */
async function resolveEventFees(
  admin: SupabaseClient,
  eventId: string
): Promise<{
  ticketing_fee: number;
  facility_fee: number;
  tax_rate: number;
  tax_method: TaxMethod;
  fees_included_in_price: boolean;
}> {
  const { data: event } = await admin
    .from("events")
    .select("venue_id, event_venue_id, facility_fee_enabled, tax_method, fees_included_in_price")
    .eq("id", eventId)
    .single();

  if (!event) {
    return {
      ticketing_fee: 0,
      facility_fee: 0,
      tax_rate: 0,
      tax_method: "multiplier",
      fees_included_in_price: false,
    };
  }

  let fees = { ticketing_fee: 0, facility_fee: 0, tax_rate: 0, tax_method: "multiplier" as TaxMethod };

  if (event.event_venue_id) {
    const { data: ev } = await admin
      .from("event_venues")
      .select("ticketing_fee, facility_fee, tax_rate, tax_method")
      .eq("id", event.event_venue_id)
      .maybeSingle();
    if (ev) {
      fees = {
        ticketing_fee: num(ev.ticketing_fee),
        facility_fee: num(ev.facility_fee),
        tax_rate: num(ev.tax_rate),
        tax_method: ev.tax_method === "divisor" ? "divisor" : "multiplier",
      };
    }
  }
  if ((!fees.ticketing_fee && !fees.tax_rate) && event.venue_id) {
    const { data: v } = await admin
      .from("venues")
      .select("ticketing_fee, facility_fee, tax_rate, tax_method")
      .eq("id", event.venue_id)
      .maybeSingle();
    if (v) {
      fees = {
        ticketing_fee: num(v.ticketing_fee),
        facility_fee: num(v.facility_fee),
        tax_rate: num(v.tax_rate),
        tax_method: v.tax_method === "divisor" ? "divisor" : "multiplier",
      };
    }
  }

  if (event.facility_fee_enabled === false) fees.facility_fee = 0;

  // Event-level tax_method overrides the venue default — same precedence as
  // resolveVenueFees() in checkout, so the audit taxes what checkout charged.
  if (event.tax_method === "divisor" || event.tax_method === "multiplier") {
    fees.tax_method = event.tax_method;
  }

  return { ...fees, fees_included_in_price: event.fees_included_in_price === true };
}

// ── Reserved-seating truth ───────────────────────────────────────────────────

type SeatBasis = {
  rows: Array<{
    name: string;
    capacityUnits: number;   // sellable billing units in this section
    soldUnits: number;       // billing units actually sold
    unitPrice: number;       // dollars per billing unit
  }>;
  billingUnits: number;
  faceGross: number;
};

/**
 * Face value and billing-unit counts straight from the seat map, which is what
 * a reserved-seating checkout actually prices against. Returns null when the
 * event has no enabled layout — caller falls back to tier pricing.
 *
 * A `sells_as_table` section is billed once per table object: eleven 8-top
 * tables at $800 is $8,800 of face value and 11 billing units, NOT 88 of
 * either. `objects.metadata.hidden` sections stay excluded from capacity for
 * the same reason checkout excludes them.
 */
async function seatBasisForEvent(
  admin: SupabaseClient,
  eventId: string
): Promise<SeatBasis | null> {
  const { data: map } = await admin
    .from("event_layout_maps")
    .select("layout_id")
    .eq("event_id", eventId)
    .eq("enabled", true)
    .maybeSingle();
  if (!map?.layout_id) return null;

  const { data: sections } = await admin
    .from("sections")
    .select("id, name, price_cents, sells_as_table, type")
    .eq("layout_id", map.layout_id);
  const sectionRows = sections ?? [];
  if (sectionRows.length === 0) return null;

  const sectionIds = sectionRows.map((s: { id: string }) => s.id);
  const { data: seatRows } = await admin
    .from("seats")
    .select("id, section_id, status, object_id")
    .in("section_id", sectionIds);
  const seats = seatRows ?? [];

  const out: SeatBasis = { rows: [], billingUnits: 0, faceGross: 0 };

  for (const sec of sectionRows) {
    const isTable = !!sec.sells_as_table || sec.type === "table";
    const secSeats = seats.filter(
      (s: { section_id: string }) => s.section_id === sec.id
    );
    if (secSeats.length === 0) continue;

    const unitPrice = num(sec.price_cents) / 100;
    let capacityUnits: number;
    let soldUnits: number;

    if (isTable) {
      // One billing unit per table object.
      const allObjects = new Set(
        secSeats
          .map((s: { object_id: string | null }) => s.object_id)
          .filter(Boolean) as string[]
      );
      const soldObjects = new Set(
        secSeats
          .filter((s: { status: string }) => s.status === "sold")
          .map((s: { object_id: string | null }) => s.object_id)
          .filter(Boolean) as string[]
      );
      capacityUnits = allObjects.size;
      soldUnits = soldObjects.size;
    } else {
      capacityUnits = secSeats.length;
      soldUnits = secSeats.filter(
        (s: { status: string }) => s.status === "sold"
      ).length;
    }

    if (capacityUnits === 0) continue;
    out.rows.push({ name: sec.name, capacityUnits, soldUnits, unitPrice });
    out.billingUnits += soldUnits;
    out.faceGross += soldUnits * unitPrice;
  }

  return out.rows.length > 0 ? out : null;
}

/**
 * Build the ticket audit + fee/tax totals for a single event from real order data.
 */
export async function computeEventAudit(
  admin: SupabaseClient,
  eventId: string
): Promise<AuditTotals> {
  const fees = await resolveEventFees(admin, eventId);

  // ── 1. Orders ────────────────────────────────────────────────────────────
  // Comp orders are status='paid' too. They are distinguished ONLY by
  // source='comp' — a $0 order with source='online' is a free event or a
  // 100%-off promo code, which is a real admission, not a comp against the
  // artist's allocation. Conflating the two reported 164 phantom comps
  // against 9 real ones.
  const { data: orders } = await admin
    .from("orders")
    .select("id, status, source, quantity, total_amount")
    .eq("event_id", eventId)
    .eq("status", "paid");

  const orderList: OrderRow[] = (orders ?? []) as OrderRow[];
  const orderById: Record<string, OrderRow> = {};
  for (const o of orderList) orderById[o.id] = o;

  const isCompOrder = (o: OrderRow | undefined) => o?.source === "comp";
  const isFreeOrder = (o: OrderRow | undefined) =>
    !!o && o.source !== "comp" && num(o.total_amount) === 0;

  let stripe_gross = 0;
  let comp_count = 0;
  let free_count = 0;
  const payingOrderIds: string[] = [];

  for (const o of orderList) {
    const qty = num(o.quantity);
    if (isCompOrder(o)) {
      comp_count += qty;
    } else if (isFreeOrder(o)) {
      free_count += qty;
    } else {
      stripe_gross += num(o.total_amount);
      payingOrderIds.push(o.id);
    }
  }

  // ── 2. Tickets (needed for tier attribution + comp face value) ───────────
  const orderIds = orderList.map((o) => o.id);
  const { data: tickets } =
    orderIds.length === 0
      ? { data: [] as TicketRow[] }
      : await admin
          .from("tickets")
          .select("id, order_id, ticket_type_id")
          .in("order_id", orderIds);
  const ticketList: TicketRow[] = (tickets ?? []) as TicketRow[];

  // ── 3. Tiers ─────────────────────────────────────────────────────────────
  const { data: tiers } = await admin
    .from("ticket_tiers")
    .select("id, tier_name, price, capacity, sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });
  const tierList: TierRow[] = (tiers ?? []) as TierRow[];
  const tierById: Record<string, TierRow> = {};
  for (const t of tierList) tierById[t.id] = t;

  // Comp face value is always tier-based — a comp has no money attached, so
  // there's no charge to price it from.
  let comp_face_value = 0;
  for (const t of ticketList) {
    const order = t.order_id ? orderById[t.order_id] : undefined;
    if (!isCompOrder(order)) continue;
    const tier = t.ticket_type_id ? tierById[t.ticket_type_id] : undefined;
    comp_face_value += num(tier?.price ?? tierList[0]?.price);
  }

  // ── 4. Face value + billing units ────────────────────────────────────────
  // Seats/sections win when the event has an enabled layout: that IS what
  // checkout charged. Tiers are the general-admission fallback.
  const seatBasis = await seatBasisForEvent(admin, eventId);
  const pricing_basis: "seats" | "tiers" = seatBasis ? "seats" : "tiers";

  type TierAgg = {
    tier: string;
    capacity: number;
    sold: number;
    comps: number;
    kills: number;
    price: number;
    ticketing_fee: number;
    facility_fee: number;
    gross: number;
    sort_order: number;
  };
  const rows: TierAgg[] = [];
  let face_gross = 0;
  let billing_unit_count = 0;
  let tickets_sold_count = 0;

  if (seatBasis) {
    // Comps on a seated event still occupy seats, so they're already inside
    // soldUnits. Back them out by ticket count per section where we can't
    // distinguish — in practice comps are issued without seats, so we report
    // them separately and leave the seat counts as the charge record.
    for (const [i, s] of seatBasis.rows.entries()) {
      rows.push({
        tier: s.name,
        capacity: s.capacityUnits,
        sold: s.soldUnits,
        comps: 0,
        kills: 0,
        price: s.unitPrice,
        ticketing_fee: fees.ticketing_fee,
        facility_fee: fees.facility_fee,
        gross: s.soldUnits * s.unitPrice,
        sort_order: i,
      });
    }
    face_gross = seatBasis.faceGross;
    billing_unit_count = seatBasis.billingUnits;
    // Admissions ≠ billing units on a table event: 11 tables seat 88 people.
    tickets_sold_count = ticketList.filter(
      (t) => !isCompOrder(t.order_id ? orderById[t.order_id] : undefined)
    ).length;
  } else {
    const tierMap: Record<string, TierAgg> = {};
    for (const t of tierList) {
      tierMap[t.id] = {
        tier: t.tier_name,
        capacity: num(t.capacity),
        sold: 0,
        comps: 0,
        kills: 0,
        price: num(t.price),
        ticketing_fee: fees.ticketing_fee,
        facility_fee: fees.facility_fee,
        gross: 0,
        sort_order: num(t.sort_order),
      };
    }
    const fallbackTierId = tierList[0]?.id ?? "__unassigned__";
    if (!tierMap[fallbackTierId]) {
      tierMap[fallbackTierId] = {
        tier: "Unassigned",
        capacity: 0,
        sold: 0,
        comps: 0,
        kills: 0,
        price: 0,
        ticketing_fee: fees.ticketing_fee,
        facility_fee: fees.facility_fee,
        gross: 0,
        sort_order: 9999,
      };
    }

    for (const t of ticketList) {
      const tierId =
        t.ticket_type_id && tierMap[t.ticket_type_id]
          ? t.ticket_type_id
          : fallbackTierId;
      const tier = tierMap[tierId];
      if (!tier) continue;
      const order = t.order_id ? orderById[t.order_id] : undefined;
      if (isCompOrder(order)) {
        tier.comps += 1;
      } else {
        tier.sold += 1;
        tier.gross += tier.price;
      }
    }

    rows.push(...Object.values(tierMap));
    face_gross = rows.reduce((s, r) => s + r.gross, 0);
    // Billing units for GA = what checkout charged fees on: order quantity.
    billing_unit_count = orderList
      .filter((o) => !isCompOrder(o) && !isFreeOrder(o))
      .reduce((s, o) => s + num(o.quantity), 0);
    tickets_sold_count = rows.reduce((s, r) => s + r.sold, 0);
  }

  // ── 5. Card fees — measured, not plugged ─────────────────────────────────
  let cc_fees = 0;
  let ledgerCovered = 0;
  if (payingOrderIds.length > 0) {
    const { data: ledger } = await admin
      .from("settlement_ledger")
      .select("order_id, stripe_fee, type")
      .eq("event_id", eventId)
      .eq("type", "sale");
    const feeByOrder = new Map<string, number>();
    for (const l of (ledger ?? []) as LedgerRow[]) {
      if (l.order_id) feeByOrder.set(l.order_id, num(l.stripe_fee));
    }
    for (const id of payingOrderIds) {
      const recorded = feeByOrder.get(id);
      if (recorded != null) {
        cc_fees += recorded;
        ledgerCovered += 1;
      } else {
        // No ledger row (5 such orders exist in production). Estimate so the
        // total isn't silently short, and mark the source as degraded.
        cc_fees +=
          estimatedStripeCostCents(Math.round(num(orderById[id]?.total_amount) * 100)) / 100;
      }
    }
  }
  const cc_fees_source: AuditTotals["cc_fees_source"] =
    payingOrderIds.length === 0 || ledgerCovered === payingOrderIds.length
      ? "ledger"
      : ledgerCovered === 0
        ? "estimated"
        : "mixed";


  // ── 6. Fees + tax ────────────────────────────────────────────────────────
  // Both fees are charged per BILLING UNIT (calculateFees multiplies by
  // effectiveQuantity, which for a table order is the table count) — not per
  // admission. Charging them per ticket billed an 11-table section 88 times.
  const ticketing_fees = fees.ticketing_fee * billing_unit_count;
  const facility_fees = fees.facility_fee * billing_unit_count;

  const tax_method: TaxMethod = fees.tax_method;
  let total_gross: number;
  let artist_face: number;
  let taxes: number;

  if (fees.fees_included_in_price) {
    // The sticker price covers EVERYTHING — service fee, facility fee, sales
    // tax, and the card fee the venue absorbs. So every one of those is carved
    // out of the price rather than added to it, and the tax has to be backed
    // out with the divisor method no matter how the venue is configured,
    // because it is by definition already inside the number.
    total_gross = face_gross;
    const afterFees = face_gross - ticketing_fees - facility_fees - cc_fees;
    taxes =
      fees.tax_rate > 0 ? afterFees - afterFees / (1 + fees.tax_rate) : 0;
    artist_face = afterFees - taxes;
  } else {
    // Fees are added on top of the ticket price at checkout, so the all-in
    // gross is face + fees and the artist's face value is the price itself.
    total_gross = face_gross + ticketing_fees + facility_fees;
    artist_face = face_gross;
    // Divisor: tax is inside the face price, back it out. Multiplier: tax was
    // charged on top of face and was never part of it. Same branch checkout
    // uses, so the audit taxes exactly what was collected.
    taxes =
      tax_method === "divisor" && fees.tax_rate > 0
        ? artist_face - artist_face / (1 + fees.tax_rate)
        : artist_face * fees.tax_rate;
  }

  // ── 7. Reconciliation ────────────────────────────────────────────────────
  // What we can account for vs. what Stripe actually collected. Any gap is
  // reported, never buried in the card-fee line.
  const accountedFor =
    artist_face + ticketing_fees + facility_fees + taxes + cc_fees;
  const reconciliation_variance = stripe_gross - accountedFor;

  const audit: TicketAuditRow[] = rows
    .filter((t) => t.capacity > 0 || t.sold > 0 || t.comps > 0)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => ({
      tier: t.tier,
      capacity: t.capacity,
      sold: t.sold,
      comps: t.comps,
      kills: t.kills,
      price: r2(t.price),
      ticketing_fee: r2(t.ticketing_fee),
      facility_fee: r2(t.facility_fee),
      gross: r2(t.gross),
    }));

  return {
    audit,
    total_gross: r2(total_gross),
    face_gross: r2(artist_face),
    ticketing_fees: r2(ticketing_fees),
    facility_fees: r2(facility_fees),
    taxes: r2(taxes),
    cc_fees: r2(cc_fees),
    cc_fees_source,
    stripe_gross: r2(stripe_gross),
    reconciliation_variance: r2(reconciliation_variance),
    tickets_sold_count,
    billing_unit_count,
    comp_count,
    comp_face_value: r2(comp_face_value),
    free_count,
    ticketing_fee_per_ticket: r2(fees.ticketing_fee),
    facility_fee_per_ticket: r2(fees.facility_fee),
    tax_rate: fees.tax_rate,
    tax_method,
    fees_included_in_price: fees.fees_included_in_price,
    pricing_basis,
  };
}

/**
 * Find the artist offer that should attach to this event's settlement.
 * Priority:
 *   1. Most recent offer for the same venue + same event_date
 *   2. Most recent offer for the same venue + same event_venue_id
 * Returns null when nothing matches confidently — this is intentional so
 * we never silently grab the wrong offer (the Kruse → Jed Harrelson bug).
 */
export async function findOfferForEvent(
  admin: SupabaseClient,
  eventId: string
): Promise<{ id: string; data: Record<string, unknown> } | null> {
  const { data: event } = await admin
    .from("events")
    .select("id, title, date, venue_id, event_venue_id")
    .eq("id", eventId)
    .single();

  if (!event) return null;

  // Primary match: direct event_id FK — most reliable, no ambiguity
  const { data: byEventId } = await admin
    .from("artist_offers")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byEventId) return { id: byEventId.id, data: byEventId };

  const eventDateStr =
    typeof event.date === "string"
      ? event.date.slice(0, 10) // 'YYYY-MM-DD' for comparison with offers.event_date
      : null;

  // Fallback: venue_id + event_date (pre-FK legacy matching)
  if (eventDateStr && event.venue_id) {
    const { data: byDate } = await admin
      .from("artist_offers")
      .select("*")
      .eq("venue_id", event.venue_id)
      .eq("event_date", eventDateStr)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byDate) return { id: byDate.id, data: byDate };
  }

  // Try event_venue_id match
  if (event.event_venue_id) {
    const { data: byEventVenue } = await admin
      .from("artist_offers")
      .select("*")
      .eq("event_venue_id", event.event_venue_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byEventVenue) return { id: byEventVenue.id, data: byEventVenue };
  }

  // No confident match — caller falls back to manual entry.
  return null;
}
