import { offerSettleTerms, settlementArtistFac, settlementDoorDeductions } from "@/lib/settlement/doorTerms";
import { artistPayout } from "@/lib/settlement/model";

/**
 * Settling a door deal on the offer's terms: 80% of the door after Support,
 * plus $1 of each $3 facility fee. The show sold 600 at $30 face; Support
 * actually cost $1,200 (the offer said $1,000), and $1,800 of facility fees
 * came in.
 */
const offer = {
  fixed_expenses: [
    { name: "Support", amount: 1000, off_top: true },
    { name: "Rent", amount: 500 },
    { name: "Production", amount: 1000 },
  ],
  ticket_scaling: [{ name: "GA", seats: 750, comps: 30, kills: 0, sellable_cap: 720, price: 36, net_price: 30, facility_fee: 3, ticketing_fee: 3, artist_fac: 1 }],
};
const expenses = [
  { name: "Support", actual_amount: 1200 },
  { name: "Rent", actual_amount: 500 },
  { name: "Production", actual_amount: 1000 },
];

describe("door terms on a settlement", () => {
  const terms = offerSettleTerms(offer);

  it("reads the off-the-top lines and the per-ticket FAC from the offer", () => {
    expect(terms).toEqual({ offTop: ["Support"], facPerTicket: 1 });
  });

  it("deducts what those lines actually cost, not the offer estimate", () => {
    expect(settlementDoorDeductions(expenses, terms.offTop, "DOOR")).toBe(1200);
    expect(settlementDoorDeductions(expenses, terms.offTop, "VS")).toBe(0);
  });

  it("pays the artist's fraction of the facility fees collected", () => {
    expect(settlementArtistFac(1800, 3, 1)).toBe(600);
    expect(settlementArtistFac(1800, 0, 1)).toBe(0);
    expect(settlementArtistFac(1800, 3, 5)).toBe(1800);
  });

  it("settles the artist at door share plus facility fee", () => {
    // door 18,000 − 1,200 = 16,800; 80% = 13,440; + 600
    const p = artistPayout({
      netReceipts: 18000 + 500, totalExpenses: 2700 + 500, guarantee: 0, backendPct: 0.8, dealType: "DOOR",
      cardSurcharge: 500,
      doorDeductions: settlementDoorDeductions(expenses, terms.offTop, "DOOR"),
      facilityFeeToArtist: settlementArtistFac(1800, 3, terms.facPerTicket),
    });
    expect(p.artistBackend).toBeCloseTo(13440, 2);
    expect(p.facilityFeeToArtist).toBe(600);
    expect(p.artistTotal).toBeCloseTo(14040, 2);
  });

  it("has nothing to apply when the settlement has no offer", () => {
    expect(offerSettleTerms(null)).toEqual({ offTop: [], facPerTicket: 0 });
  });
});
