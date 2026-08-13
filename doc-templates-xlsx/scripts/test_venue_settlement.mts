import { renderXlsxTemplate } from "../../lib/xlsx-templates/render";
import { buildVenueSettlementData } from "../../lib/xlsx-templates/venue-settlement/adapter";
import type { Settlement } from "../../lib/types/settlement";
import type { ArtistOffer } from "../../lib/types/offer";
import { writeFile } from "fs/promises";
import path from "path";

// Muscle Shoals Meets scenario -- the exact real case that motivated the
// Bonus/service-fee-rebate wiring (a ticketing-only deal, 50% of service
// fees rebated to the artist). 3 ticket tiers (template stencil has 4 --
// exercises row deletion this time, the opposite direction from the
// artist-settlement stress test) and a nonzero service_fee_rebate_pct.
const settlement: Settlement = {
  id: "test-multitier",
  venue_id: "test-venue",
  offer_id: "test-offer",
  event_title: "Muscle Shoals Meets",
  event_date: "2026-09-01",
  artist_name: "Cole Goodwin",
  guarantee: 0,
  deal_type: "VS",
  backend_percentage: 1,
  radius_clause: "150mi | 90d prior | 90 days after",
  ticket_audit: [
    {
      tier: "VIP Table", capacity: 11, sold: 10, comps: 0, kills: 1, price: 800,
      ticketing_fee: 3, facility_fee: 0, gross: 8000, orders: 9, cc_fees: 304.8,
      cc_fees_actual: 304.8, unsold: 1, tax: 760, gross_receipts: 9094.8, total_price: 909.48,
    },
    {
      tier: "GA Section 1", capacity: 196, sold: 196, comps: 0, kills: 0, price: 75,
      ticketing_fee: 3, facility_fee: 0, gross: 14700, orders: 180, cc_fees: 560.1,
      cc_fees_actual: 560.1, unsold: 0, tax: 1396.5, gross_receipts: 17244.6, total_price: 87.99,
    },
    {
      tier: "GA Section 2", capacity: 224, sold: 224, comps: 0, kills: 0, price: 50,
      ticketing_fee: 3, facility_fee: 0, gross: 11200, orders: 210, cc_fees: 426.7,
      cc_fees_actual: 426.7, unsold: 0, tax: 1064, gross_receipts: 13362.7, total_price: 59.65,
    },
  ],
  tickets_sold_count: 430,
  comp_count: 0,
  comp_face_value: 0,
  total_gross: 33900,
  ticketing_fees: 1290,
  facility_fees: 0,
  cc_fees: 1291.59,
  ticketing_fee_per_ticket: 3,
  facility_fee_per_ticket: 0,
  adj_gross: 32610,
  taxes: 3221.5,
  tax_rate: 0.095,
  tax_method: "multiplier",
  net_receipts: 29388.5,
  total_expenses: 1300,
  splitpoint: 0,
  artist_backend: 20571.95, // (29388.5-1300)*1.0 - 0, floored -- illustrative
  service_fee_rebate_pct: 0.5, // ticketing-only deal: 50% of service fees rebated
  // artist_total = guarantee(0) + artist_backend(20571.95) + serviceFeeRebate
  // (ticketing_fees 1290 * 0.5 = 645), matching lib/settlement/model.ts's
  // artistPayout() -- illustrative, not recomputed here.
  artist_total: 21216.95,
  deposit_paid: 0,
  cash_advance: 0,
  balance_due: 21216.95,
  bar_revenue: 0,
  concessions_revenue: 0,
  merch_commission: 0,
  ticketing_rebate: 0, // unrelated legacy field -- not what drives the Bonus line anymore
  parking_revenue: 0,
  sponsorship_revenue: 0,
  other_ancillary: [],
  venue_total_revenue: 30369.5,
  venue_net_profit: 8816.55,
  merch_items: [],
  merch_discounts: 0,
  merch_split_venue_pct: 0.2,
  merch_tax_rate: 0,
  merch_tax_method: "multiplier",
  merch_tax_payer: "artist",
  merch_seller_fee: 0,
  merch_seller_fee_payer: "venue",
  merch_total_gross: 0,
  merch_total_tax: 0,
  merch_total_net: 0,
  merch_venue_share: 0,
  merch_artist_share: 0,
  status: "finalized",
  created_at: "2026-08-05T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
};

const expenses = [
  { name: "Production", category: "fixed", actual_amount: 500 },
  { name: "Security", category: "fixed", actual_amount: 300 },
  { name: "Marketing", category: "fixed", actual_amount: 200 },
  { name: "Insurance", category: "fixed", actual_amount: 150 },
  { name: "Cleaning", category: "fixed", actual_amount: 100 },
  { name: "ASCAP", category: "variable", actual_amount: 25 },
  { name: "BMI", category: "variable", actual_amount: 25 },
];

const offer: ArtistOffer = {
  id: "test-offer",
  artist_name: "Cole Goodwin",
  venue: "Singin' River Brewing Co.",
  venue_address: "526 E College St, Florence, AL 35630",
  venue_id: "test-venue",
  agency: "WME",
  agent_name: "Carrie Creasy",
  agent_phone: "(615)-963-3098",
  agent_email: "carrie@wmeagency.com",
  num_shows: 1,
  show_length: "90min",
  show_time: "8:45 PM",
  billing: "Festival",
  show_lineup: [
    { time: "6:00pm", artist: "Doors", set_length: "" },
    { time: "9:00pm", artist: "Cole Goodwin", set_length: "90" },
  ],
  guarantee: 0,
  deal_type: "VS",
  deposit_pct: 0,
  deposit_amount: 0,
  deposit_due: "N/A",
  balance_due: "Day of Show",
  merch_split: "80/20 Soft, 100 Hard",
  merch_seller: "Venue",
  production_by: "In house",
  other_terms: "Ticketing-only deal; 50% of service fees rebated to artist.",
  comps: 20,
  artist_comps: 10,
  marketing_comps: 10,
  status: "accepted",
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

const data = buildVenueSettlementData(settlement, expenses, offer);
const templateDir = path.resolve(process.cwd(), "lib/xlsx-templates/venue-settlement");
const buf = await renderXlsxTemplate(templateDir, data as unknown as Record<string, unknown>);
const outPath = "/tmp/venue-settlement-test.xlsx";
await writeFile(outPath, buf);
console.log("Wrote", outPath, buf.length, "bytes");
console.log("ticket_audit rows:", data.ticket_audit.length, "(template stencil has 4)");
console.log("bonus:", data.bonus, "total_artist_walkout:", data.total_artist_walkout, "venue_net_profit:", data.venue_net_profit);
