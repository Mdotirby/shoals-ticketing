import { renderXlsxTemplate } from "../../lib/xlsx-templates/render";
import { buildArtistSettlementData } from "../../lib/xlsx-templates/artist-settlement/adapter";
import type { Settlement } from "../../lib/types/settlement";
import type { ArtistOffer } from "../../lib/types/offer";
import { writeFile } from "fs/promises";
import path from "path";

// Twin Fin settlement, reused from the earlier PDF pipeline testing this
// session, extended with what an artist-settlement export additionally
// needs (offer_id + a matching ArtistOffer for the header context).
const settlement: Settlement = {
  id: "test-twinfin",
  venue_id: "test-venue",
  offer_id: "test-offer",
  event_title: "Twin Fin Live",
  event_date: "2026-08-04",
  artist_name: "Twin Fin",
  guarantee: 1000.0,
  deal_type: "VS",
  backend_percentage: 0.6,
  radius_clause: "150mi | 90d prior | 90 days after",
  ticket_audit: [
    {
      tier: "General Admission", capacity: 525, sold: 82, comps: 4, kills: 0, price: 15.0,
      ticketing_fee: 3.0, facility_fee: 0.0, gross: 1230.0, orders: 80, cc_fees: 46.28,
      cc_fees_actual: 46.28, unsold: 439, tax: 116.85, gross_receipts: 1639.13, total_price: 19.99,
    },
  ],
  tickets_sold_count: 82,
  comp_count: 4,
  comp_face_value: 0,
  total_gross: 1230.0,
  ticketing_fees: 246.0,
  facility_fees: 0.0,
  cc_fees: 46.28,
  ticketing_fee_per_ticket: 3.0,
  facility_fee_per_ticket: 0.0,
  adj_gross: 984.0,
  taxes: 116.85,
  tax_rate: 0.095,
  tax_method: "multiplier",
  net_receipts: 1230.0,
  total_expenses: 1270.0,
  splitpoint: 1000,
  artist_backend: 138, // (netAfterExpenses(1230-1270=-40)... using a nonzero example instead below
  artist_total: 1138,
  deposit_paid: 500.0,
  cash_advance: 0,
  balance_due: 349.4,
  bar_revenue: 0,
  concessions_revenue: 0,
  merch_commission: 0,
  ticketing_rebate: 0,
  parking_revenue: 0,
  sponsorship_revenue: 0,
  other_ancillary: [],
  venue_total_revenue: 0,
  venue_net_profit: 0,
  merch_items: [],
  merch_discounts: 0,
  merch_split_venue_pct: 0.2,
  merch_tax_rate: 0,
  merch_tax_method: "multiplier",
  merch_tax_payer: "artist",
  merch_seller_fee: 0,
  merch_seller_fee_payer: "venue",
  merch_total_gross: 753.0,
  merch_total_tax: 0,
  merch_total_net: 753.0,
  merch_venue_share: 150.6,
  merch_artist_share: 602.4,
  status: "finalized",
  created_at: "2026-08-05T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
};

const expenses = [
  { name: "Rent", category: "fixed", actual_amount: 0 },
  { name: "Production", category: "fixed", actual_amount: 300.0 },
  { name: "Catering", category: "fixed", actual_amount: 0 },
  { name: "Hospitality", category: "fixed", actual_amount: 0 },
  { name: "Support", category: "fixed", actual_amount: 250.0 },
  { name: "Talent", category: "fixed", actual_amount: 0 },
  { name: "Marketing", category: "fixed", actual_amount: 520.0 },
  { name: "Labor", category: "fixed", actual_amount: 0 },
  { name: "Insurance", category: "fixed", actual_amount: 0 },
  { name: "Security", category: "fixed", actual_amount: 200.0 },
  { name: "Ushers", category: "fixed", actual_amount: 0 },
  { name: "Police", category: "fixed", actual_amount: 0 },
  { name: "Cleaning", category: "fixed", actual_amount: 0 },
  { name: "Medical", category: "fixed", actual_amount: 0 },
  { name: "ASCAP", category: "variable", actual_amount: 0 },
  { name: "BMI", category: "variable", actual_amount: 0 },
  { name: "SESAC", category: "variable", actual_amount: 0 },
  { name: "GMR", category: "variable", actual_amount: 0 },
];

const offer: ArtistOffer = {
  id: "test-offer",
  artist_name: "Twin Fin",
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
  billing: "100% Headline",
  show_lineup: [
    { time: "7:00pm", artist: "Doors", set_length: "" },
    { time: "8:00pm", artist: "Local Support", set_length: "30" },
    { time: "8:45pm", artist: "Twin Fin", set_length: "90" },
  ],
  guarantee: 1000,
  deal_type: "VS",
  deposit_pct: 50,
  deposit_amount: 500,
  deposit_due: "30 days prior with FEC",
  balance_due: "Day of Show",
  merch_split: "80/20 Soft, 100 Hard",
  merch_seller: "Artist",
  production_by: "In house",
  other_terms: "After taxes and approved expenses, Promoter recoups first.",
  comps: 30,
  artist_comps: 10,
  marketing_comps: 20,
  status: "accepted",
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

const data = buildArtistSettlementData(settlement, expenses, offer);
console.log("Adapter output field count:", Object.keys(data).length);

const templateDir = path.resolve(process.cwd(), "lib/xlsx-templates/artist-settlement");
const buf = await renderXlsxTemplate(templateDir, data as unknown as Record<string, unknown>);
const outPath = "/tmp/artist-settlement-test.xlsx";
await writeFile(outPath, buf);
console.log("Wrote", outPath, buf.length, "bytes");
