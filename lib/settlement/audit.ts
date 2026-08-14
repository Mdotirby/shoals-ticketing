/**
 * Settlement Ticket Audit — single source of truth.
 *
 * Pulls actual order data for the event so settlement totals reconcile
 * against Stripe.
 *
 * ── Pricing basis ────────────────────────────────────────────────────────
 * Face value, fees, and tax are sourced PER ORDER from `settlement_ledger`
 * — written at sale time, using the price/rate that was actually in force
 * then — not re-derived from `ticket_tiers.price` or `sections.price_cents`
 * as they stand TODAY.
 *
 * This audit used to reconstruct every historical ticket at today's live
 * tier price. On Drivin' N Cryin', the GA price was raised from $20 to $25
 * a few hours before doors; the audit repriced all 271 already-sold $20
 * tickets at $25, inflating the reconstructed subtotal by over $1,200. Real
 * money collected then came in UNDER that inflated subtotal, which floored
 * the CC-fee column at $0 (see the cc_fees math below) and overstated net
 * receipts feeding the artist split by a comparable amount. The ledger row
 * written at each sale doesn't have this problem — it already knows what
 * price and rate were live at that exact moment.
 *
 * Rows are grouped by (source, tier, unit price) rather than just tier, so a
 * mid-run price change — or a facility fee toggled on partway through, as
 * also happened on this same show — surfaces as its own row instead of
 * being silently averaged into history. `ticket_tiers.price` /
 * `sections.price_cents` remain the CURRENT sale-page price only; they are
 * never used to re-derive what already sold.
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
 * Each row's cc_fees / cc_fees_actual are summed directly from the real
 * per-order ledger figures (stripe_fee / stripe_fee_actual), not derived as
 * a residual against a reconstructed subtotal. The residual approach is
 * exactly what floored to $0 on DNC — any upstream reconstruction error
 * landed entirely in the card-fee line instead of being visible anywhere.
 *
 * `reconciliation_variance` still compares Stripe's real gross against what
 * the (now ledger-sourced) pricing model says it should have been — an
 * independent check that should read ~$0 once this is right, and is
 * persisted on the settlement so a future mismatch shows as a visible
 * warning instead of vanishing the way this one did.
 *
 * Data sources:
 *   • orders            — paid / comp / free purchases
 *   • tickets           — per-tier counts (general admission events)
 *   • ticket_tiers      — capacity (general admission events)
 *   • sections + seats  — capacity (reserved seating events)
 *   • settlement_ledger — per-order face/fee/tax/card breakdown, PRIMARY
 *                         source for every dollar figure in this audit
 *   • venues / event_venues — per-event fee + tax config (current values —
 *                         used only for CURRENT-price display, never to
 *                         reprice historical orders)
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
  /** GROSS BOX OFFICE RECEIPTS — everything the buyer paid. Ties to Stripe. */
  gbor: number;
  /** The artist's face value: total_gross − ticketing_fees − facility_fees. */
  face_gross: number;
  ticketing_fees: number;       // Σ ticketing fee actually charged, per order
  facility_fees: number;        // Σ facility fee actually charged, per order
  taxes: number;                // Σ tax actually collected, per order
  /** Card surcharge the BUYERS paid — Σ real per-order ledger figures. */
  cc_fees: number;
  /** What Stripe actually kept, from balance transactions where recorded. */
  cc_fees_actual: number;
  /**
   * cc_fees − cc_fees_actual. Negative means the platform absorbed the
   * difference: charging a percentage of the SUBTOTAL can never recover
   * Stripe's cut of the grossed-up TOTAL. Flip surcharge_mode to "gross_up"
   * in the rate card to drive this to ~zero.
   */
  cc_variance: number;
  /** Where cc_fees_actual came from, so the UI can flag incomplete coverage. */
  cc_fees_source: "ledger" | "estimated" | "mixed";
  /** Σ orders.total_amount for paying orders — what Stripe actually collected. */
  stripe_gross: number;
  /**
   * stripe_gross − what the ledger-sourced figures say it should have been.
   * Should be ~$0. Anything else is a real discrepancy — an order that
   * bypassed the fee math, a missing ledger row, a refund not reflected here.
   */
  reconciliation_variance: number;
  tickets_sold_count: number;   // paying admissions
  /** Billing units actually charged — tables count once, not once per seat. */
  billing_unit_count: number;
  comp_count: number;           // true comps (orders.source = 'comp')
  comp_face_value: number;      // would-be price of comps (excluded from gross)
  /** $0 orders that are NOT comps — free events and 100%-off promo codes. */
  free_count: number;
  ticketing_fee_per_ticket: number; // snapshot of CURRENT per-unit rate (display only)
  facility_fee_per_ticket: number;  // snapshot of CURRENT per-unit rate (display only)
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
  /** Face value backed out of the real charge at sale time — the authoritative
   *  per-order price, independent of what ticket_tiers.price says today. */
  ticket_revenue?: number | string | null;
  ticketing_fee?: number | string | null;
  facility_fee?: number | string | null;
  tax_collected?: number | string | null;
  /** What we surcharged the buyer, computed at sale time from the rate/price
   *  actually in force then. */
  stripe_fee: number | string | null;
  /** What Stripe actually deducted, from the charge's balance transaction. */
  stripe_fee_actual?: number | string | null;
  type: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (n: unknown) => Number(n ?? 0) || 0;

