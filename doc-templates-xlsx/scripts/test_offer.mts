import { renderXlsxTemplate } from "../../lib/xlsx-templates/render";
import { buildOfferData } from "../../lib/xlsx-templates/offer/adapter";
import type { ArtistOffer } from "../../lib/types/offer";
import { writeFile } from "fs/promises";
import path from "path";

// 3 ticket-scaling tiers (template stencil has 2 -> +1 row inserted) + a
// shrunk expense list (14->5 fixed, 4->2 variable), same combined
// insertion+deletion stress pattern as the settlement tests.
const offer: ArtistOffer = {
  id: "test-offer-multitier",
  artist_name: "Cole Goodwin",
  venue: "Singin' River Brewing Co.",
  venue_address: "526 E College St, Florence, AL 35630",
  venue_id: "test-venue",
  event_date: "2026-09-01",
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
  guarantee: 2000,
  deal_type: "VS",
  backend_percentage: "80",
  radius_distance: "150mi",
  radius_days_prior: 90,
  radius_days_after: 90,
  deposit_pct: 10,
  deposit_amount: 200,
  deposit_due: "30 days prior with FEC",
  balance_due: "Day of Show",
  merch_split: "80/20 Soft, 100 Hard",
  merch_seller: "Artist",
  production_by: "In house",
  other_terms: "After taxes and approved expenses, Promoter recoups first.",
  comps: 30,
  artist_comps: 10,
  marketing_comps: 20,
  ticket_scaling: [
    { name: "VIP Table", seats: 11, comps: 0, kills: 1, sellable_cap: 10, price: 80, net_price: 80, facility_fee: 0, ticketing_fee: 3 },
    { name: "GA Section 1", seats: 196, comps: 0, kills: 0, sellable_cap: 196, price: 75, net_price: 75, facility_fee: 0, ticketing_fee: 3 },
    { name: "GA Section 2", seats: 224, comps: 0, kills: 0, sellable_cap: 224, price: 50, net_price: 50, facility_fee: 0, ticketing_fee: 3 },
  ],
  fixed_expenses: [
    { name: "Production", amount: 500 },
    { name: "Security", amount: 300 },
    { name: "Marketing", amount: 200 },
    { name: "Insurance", amount: 150 },
    { name: "Cleaning", amount: 100 },
  ],
  variable_expenses: [
    { name: "ASCAP", rate: 0.008, amount: 25 },
    { name: "BMI", rate: 0.008, amount: 25 },
  ],
  tax_rate: 0.095,
  tax_method: "multiplier",
  status: "draft",
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

const data = buildOfferData(offer);
const templateDir = path.resolve(process.cwd(), "lib/xlsx-templates/offer");
const buf = await renderXlsxTemplate(templateDir, data as unknown as Record<string, unknown>);
const outPath = "/tmp/offer-test.xlsx";
await writeFile(outPath, buf);
console.log("Wrote", outPath, buf.length, "bytes");
console.log("tiers:", data.ticket_scaling.length, "avg price:", data.ticket_totals_avg_price);
console.log("splitpoint:", data.splitpoint, "backend:", data.backend, "overage:", data.overage, "artist_total_potential:", data.artist_total_potential);
console.log("breakeven_tickets:", data.breakeven_tickets, "bare_minimum_tickets:", data.bare_minimum_tickets);
