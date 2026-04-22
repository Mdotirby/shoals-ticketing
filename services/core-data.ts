/**
 * services/core-data.ts
 * ─────────────────────────────────────────────────────────────
 * READ-ONLY single-source-of-truth access layer.
 *
 * Both Ad Engine and Deal Lab MUST read financial facts through
 * this module. It never recomputes gross / adj_gross / net_potential /
 * splitpoint / artist_backend — those values come straight from the
 * persisted `artist_offers` row (same values the PDF / UI uses).
 *
 * If an authoritative input is missing, the helpers return
 * `{ complete: false, missing: [...] }` instead of guessing. Callers
 * must refuse to simulate / optimize in that case.
 *
 * HARD RULES (do not break):
 *   1. No writes. Service-role client is used for reads only.
 *   2. No new formulas. Only aggregation of already-persisted values.
 *   3. No fallback that fabricates numbers. If a field is null, say so.
 *   4. All callers go through here — no module may query artist_offers
 *      or settlements directly.
 */

import { createAdminClient } from "@/lib/supabase-server";

/* ──────────────────────────────────────────────────────────── */
/*  Types                                                        */
/* ──────────────────────────────────────────────────────────── */

export type TierSnapshot = {
  id: string;
  tier_name: string;
  price: number;
  capacity: number;
  sort_order: number;
  /** Actual units sold (paid/completed orders, when mappable) */
  sold?: number;
};

export type CoreEventMeta = {
  id: string;
  title: string;
  venue: string | null;
  venue_id: string | null;
  date: string;
  status: string;
  event_type: string | null;
  is_free: boolean | null;
  on_sale_at: string | null;
  capacity: number | null;
  landing_page_slug: string | null;
};

export type CoreTicketPricing = {
  source: "ticket_tiers" | "ticket_types" | "event_price_fallback" | "none";
  tiers: TierSnapshot[];
  total_capacity: number;
  avg_price: number | null;
  min_price: number | null;
  max_price: number | null;
};

export type CoreCostStructure = {
  /** The offer row used, if any */
  offer_id: string | null;
  /** Persisted fixed expense line-items (no recompute) */
  fixed_expenses: Array<{ name: string; amount: number }>;
  /** Persisted variable expense line-items (no recompute) */
  variable_expenses: Array<{ name: string; rate: number; amount: number }>;
  total_fixed: number;
  total_variable: number;
  total_expenses: number;
  guarantee: number;
  deal_type: "FLAT" | "VS" | "PLUS" | "BONUS" | null;
  backend_percentage: number | null;
  tax_rate: number | null;
  tax_method: "divisor" | "multiplier" | null;
};

export type CoreFinancials = {
  /** True when every authoritative input is present */
  complete: boolean;
  /** Which fields were missing from `artist_offers` (empty when complete) */
  missing: string[];
  /** The offer row id used as the basis for these numbers */
  offer_id: string | null;
  /** Current finalized settlement (if one exists) */
  settlement_id: string | null;

  // PROJECTED numbers (from offer row — already persisted & PDF-consistent)
  gross_potential: number | null;
  adj_gross: number | null;
  net_potential: number | null;
  total_expenses: number | null;
  splitpoint: number | null;
  artist_backend: number | null;
  pot_walkout: number | null;
  guarantee: number | null;
  deal_type: CoreCostStructure["deal_type"];
  backend_percentage: number | null;
  tax_rate: number | null;
  tax_method: CoreCostStructure["tax_method"];

  // ACTUALS (from settlement if finalized, else orders aggregate)
  actual_revenue: number;
  actual_units_sold: number;
  actual_source: "settlement" | "orders" | "none";
};

export type CoreRevenueProjections = {
  /** Per-scenario projected gross/net/units. No new formulas — uses
   *  the persisted offer totals and scales linearly by sell-through.
   *  If inputs are incomplete, `available:false`. */
  available: boolean;
  reason?: string;
  total_capacity: number;
  /** Snapshot of persisted offer totals at 100% sell-through */
  at_full_sellthrough: {
    gross_potential: number;
    adj_gross: number;
    net_potential: number;
    total_expenses: number; // includes variable portion scaled at 100%
  } | null;
  /** Linear scaling inputs for scenario engine (Deal Lab) */
  fixed_expenses_total: number;
  variable_expense_rates: Array<{ name: string; rate: number }>;
};