/**
 * Pull the canonical fee/tax config that was in effect for the event.
 * Mirrors checkout's resolution order: event_venues override → venues fallback,
 * with respect for facility_fee_enabled.
 *
 * NOTE: this is the CURRENT config, used only for display fields
 * (ticketing_fee_per_ticket / facility_fee_per_ticket / tax_rate snapshots)
 * and for fees_included_in_price / tax_method, which don't vary per order the
 * way price and fee amounts can. It is never used to reprice a historical
 * order — that always comes from the ledger.
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
    unitPrice: number;       // dollars per billing unit, CURRENT price
    /** Distinct paying orders that bought into this section. */
    orders: number;
  }>;
  billingUnits: number;
  /**
   * Billing units per (order, section), so the caller can split each order's
   * REAL card surcharge across the sections it touched. Card fees are charged
   * per order, so they can't be apportioned by ticket count.
   */
  unitsByOrderSection: Map<string, Map<string, number>>;
};

/**
 * Capacity + which sections real orders touched, straight from the seat map.
 * Returns null when the event has no enabled layout — caller falls back to
 * tier-based capacity.
 *
 * Face VALUE is deliberately not read from `sections.price_cents` here
 * anymore — that's today's price, and a section's price can change mid-run
 * the same way a GA tier's can. Real face value comes from the ledger, per
 * order, in computeEventAudit below. This function is now capacity/mapping
 * only: which seats exist, which are sold, and which order+section each
 * sold seat belongs to.
 *
 * A `sells_as_table` section is billed once per table object: eleven 8-top
 * tables is 11 billing units, NOT 88. `objects.metadata.hidden` sections stay
 * excluded from capacity for the same reason checkout excludes them.
 */
