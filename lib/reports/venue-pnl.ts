import type { SupabaseClient } from "@supabase/supabase-js";
import { computeEventAudit } from "@/lib/settlement/audit";

/**
 * Venue P&L — every show at one event venue, over a date range.
 *
 * WHERE THE MONEY COMES FROM
 * Revenue is computeEventAudit(), the same function settlement and the
 * ticket audit report run on: per-order figures out of settlement_ledger,
 * written at the time of each sale, so a mid-run price change or a fee
 * toggled on partway through is already accounted for. Nothing here
 * re-derives ticket money from today's tier prices.
 *
 * Expenses are the settlement: artist payout, the expense lines with a real
 * actual_amount, and whatever the settlement's own total_expenses holds over
 * and above those lines (see `expenses_unitemized`). A show with no
 * settlement contributes revenue and no costs — flagged per show as
 * `has_settlement: false` so a reader can see why a P&L looks too good.
 *
 * WHAT IS DELIBERATELY NOT NETTED
 * Sales tax appears twice, once collected and once remitted, so it nets to
 * zero and the gross figures still tie to the bank. The card surcharge is
 * revenue and Stripe's actual cut is an expense; the gap between them is the
 * processing cost the venue absorbs, which is worth seeing rather than
 * hiding in a net number.
 *
 * GROUPED BY EVENT VENUE, NOT ACCOUNT
 * events.event_venue_id is the physical room (Singin' River Brewing Co.,
 * Shoals Ballroom). events.venue_id is the operator account that sold the
 * tickets. A P&L "per venue" means the room.
 */

export type PnlShow = {
  event_id: string;
  title: string;
  date: string;
  event_type: string | null;
  has_settlement: boolean;
  settlement_status: string | null;

  tickets_sold: number;
  comps: number;

  // Revenue
  face_value: number;
  door_cash: number;
  service_fees: number;
  facility_fees: number;
  card_fees_collected: number;
  sales_tax_collected: number;
  merch_venue_share: number;
  revenue_total: number;

  // Expenses
  artist_payout: number;
  sales_tax_remitted: number;
  card_processing: number;
  show_expenses: Record<string, number>;
  expenses_unitemized: number;
  expenses_total: number;

  net: number;
};

export type PnlVenue = {
  event_venue_id: string | null;
  event_venue_name: string;
  shows: PnlShow[];
  /** Union of every expense line name used by any show, in a stable order. */
  expense_categories: string[];
  totals: Omit<PnlShow, "event_id" | "title" | "date" | "event_type" | "has_settlement" | "settlement_status">;
};

type EventRow = {
  id: string;
  title: string;
  date: string;
  event_type: string | null;
  venue: string | null;
  venue_id: string | null;
  event_venue_id: string | null;
};

type SettlementRow = {
  id: string;
  event_id: string | null;
  status: string | null;
  artist_total: number | null;
  total_expenses: number | null;
  merch_venue_share: number | null;
  cash_gross: number | null;
};

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Expense lines in the order the settlement itself lists them. */
const CATEGORY_ORDER = [
  "Rent",
  "Production",
  "Catering",
  "Hospitality",
  "Support",
  "Talent",
  "Marketing",
  "Labor",
  "Insurance",
  "Security",
  "Box Office",
  "Barricades",
  "Ushers",
  "Police",
  "Cleaning",
  "Medical",
  "ASCAP",
  "BMI",
  "SESAC",
  "GMR",
];

