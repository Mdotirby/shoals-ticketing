/**
 * Settlement Ticket Audit — single source of truth.
 *
 * Pulls actual order data for the event so settlement totals reconcile
 * against Stripe.
 *
 * Data sources (only the columns that the Stripe webhook actually populates):
 *   • orders                  — paid + comp ticket purchases (id, status, source,
 *                                quantity, total_amount). The `_cents` columns
 *                                that the checkout intent stuffs into Stripe
 *                                metadata are NOT written to the orders table —
 *                                so we ignore them and use total_amount.
 *   • tickets                 — per-ticket-tier counts.
 *   • ticket_tiers            — capacity + face price.
 *   • settlement_ledger       — per-order fee/tax/CC breakdown written by the
 *                                webhook on `payment_intent.succeeded`. This is
 *                                where ticketing_fee, tax_collected, stripe_fee
 *                                actually live.
 *   • venues / event_venues   — per-event facility_fee + tax_rate config.
 *
 * Used by:
 *   • POST /api/settlements          — initial audit on settlement creation
 *   • POST /api/settlements/[id]/refresh — manual "Refresh from Orders" button
 *   • GET  /api/admin/reports/ticket-audit — Reports → Ticket Audit
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TicketAuditRow, TaxMethod } from "@/lib/types/settlement";

export type AuditTotals = {
  audit: TicketAuditRow[];
  total_gross: number;          // Σ face value of paid tickets (tier.price × count)
  ticketing_fees: number;       // venue.ticketing_fee × tickets_sold_count
  facility_fees: number;        // venue.facility_fee × tickets_sold_count
  taxes: number;                // face_gross × tax_rate (or divisor method)
  /**
   * Stripe processing fees. Derived as the residual:
   *   stripe_gross − face − svc − fac − tax = cc_fees
   * This guarantees that on the settlement page,
   *   face + svc + fac + tax + cc === Stripe Dashboard "Gross volume"
   * to the penny — no formula drift.
   */
  cc_fees: number;
  tickets_sold_count: number;   // paying tickets
  comp_count: number;           // comp tickets
  comp_face_value: number;      // would-be price of comps (excluded from gross)
  ticketing_fee_per_ticket: number; // snapshot of per-ticket rate
  facility_fee_per_ticket: number;  // snapshot of per-ticket rate
  tax_rate: number;             // venue tax rate snapshot
  tax_method: TaxMethod;
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
}> {
  const { data: event } = await admin
    .from("events")
    .select("venue_id, event_venue_id, facility_fee_enabled")
    .eq("id", eventId)
    .single();

  if (!event) return { ticketing_fee: 0, facility_fee: 0, tax_rate: 0, tax_method: "multiplier" };

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
  return fees;
}

/**
 * Build the ticket audit + fee/tax totals for a single event from real order data.
 */
