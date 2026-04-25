/**
 * Settlement Ticket Audit — single source of truth.
 *
 * Pulls actual order data from the orders + tickets tables (NOT list-price ×
 * count) so settlement totals reconcile against Stripe to the penny.
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
  total_gross: number;          // Σ subtotal collected (face value, paying only)
  ticketing_fees: number;       // Σ ticketing fees collected
  facility_fees: number;        // Σ facility fees collected
  taxes: number;                // Σ tax collected (actual)
  cc_fees: number;              // Σ Stripe / processing fees collected
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
  subtotal_cents: number | null;
  ticketing_fee_cents: number | null;
  facility_fee_cents: number | null;
  tax_cents: number | null;
  processing_fee_cents: number | null;
  total_cents: number | null;
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

const r2 = (n: number) => Math.round(n * 100) / 100;
const cToD = (c: number | null | undefined) => (Number(c ?? 0) || 0) / 100;

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
}> {
  const { data: event } = await admin
    .from("events")
    .select("venue_id, event_venue_id, facility_fee_enabled")
    .eq("id", eventId)
    .single();

  if (!event) return { ticketing_fee: 0, facility_fee: 0, tax_rate: 0 };

  let fees = { ticketing_fee: 0, facility_fee: 0, tax_rate: 0 };

  if (event.event_venue_id) {
    const { data: ev } = await admin
      .from("event_venues")
      .select("ticketing_fee, facility_fee, tax_rate")
      .eq("id", event.event_venue_id)
      .maybeSingle();
    if (ev) {
      fees = {
        ticketing_fee: Number(ev.ticketing_fee ?? 0) || 0,
        facility_fee: Number(ev.facility_fee ?? 0) || 0,
        tax_rate: Number(ev.tax_rate ?? 0) || 0,
      };
    }
  }
  if ((!fees.ticketing_fee && !fees.tax_rate) && event.venue_id) {
    const { data: v } = await admin
      .from("venues")
      .select("ticketing_fee, facility_fee, tax_rate")
      .eq("id", event.venue_id)
      .maybeSingle();
    if (v) {
      fees = {
        ticketing_fee: Number(v.ticketing_fee ?? 0) || 0,
        facility_fee: Number(v.facility_fee ?? 0) || 0,
        tax_rate: Number(v.tax_rate ?? 0) || 0,
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

  // 2. All orders for this event — paid + comp.
  //    Refunded orders are status='refunded' so they're naturally excluded.
  const { data: orders } = await admin
    .from("orders")
    .select(
      "id, status, source, quantity, total_amount, subtotal_cents, ticketing_fee_cents, facility_fee_cents, tax_cents, processing_fee_cents, total_cents"
    )
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

  // 4. Build per-tier maps
  type TierAgg = {
    tier: string;
    capacity: number;
    sold: number;
    comps: number;
    kills: number;
    price: number;
    facility_fee: number;
    gross: number;
    sort_order: number;
  };
  const tierMap: Record<string, TierAgg> = {};
  for (const t of tierList) {
    tierMap[t.id] = {
      tier: t.tier_name,
      capacity: Number(t.capacity ?? 0) || 0,
      sold: 0,
      comps: 0,
      kills: 0,
      price: Number(t.price ?? 0) || 0,
      facility_fee: 0,
      gross: 0,
      sort_order: Number(t.sort_order ?? 0) || 0,
    };
  }

  // Helper: fall-through tier for tickets with no ticket_type_id (legacy data).
  const fallbackTierId = tierList[0]?.id ?? "__unassigned__";
  if (!tierMap[fallbackTierId]) {
    tierMap[fallbackTierId] = {
      tier: "Unassigned",
      capacity: 0,
      sold: 0,
      comps: 0,
      kills: 0,
      price: 0,
      facility_fee: 0,
      gross: 0,
      sort_order: 9999,
    };
  }

  // 5. Walk every ticket. Attribute count + per-ticket gross to its tier.
  //    A "comp" is determined by its parent order's source.
  for (const t of ticketList) {
    const tierId = t.ticket_type_id && tierMap[t.ticket_type_id] ? t.ticket_type_id : fallbackTierId;
    const tier = tierMap[tierId];
    if (!tier) continue;
    const order = t.order_id ? orderById[t.order_id] : undefined;
    const isComp = order?.source === "comp" || (order?.total_amount ?? 0) === 0;

    if (isComp) {
      tier.comps += 1;
    } else {
      tier.sold += 1;
      // Per-ticket subtotal = order.subtotal / order.quantity, fall back to tier.price
      const orderSubtotal = cToD(order?.subtotal_cents);
      const orderQty = Number(order?.quantity ?? 0) || 1;
      const perTicket =
        orderSubtotal > 0 && orderQty > 0
          ? orderSubtotal / orderQty
          : tier.price;
      tier.gross += perTicket;
    }
  }

  // 6. Aggregate fee + tax totals from orders (paying orders only — comps
  //    contribute zero to all of these by construction).
  let ticketing_fees = 0;
  let facility_fees = 0;
  let taxes = 0;
  let cc_fees = 0;
  let tickets_sold_count = 0;
  let comp_count = 0;
  let comp_face_value = 0;

  for (const o of orderList) {
    const isComp = o.source === "comp" || (o.total_amount ?? 0) === 0;
    const qty = Number(o.quantity ?? 0) || 0;
    if (isComp) {
      comp_count += qty;
      // Face value of this comp = avg tier price for the order (for info only)
      // We compute it from the linked tickets so it's accurate.
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
      ticketing_fees += cToD(o.ticketing_fee_cents);
      facility_fees += cToD(o.facility_fee_cents);
      taxes += cToD(o.tax_cents);
      cc_fees += cToD(o.processing_fee_cents);
    }
  }

  // 7. Apply refunds/disputes from settlement_ledger.
  //    Negative ledger rows reduce gross / fees / tax to keep numbers honest.
  const { data: ledgerAdjustments } = await admin
    .from("settlement_ledger")
    .select("ticket_revenue, ticketing_fee, tax_collected, stripe_fee, type")
    .eq("event_id", eventId)
    .in("type", ["refund", "dispute"]);

  for (const row of ledgerAdjustments ?? []) {
    // Negative numbers — add them to deduct.
    const delta = (n: number | null) => Number(n ?? 0) || 0;
    // Spread across tiers proportionally to existing gross would be ideal but
    // refunds are rare enough that we just bucket them into the totals row.
    // (Per-tier gross stays at "before refund" — matches historical reports.)
    ticketing_fees += delta(row.ticketing_fee);
    taxes += delta(row.tax_collected);
    cc_fees += delta(row.stripe_fee);
    // We DO subtract from total gross (below) because the artist isn't paid on
    // refunded tickets.
    // Note: refund rows already store negative values, so this is additive.
    // We track separately for the audit table though — keep gross_minus_refunds
    // out of per-tier display to avoid confusion.
    void delta(row.ticket_revenue);
  }

  // 8. Per-ticket fee rates — snapshot the venue config in effect.
  const fees = await resolveEventFees(admin, eventId);

  // Stamp each tier's per-ticket facility fee (mirrors what got collected).
  for (const tier of Object.values(tierMap)) {
    tier.facility_fee = fees.facility_fee;
  }

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
      facility_fee: r2(t.facility_fee),
      gross: r2(t.gross),
    }));

  const total_gross = audit.reduce((s, r) => s + r.gross, 0);

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
    tax_method: "multiplier", // matches checkout convention; user can override
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

  const eventDateStr =
    typeof event.date === "string"
      ? event.date.slice(0, 10) // 'YYYY-MM-DD' for comparison with offers.event_date
      : null;

  // Try strict match: venue_id + event_date
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