/* ──────────────────────────────────────────────────────────── */
/*  Internal helpers                                             */
/* ──────────────────────────────────────────────────────────── */

function n(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}
function nz(v: unknown): number {
  return n(v) ?? 0;
}

/* ──────────────────────────────────────────────────────────── */
/*  getEventMeta                                                 */
/* ──────────────────────────────────────────────────────────── */

export async function getEventMeta(event_id: string): Promise<CoreEventMeta | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("events")
    .select(
      "id,title,venue,venue_id,date,status,event_type,is_free,on_sale_at,capacity,landing_page_slug"
    )
    .eq("id", event_id)
    .maybeSingle();
  if (error || !data) return null;
  return data as CoreEventMeta;
}

/* ──────────────────────────────────────────────────────────── */
/*  getTicketPricing                                             */
/*  Mirrors the fallback order used by event-performance route   */
/*  (ticket_tiers → ticket_types → events.price)                 */
/* ──────────────────────────────────────────────────────────── */

export async function getTicketPricing(event_id: string): Promise<CoreTicketPricing> {
  const db = createAdminClient();

  // 1) ticket_tiers (canonical)
  const { data: tiers } = await db
    .from("ticket_tiers")
    .select("id,tier_name,price,capacity,sort_order")
    .eq("event_id", event_id)
    .order("sort_order", { ascending: true });

  if (tiers && tiers.length > 0) {
    const rows = tiers as Array<Record<string, unknown>>;
    const snap: TierSnapshot[] = rows.map((t) => ({
      id: String(t.id),
      tier_name: String(t.tier_name ?? ""),
      price: nz(t.price),
      capacity: nz(t.capacity),
      sort_order: nz(t.sort_order),
    }));
    return buildPricingResult("ticket_tiers", snap);
  }

  // 2) ticket_types (legacy)
  const { data: types } = await db
    .from("ticket_types")
    .select("id,name,price,quantity_available,quantity_sold,sort_order")
    .eq("event_id", event_id)
    .order("sort_order", { ascending: true });

  if (types && types.length > 0) {
    const rows = types as Array<Record<string, unknown>>;
    const snap: TierSnapshot[] = rows.map((t) => ({
      id: String(t.id),
      tier_name: String(t.name ?? ""),
      price: nz(t.price),
      capacity: nz(t.quantity_available),
      sold: nz(t.quantity_sold),
      sort_order: nz(t.sort_order),
    }));
    return buildPricingResult("ticket_types", snap);
  }

  // 3) events.price fallback (single-tier assumption, no capacity)
  const { data: ev } = await db
    .from("events")
    .select("price,capacity")
    .eq("id", event_id)
    .maybeSingle();

  if (ev && (nz((ev as Record<string, unknown>).price) > 0 || nz((ev as Record<string, unknown>).capacity) > 0)) {
    const e = ev as Record<string, unknown>;
    const snap: TierSnapshot[] = [
      {
        id: "event_default",
        tier_name: "General",
        price: nz(e.price),
        capacity: nz(e.capacity),
        sort_order: 0,
      },
    ];
    return buildPricingResult("event_price_fallback", snap);
  }

  return {
    source: "none",
    tiers: [],
    total_capacity: 0,
    avg_price: null,
    min_price: null,
    max_price: null,
  };
}

function buildPricingResult(
  source: CoreTicketPricing["source"],
  tiers: TierSnapshot[]
): CoreTicketPricing {
  const total_capacity = tiers.reduce((s, t) => s + (t.capacity || 0), 0);
  const prices = tiers.map((t) => t.price).filter((p) => p > 0);
  return {
    source,
    tiers,
    total_capacity,
    avg_price: prices.length
      ? prices.reduce((a, b) => a + b, 0) / prices.length
      : null,
    min_price: prices.length ? Math.min(...prices) : null,
    max_price: prices.length ? Math.max(...prices) : null,
  };
}