function sortCategories(names: string[]): string[] {
  return names.sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export async function buildVenuePnl(
  admin: SupabaseClient,
  opts: { eventVenueId?: string | null; venueId?: string | null; from?: string | null; to?: string | null }
): Promise<PnlVenue[]> {
  let q = admin
    .from("events")
    .select("id, title, date, event_type, venue, venue_id, event_venue_id")
    .order("date", { ascending: true });

  if (opts.eventVenueId) q = q.eq("event_venue_id", opts.eventVenueId);
  if (opts.venueId) q = q.eq("venue_id", opts.venueId);
  if (opts.from) q = q.gte("date", opts.from);
  if (opts.to) q = q.lte("date", opts.to);

  const { data: events, error } = await q;
  if (error) throw error;

  const eventRows = (events ?? []) as EventRow[];
  if (eventRows.length === 0) return [];

  const eventIds = eventRows.map((e) => e.id);

  // Venue names, so a row can say "Singin' River Brewing Co." rather than a uuid.
  const venueVenueIds = [...new Set(eventRows.map((e) => e.event_venue_id).filter(Boolean))] as string[];
  const nameById = new Map<string, string>();
  if (venueVenueIds.length > 0) {
    const { data: venues } = await admin.from("event_venues").select("id, name").in("id", venueVenueIds);
    for (const v of (venues ?? []) as { id: string; name: string }[]) nameById.set(v.id, v.name);
  }

  const { data: settlements } = await admin
    .from("settlements")
    .select("id, event_id, status, artist_total, total_expenses, merch_venue_share, cash_gross")
    .in("event_id", eventIds);
  const settlementRows = (settlements ?? []) as SettlementRow[];
  const settlementByEvent = new Map(settlementRows.filter((s) => s.event_id).map((s) => [s.event_id!, s]));

  const settlementIds = settlementRows.map((s) => s.id);
  const expensesBySettlement = new Map<string, { name: string; actual: number }[]>();
  if (settlementIds.length > 0) {
    const { data: expenses } = await admin
      .from("settlement_expenses")
      .select("settlement_id, name, actual_amount, sort_order")
      .in("settlement_id", settlementIds);
    for (const e of (expenses ?? []) as {
      settlement_id: string;
      name: string;
      actual_amount: number | null;
    }[]) {
      const actual = Number(e.actual_amount) || 0;
      if (actual === 0) continue; // budget-only lines are not costs
      const list = expensesBySettlement.get(e.settlement_id) ?? [];
      list.push({ name: (e.name || "Other").trim(), actual });
      expensesBySettlement.set(e.settlement_id, list);
    }
  }

  const byVenue = new Map<string, PnlVenue>();

  for (const ev of eventRows) {
    // Same source as the settlement and the ticket audit report.
    const audit = await computeEventAudit(admin, ev.id);
    const settlement = settlementByEvent.get(ev.id) ?? null;

    const show_expenses: Record<string, number> = {};
    let itemised = 0;
    for (const line of expensesBySettlement.get(settlement?.id ?? "") ?? []) {
      show_expenses[line.name] = r2((show_expenses[line.name] ?? 0) + line.actual);
      itemised += line.actual;
    }

    // Cash taken at the door never touches Stripe and has no order behind it
    // on older shows, so it lives on the settlement as a manual figure. The
    // audit cannot see it; without this the night is short by exactly the
    // cash drawer (Twin Fin $240, Drivin' N Cryin' $450).
    const door_cash = r2(settlement?.cash_gross ?? 0);
    const artist_payout = r2(settlement?.artist_total ?? 0);
    const sales_tax_collected = r2(audit.taxes);
    const card_processing = r2(audit.cc_fees_actual || audit.cc_fees);
    // A settlement whose stored total exceeds its own itemised lines is
    // carrying costs nobody broke out; keep the difference rather than
    // silently reporting a smaller expense figure than the settlement did.
    const expenses_unitemized = r2(Math.max(0, (settlement?.total_expenses ?? 0) - itemised));

    const revenue_total = r2(
      audit.face_gross +
        door_cash +
        audit.ticketing_fees +
        audit.facility_fees +
        audit.cc_fees +
        sales_tax_collected +
        (settlement?.merch_venue_share ?? 0)
    );
    const expenses_total = r2(
      artist_payout + sales_tax_collected + card_processing + itemised + expenses_unitemized
    );

    const show: PnlShow = {
      event_id: ev.id,
      title: ev.title,
      date: ev.date,
      event_type: ev.event_type,
      has_settlement: !!settlement,
      settlement_status: settlement?.status ?? null,

      tickets_sold: audit.tickets_sold_count,
      comps: audit.comp_count,

      face_value: r2(audit.face_gross),
      door_cash,
      service_fees: r2(audit.ticketing_fees),
      facility_fees: r2(audit.facility_fees),
      card_fees_collected: r2(audit.cc_fees),
      sales_tax_collected,
      merch_venue_share: r2(settlement?.merch_venue_share ?? 0),
      revenue_total,

      artist_payout,
      sales_tax_remitted: sales_tax_collected,
      card_processing,
      show_expenses,
      expenses_unitemized,
      expenses_total,

      net: r2(revenue_total - expenses_total),
    };

    // A hold or a private booking with no settlement and no money is an
    // empty row on a P&L -- it says nothing and makes a venue look like it
    // ran six shows when it ran none.
    if (!settlement && revenue_total === 0 && expenses_total === 0) continue;

    const key = ev.event_venue_id ?? "__none__";
    if (!byVenue.has(key)) {
      byVenue.set(key, {
        event_venue_id: ev.event_venue_id,
        event_venue_name:
          (ev.event_venue_id ? nameById.get(ev.event_venue_id) : null) ?? ev.venue ?? "Unassigned venue",
        shows: [],
        expense_categories: [],
        totals: blankTotals(),
      });
    }
    byVenue.get(key)!.shows.push(show);
  }

  for (const venue of byVenue.values()) {
    venue.expense_categories = sortCategories([
      ...new Set(venue.shows.flatMap((s) => Object.keys(s.show_expenses))),
    ]);
    venue.totals = sumShows(venue.shows, venue.expense_categories);
  }

  return [...byVenue.values()].sort((a, b) => a.event_venue_name.localeCompare(b.event_venue_name));
}

function blankTotals(): PnlVenue["totals"] {
  return {
    tickets_sold: 0,
    comps: 0,
    face_value: 0,
    door_cash: 0,
    service_fees: 0,
    facility_fees: 0,
    card_fees_collected: 0,
    sales_tax_collected: 0,
    merch_venue_share: 0,
    revenue_total: 0,
    artist_payout: 0,
    sales_tax_remitted: 0,
    card_processing: 0,
    show_expenses: {},
    expenses_unitemized: 0,
    expenses_total: 0,
    net: 0,
  };
}

function sumShows(shows: PnlShow[], categories: string[]): PnlVenue["totals"] {
  const t = blankTotals();
  const add = (k: keyof PnlVenue["totals"]) => {
    (t[k] as number) = r2(shows.reduce((s, sh) => s + (sh[k as keyof PnlShow] as number), 0));
  };
  (
    [
      "tickets_sold",
      "comps",
      "face_value",
      "door_cash",
      "service_fees",
      "facility_fees",
      "card_fees_collected",
      "sales_tax_collected",
      "merch_venue_share",
      "revenue_total",
      "artist_payout",
      "sales_tax_remitted",
      "card_processing",
      "expenses_unitemized",
      "expenses_total",
      "net",
    ] as const
  ).forEach(add);
  for (const c of categories) {
    t.show_expenses[c] = r2(shows.reduce((s, sh) => s + (sh.show_expenses[c] ?? 0), 0));
  }
  return t;
}