async function seatBasisForEvent(
  admin: SupabaseClient,
  eventId: string,
  /** Orders that actually paid. A seat marked `sold` whose order is a comp — or
   *  which has no order at all — is a house seat: it occupies inventory but no
   *  money changed hands, so it must not contribute face value. A single
   *  comped $800 VIP table was adding $800 of revenue nobody paid. */
  payingOrderIds: Set<string>
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
    .select("id, section_id, status, object_id, order_id")
    .in("section_id", sectionIds);
  type SeatRow = {
    id: string;
    section_id: string;
    status: string;
    object_id: string | null;
    order_id: string | null;
  };
  // A seat only counts as sold if a PAYING order stands behind it. Re-label
  // anything else as "house" so it still occupies capacity — the room really
  // is full — without contributing face value nobody paid.
  const seats: SeatRow[] = ((seatRows ?? []) as SeatRow[]).map((s) => ({
    ...s,
    status:
      s.status === "sold" && !(s.order_id && payingOrderIds.has(s.order_id))
        ? "house"
        : s.status,
  }));

  const out: SeatBasis = {
    rows: [],
    billingUnits: 0,
    unitsByOrderSection: new Map(),
  };

  const bump = (orderId: string, secName: string) => {
    const perSection =
      out.unitsByOrderSection.get(orderId) ?? new Map<string, number>();
    perSection.set(secName, (perSection.get(secName) ?? 0) + 1);
    out.unitsByOrderSection.set(orderId, perSection);
  };

  for (const sec of sectionRows) {
    const isTable = !!sec.sells_as_table || sec.type === "table";
    const secSeats = seats.filter((s) => s.section_id === sec.id);
    if (secSeats.length === 0) continue;

    const unitPrice = num(sec.price_cents) / 100;
    const ordersHere = new Set<string>();
    let capacityUnits: number;
    let soldUnits: number;

    if (isTable) {
      // One billing unit per table object.
      const allObjects = new Set(
        secSeats.map((s) => s.object_id).filter(Boolean) as string[]
      );
      const soldObjects = new Map<string, string | null>(); // objectId → orderId
      for (const s of secSeats) {
        if (s.status !== "sold" || !s.object_id) continue;
        if (!soldObjects.has(s.object_id)) soldObjects.set(s.object_id, s.order_id);
      }
      capacityUnits = allObjects.size;
      soldUnits = soldObjects.size;
      for (const orderId of soldObjects.values()) {
        if (!orderId) continue;
        ordersHere.add(orderId);
        bump(orderId, sec.name);
      }
    } else {
      capacityUnits = secSeats.length;
      const sold = secSeats.filter((s) => s.status === "sold");
      soldUnits = sold.length;
      for (const s of sold) {
        if (!s.order_id) continue;
        ordersHere.add(s.order_id);
        bump(s.order_id, sec.name);
      }
    }

    if (capacityUnits === 0) continue;
    out.rows.push({
      name: sec.name,
      capacityUnits,
      soldUnits,
      unitPrice,
      orders: ordersHere.size,
    });
    out.billingUnits += soldUnits;
  }

  return out.rows.length > 0 ? out : null;
}

