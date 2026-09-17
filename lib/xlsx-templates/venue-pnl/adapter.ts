import type { PnlVenue } from "@/lib/reports/venue-pnl";

/**
 * PnlVenue -> the flat field map venue-pnl/manifest.json's cells expect.
 *
 * Pure placement and labelling: every figure arrives already computed by
 * lib/reports/venue-pnl.ts, which in turn reads computeEventAudit() and the
 * settlements. Nothing here re-derives money, the same rule the offer and
 * settlement adapters follow.
 */

export type VenuePnlData = {
  venue_name: string;
  period_label: string;
  generated_label: string;
  show_count: number;

  shows: {
    date_label: string;
    title: string;
    tickets_sold: number;
    face_value: number;
    service_fees: number;
    facility_fees: number;
    card_fees_collected: number;
    sales_tax_collected: number;
    revenue_total: number;
    artist_payout: number;
    expenses_total: number;
    net: number;
  }[];

  totals_tickets: number;
  totals_face_value: number;
  totals_service_fees: number;
  totals_facility_fees: number;
  totals_card_fees: number;
  totals_sales_tax: number;
  totals_revenue: number;
  totals_artist: number;
  totals_expenses: number;
  totals_net: number;

  rev_face_value: number;
  rev_door_cash: number;
  rev_service_fees: number;
  rev_facility_fees: number;
  rev_card_fees: number;
  rev_sales_tax: number;
  rev_merch: number;
  rev_total: number;

  exp_artist: number;
  exp_sales_tax: number;
  exp_card_processing: number;
  expense_lines: { name: string; amount: number }[];
  exp_unitemized: number;
  exp_total: number;

  net_profit: number;
};

/** Date-only strings need noon local so a show doesn't slip a day in US zones. */
function showDate(d: string): string {
  if (!d) return "";
  const parsed =
    d.length === 10 && d[4] === "-" ? new Date(`${d}T12:00:00`) : new Date(d);
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function periodLabel(from?: string | null, to?: string | null): string {
  if (from && to) return `${showDate(from)} — ${showDate(to)}`;
  if (from) return `${showDate(from)} onward`;
  if (to) return `through ${showDate(to)}`;
  return "All dates";
}

export function buildVenuePnlData(
  venue: PnlVenue,
  range: { from?: string | null; to?: string | null } = {}
): VenuePnlData {
  const t = venue.totals;

  return {
    venue_name: venue.event_venue_name,
    period_label: periodLabel(range.from, range.to),
    generated_label: new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    show_count: venue.shows.length,

    shows: venue.shows.map((s) => ({
      date_label: showDate(s.date),
      // A show with no settlement has no costs recorded, which would
      // otherwise read as a wildly profitable night.
      title: s.has_settlement ? s.title : `${s.title} (no settlement)`,
      tickets_sold: s.tickets_sold,
      face_value: s.face_value,
      service_fees: s.service_fees,
      facility_fees: s.facility_fees,
      card_fees_collected: s.card_fees_collected,
      sales_tax_collected: s.sales_tax_collected,
      revenue_total: s.revenue_total,
      artist_payout: s.artist_payout,
      expenses_total: s.expenses_total,
      net: s.net,
    })),

    totals_tickets: t.tickets_sold,
    totals_face_value: t.face_value,
    totals_service_fees: t.service_fees,
    totals_facility_fees: t.facility_fees,
    totals_card_fees: t.card_fees_collected,
    totals_sales_tax: t.sales_tax_collected,
    totals_revenue: t.revenue_total,
    totals_artist: t.artist_payout,
    totals_expenses: t.expenses_total,
    totals_net: t.net,

    rev_face_value: t.face_value,
    rev_door_cash: t.door_cash,
    rev_service_fees: t.service_fees,
    rev_facility_fees: t.facility_fees,
    rev_card_fees: t.card_fees_collected,
    rev_sales_tax: t.sales_tax_collected,
    rev_merch: t.merch_venue_share,
    rev_total: t.revenue_total,

    exp_artist: t.artist_payout,
    exp_sales_tax: t.sales_tax_remitted,
    exp_card_processing: t.card_processing,
    expense_lines: venue.expense_categories.map((name) => ({
      name: `Show expense — ${name}`,
      amount: t.show_expenses[name] ?? 0,
    })),
    exp_unitemized: t.expenses_unitemized,
    exp_total: t.expenses_total,

    net_profit: t.net,
  };
}
