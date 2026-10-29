import { offerTotals } from "@/lib/offers/totals";
import { walkoutAt } from "@/lib/offers/walkout";
import { doorDeductions, withDoorDefaults } from "@/lib/offers/door";
import { artistPayout } from "@/lib/settlement/model";

/**
 * A door deal "after support and catering", on Cigarettes @ Sunset's room:
 * 720 sellable at $27.50 face + $3 service + $3 facility, 9.5% tax on top.
 *
 * The door is face value — 720 × 27.50 = 19,800 — with tax, the platform's
 * fees and the card surcharge all left out. Support and Catering come off
 * it first; Hospitality stays a venue cost after the split.
 */
const DOOR_OFFER = {
  tax_rate: 0.095,
  tax_method: "multiplier",
  ticket_scaling: [
    { name: "GA", seats: 750, comps: 30, kills: 0, sellable_cap: 720, price: 33.5, net_price: 27.5, ticketing_fee: 3, facility_fee: 3 },
  ],
  fixed_expenses: [
    { name: "Support", amount: 1000, off_top: true },
    { name: "Catering", amount: 500, off_top: true },
    { name: "Hospitality", amount: 250 },
  ],
  variable_expenses: [],
  guarantee: 0,
  backend_percentage: 70,
  deal_type: "DOOR",
};

describe("door deal after named expenses", () => {
  const t = offerTotals(DOOR_OFFER);

  it("splits the door after the lines that come off the top", () => {
    // (19,800 − 1,500) × 70% = 12,810
    expect(t.doorDeductions).toBe(1500);
    expect(t.artistTotal).toBeCloseTo(12810, 2);
  });

  it("leaves the venue its share less the costs that stayed after the split", () => {
    // 30% of 18,300 = 5,490, less 250 of hospitality
    expect(t.potWalkout).toBeCloseTo(5240, 2);
  });

  it("scales the door with sales but not the deductions", () => {
    const basis = {
      netPotential: t.netPotential,
      totalFixed: t.totalFixed,
      totalVariable: t.totalVariable,
      sellable: 720,
      guarantee: 0,
      backendPct: 70,
      dealType: "DOOR",
      cardAtSellout: t.cardExpense.amount,
      doorDeductions: t.doorDeductions,
    };
    expect(walkoutAt(1, basis).artist).toBeCloseTo(12810, 2);
    // half the room: (9,900 − 1,500) × 70% = 5,880
    expect(walkoutAt(0.5, basis).artist).toBeCloseTo(5880, 2);
    expect(walkoutAt(0.5, basis).venue).toBeCloseTo(8400 * 0.3 - 250, 2);
  });

  it("pays nothing when the deductions eat the door", () => {
    expect(artistPayout({ netReceipts: 1000, totalExpenses: 0, guarantee: 0, backendPct: 0.7, dealType: "DOOR", doorDeductions: 1500 }).artistTotal).toBe(0);
  });

  it("ignores the flags on any other deal", () => {
    expect(doorDeductions(DOOR_OFFER.fixed_expenses, "VS")).toBe(0);
    const vs = offerTotals({ ...DOOR_OFFER, deal_type: "VS", guarantee: 0 });
    expect(vs.doorDeductions).toBe(0);
  });
});

describe("switching to DOOR", () => {
  it("flags Support and Catering when nothing is flagged yet", () => {
    const rows = withDoorDefaults([{ name: "Rent", amount: 500 }, { name: "Support", amount: 1000 }, { name: "catering", amount: 0 }]);
    expect(rows.map((r) => !!r.off_top)).toEqual([false, true, true]);
  });

  it("keeps the buyer's own choice once there is one", () => {
    const rows = withDoorDefaults([{ name: "Rent", amount: 500, off_top: true }, { name: "Support", amount: 1000 }]);
    expect(rows.map((r) => !!r.off_top)).toEqual([true, false]);
  });
});

describe("facility fee to the artist", () => {
  const withFac = {
    ...DOOR_OFFER,
    ticket_scaling: DOOR_OFFER.ticket_scaling.map((r) => ({ ...r, artist_fac: 1 })),
  };
  const t = offerTotals(withFac);

  it("pays $1 a ticket on top of the door share", () => {
    expect(t.artistFac).toBe(720);
    expect(t.artistTotal).toBeCloseTo(12810 + 720, 2);
  });

  it("comes out of the venue's walkout", () => {
    expect(t.potWalkout).toBeCloseTo(5240 - 720, 2);
  });

  it("scales with tickets sold", () => {
    const basis = {
      netPotential: t.netPotential, totalFixed: t.totalFixed, totalVariable: t.totalVariable,
      sellable: 720, guarantee: 0, backendPct: 70, dealType: "DOOR",
      cardAtSellout: t.cardExpense.amount, doorDeductions: t.doorDeductions, artistFacAtSellout: t.artistFac,
    };
    expect(walkoutAt(0.5, basis).artist).toBeCloseTo(5880 + 360, 2);
  });

  it("can't hand over more than the tier's facility fee", () => {
    const capped = offerTotals({ ...DOOR_OFFER, ticket_scaling: DOOR_OFFER.ticket_scaling.map((r) => ({ ...r, artist_fac: 5 })) });
    expect(capped.artistFac).toBe(720 * 3);
  });
});