type Agg = {
  source: "online" | "terminal" | "cash";
  tier: string;
  /** Grouping key for capacity attribution — tier id (GA) or section name
   *  (seated). NOT displayed; two tiers can share a display name (as
   *  happened on DNC) and must keep separate capacity. */
  capacityKey: string;
  capacity: number;
  sold: number;
  comps: number;
  kills: number;
  price: number;         // unit face value for THIS row (this source+price bucket)
  /** Σ real ticketing-fee dollars actually charged, this row — accumulated
   *  from each order's own ledger record, NOT current-rate × sold. A rate
   *  changing (like DNC's facility fee toggling on mid-run) doesn't move
   *  the face price, so it wouldn't split into its own price-bucket row —
   *  accumulating the real total is what keeps it correct regardless. */
  ticketing_fee: number;
  /** Σ real facility-fee dollars actually charged, this row. Same reasoning. */
  facility_fee: number;
  gross: number;         // Σ face value, this row
  tax: number;            // Σ tax actually collected, this row
  sort_order: number;
  orders: number;
  cc_fees: number;
  cc_fees_actual: number;
};

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
  const isCashOrder = (o: OrderRow | undefined) => o?.source === "cash";
  const isFreeOrder = (o: OrderRow | undefined) =>
    !!o && o.source !== "comp" && o.source !== "cash" && num(o.total_amount) === 0;
  const rowSource = (o: OrderRow | undefined): "online" | "terminal" | "cash" =>
    o?.source === "terminal" ? "terminal" : o?.source === "cash" ? "cash" : "online";

  let stripe_gross = 0;
  let comp_count = 0;
  let free_count = 0;
  // Real money, ties to the Stripe deposit — cash is deliberately excluded:
  // it never touches Stripe, so it has nothing to reconcile against and
  // would otherwise corrupt reconciliation_variance's whole premise.
  const payingOrderIds: string[] = [];
  // Cash orders still get real tier/money rows (see step 5) — they just skip
  // the Stripe-gross/reconciliation and Stripe-cost estimate machinery below,
  // since neither applies to money that never went through a card.
  const cashOrderIds: string[] = [];

  for (const o of orderList) {
    const qty = num(o.quantity);
    if (isCompOrder(o)) {
      comp_count += qty;
    } else if (isCashOrder(o)) {
      cashOrderIds.push(o.id);
    } else if (isFreeOrder(o)) {
      free_count += qty;
    } else {
      stripe_gross += num(o.total_amount);
      payingOrderIds.push(o.id);
    }
  }

  // ── 2. Tickets (tier/section attribution + comp face value) ──────────────
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

  // Comp face value is always CURRENT tier price — a comp has no charge to
  // back a historical price out of.
  let comp_face_value = 0;
  for (const t of ticketList) {
    const order = t.order_id ? orderById[t.order_id] : undefined;
    if (!isCompOrder(order)) continue;
    const tier = t.ticket_type_id ? tierById[t.ticket_type_id] : undefined;
    comp_face_value += num(tier?.price ?? tierList[0]?.price);
  }

  // ── 4. Ledger — the authoritative per-order money, fetched once up front
  // so face value, fees, and tax can be sourced from it below instead of
  // reconstructed from today's live price. ─────────────────────────────────
  const ledgerByOrder = new Map<string, LedgerRow>();
  // Cash orders live in cashOrderIds, not payingOrderIds (step 1) — an event
  // with cash sales but no online/terminal ones would otherwise skip this
  // fetch entirely and every cash order would fall through to the
  // fee-reconstruction fallback below, exactly the wrong thing for money
  // that was already written to the ledger as real zeros.
  if (payingOrderIds.length > 0 || cashOrderIds.length > 0) {
    const { data: ledger } = await admin
      .from("settlement_ledger")
      .select(
        "order_id, ticket_revenue, ticketing_fee, facility_fee, tax_collected, stripe_fee, stripe_fee_actual, type"
      )
      .eq("event_id", eventId)
      .eq("type", "sale");
    for (const l of (ledger ?? []) as LedgerRow[]) {
      if (l.order_id) ledgerByOrder.set(l.order_id, l);
    }
  }

  // Per-order real (or, failing that, estimated) Stripe cost — independent of
  // what we charged the buyer. Used for cc_fees_actual on every row.
  const actualByOrder = new Map<string, number>();
  let ledgerCovered = 0;
  for (const id of payingOrderIds) {
    const row = ledgerByOrder.get(id);
    const recorded = row?.stripe_fee_actual;
    if (recorded != null && num(recorded) > 0) {
      actualByOrder.set(id, num(recorded));
      ledgerCovered += 1;
    } else {
      const total = num(orderById[id]?.total_amount);
      // payingOrderIds never contains a cash order (step 1 routes those into
      // cashOrderIds instead), so this is always "online" or "terminal".
      const method = rowSource(orderById[id]) as "online" | "terminal";
      actualByOrder.set(
        id,
        estimatedStripeCostCents(Math.round(total * 100), method) / 100
      );
    }
  }
  const cc_fees_source: AuditTotals["cc_fees_source"] =
    payingOrderIds.length === 0 || ledgerCovered === payingOrderIds.length
      ? "ledger"
      : ledgerCovered === 0
        ? "estimated"
        : "mixed";

  /**
   * One order's real money, ledger-first. Falls back to reconstructing from
   * total_amount at CURRENT rates only when an order somehow has no ledger
   * row — should not happen (the webhook write is the only path that creates
   * an order, and always writes one), but keeps the audit from silently
   * dropping money if a write ever failed and hasn't been backfilled yet.
   */
  function orderMoney(orderId: string, units: number) {
    const order = orderById[orderId];
    const ledger = ledgerByOrder.get(orderId);
    if (ledger) {
      return {
        ticketRevenue: num(ledger.ticket_revenue),
        ticketingFee: num(ledger.ticketing_fee),
        facilityFee: num(ledger.facility_fee),
        taxCollected: num(ledger.tax_collected),
        ccCollected: num(ledger.stripe_fee),
        ccActual: actualByOrder.get(orderId) ?? 0,
      };
    }
    const total = Math.max(0, num(order?.total_amount));
    const surcharge = fees.fees_included_in_price
      ? 0
      : actualByOrder.get(orderId) ?? 0; // best available estimate, no ledger to read the real surcharge from
    const afterCard = total - surcharge;
    const afterFees = afterCard - (fees.ticketing_fee + fees.facility_fee) * units;
    const ticketRevenue =
      fees.tax_method === "divisor"
        ? Math.max(0, afterFees)
        : Math.max(0, afterFees) / (1 + fees.tax_rate);
    return {
      ticketRevenue,
      ticketingFee: fees.ticketing_fee * units,
      facilityFee: fees.facility_fee * units,
      taxCollected:
        fees.tax_method === "divisor"
          ? afterFees - ticketRevenue
          : ticketRevenue * fees.tax_rate,
      ccCollected: surcharge,
      ccActual: actualByOrder.get(orderId) ?? 0,
    };
  }

  // ── 5. Face value + rows ──────────────────────────────────────────────────
  // Seats/sections win capacity when the event has an enabled layout — that
  // IS the real inventory. Tiers are the general-admission fallback. Either
  // way, every dollar figure now comes from orderMoney() above, grouped by
  // (source, tier/section, unit price) so a mid-run price change becomes its
  // own row instead of quietly repricing history.
  const seatBasis = await seatBasisForEvent(admin, eventId, new Set(payingOrderIds));
  const pricing_basis: "seats" | "tiers" = seatBasis ? "seats" : "tiers";

  const aggs = new Map<string, Agg>();
  // Grouping tolerance for "same price point" — deliberately coarse (nearest
  // dollar), not exact-cent. Per-order face value is backed out of a real
  // charge whose surcharge and tax each round to the cent at the ORDER
  // level, then gets divided by quantity — so two orders selling the exact
  // same $20 ticket can legitimately back out to $19.95 and $20.02 a few
  // cents apart depending on order size. Grouping on the exact cent turns
  // one real price into eight near-duplicate rows. A real price change
  // (like DNC's $20->$25) is always dollars apart, never cents, so nearest-
  // dollar tolerance still splits it into its own row while absorbing the
  // rounding noise. The displayed price for a bucket is its true blended
  // average (gross/sold), not this rounded key, so display stays precise.
  const priceKey = (n: number) => Math.round(n);

  function addRow(
    key: string,
    init: Omit<
      Agg,
      "sold" | "comps" | "gross" | "tax" | "orders" | "cc_fees" | "cc_fees_actual" | "ticketing_fee" | "facility_fee"
    >
  ): Agg {
    let row = aggs.get(key);
    if (!row) {
      row = {
        ...init,
        sold: 0, comps: 0, gross: 0, tax: 0, orders: 0, cc_fees: 0, cc_fees_actual: 0,
        ticketing_fee: 0, facility_fee: 0,
      };
      aggs.set(key, row);
    }
    return row;
  }

  let billing_unit_count = 0;
  let tickets_sold_count = 0;

  if (seatBasis) {
    // Real seated/table sales — always source='online', since the box office
    // / Terminal flow has no seat picker and never assigns a real seat.
    const seatedOrderIds = new Set(seatBasis.unitsByOrderSection.keys());
    for (const [orderId, perSection] of seatBasis.unitsByOrderSection) {
      const order = orderById[orderId];
      if (!order) continue;
      const money = orderMoney(orderId, [...perSection.values()].reduce((s, u) => s + u, 0));
      const totalUnits = [...perSection.values()].reduce((s, u) => s + u, 0) || 1;
      // A single order can span multiple sections (rare, but possible) —
      // split its ledger totals across sections by unit share.
      for (const [secName, units] of perSection) {
        const share = units / totalUnits;
        const secRow = seatBasis.rows.find((r) => r.name === secName);
        const unitPrice = units > 0 ? (money.ticketRevenue * share) / units : 0;
        const key = `online::${secName}::${priceKey(unitPrice)}`;
        const row = addRow(key, {
          source: "online",
          tier: secName,
          capacityKey: secName,
          capacity: secRow?.capacityUnits ?? 0,
          kills: 0,
          price: unitPrice,
          sort_order: 0,
        });
        row.sold += units;
        row.orders += 1;
        row.gross += money.ticketRevenue * share;
        row.tax += money.taxCollected * share;
        row.ticketing_fee += money.ticketingFee * share;
        row.facility_fee += money.facilityFee * share;
        row.cc_fees += money.ccCollected * share;
        row.cc_fees_actual += money.ccActual * share;
      }
    }
    // Admissions ≠ billing units on a table event: 11 tables seat 88 people.
    tickets_sold_count = ticketList.filter(
      (t) => !isCompOrder(t.order_id ? orderById[t.order_id] : undefined)
    ).length;

    // ── Paid orders with no seats attached ──────────────────────────────
    // The box office / Terminal / cash flow sells by tier and quantity with
    // no seat picker, so a sale taken at the door on a seated event has no
    // seats to price from — fall back to tier attribution, same as GA.
    const orphanOrderIds = [
      ...payingOrderIds,
      ...cashOrderIds,
      ...orderList.filter(isFreeOrder).map((o) => o.id),
    ].filter((id) => !seatedOrderIds.has(id));

    for (const orderId of orphanOrderIds) {
      const order = orderById[orderId];
      const orderTickets = ticketList.filter((t) => t.order_id === orderId);
      const units = orderTickets.length || num(order?.quantity) || 1;
      const tier = orderTickets[0]?.ticket_type_id
        ? tierById[orderTickets[0].ticket_type_id!]
        : undefined;
      const money = orderMoney(orderId, units);
      const unitPrice = units > 0 ? money.ticketRevenue / units : 0;
      const label = tier?.tier_name ?? "Door / Box Office";
      const capacityKey = tier?.id ?? "__door__";
      const key = `${rowSource(order)}::${capacityKey}::${priceKey(unitPrice)}`;
      const row = addRow(key, {
        source: rowSource(order),
        tier: label,
        capacityKey,
        capacity: 0, // attributed once at final assembly, see below
        kills: 0,
        price: unitPrice,
        sort_order: 9998,
      });
      row.sold += units;
      row.orders += 1;
      row.gross += money.ticketRevenue;
      row.tax += money.taxCollected;
      row.ticketing_fee += money.ticketingFee;
      row.facility_fee += money.facilityFee;
      row.cc_fees += money.ccCollected;
      row.cc_fees_actual += money.ccActual;
      billing_unit_count += units;
    }
    billing_unit_count += seatBasis.billingUnits;
  } else {
    // ── General admission (tiers) ───────────────────────────────────────
    const fallbackTierId = tierList[0]?.id ?? "__unassigned__";
    const nonCompOrders = orderList.filter((o) => !isCompOrder(o));

    for (const order of nonCompOrders) {
      const orderTickets = ticketList.filter((t) => t.order_id === order.id);
      const units = orderTickets.length || num(order.quantity) || 1;
      const tierId =
        orderTickets[0]?.ticket_type_id && tierById[orderTickets[0].ticket_type_id!]
          ? orderTickets[0].ticket_type_id!
          : fallbackTierId;
      const tier = tierById[tierId];
      const label = tier?.tier_name ?? "Unassigned";

      const isFree = isFreeOrder(order);
      const money = isFree
        ? { ticketRevenue: 0, ticketingFee: 0, facilityFee: 0, taxCollected: 0, ccCollected: 0, ccActual: 0 }
        : orderMoney(order.id, units);
      const unitPrice = isFree || units === 0 ? 0 : money.ticketRevenue / units;

      const key = `${rowSource(order)}::${tierId}::${priceKey(unitPrice)}`;
      const row = addRow(key, {
        source: rowSource(order),
        tier: label,
        capacityKey: tierId,
        capacity: 0, // attributed once at final assembly, see below
        kills: 0,
        price: unitPrice,
        sort_order: num(tier?.sort_order ?? 9999),
      });
      row.sold += units;
      row.orders += 1;
      row.gross += money.ticketRevenue;
      row.tax += money.taxCollected;
      row.ticketing_fee += money.ticketingFee;
      row.facility_fee += money.facilityFee;
      row.cc_fees += money.ccCollected;
      row.cc_fees_actual += money.ccActual;
      billing_unit_count += units;
    }

    tickets_sold_count = [...aggs.values()].reduce((s, r) => s + r.sold, 0);
  }

  // ── 6. Capacity + comps ───────────────────────────────────────────────────
  // Capacity is one pooled number per tier/section shared across every
  // source and price bucket that sells into it — attributing it to every row
  // would triple-count a tier that split into three price buckets. It's
  // assigned once, to that capacityKey's first row in sort order; every
  // other row of the same tier carries capacity 0 (and is excluded from
  // unsold) so a naive column sum still gives the right total.
  const rows = [...aggs.values()];
  const capacityByKey = new Map<string, number>();
  if (seatBasis) {
    for (const r of seatBasis.rows) capacityByKey.set(r.name, r.capacityUnits);
  } else {
    for (const t of tierList) capacityByKey.set(t.id, num(t.capacity));
  }
  const compsByKey = new Map<string, number>();
  for (const t of ticketList) {
    const order = t.order_id ? orderById[t.order_id] : undefined;
    if (!isCompOrder(order)) continue;
    const key = seatBasis
      ? undefined // seated comps have no seat, so no section to attribute to
      : (t.ticket_type_id && tierById[t.ticket_type_id] ? t.ticket_type_id : tierList[0]?.id);
    if (!key) continue;
    compsByKey.set(key, (compsByKey.get(key) ?? 0) + 1);
    comp_count += 0; // comp_count already tallied from orders above; this map is per-row attribution only
  }

  rows.sort((a, b) => a.sort_order - b.sort_order || a.price - b.price || a.source.localeCompare(b.source));
  const seenCapacityKey = new Set<string>();
  for (const row of rows) {
    if (seenCapacityKey.has(row.capacityKey)) continue;
    seenCapacityKey.add(row.capacityKey);
    row.capacity = capacityByKey.get(row.capacityKey) ?? 0;
    row.comps = compsByKey.get(row.capacityKey) ?? 0;
  }
  // Tiers with capacity/comps but zero sales across every price bucket never
  // got a row above (nothing to key off of) — add one so unsold inventory
  // still shows.
  if (!seatBasis) {
    for (const t of tierList) {
      if (seenCapacityKey.has(t.id)) continue;
      const comps = compsByKey.get(t.id) ?? 0;
      if (num(t.capacity) === 0 && comps === 0) continue;
      rows.push({
        source: "online",
        tier: t.tier_name,
        capacityKey: t.id,
        capacity: num(t.capacity),
        sold: 0,
        comps,
        kills: 0,
        price: num(t.price),
        ticketing_fee: 0,
        facility_fee: 0,
        gross: 0,
        tax: 0,
        sort_order: num(t.sort_order),
        orders: 0,
        cc_fees: 0,
        cc_fees_actual: 0,
      });
      seenCapacityKey.add(t.id);
    }
    rows.sort((a, b) => a.sort_order - b.sort_order || a.price - b.price || a.source.localeCompare(b.source));
  }

  // ── 7. Event-level totals — summed straight from the rows, which are
  // themselves summed straight from real per-order ledger figures. Note
  // ticketing_fee/facility_fee on each row are already real dollar totals
  // (accumulated per order above), not a rate — no `* r.sold` here, that
  // would be the same "rate × count instead of the real total" mistake this
  // whole rewrite exists to eliminate, just for fees instead of price. ────
  const face_gross = rows.reduce((s, r) => s + r.gross, 0);
  const ticketing_fees = rows.reduce((s, r) => s + r.ticketing_fee, 0);
  const facility_fees = rows.reduce((s, r) => s + r.facility_fee, 0);
  const taxes = rows.reduce((s, r) => s + r.tax, 0);
  const cc_fees = fees.fees_included_in_price ? 0 : rows.reduce((s, r) => s + r.cc_fees, 0);
  const cc_fees_actual = rows.reduce((s, r) => s + r.cc_fees_actual, 0);

  const tax_method: TaxMethod = fees.tax_method;
  const total_gross = fees.fees_included_in_price
    ? face_gross
    : face_gross + ticketing_fees + facility_fees;
  // fees_included_in_price: the venue absorbs cc_fees_actual out of the
  // sticker price, so the artist's face value is net of it. Otherwise face
  // value is the price itself — the surcharge was collected on top and never
  // touched the split base.
  const artist_face = fees.fees_included_in_price
    ? face_gross - ticketing_fees - facility_fees - cc_fees_actual - taxes
    : face_gross;

  // ── 8. Reconciliation ────────────────────────────────────────────────────
  // What the ledger-sourced figures say Stripe should have collected, against
  // what Stripe actually collected. Should read ~$0 now that every figure is
  // sourced per-order instead of reconstructed from today's live price.
  //
  // Cash rows are deliberately excluded here (stripe_gross already excludes
  // them too, see step 1) — they never touched Stripe, so comparing them
  // against a Stripe deposit isn't a reconciliation, it's a guaranteed false
  // mismatch equal to whatever cash came in. face_gross/artist_face above
  // still include cash, correctly, for the actual settlement math (NBOR etc.)
  // that consumes AuditTotals.face_gross — only this specific comparison
  // needs to carve it back out.
  const cashFaceGross = rows
    .filter((r) => r.source === "cash")
    .reduce((s, r) => s + r.gross, 0);
  const subtotalCollected =
    artist_face - cashFaceGross + ticketing_fees + facility_fees + taxes + cc_fees;
  const reconciliation_variance = stripe_gross - subtotalCollected;

  const audit: TicketAuditRow[] = rows
    .filter((t) => t.capacity > 0 || t.sold > 0 || t.comps > 0)
    .map((t) => ({
      source: t.source,
      tier: t.tier,
      capacity: t.capacity,
      sold: t.sold,
      comps: t.comps,
      kills: t.kills,
      // The true blended average for whatever landed in this bucket, not
      // t.price (which is only ever the first order's noisy per-unit value
      // — later orders merging into the same nearest-dollar bucket don't
      // update it). Averaging across every real order in the bucket is what
      // actually cancels the per-order rounding noise out.
      price: r2(t.sold > 0 ? t.gross / t.sold : t.price),
      // Display as a per-unit rate — t.ticketing_fee/facility_fee are real
      // accumulated dollar totals, not a rate; divide back down for the
      // column. Empty rows (sold=0, capacity-only) have no real dollars to
      // derive a rate from, so they fall back to today's current rate as an
      // informational placeholder.
      ticketing_fee: r2(t.sold > 0 ? t.ticketing_fee / t.sold : fees.ticketing_fee),
      facility_fee: r2(t.sold > 0 ? t.facility_fee / t.sold : fees.facility_fee),
      gross: r2(t.gross),
      orders: t.orders,
      cc_fees: r2(t.cc_fees),
      cc_fees_actual: r2(t.cc_fees_actual),
      unsold: Math.max(0, t.capacity - t.sold - t.comps),
      tax: r2(t.tax),
      gross_receipts: r2(t.gross + t.ticketing_fee + t.facility_fee + t.tax + t.cc_fees),
      total_price: t.sold > 0
        ? r2((t.gross + t.ticketing_fee + t.facility_fee + t.tax + t.cc_fees) / t.sold)
        : 0,
    }));

  return {
    audit,
    total_gross: r2(total_gross),
    gbor: r2(total_gross + (tax_method === "divisor" ? 0 : taxes) + cc_fees),
    face_gross: r2(artist_face),
    ticketing_fees: r2(ticketing_fees),
    facility_fees: r2(facility_fees),
    taxes: r2(taxes),
    cc_fees: r2(cc_fees),
    cc_fees_actual: r2(cc_fees_actual),
    cc_variance: r2(cc_fees - cc_fees_actual),
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
