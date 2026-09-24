import {
  isCardExpense,
  withoutCardExpense,
  cardExpenseAtSellout,
  cardExpenseRow,
  CARD_EXPENSE_NAME,
} from "@/lib/offers/cardExpense";

describe("isCardExpense", () => {
  it.each([
    "Credit Card (Stripe)",
    "Credit Card",
    "credit card",
    "CC Processing",
    "Stripe",
    "Processing Fee",
    "Card processing (2.9% + $0.30)",
  ])("recognises %s", (name) => {
    expect(isCardExpense(name)).toBe(true);
  });

  it.each(["ASCAP", "BMI", "SESAC", "GMR", "Sound engineer", "", null, undefined])(
    "leaves %s alone",
    (name) => {
      expect(isCardExpense(name)).toBe(false);
    },
  );
});

describe("withoutCardExpense", () => {
  it("drops a hand-entered card line so it cannot be counted twice", () => {
    const rows = [
      { name: "ASCAP", rate: 0.008 },
      { name: "Credit Card (Stripe)", rate: 0.03 },
      { name: "BMI", rate: 0.008 },
    ];
    expect(withoutCardExpense(rows).map((r) => r.name)).toEqual(["ASCAP", "BMI"]);
  });

  it("survives a non-array", () => {
    expect(withoutCardExpense(null as never)).toEqual([]);
  });
});

describe("cardExpenseAtSellout", () => {
  // Sunny Sweeney: 520 sellable, $24.00 sub-total, 9.5% divisor.
  // Exactly 2.9% of 24.00 = $0.696, plus exactly $0.30 = $0.996 a ticket.
  // x 520 = $517.92 -- NOT $520.00, which is what per-ticket rounding to the
  // whole cent produces. Neither the rate nor the flat fee is rounded, and
  // the total is rounded exactly once, at the end.
  it("prices the divisor case off the sub-total alone, without rounding per ticket", () => {
    const out = cardExpenseAtSellout(
      [{ sellable_cap: 520, price: 24, net_price: 20 }],
      { taxMethod: "divisor", taxRate: 0.095 },
    );
    expect(out.amount).toBeCloseTo(517.92, 2);
    expect(out.tickets).toBe(520);
    expect(out.perTicket).toBeCloseTo(0.996, 6);
  });

  it("adds multiplier tax before charging the card, because the buyer pays it", () => {
    // face 20 -> tax 1.90 on top -> card charged on 24 + 1.90 = 25.90
    // 25.90 * 2.9% + 0.30 = $1.0511 a ticket, kept at full precision
    const out = cardExpenseAtSellout(
      [{ sellable_cap: 100, price: 24, net_price: 20 }],
      { taxMethod: "multiplier", taxRate: 0.095 },
    );
    expect(out.perTicket).toBeCloseTo(1.0511, 6);
    expect(out.amount).toBeCloseTo(105.11, 2);
  });

  it("reads a tax rate stored as a percentage the same as one stored as a decimal", () => {
    const asDecimal = cardExpenseAtSellout([{ sellable_cap: 10, price: 24, net_price: 20 }], { taxMethod: "multiplier", taxRate: 0.095 });
    const asPercent = cardExpenseAtSellout([{ sellable_cap: 10, price: 24, net_price: 20 }], { taxMethod: "multiplier", taxRate: 9.5 });
    expect(asPercent.amount).toBe(asDecimal.amount);
  });

  it("sums across tiers", () => {
    const out = cardExpenseAtSellout(
      [
        { sellable_cap: 100, price: 24, net_price: 24 },
        { sellable_cap: 50, price: 50, net_price: 50 },
      ],
      { taxMethod: "divisor" },
    );
    // (24*.029+.30)*100 + (50*.029+.30)*50 = 99.60 + 87.50 = 187.10
    expect(out.amount).toBeCloseTo(187.1, 2);
    expect(out.tickets).toBe(150);
  });

  it("ignores tiers with nothing to sell", () => {
    const out = cardExpenseAtSellout([{ sellable_cap: 0, price: 24 }], {});
    expect(out).toEqual({ amount: 0, tickets: 0, perTicket: 0 });
  });

  it("is zero for no scaling at all", () => {
    expect(cardExpenseAtSellout([], {}).amount).toBe(0);
    expect(cardExpenseAtSellout(null as never, {}).amount).toBe(0);
  });
});

describe("the rate is exact", () => {
  it("is 2.9% and $0.30, not 3% and not a rounded flat fee", () => {
    // One ticket at $100: 2.9% is $2.90, never $3.00.
    const out = cardExpenseAtSellout([{ sellable_cap: 1, price: 100 }], {});
    expect(out.amount).toBeCloseTo(3.2, 6); // 2.90 + 0.30
  });

  it("stays exact across a large tier rather than compounding a rounded cent", () => {
    // 1,000 x $19.99. Exact: 19990 * 2.9% + 1000 * 0.30 = 579.71 + 300.
    const out = cardExpenseAtSellout([{ sellable_cap: 1000, price: 19.99 }], {});
    expect(out.amount).toBeCloseTo(879.71, 2);
    // Per-ticket rounding would have given $0.88 x 1000 = $880.00.
    expect(out.amount).not.toBeCloseTo(880.0, 2);
  });
});

describe("cardExpenseRow", () => {
  it("is named for the rate it actually charges", () => {
    expect(CARD_EXPENSE_NAME).toBe("Card processing (2.9% + $0.30)");
  });

  it("carries rate 0 so nothing recomputes it as a share of gross", () => {
    const row = cardExpenseRow([{ sellable_cap: 520, price: 24, net_price: 20 }], { taxMethod: "divisor", taxRate: 0.095 });
    expect(row.rate).toBe(0);
    expect(row.locked).toBe(true);
    expect(row.amount).toBeCloseTo(517.92, 2);
  });

  it("is itself recognised as a card line, so re-saving cannot stack copies", () => {
    const row = cardExpenseRow([{ sellable_cap: 10, price: 24 }], {});
    expect(isCardExpense(row.name)).toBe(true);
  });
});
