import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * Monthly Revenue Report API
 * Cross-event revenue summary with profit split calculations.
 *
 * Query params:
 *   ?venue_id=UUID&from=YYYY-MM-DD&to=YYYY-MM-DD
 *   ?format=csv
 */
export async function GET(request: Request) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const format = searchParams.get("format");

  if (!venueId) {
    return NextResponse.json({ error: "venue_id is required" }, { status: 400 });
  }

  try {
    // 1. Fetch events in range for this venue
    let eventsQuery = supabase
      .from("events")
      .select("id, title, date, venue, event_type")
      .eq("venue_id", venueId)
      .order("date", { ascending: true });

    if (from) eventsQuery = eventsQuery.gte("date", from);
    if (to) eventsQuery = eventsQuery.lte("date", to);

    const { data: events, error: evErr } = await eventsQuery;
    if (evErr) throw evErr;

    const eventIds = (events ?? []).map((e) => e.id);

    // 2. Fetch settlement ledger for these events
    let ledgerQuery = supabase
      .from("settlement_ledger")
      .select("*")
      .eq("venue_id", venueId)
      .eq("type", "sale");

    if (eventIds.length > 0) {
      ledgerQuery = ledgerQuery.in("event_id", eventIds);
    }

    const { data: ledger, error: ledErr } = await ledgerQuery;
    if (ledErr) throw ledErr;

    // 3. Aggregate revenue streams
    let totalTicketRevenue = 0;
    let totalTicketingFees = 0;
    let totalFacilityFees = 0;
    let totalTaxCollected = 0;
    let totalGross = 0;

    // Per-event breakdown
    const eventRevenue: Record<string, {
      event_title: string;
      event_date: string;
      event_type: string;
      ticket_revenue: number;
      ticketing_fees: number;
      facility_fees: number;
      tax_collected: number;
      gross: number;
    }> = {};

    for (const ev of events ?? []) {
      eventRevenue[ev.id] = {
        event_title: ev.title,
        event_date: ev.date,
        event_type: ev.event_type ?? "hard_ticket",
        ticket_revenue: 0,
        ticketing_fees: 0,
        facility_fees: 0,
        tax_collected: 0,
        gross: 0,
      };
    }

    if (ledger && ledger.length > 0) {
      for (const row of ledger) {
        const eid = row.event_id;
        const ticketRev = Number(row.ticket_revenue) || 0;
        const ticketingFee = Number(row.ticketing_fee) || 0;
        const facilityFee = Number(row.facility_fee) || 0;
        const tax = Number(row.tax_collected) || 0;
        const gross = Number(row.gross_amount) || 0;

        totalTicketRevenue += ticketRev;
        totalTicketingFees += ticketingFee;
        totalFacilityFees += facilityFee;
        totalTaxCollected += tax;
        totalGross += gross;

        if (eventRevenue[eid]) {
          eventRevenue[eid].ticket_revenue += ticketRev;
          eventRevenue[eid].ticketing_fees += ticketingFee;
          eventRevenue[eid].facility_fees += facilityFee;
          eventRevenue[eid].tax_collected += tax;
          eventRevenue[eid].gross += gross;
        }
      }
    } else if (eventIds.length > 0) {
      // Fallback: calculate revenue from orders if no settlement_ledger entries
      const { data: orders } = await supabase
        .from("orders")
        .select("id, event_id, total_amount, quantity")
        .in("event_id", eventIds)
        .eq("status", "completed");

      // Get venue fees
      const { data: venueData } = await supabase
        .from("venues")
        .select("ticketing_fee, facility_fee, tax_rate")
        .eq("id", venueId)
        .single();

      const ticketingFeeRate = Number(venueData?.ticketing_fee) || 0;
      const facilityFeeRate = Number(venueData?.facility_fee) || 0;
      const taxRate = Number(venueData?.tax_rate) || 0;

      for (const order of orders ?? []) {
        const eid = order.event_id;
        const qty = Number(order.quantity) || 1;
        const total = Number(order.total_amount) || 0;

        // Estimate breakdown from total (reverse-engineer from checkout formula)
        const ticketingFees = ticketingFeeRate * qty;
        const facilityFees = facilityFeeRate * qty;
        const ticketRev = total - ticketingFees - facilityFees;
        const taxEst = ticketRev * taxRate;
        const grossRev = ticketRev - taxEst;

        totalTicketRevenue += grossRev;
        totalTicketingFees += ticketingFees;
        totalFacilityFees += facilityFees;
        totalTaxCollected += taxEst;
        totalGross += total;

        if (eventRevenue[eid]) {
          eventRevenue[eid].ticket_revenue += grossRev;
          eventRevenue[eid].ticketing_fees += ticketingFees;
          eventRevenue[eid].facility_fees += facilityFees;
          eventRevenue[eid].tax_collected += taxEst;
          eventRevenue[eid].gross += total;
        }
      }
    }

    // 4. Fetch operational expenses
    let expQuery = supabase
      .from("operational_expenses")
      .select("*")
      .eq("venue_id", venueId);

    if (from) expQuery = expQuery.gte("expense_date", from);
    if (to) expQuery = expQuery.lte("expense_date", to);

    const { data: expenses, error: expErr } = await expQuery;
    if (expErr) throw expErr;

    let totalExpenses = 0;
    const expenseByCategory: Record<string, number> = {};
    for (const exp of expenses ?? []) {
      const amt = Number(exp.amount) || 0;
      totalExpenses += amt;
      const cat = exp.category || "other";
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + amt;
    }

    // 5. Net Profit
    const grossRevenue = r2(totalGross);
    const netProfit = r2(grossRevenue - totalExpenses);

    // 6. Revenue Share Calculation
    const BASE_GUARANTEE = 3000;
    let ownershipGuarantee = Math.min(BASE_GUARANTEE, netProfit > 0 ? BASE_GUARANTEE : 0);
    let remainingProfit = Math.max(0, netProfit - ownershipGuarantee);

    // Tiered split on remaining profit
    let managementShare = 0;
    let ownershipShare = ownershipGuarantee;
    let profitTier = "none";

    if (remainingProfit > 0) {
      // Tier 1: ≤$10K → 80/20
      const tier1 = Math.min(remainingProfit, 10000);
      managementShare += tier1 * 0.8;
      ownershipShare += tier1 * 0.2;
      remainingProfit -= tier1;
      profitTier = "tier_1";

      // Tier 2: $10K-$20K → 70/30
      if (remainingProfit > 0) {
        const tier2 = Math.min(remainingProfit, 10000);
        managementShare += tier2 * 0.7;
        ownershipShare += tier2 * 0.3;
        remainingProfit -= tier2;
        profitTier = "tier_2";
      }

      // Tier 3: >$20K → 60/40
      if (remainingProfit > 0) {
        managementShare += remainingProfit * 0.6;
        ownershipShare += remainingProfit * 0.4;
        profitTier = "tier_3";
      }
    }

    // 7. Ticketing Rebate
    const mgmtTicketingRebate = r2(totalTicketingFees * 0.5);
    const ownerRebateOfMgmt = r2(mgmtTicketingRebate * 0.05);

    // 8. Facility Fee Split
    const mgmtFacilityShare = r2(totalFacilityFees * 0.5);
    const ownerFacilityShare = r2(totalFacilityFees * 0.5);

    // 9. Totals
    const totalToManagement = r2(managementShare + mgmtTicketingRebate + mgmtFacilityShare);
    const totalToOwnership = r2(ownershipShare + ownerRebateOfMgmt + ownerFacilityShare);

    const result = {
      period: { from, to, venue_id: venueId },
      event_breakdown: Object.values(eventRevenue).map((e) => ({
        ...e,
        ticket_revenue: r2(e.ticket_revenue),
        ticketing_fees: r2(e.ticketing_fees),
        facility_fees: r2(e.facility_fees),
        tax_collected: r2(e.tax_collected),
        gross: r2(e.gross),
      })),
      revenue_streams: {
        ticket_revenue: r2(totalTicketRevenue),
        ticketing_fees: r2(totalTicketingFees),
        facility_fees: r2(totalFacilityFees),
        tax_collected: r2(totalTaxCollected),
        gross_revenue: grossRevenue,
      },
      expenses: {
        total: r2(totalExpenses),
        by_category: expenseByCategory,
      },
      profit: {
        gross_revenue: grossRevenue,
        total_expenses: r2(totalExpenses),
        net_profit: netProfit,
        profit_tier: profitTier,
      },
      revenue_share: {
        base_guarantee: BASE_GUARANTEE,
        ownership_guarantee: r2(ownershipGuarantee),
        management_share: r2(managementShare),
        ownership_share: r2(ownershipShare),
      },
      ticketing_rebate: {
        total_ticketing_fees: r2(totalTicketingFees),
        management_rebate: mgmtTicketingRebate,
        ownership_rebate_of_mgmt: ownerRebateOfMgmt,
      },
      facility_fee_split: {
        total_facility_fees: r2(totalFacilityFees),
        management_share: mgmtFacilityShare,
        ownership_share: ownerFacilityShare,
      },
      totals: {
        total_to_management: totalToManagement,
        total_to_ownership: totalToOwnership,
      },
    };

    if (format === "csv") {
      return csvResponse(result);
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function csvResponse(data: any) {
  const lines: string[] = [];

  // Section 1: Event Breakdown
  lines.push("MONTHLY REVENUE REPORT");
  lines.push(`Period: ${data.period.from ?? "All"} to ${data.period.to ?? "All"}`);
  lines.push("");
  lines.push("EVENT BREAKDOWN");
  lines.push("Event,Date,Type,Ticket Revenue,Ticketing Fees,Facility Fees,Tax Collected,Gross");

  for (const ev of data.event_breakdown) {
    lines.push(
      [
        csvEsc(ev.event_title),
        ev.event_date,
        ev.event_type,
        `$${ev.ticket_revenue.toFixed(2)}`,
        `$${ev.ticketing_fees.toFixed(2)}`,
        `$${ev.facility_fees.toFixed(2)}`,
        `$${ev.tax_collected.toFixed(2)}`,
        `$${ev.gross.toFixed(2)}`,
      ].join(",")
    );
  }

  // Section 2: Revenue Streams
  lines.push("");
  lines.push("REVENUE STREAMS");
  const rs = data.revenue_streams;
  lines.push(`Ticket Revenue,$${rs.ticket_revenue.toFixed(2)}`);
  lines.push(`Ticketing Fees,$${rs.ticketing_fees.toFixed(2)}`);
  lines.push(`Facility Fees,$${rs.facility_fees.toFixed(2)}`);
  lines.push(`Tax Collected,$${rs.tax_collected.toFixed(2)}`);
  lines.push(`Gross Revenue,$${rs.gross_revenue.toFixed(2)}`);

  // Section 3: Expenses
  lines.push("");
  lines.push("OPERATIONAL EXPENSES");
  for (const [cat, amt] of Object.entries(data.expenses.by_category)) {
    lines.push(`${cat},$${Number(amt).toFixed(2)}`);
  }
  lines.push(`Total Expenses,$${data.expenses.total.toFixed(2)}`);

  // Section 4: Profit + Split
  lines.push("");
  lines.push("PROFIT & REVENUE SHARE");
  lines.push(`Net Profit,$${data.profit.net_profit.toFixed(2)}`);
  lines.push(`Profit Tier,${data.profit.profit_tier}`);
  lines.push(`Ownership Guarantee,$${data.revenue_share.ownership_guarantee.toFixed(2)}`);
  lines.push(`Management Profit Share,$${data.revenue_share.management_share.toFixed(2)}`);
  lines.push(`Ownership Profit Share,$${data.revenue_share.ownership_share.toFixed(2)}`);

  // Section 5: Rebates
  lines.push("");
  lines.push("TICKETING REBATE");
  lines.push(`Management Rebate (50% of fees),$${data.ticketing_rebate.management_rebate.toFixed(2)}`);
  lines.push(`Ownership Rebate (5% of mgmt),$${data.ticketing_rebate.ownership_rebate_of_mgmt.toFixed(2)}`);

  lines.push("");
  lines.push("FACILITY FEE SPLIT");
  lines.push(`Management (50%),$${data.facility_fee_split.management_share.toFixed(2)}`);
  lines.push(`Ownership (50%),$${data.facility_fee_split.ownership_share.toFixed(2)}`);

  // Section 6: Final Totals
  lines.push("");
  lines.push("FINAL TOTALS");
  lines.push(`Total to Management,$${data.totals.total_to_management.toFixed(2)}`);
  lines.push(`Total to Ownership,$${data.totals.total_to_ownership.toFixed(2)}`);

  const csv = lines.join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="monthly-revenue-${data.period.from ?? "all"}-${data.period.to ?? "all"}.csv"`,
    },
  });
}

function csvEsc(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