export async function computeEventAudit(
  admin: SupabaseClient,
  eventId: string
): Promise<AuditTotals> {
  // 1. Tiers (capacity + price snapshot)
  const { data: tiers } = await admin
    .from("ticket_tiers")
    .select("id, tier_name, price, capacity, sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  const tierList: TierRow[] = (tiers ?? []) as TierRow[];

  // 2. All paid orders for this event. Comp orders are status='paid' too —
  //    they're distinguished by source='comp' (or total_amount=0).
  const { data: orders } = await admin
    .from("orders")
    .select("id, status, source, quantity, total_amount")
    .eq("event_id", eventId)
    .eq("status", "paid");

  const orderList: OrderRow[] = (orders ?? []) as OrderRow[];
  const orderById: Record<string, OrderRow> = {};
  for (const o of orderList) orderById[o.id] = o;

  // 3. Tickets for those orders → tier mapping
  const orderIds = orderList.map((o) => o.id);
  const { data: tickets } =
    orderIds.length === 0
      ? { data: [] as TicketRow[] }
      : await admin
          .from("tickets")
          .select("id, order_id, ticket_type_id")
          .in("order_id", orderIds);

  const ticketList: TicketRow[] = (tickets ?? []) as TicketRow[];

  // 4. Per-tier aggregation
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
  const tierMap: Record<string, TierAgg> = {};
  for (const t of tierList) {
    tierMap[t.id] = {
      tier: t.tier_name,
      capacity: num(t.capacity),
      sold: 0,
      comps: 0,
      kills: 0,
      price: num(t.price),
      ticketing_fee: 0,
      facility_fee: 0,
      gross: 0,
      sort_order: num(t.sort_order),
    };
  }

  // Fall-through tier for tickets with no ticket_type_id (legacy data).
  const fallbackTierId = tierList[0]?.id ?? "__unassigned__";
  if (!tierMap[fallbackTierId]) {
    tierMap[fallbackTierId] = {
      tier: "Unassigned",
      capacity: 0,
      sold: 0,
      comps: 0,
      kills: 0,
      price: 0,
      ticketing_fee: 0,
      facility_fee: 0,
      gross: 0,
      sort_order: 9999,
    };
  }

  // 5. Walk every ticket — count + face-value gross per tier.
  for (const t of ticketList) {
    const tierId =
      t.ticket_type_id && tierMap[t.ticket_type_id]
        ? t.ticket_type_id
        : fallbackTierId;
    const tier = tierMap[tierId];
    if (!tier) continue;
    const order = t.order_id ? orderById[t.order_id] : undefined;
    const isComp =
      order?.source === "comp" || (order && num(order.total_amount) === 0);
    if (isComp) {
      tier.comps += 1;
    } else {
      tier.sold += 1;
      // Face-value gross = tier.price (the artist gets paid on face value;
      // promo/discounts come out of net receipts via the actual order math).
      tier.gross += tier.price;
    }
  }

  // 6. Counts: paying tickets vs comps + comp face value.
  let tickets_sold_count = 0;
  let comp_count = 0;
  let comp_face_value = 0;
  let total_paid_amount = 0; // Σ orders.total_amount for paying (non-comp) orders
  let paid_order_count = 0;  // count of non-comp paid orders (for CC formula)
  for (const o of orderList) {
    const isComp = o.source === "comp" || num(o.total_amount) === 0;
    const qty = num(o.quantity);
    if (isComp) {
      comp_count += qty;
      const compTickets = ticketList.filter((t) => t.order_id === o.id);
      for (const ct of compTickets) {
        const tierId =
          ct.ticket_type_id && tierMap[ct.ticket_type_id]
            ? ct.ticket_type_id
            : fallbackTierId;
        comp_face_value += tierMap[tierId]?.price ?? 0;
      }
    } else {
      tickets_sold_count += qty;
      total_paid_amount += num(o.total_amount);
      paid_order_count += 1;
    }
  }

  // 7. Fees + tax — derived from the EVENT/VENUE config (the user explicitly
  //    wants these "from what we've already set for that event", not editable).
  const fees = await resolveEventFees(admin, eventId);
  const ticketing_fees = fees.ticketing_fee * tickets_sold_count;
  const facility_fees = fees.facility_fee * tickets_sold_count;

  // Stamp each tier with its per-ticket fee snapshots so the audit table can
  // render Svc Fee + Fac Fee columns.
  for (const tier of Object.values(tierMap)) {
    tier.ticketing_fee = fees.ticketing_fee;
    tier.facility_fee = fees.facility_fee;
  }

  // 8. CC processing fees — derived as the RESIDUAL of:
  //      Stripe Gross  −  Face  −  Svc  −  Fac  −  Tax  =  CC Fees
  //    This guarantees the audit reconciles to Stripe's "Gross volume" line
  //    on the dashboard to the penny, no matter what the formula or per-
  //    order rounding says. `total_paid_amount` IS the Stripe Gross — it's
  //    Σ orders.total_amount for every paying (non-comp) order, which is
  //    exactly what Stripe collected.
  const stripe_gross = total_paid_amount;
  const total_face = Object.values(tierMap).reduce((s, t) => s + t.gross, 0);
  const total_svc = fees.ticketing_fee * tickets_sold_count;
  const total_fac = fees.facility_fee * tickets_sold_count;
  const total_tax_face = total_face * fees.tax_rate; // multiplier method
  const cc_fees_residual =
    stripe_gross - total_face - total_svc - total_fac - total_tax_face;
  // Don't allow negative residual; fall back to the formula in edge cases.
  let cc_fees =
    cc_fees_residual >= 0
      ? cc_fees_residual
      : stripe_gross > 0
        ? stripe_gross * 0.027 + paid_order_count * 0.3
        : 0;

  // 9. Sort and finalize
  const audit: TicketAuditRow[] = Object.values(tierMap)
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

  const total_gross = audit.reduce((s, r) => s + r.gross, 0);

  // Tax — derived from event config + gross, applying the venue tax_method.
  // Checkout adds tax on top of the face price (multiplier), so we default to
  // that. The settlement page can override per-event if a venue runs
  // tax-inclusive pricing.
  const tax_method: TaxMethod = fees.tax_method;
  const taxes =
    tax_method === "divisor" && fees.tax_rate > 0
      ? total_gross - total_gross / (1 + fees.tax_rate)
      : total_gross * fees.tax_rate;

  return {
    audit,
    total_gross: r2(total_gross),
    ticketing_fees: r2(ticketing_fees),
    facility_fees: r2(facility_fees),
    taxes: r2(taxes),
    cc_fees: r2(cc_fees),
    tickets_sold_count,
    comp_count,
    comp_face_value: r2(comp_face_value),
    ticketing_fee_per_ticket: r2(fees.ticketing_fee),
    facility_fee_per_ticket: r2(fees.facility_fee),
    tax_rate: fees.tax_rate,
    tax_method,
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
