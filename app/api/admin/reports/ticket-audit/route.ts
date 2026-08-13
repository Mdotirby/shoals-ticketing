import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { computeEventAudit } from "@/lib/settlement/audit";

/**
 * Ticket Audit Report API
 * Returns per-event ticket inventory and revenue.
 *
 * Revenue numbers come from the actual `orders` table (subtotal, fees, tax,
 * processing fees) — NOT list-price × count. This means promo-coded orders,
 * box-office overrides, and refunds reconcile against Stripe.
 *
 * Comp tickets are listed separately and excluded from gross.
 *
 * Query params:
 *   ?event_id=UUID           — single event
 *   ?venue_id=UUID&from=&to= — all events for a venue in date range
 *   ?format=csv              — return CSV instead of JSON
 */
export async function GET(request: Request) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");
  const venueId = searchParams.get("venue_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const format = searchParams.get("format");

  try {
    // 1. Fetch events
    let eventsQuery = supabase
      .from("events")
      .select("id, title, date, venue, venue_id, event_venue_id")
      .order("date", { ascending: true });

    if (eventId) eventsQuery = eventsQuery.eq("id", eventId);
    else if (venueId) eventsQuery = eventsQuery.eq("venue_id", venueId);
    if (from) eventsQuery = eventsQuery.gte("date", from);
    if (to) eventsQuery = eventsQuery.lte("date", to);

    const { data: events, error: evErr } = await eventsQuery;
    if (evErr) throw evErr;
    if (!events || events.length === 0) {
      return NextResponse.json({ events: [], grand_total: emptyTotals() });
    }

    // 2. For each event, run the same audit helper that powers settlements.
    //    This guarantees Reports → Ticket Audit and Settlements show identical
    //    numbers (no more "report says X, settlement says Y" drift).
    const grandTotal = emptyTotals();
    const eventResults = [] as Array<ReturnType<typeof buildEventResult>>;

    for (const event of events) {
      const audit = await computeEventAudit(supabase, event.id);

      // Per-row figures come straight from the audit now — fees are per
      // billing unit and card fees are allocated from real orders, so nothing
      // here needs apportioning by ticket count.
      const tierRows = audit.audit.map((row) => ({
        tier_name: row.tier,
        capacity: row.capacity,
        qty_sold: row.sold,
        comps: row.comps,
        unsold: row.unsold ?? 0,
        pct_house:
          row.capacity > 0 ? round((row.sold / row.capacity) * 100, 1) : 0,
        price: row.price,
        gross_sales: row.gross,
        ticketing_fees: round((row.ticketing_fee || 0) * row.sold, 2),
        facility_fees: round((row.facility_fee || 0) * row.sold, 2),
        tax_collected: round(row.tax ?? 0, 2),
        orders: row.orders ?? 0,
        cc_fees: round(row.cc_fees ?? 0, 2),
        // GBOR for the row — everything the buyer paid.
        total_revenue: round(row.gross_receipts ?? 0, 2),
        total_price: round(row.total_price ?? 0, 2),
      }));

      const subtotal = {
        capacity: audit.audit.reduce((s, r) => s + r.capacity, 0),
        qty_sold: audit.tickets_sold_count,
        comps: audit.comp_count,
        free: audit.free_count,
        pct_house: 0,
        unsold: audit.audit.reduce((s, r) => s + (r.unsold ?? 0), 0),
        orders: audit.audit.reduce((s, r) => s + (r.orders ?? 0), 0),
        // Face value only — what the artist splits on.
        gross_sales: audit.face_gross,
        ticketing_fees: audit.ticketing_fees,
        facility_fees: audit.facility_fees,
        tax_collected: audit.taxes,
        cc_fees: audit.cc_fees,
        // GBOR — everything the buyer paid, which is what ties to Stripe.
        total_revenue: audit.gbor,
        // What Stripe actually collected, and anything that doesn't reconcile.
        stripe_gross: audit.stripe_gross,
        variance: audit.reconciliation_variance,
      };
      subtotal.pct_house =
        subtotal.capacity > 0
          ? round((subtotal.qty_sold / subtotal.capacity) * 100, 1)
          : 0;

      grandTotal.capacity += subtotal.capacity;
      grandTotal.qty_sold += subtotal.qty_sold;
      grandTotal.comps += subtotal.comps;
      grandTotal.free += subtotal.free;
      grandTotal.unsold += subtotal.unsold;
      grandTotal.orders += subtotal.orders;
      grandTotal.gross_sales += subtotal.gross_sales;
      grandTotal.ticketing_fees += subtotal.ticketing_fees;
      grandTotal.facility_fees += subtotal.facility_fees;
      grandTotal.tax_collected += subtotal.tax_collected;
      grandTotal.cc_fees += subtotal.cc_fees;
      grandTotal.total_revenue += subtotal.total_revenue;
      grandTotal.stripe_gross += subtotal.stripe_gross;
      grandTotal.variance += subtotal.variance;

      eventResults.push(
        buildEventResult({
          event_id: event.id,
          event_title: event.title,
          event_date: event.date,
          venue_name: event.venue,
          tiers: tierRows,
          subtotal,
        })
      );
    }

    grandTotal.pct_house =
      grandTotal.capacity > 0
        ? round((grandTotal.qty_sold / grandTotal.capacity) * 100, 1)
        : 0;
    roundTotals(grandTotal);

    const result = { events: eventResults, grand_total: grandTotal };

    if (format === "csv") return csvResponse(result);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

type TierRow = {
  tier_name: string;
  capacity: number;
  qty_sold: number;
  comps: number;
  unsold: number;
  pct_house: number;
  price: number;
  gross_sales: number;
  ticketing_fees: number;
  facility_fees: number;
  tax_collected: number;
  orders: number;
  cc_fees: number;
  total_revenue: number;
  total_price: number;
};

type EventResult = {
  event_id: string;
  event_title: string;
  event_date: string;
  venue_name: string;
  tiers: TierRow[];
  subtotal: ReturnType<typeof emptyTotals>;
};

function buildEventResult(r: EventResult): EventResult {
  return r;
}

function emptyTotals() {
  return {
    capacity: 0,
    qty_sold: 0,
    comps: 0,
    free: 0,
    unsold: 0,
    orders: 0,
    pct_house: 0,
    gross_sales: 0,
    ticketing_fees: 0,
    facility_fees: 0,
    tax_collected: 0,
    cc_fees: 0,
    total_revenue: 0,
    stripe_gross: 0,
    variance: 0,
  };
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function roundTotals(t: ReturnType<typeof emptyTotals>) {
  t.gross_sales = round(t.gross_sales, 2);
  t.ticketing_fees = round(t.ticketing_fees, 2);
  t.facility_fees = round(t.facility_fees, 2);
  t.tax_collected = round(t.tax_collected, 2);
  t.cc_fees = round(t.cc_fees, 2);
  t.total_revenue = round(t.total_revenue, 2);
  t.stripe_gross = round(t.stripe_gross, 2);
  t.variance = round(t.variance, 2);
}

function csvResponse(data: {
  events: EventResult[];
  grand_total: ReturnType<typeof emptyTotals>;
}) {
  const headers = [
    "Event",
    "Tier Name",
    "Capacity",
    "Sold",
    "Comp/Guest",
    "Unsold",
    "% of House",
    "Price",
    "SVC",
    "FAC",
    "Tax",
    "Orders",
    "CC",
    "Gross (GBOR)",
    "Tot. Price",
    "Stripe Gross",
    "Variance",
  ];
  const lines = [headers.join(",")];

  for (const ev of data.events) {
    for (const tier of ev.tiers) {
      lines.push(
        [
          csvEscape(ev.event_title),
          csvEscape(tier.tier_name),
          tier.capacity,
          tier.qty_sold,
          tier.comps,
          tier.unsold,
          `${tier.pct_house}%`,
          `$${tier.price.toFixed(2)}`,
          `$${tier.ticketing_fees.toFixed(2)}`,
          `$${tier.facility_fees.toFixed(2)}`,
          `$${tier.tax_collected.toFixed(2)}`,
          tier.orders,
          `$${tier.cc_fees.toFixed(2)}`,
          `$${tier.total_revenue.toFixed(2)}`,
          `$${tier.total_price.toFixed(2)}`,
          "",
          "",
        ].join(",")
      );
    }
    const s = ev.subtotal;
    lines.push(
      [
        csvEscape(`${ev.event_title} — SUBTOTAL`),
        "",
        s.capacity,
        s.qty_sold,
        s.comps,
        s.unsold,
        `${s.pct_house}%`,
        "",
        `$${s.ticketing_fees.toFixed(2)}`,
        `$${s.facility_fees.toFixed(2)}`,
        `$${s.tax_collected.toFixed(2)}`,
        s.orders,
        `$${s.cc_fees.toFixed(2)}`,
        `$${s.total_revenue.toFixed(2)}`,
        "",
        `$${s.stripe_gross.toFixed(2)}`,
        `$${s.variance.toFixed(2)}`,
      ].join(",")
    );
  }

  const g = data.grand_total;
  lines.push(
    [
      "GRAND TOTAL",
      "",
      g.capacity,
      g.qty_sold,
      g.comps,
      g.unsold,
      `${g.pct_house}%`,
      "",
      `$${g.ticketing_fees.toFixed(2)}`,
      `$${g.facility_fees.toFixed(2)}`,
      `$${g.tax_collected.toFixed(2)}`,
      g.orders,
      `$${g.cc_fees.toFixed(2)}`,
      `$${g.total_revenue.toFixed(2)}`,
      "",
      `$${g.stripe_gross.toFixed(2)}`,
      `$${g.variance.toFixed(2)}`,
    ].join(",")
  );

  const csv = lines.join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ticket-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
