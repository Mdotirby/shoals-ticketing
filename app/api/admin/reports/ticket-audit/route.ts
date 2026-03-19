import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * Ticket Audit Report API
 * Returns per-event ticket inventory and revenue — ZERO customer data.
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
      .select("id, title, date, venue, venue_id, event_venue_id, facility_fee_enabled")
      .order("date", { ascending: true });

    if (eventId) {
      eventsQuery = eventsQuery.eq("id", eventId);
    } else if (venueId) {
      eventsQuery = eventsQuery.eq("venue_id", venueId);
    }
    if (from) eventsQuery = eventsQuery.gte("date", from);
    if (to) eventsQuery = eventsQuery.lte("date", to);

    const { data: events, error: evErr } = await eventsQuery;
    if (evErr) throw evErr;
    if (!events || events.length === 0) {
      return NextResponse.json({ events: [], grand_total: emptyTotals() });
    }

    const eventIds = events.map((e) => e.id);

    // 2. Fetch ticket tiers for these events
    const { data: tiers, error: tierErr } = await supabase
      .from("ticket_tiers")
      .select("*")
      .in("event_id", eventIds)
      .order("sort_order", { ascending: true });
    if (tierErr) throw tierErr;

    // 3. Fetch ticket counts grouped by tier (ticket_type_id maps to ticket_tiers.id)
    const { data: tickets, error: tickErr } = await supabase
      .from("tickets")
      .select("ticket_type_id, event_id")
      .in("event_id", eventIds);
    if (tickErr) throw tickErr;

    // Count tickets per tier
    const soldByTier: Record<string, number> = {};
    for (const t of tickets ?? []) {
      const key = t.ticket_type_id;
      soldByTier[key] = (soldByTier[key] || 0) + 1;
    }

    // 4. Fetch venue fee config + event_venues overrides
    const venueIds = [...new Set(events.map((e) => e.venue_id).filter(Boolean))];
    const { data: venues } = await supabase
      .from("venues")
      .select("id, ticketing_fee, facility_fee, tax_rate")
      .in("id", venueIds);

    const venueMap: Record<string, { ticketing_fee: number; facility_fee: number; tax_rate: number }> = {};
    for (const v of venues ?? []) {
      venueMap[v.id] = {
        ticketing_fee: Number(v.ticketing_fee) || 0,
        facility_fee: Number(v.facility_fee) || 0,
        tax_rate: Number(v.tax_rate) || 0,
      };
    }

    // Also check event_venues for per-event fee overrides
    const eventVenueIds = [...new Set(events.map((e) => e.event_venue_id).filter(Boolean))];
    const eventVenueMap: Record<string, { ticketing_fee: number; facility_fee: number; tax_rate: number }> = {};
    if (eventVenueIds.length > 0) {
      const { data: evVenues } = await supabase
        .from("event_venues")
        .select("id, ticketing_fee, facility_fee, tax_rate")
        .in("id", eventVenueIds);
      for (const ev of evVenues ?? []) {
        eventVenueMap[ev.id] = {
          ticketing_fee: Number(ev.ticketing_fee) ?? 0,
          facility_fee: Number(ev.facility_fee) ?? 0,
          tax_rate: Number(ev.tax_rate) ?? 0,
        };
      }
    }

    // 5. Also check settlement_ledger for actual fee data per event
    const { data: ledgerRows } = await supabase
      .from("settlement_ledger")
      .select("event_id, ticketing_fee, tax_collected, gross_amount")
      .in("event_id", eventIds)
      .eq("type", "sale");

    // Aggregate ledger by event
    const ledgerByEvent: Record<string, { ticketing_fees: number; tax_collected: number; gross: number }> = {};
    for (const row of ledgerRows ?? []) {
      if (!ledgerByEvent[row.event_id]) {
        ledgerByEvent[row.event_id] = { ticketing_fees: 0, tax_collected: 0, gross: 0 };
      }
      ledgerByEvent[row.event_id].ticketing_fees += Number(row.ticketing_fee) || 0;
      ledgerByEvent[row.event_id].tax_collected += Number(row.tax_collected) || 0;
      ledgerByEvent[row.event_id].gross += Number(row.gross_amount) || 0;
    }

    // 6. Build audit rows
    const grandTotal = emptyTotals();
    const eventResults = events.map((event) => {
      const eventTiers = (tiers ?? []).filter((t) => t.event_id === event.id);
      // Resolve fees: event_venues override → venues fallback
      let venueFees = venueMap[event.venue_id] ?? { ticketing_fee: 0, facility_fee: 0, tax_rate: 0 };
      if (event.event_venue_id && eventVenueMap[event.event_venue_id]) {
        const evFees = eventVenueMap[event.event_venue_id];
        venueFees = {
          ticketing_fee: evFees.ticketing_fee ?? venueFees.ticketing_fee,
          facility_fee: evFees.facility_fee ?? venueFees.facility_fee,
          tax_rate: evFees.tax_rate ?? venueFees.tax_rate,
        };
      }
      // Respect facility_fee_enabled flag
      if (event.facility_fee_enabled === false) {
        venueFees = { ...venueFees, facility_fee: 0 };
      }
      const eventSubtotal = emptyTotals();

      const rows = eventTiers.map((tier) => {
        const capacity = Number(tier.capacity) || 0;
        const qtySold = soldByTier[tier.id] || 0;
        const pctHouse = capacity > 0 ? round((qtySold / capacity) * 100, 1) : 0;
        const price = Number(tier.price) || 0;
        const grossSales = round(price * qtySold, 2);
        const ticketingFees = round(venueFees.ticketing_fee * qtySold, 2);
        const facilityFees = round(venueFees.facility_fee * qtySold, 2);
        const taxCollected = round(grossSales * venueFees.tax_rate, 2);
        const totalRevenue = round(grossSales + ticketingFees + facilityFees + taxCollected, 2);

        // Accumulate subtotals
        eventSubtotal.capacity += capacity;
        eventSubtotal.qty_sold += qtySold;
        eventSubtotal.gross_sales += grossSales;
        eventSubtotal.ticketing_fees += ticketingFees;
        eventSubtotal.facility_fees += facilityFees;
        eventSubtotal.tax_collected += taxCollected;
        eventSubtotal.total_revenue += totalRevenue;

        return {
          tier_name: tier.tier_name,
          capacity,
          qty_sold: qtySold,
          pct_house: pctHouse,
          price,
          gross_sales: grossSales,
          ticketing_fees: ticketingFees,
          facility_fees: facilityFees,
          tax_collected: taxCollected,
          total_revenue: totalRevenue,
        };
      });

      // Compute event-level pct_house
      eventSubtotal.pct_house =
        eventSubtotal.capacity > 0
          ? round((eventSubtotal.qty_sold / eventSubtotal.capacity) * 100, 1)
          : 0;

      // Round subtotals
      roundTotals(eventSubtotal);

      // Accumulate grand totals
      grandTotal.capacity += eventSubtotal.capacity;
      grandTotal.qty_sold += eventSubtotal.qty_sold;
      grandTotal.gross_sales += eventSubtotal.gross_sales;
      grandTotal.ticketing_fees += eventSubtotal.ticketing_fees;
      grandTotal.facility_fees += eventSubtotal.facility_fees;
      grandTotal.tax_collected += eventSubtotal.tax_collected;
      grandTotal.total_revenue += eventSubtotal.total_revenue;

      return {
        event_id: event.id,
        event_title: event.title,
        event_date: event.date,
        venue_name: event.venue,
        tiers: rows,
        subtotal: eventSubtotal,
      };
    });

    grandTotal.pct_house =
      grandTotal.capacity > 0
        ? round((grandTotal.qty_sold / grandTotal.capacity) * 100, 1)
        : 0;
    roundTotals(grandTotal);

    const result = { events: eventResults, grand_total: grandTotal };

    // CSV format
    if (format === "csv") {
      return csvResponse(result);
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function emptyTotals() {
  return {
    capacity: 0,
    qty_sold: 0,
    pct_house: 0,
    gross_sales: 0,
    ticketing_fees: 0,
    facility_fees: 0,
    tax_collected: 0,
    total_revenue: 0,
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
  t.total_revenue = round(t.total_revenue, 2);
}

function csvResponse(data: {
  events: Array<{
    event_title: string;
    event_date: string;
    tiers: Array<Record<string, unknown>>;
    subtotal: Record<string, number>;
  }>;
  grand_total: Record<string, number>;
}) {
  const headers = [
    "Event",
    "Tier Name",
    "Capacity",
    "Qty Sold",
    "% of House",
    "Price",
    "Gross Sales",
    "Ticketing Fees",
    "Facility Fees",
    "Tax Collected",
    "Total Revenue",
  ];
  const lines = [headers.join(",")];

  for (const ev of data.events) {
    for (const tier of ev.tiers) {
      lines.push(
        [
          csvEscape(ev.event_title),
          csvEscape(String(tier.tier_name)),
          tier.capacity,
          tier.qty_sold,
          `${tier.pct_house}%`,
          `$${Number(tier.price).toFixed(2)}`,
          `$${Number(tier.gross_sales).toFixed(2)}`,
          `$${Number(tier.ticketing_fees).toFixed(2)}`,
          `$${Number(tier.facility_fees).toFixed(2)}`,
          `$${Number(tier.tax_collected).toFixed(2)}`,
          `$${Number(tier.total_revenue).toFixed(2)}`,
        ].join(",")
      );
    }
    // Subtotal row
    const s = ev.subtotal;
    lines.push(
      [
        csvEscape(`${ev.event_title} — SUBTOTAL`),
        "",
        s.capacity,
        s.qty_sold,
        `${s.pct_house}%`,
        "",
        `$${s.gross_sales.toFixed(2)}`,
        `$${s.ticketing_fees.toFixed(2)}`,
        `$${s.facility_fees.toFixed(2)}`,
        `$${s.tax_collected.toFixed(2)}`,
        `$${s.total_revenue.toFixed(2)}`,
      ].join(",")
    );
  }

  // Grand total
  const g = data.grand_total;
  lines.push(
    [
      "GRAND TOTAL",
      "",
      g.capacity,
      g.qty_sold,
      `${g.pct_house}%`,
      "",
      `$${g.gross_sales.toFixed(2)}`,
      `$${g.ticketing_fees.toFixed(2)}`,
      `$${g.facility_fees.toFixed(2)}`,
      `$${g.tax_collected.toFixed(2)}`,
      `$${g.total_revenue.toFixed(2)}`,
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
