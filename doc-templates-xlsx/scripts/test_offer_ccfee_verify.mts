import { buildOfferData } from "../../lib/xlsx-templates/offer/adapter";
import type { ArtistOffer } from "../../lib/types/offer";

// Exact numbers from Matt's screenshots: net_price $25.50, fac $3, tkt $3,
// 750 capacity / 30 comps / 720 sellable, 9.5% multiplier tax. Expected
// (matching the source spreadsheet, screenshot 3): tax $2.42, cc $1.28,
// all-in price $35.21, gross $25,348.50.
const offer: ArtistOffer = {
  id: "test-ccfee-verify",
  artist_name: "Test Artist",
  status: "draft",
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  guarantee: 0,
  deal_type: "VS",
  backend_percentage: "0",
  tax_rate: 0.095,
  tax_method: "multiplier",
  ticket_scaling: [
    { name: "General Admission", seats: 750, comps: 30, kills: 0, sellable_cap: 720, price: 31.5, net_price: 25.5, facility_fee: 3, ticketing_fee: 3 },
  ],
};

const data = buildOfferData(offer);
const row = data.ticket_scaling[0];
console.log("price (expect 25.50):", row.price);
console.log("svc (expect 3.00):", row.svc);
console.log("fac (expect 3.00):", row.fac);
console.log("tax (expect 2.42):", row.tax.toFixed(2));
console.log("cc (expect 1.28):", row.cc.toFixed(2));
console.log("allin_price (expect 35.21):", row.allin_price.toFixed(2));
console.log("gross (expect 25348.50):", row.gross.toFixed(2));