/* ──────────────────────────────────────────────────────────── */
/*  Latest authoritative offer row                               */
/* ──────────────────────────────────────────────────────────── */

async function getLatestOfferForEvent(event_id: string) {
  const db = createAdminClient();

  // Prefer an offer linked via event_id if such column exists (some
  // deployments have it) — fall back to joining via event_date + venue.
  // We query both shapes and pick whichever returns rows.
  const tryDirect = await db
    .from("artist_offers")
    .select("*")
    .eq("event_id", event_id)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (!tryDirect.error && tryDirect.data && tryDirect.data.length > 0) {
    return tryDirect.data[0] as Record<string, unknown>;
  }

  // Fall back: resolve by event_date + venue_id (artist_offers has those)
  const { data: ev } = await db
    .from("events")
    .select("date,venue_id")
    .eq("id", event_id)
    .maybeSingle();
  if (!ev) return null;

  const { data } = await db
    .from("artist_offers")
    .select("*")
    .eq("event_date", (ev as Record<string, unknown>).date)
    .eq("venue_id", (ev as Record<string, unknown>).venue_id)
    .in("status", ["accepted", "sent", "draft"])
    .order("updated_at", { ascending: false })
    .limit(1);

  if (data && data.length > 0) return data[0] as Record<string, unknown>;
  return null;
}

/* ──────────────────────────────────────────────────────────── */
/*  Latest settlement (actuals)                                  */
/* ──────────────────────────────────────────────────────────── */

async function getLatestSettlementForEvent(event_id: string) {
  const db = createAdminClient();
  const { data } = await db
    .from("settlements")
    .select("*")
    .eq("event_id", event_id)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (data && data.length > 0) return data[0] as Record<string, unknown>;
  return null;
}

/* ──────────────────────────────────────────────────────────── */
/*  Actuals from paid orders (used when no finalized settlement) */
/* ──────────────────────────────────────────────────────────── */

async function getActualsFromOrders(event_id: string) {
  const db = createAdminClient();
  const { data } = await db
    .from("orders")
    .select("quantity,total_amount,status")
    .eq("event_id", event_id)
    .in("status", ["paid", "completed"]);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return {
    revenue: rows.reduce((s, r) => s + nz(r.total_amount), 0),
    units: rows.reduce((s, r) => s + (nz(r.quantity) || 1), 0),
  };
}

/* ──────────────────────────────────────────────────────────── */
/*  getCostStructure                                             */
/* ──────────────────────────────────────────────────────────── */

export async function getCostStructure(event_id: string): Promise<CoreCostStructure> {
  const offer = await getLatestOfferForEvent(event_id);
  if (!offer) {
    return {
      offer_id: null,
      fixed_expenses: [],
      variable_expenses: [],
      total_fixed: 0,
      total_variable: 0,
      total_expenses: 0,
      guarantee: 0,
      deal_type: null,
      backend_percentage: null,
      tax_rate: null,
      tax_method: null,
    };
  }
  const fixed = Array.isArray(offer.fixed_expenses)
    ? (offer.fixed_expenses as Array<{ name: string; amount: number }>)
    : [];
  const variable = Array.isArray(offer.variable_expenses)
    ? (offer.variable_expenses as Array<{ name: string; rate: number; amount: number }>)
    : [];
  return {
    offer_id: String(offer.id),
    fixed_expenses: fixed,
    variable_expenses: variable,
    total_fixed: nz(offer.total_fixed),
    total_variable: nz(offer.total_variable),
    total_expenses: nz(offer.total_expenses),
    guarantee: nz(offer.guarantee),
    deal_type: (offer.deal_type as CoreCostStructure["deal_type"]) ?? null,
    backend_percentage: n(offer.backend_percentage),
    tax_rate: n(offer.tax_rate),
    tax_method: (offer.tax_method as CoreCostStructure["tax_method"]) ?? null,
  };
}

/* ──────────────────────────────────────────────────────────── */
/*  getEventFinancials (MAIN ENTRY POINT for Deal Lab + Ad ROAS) */
/* ──────────────────────────────────────────────────────────── */

