import type { ExpenseItem, VariableExpenseItem } from "@/lib/types/offer";
import { guaranteeInExpenses } from "./walkout";

/**
 * What a new offer starts with, so the buyer edits a filled-in deal rather
 * than typing one from nothing.
 *
 * These are the values the old /admin/offers/new form opened with. When that
 * form was folded into the builder (59ef334) the new route started posting a
 * bare `{ artist_name: "" }`, and every one of them was lost: no expenses, a
 * 0% tax rate, no fees, no venue, no radius, no merch split.
 */
export const DEFAULT_FIXED_EXPENSES: ExpenseItem[] = [
  { name: "Rent", amount: 500 },
  { name: "Production", amount: 1000 },
  { name: "Catering", amount: 0 },
  { name: "Hospitality", amount: 250 },
  { name: "Support", amount: 250 },
  { name: "Talent", amount: 0 },
  { name: "Marketing", amount: 1000 },
  { name: "Labor", amount: 0 },
  { name: "Insurance", amount: 400 },
  { name: "Security", amount: 0 },
  { name: "Ushers", amount: 0 },
  { name: "Police", amount: 0 },
  { name: "Cleaning", amount: 0 },
  { name: "Medical", amount: 0 },
];

export const DEFAULT_VARIABLE_EXPENSES: VariableExpenseItem[] = [
  { name: "ASCAP", rate: 0.008, amount: 0 },
  { name: "BMI", rate: 0.008, amount: 0 },
  { name: "SESAC", rate: 0.0003, amount: 0 },
  { name: "GMR", rate: 0.0015, amount: 0 },
];

export const TALENT_LINE = "Talent";

/**
 * Keep the Talent expense line equal to what the deal says it is.
 *
 * On FLAT, PLUS and BONUS the guarantee is a show expense — it is what makes
 * a PLUS backend run on net *after* the guarantee. That used to depend on the
 * buyer typing the guarantee into Talent by hand, and on 6 of the 7 FLAT
 * offers on file nobody had, so their P&L left the guarantee out entirely.
 * On VS the guarantee is paid out of the artist's share, never as an
 * expense, so Talent is zero.
 */
export function syncTalentLine(fixed: ExpenseItem[] | undefined, dealType: string, guarantee: number): ExpenseItem[] {
  const rows = Array.isArray(fixed) ? fixed : [];
  const amount = guaranteeInExpenses(dealType) ? Number(guarantee) || 0 : 0;
  const i = rows.findIndex((e) => String(e.name || "").trim().toLowerCase() === TALENT_LINE.toLowerCase());
  if (i === -1) return amount ? [...rows, { name: TALENT_LINE, amount }] : rows;
  if (Number(rows[i].amount) === amount) return rows;
  const next = [...rows];
  next[i] = { ...next[i], amount };
  return next;
}

/**
 * How much of the artist's money the expense list already carries: the Talent
 * line, on the deals where the guarantee belongs there. Read from the row
 * rather than assumed, because offers sent before syncTalentLine existed have
 * Talent at $0 — assuming the guarantee was inside their expenses would hand
 * the venue the guarantee back.
 */
export function talentInExpenses(fixed: ExpenseItem[] | undefined, dealType: string): number {
  if (!guaranteeInExpenses(dealType) || !Array.isArray(fixed)) return 0;
  const row = fixed.find((e) => String(e.name || "").trim().toLowerCase() === TALENT_LINE.toLowerCase());
  return Number(row?.amount) || 0;
}

/** The venue fields the defaults read — the staff projection of /api/venues. */
export type VenueDefaults = {
  id?: string;
  name?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  buyer_name?: string | null;
  buyer_phone?: string | null;
  facility_fee?: number | null;
  ticketing_fee?: number | null;
  tax_rate?: number | null;
  default_radius_distance?: string | number | null;
  default_radius_days_prior?: number | null;
  default_radius_days_after?: number | null;
};

/** The owner's platform-wide fallbacks (admin_users). */
export type OwnerDefaults = {
  default_radius_distance?: string | number | null;
  default_radius_days_prior?: number | null;
  default_radius_days_after?: number | null;
  default_ticketing_fee?: number | null;
};

/**
 * The body POSTed to create an offer. Venue settings win over the owner's,
 * as they did on the old form; anything neither sets keeps the old form's
 * default ($3.00 ticketing fee, 9.5% multiplier tax).
 */
export function newOfferDefaults(venue: VenueDefaults | null, owner: OwnerDefaults | null, dealType = "VS") {
  const ticketingFee = Number(venue?.ticketing_fee ?? owner?.default_ticketing_fee ?? 3);
  const facilityFee = Number(venue?.facility_fee ?? 0);
  // Stored as a decimal (0.095); venues hold either form.
  const rawTax = venue?.tax_rate != null ? Number(venue.tax_rate) : 9.5;
  const taxRate = rawTax > 1 ? rawTax / 100 : rawTax;
  const address = venue
    ? [venue.address_street, venue.address_city, venue.address_state, venue.address_zip].filter(Boolean).join(", ")
    : "";

  return {
    deal_type: dealType,
    venue_id: venue?.id || null,
    venue: venue?.name || null,
    venue_address: address || null,
    venue_contact: venue?.buyer_name || null,
    venue_phone: venue?.buyer_phone || null,
    num_shows: 1,
    billing: "100% Headline",
    other_terms: "After taxes and approved expenses, Promoter to cover up to 3 hotel rooms (pending availability)",
    radius_distance: venue?.default_radius_distance ?? owner?.default_radius_distance ?? null,
    radius_days_prior: venue?.default_radius_days_prior ?? owner?.default_radius_days_prior ?? null,
    radius_days_after: venue?.default_radius_days_after ?? owner?.default_radius_days_after ?? null,
    production_by: "In House",
    balance_due: "Day of Show",
    merch_split: "80/20 Soft, 90/10 Hard | Sells: Artist",
    merch_seller: "Artist",
    ticket_scaling: [{
      name: "General Admission", seats: 0, comps: 0, kills: 0, sellable_cap: 0,
      price: facilityFee + ticketingFee, net_price: 0, facility_fee: facilityFee, ticketing_fee: ticketingFee,
    }],
    fixed_expenses: DEFAULT_FIXED_EXPENSES,
    variable_expenses: DEFAULT_VARIABLE_EXPENSES,
    tax_rate: taxRate,
    tax_method: "multiplier",
    offer_valid_days: 14,
  };
}
