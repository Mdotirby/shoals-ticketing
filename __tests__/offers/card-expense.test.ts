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
  // 24.00 * 2.9% = 69.6c + 30c = 99.6c, rounded to the cent a buyer can
  // actually be charged = $1.00 a ticket, x 520 = $520.00.
  it("prices the divisor case off the sub-total alone", () => {
    const out = cardExpenseAtSellout(
      [{ sellable_cap: 520, price: 24, net_price: 20 }],
      { taxMethod: "divisor", taxRate: 0.095 },
    );
    expect(out.amount).toBeCloseTo(520.0, 2);
    expect(out.tickets).toBe(520);
    expect(out.perTicket).toBeCloseTo(1.0, 2);
  });

  it("adds multiplier tax before charging the card, because the buyer pays it", () => {
    // face 20 -> tax 1.90 on top -> card charged on 24 + 1.90 = 25.90
    // 25.90 * 0.029 + 0.30 = $1.0511 -> 1.05 a ticket
    const out = cardExpenseAtSellout(
      [{ sellable_cap: 100, price: 24, net_price: 20 }],
      { taxMethod: "multiplier", taxRate: 0.095 },
    );
    expect(out.perTicket).toBeCloseTo(1.05, 2);
    expect(out.amount).toBeCloseTo(105.0, 2);
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
    // $1.00 x 100 + $1.75 x 50 = 100.00 + 87.50 = 187.50
    expect(out.amount).toBeCloseTo(187.5, 2);
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

describe("cardExpenseRow", () => {
  it("is named for the rate it actually charges", () => {
    expect(CARD_EXPENSE_NAME).toBe("Card processing (2.9% + $0.30)");
  });

  it("carries rate 0 so nothing recomputes it as a share of gross", () => {
    const row = cardExpenseRow([{ sellable_cap: 520, price: 24, net_price: 20 }], { taxMethod: "divisor", taxRate: 0.095 });
    expect(row.rate).toBe(0);
    expect(row.locked).toBe(true);
    expect(row.amount).toBeCloseTo(520.0, 2);
  });

  it("is itself recognised as a card line, so re-saving cannot stack copies", () => {
    const row = cardExpenseRow([{ sellable_cap: 10, price: 24 }], {});
    expect(isCardExpense(row.name)).toBe(true);
  });
});