export async function getEventFinancials(event_id: string): Promise<CoreFinancials> {
  const [offer, settlement, orderActuals] = await Promise.all([
    getLatestOfferForEvent(event_id),
    getLatestSettlementForEvent(event_id),
    getActualsFromOrders(event_id),
  ]);

  // ---- projections (from offer row; never recompute) ----
  const offerId = offer ? String(offer.id) : null;
  const missing: string[] = [];
  const req = [
    "gross_potential",
    "adj_gross",
    "net_potential",
    "total_expenses",
    "tax_rate",
  ];
  if (!offer) missing.push("artist_offers_row");
  else
    for (const k of req) {
      if (offer[k] === null || offer[k] === undefined) missing.push(k);
    }

  // ---- actuals (prefer finalized settlement) ----
  let actual_revenue = 0;
  let actual_units_sold = 0;
  let actual_source: CoreFinancials["actual_source"] = "none";

  if (settlement && settlement.status === "finalized") {
    actual_revenue = nz(settlement.total_gross);
    // Approximate units from ticket_audit array
    const audit = Array.isArray(settlement.ticket_audit)
      ? (settlement.ticket_audit as Array<Record<string, unknown>>)
      : [];
    actual_units_sold = audit.reduce((s, r) => s + nz(r.sold), 0);
    actual_source = "settlement";
  } else if (orderActuals.revenue > 0 || orderActuals.units > 0) {
    actual_revenue = orderActuals.revenue;
    actual_units_sold = orderActuals.units;
    actual_source = "orders";
  }

  return {
    complete: missing.length === 0,
    missing,
    offer_id: offerId,
    settlement_id: settlement ? String(settlement.id) : null,

    gross_potential: offer ? n(offer.gross_potential) : null,
    adj_gross: offer ? n(offer.adj_gross) : null,
    net_potential: offer ? n(offer.net_potential) : null,
    total_expenses: offer ? n(offer.total_expenses) : null,
    splitpoint: offer ? n(offer.splitpoint) : null,
    artist_backend: offer ? n(offer.artist_backend) : null,
    pot_walkout: offer ? n(offer.pot_walkout) : null,
    guarantee: offer ? n(offer.guarantee) : null,
    deal_type: offer ? ((offer.deal_type as CoreFinancials["deal_type"]) ?? null) : null,
    backend_percentage: offer ? n(offer.backend_percentage) : null,
    tax_rate: offer ? n(offer.tax_rate) : null,
    tax_method: offer ? ((offer.tax_method as CoreFinancials["tax_method"]) ?? null) : null,

    actual_revenue,
    actual_units_sold,
    actual_source,
  };
}

/* ──────────────────────────────────────────────────────────── */
/*  getRevenueProjections                                        */
/*  Returns the persisted offer totals at 100% sell-through and  */
/*  the rate inputs Deal Lab needs to scale linearly per scenario */
/* ──────────────────────────────────────────────────────────── */

export async function getRevenueProjections(event_id: string): Promise<CoreRevenueProjections> {
  const [fin, pricing, costs] = await Promise.all([
    getEventFinancials(event_id),
    getTicketPricing(event_id),
    getCostStructure(event_id),
  ]);

  if (!fin.complete || fin.offer_id === null) {
    return {
      available: false,
      reason:
        "Incomplete offer financials: " +
        (fin.missing.length ? fin.missing.join(", ") : "no offer linked"),
      total_capacity: pricing.total_capacity,
      at_full_sellthrough: null,
      fixed_expenses_total: costs.total_fixed,
      variable_expense_rates: costs.variable_expenses.map((v) => ({
        name: v.name,
        rate: Number(v.rate) || 0,
      })),
    };
  }

  return {
    available: true,
    total_capacity: pricing.total_capacity,
    at_full_sellthrough: {
      gross_potential: fin.gross_potential ?? 0,
      adj_gross: fin.adj_gross ?? 0,
      net_potential: fin.net_potential ?? 0,
      total_expenses: fin.total_expenses ?? 0,
    },
    fixed_expenses_total: costs.total_fixed,
    variable_expense_rates: costs.variable_expenses.map((v) => ({
      name: v.name,
      rate: Number(v.rate) || 0,
    })),
  };
}
