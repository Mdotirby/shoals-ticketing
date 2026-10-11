import { offerTotals } from "@/lib/offers/totals";

/**
 * Sunny Sweeney as it stands: one tier, $20 face, $4 service, no facility,
 * 520 sellable, 9.5% divisor, $3,350 of fixed and the four PRO rates.
 *
 * The figures below are the ones traced off the real export while fixing
 * this. They pin the rule the whole change exists for: the card surcharge is
 * inside gross and leaves once, in expenses.
 */
const SUNNY = {
  tax_rate: 0.095,
  tax_method: "divisor",
  ticket_scaling: [
    { name: "P1", seats: 550, comps: 30, kills: 0, sellable_cap: 520, price: 24, net_price: 20, ticketing_fee: 4, facility_fee: 0 },
  ],
  fixed_expenses: [{ name: "Rent", amount: 3350 }],
  variable_expenses: [
    { name: "ASCAP", rate: 0.008, amount: 0 },
    { name: "BMI", rate: 0.008, amount: 0 },
    { name: "SESAC", rate: 0.0003, amount: 0 },
    { name: "GMR", rate: 0.0015, amount: 0 },
  ],
  guarantee: 1500,
  backend_percentage: 65,
  deal_type: "VS",
};

describe("the gross-to-splitpoint chain", () => {
  const t = offerTotals(SUNNY);

  it("gross is the all-in — what the buyer actually pays", () => {
    // 520 x (20 face + 4 svc + 1.03 card) = 13,015.60. Tax is inside the face
    // under divisor, so it adds nothing on top.
    expect(t.grossPotential).toBeCloseTo(13015.6, 2);
  });

  it("matches what the scaling table totals, which it used to differ from", () => {
    const allIn = 20 + 4 + 0 + t.cardExpense.perTicket;
    expect(t.grossPotential).toBeCloseTo(allIn * 520, 1);
  });

  it("keeps face and the rate base as separate figures", () => {
    expect(t.faceTotal).toBe(10400);       // 520 x 20
    expect(t.subtotalGross).toBe(12480);   // 520 x 24
  });

  it("takes only the two fees out to reach adjusted gross", () => {
    // 13,015.60 - 2,080 = 10,935.60, which is face 10,400 + card 535.60.
    expect(t.adjGross).toBeCloseTo(10935.6, 2);
    expect(t.adjGross).toBeCloseTo(t.faceTotal + t.cardExpense.amount, 2);
  });

  it("taxes the face and not the card fee", () => {
    expect(t.taxAmount).toBeCloseTo(902.28, 2);
    expect(t.taxAmount).toBeCloseTo(10400 - 10400 / 1.095, 2);
  });

  it("the column adds up: gross - fees - tax = net", () => {
    expect(t.grossPotential - 2080 - t.taxAmount).toBeCloseTo(t.netPotential, 2);
    expect(t.netPotential).toBeCloseTo(10033.32, 2);
  });

  it("charges the card fee ONCE, in expenses", () => {
    expect(t.cardExpense.amount).toBeCloseTo(535.6, 2);
    expect(t.totalVariable).toBeCloseTo(222.14 + 535.6, 2);
    expect(t.totalExpenses).toBeCloseTo(3350 + 757.74, 2);
    // Net carries the fee, expenses remove it: the pool is face less the rest.
    expect(t.netAfterExpenses).toBeCloseTo(5925.58, 2);
  });

  it("is the surcharge better off than the old chain, to the penny", () => {
    // The old chain put gross at the sub-total and still expensed the card:
    // 12,480 - 2,080 - 902.28 - 4,107.74 = 5,389.98.
    expect(t.netAfterExpenses - 5389.98).toBeCloseTo(t.cardExpense.amount, 2);
  });

  it("does not let the card fee inflate the PRO rates", () => {
    // ASCAP is 0.8% of ticket receipts, not of the card fee.
    expect(0.008 * t.subtotalGross).toBeCloseTo(99.84, 2);
    const ascap = t.variableExpensesOut.find((e) => e.name === "ASCAP");
    expect(ascap?.amount).toBeCloseTo(99.84, 2);
  });
});

describe("multiplier tax", () => {
  const t = offerTotals({ ...SUNNY, tax_method: "multiplier" });

  it("sits inside gross, because the buyer pays it on top at checkout", () => {
    // 520 x (24 + 1.90 tax + card). Tax on face: 10,400 x 9.5% = 988.
    expect(t.taxAmount).toBeCloseTo(988, 2);
    expect(t.grossPotential).toBeCloseTo(12480 + 988 + t.cardExpense.amount, 2);
  });

  it("comes out to reach net, which it did not have to before", () => {
    expect(t.netPotential).toBeCloseTo(t.adjGross - t.taxAmount, 2);
    // Net is face plus the card fee it still has to pay out.
    expect(t.netPotential).toBeCloseTo(t.faceTotal + t.cardExpense.amount, 2);
  });
});
