import {
  isCardExpense,
  withoutCardExpense,
  cardExpenseAtSellout,
  cardExpenseRow,
  CARD_EXPENSE_NAME,
  CARD_RATE_PCT,
  CARD_RATE_FLAT,
} from "@/lib/offers/cardExpense";
import { calculateFees } from "@/lib/checkout-helpers";
import { STRIPE_ONLINE_FLAT_CENTS, STRIPE_ONLINE_PCT, grossUpCents } from "@/lib/fees/rates";

/** What Stripe really deducts from a charge of this many dollars. */
const stripeFeeOn = (dollars: number) =>
  Math.round(Math.round(dollars * 100) * STRIPE_ONLINE_PCT + 30) / 100;

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
  // Grossed up: the surcharge is the amount that, once added, Stripe takes
  // back in full -- $1.03 a ticket, because 2.9% of $25.03 plus $0.30 is
  // $1.03. x 520 = $535.60. Charging 2.9% of the $24 sub-total instead gives
  // $0.996 and Stripe still takes $1.03 -- the shortfall this exists to end.
  it("grosses the divisor case up so the surcharge covers the real fee", () => {
    const out = cardExpenseAtSellout(
      [{ sellable_cap: 520, price: 24, net_price: 20 }],
      { taxMethod: "divisor", taxRate: 0.095 },
    );
    expect(out.amount).toBeCloseTo(535.6, 2);
    expect(out.tickets).toBe(520);
    expect(out.perTicket).toBeCloseTo(1.03, 6);
    expect(stripeFeeOn(24 + 1.03)).toBeCloseTo(1.03, 6);
  });

  it("adds multiplier tax before charging the card, because the buyer pays it", () => {
    // face 20 -> tax 1.90 on top -> card charged on 24 + 1.90 = 25.90,
    // grossed up to $1.08: 2.9% of $26.98 plus $0.30 is $1.08, exactly.
    const out = cardExpenseAtSellout(
      [{ sellable_cap: 100, price: 24, net_price: 20 }],
      { taxMethod: "multiplier", taxRate: 0.095 },
    );
    expect(out.perTicket).toBeCloseTo(1.08, 6);
    expect(out.amount).toBeCloseTo(108.0, 2);
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
    // grossed up: $1.03 x 100 + $1.80 x 50 = 103.00 + 90.00 = 193.00
    expect(out.amount).toBeCloseTo(193.0, 2);
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
  it("is 2.9% and $0.30, never 3% and never a rounded flat fee", () => {
    // One ticket at $100, grossed up: $3.30, because 2.9% of $103.30 plus
    // $0.30 is $3.30. The 2.9% is charged on what Stripe actually bills --
    // the total -- and is not 3% of anything.
    const out = cardExpenseAtSellout([{ sellable_cap: 1, price: 100 }], {});
    expect(out.amount).toBeCloseTo(3.3, 6);
    expect(stripeFeeOn(100 + 3.3)).toBeCloseTo(3.3, 6);
  });

  it("covers the fee exactly on every seat of a large tier", () => {
    const out = cardExpenseAtSellout([{ sellable_cap: 1000, price: 19.99 }], {});
    expect(out.perTicket).toBeCloseTo(0.91, 6);
    expect(out.amount).toBeCloseTo(910.0, 2);
    expect(stripeFeeOn(19.99 + 0.91)).toBeCloseTo(0.91, 6);
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
    expect(row.amount).toBeCloseTo(535.6, 2);
  });

  it("is itself recognised as a card line, so re-saving cannot stack copies", () => {
    const row = cardExpenseRow([{ sellable_cap: 10, price: 24 }], {});
    expect(isCardExpense(row.name)).toBe(true);
  });
});

/**
 * The flat fee is charged once per ORDER, and the two models differ only in
 * how many orders they assume.
 *
 * Settlement works from real orders: two tickets bought together are one
 * charge, so Stripe takes 2.9% of the whole subtotal plus a single $0.30.
 *
 * An offer has no orders yet, so it assumes one ticket per order (Matt,
 * confirmed) -- 520 sellable seats means 520 orders and 520 flat fees. That
 * is deliberately the conservative end: any real basket larger than one
 * ticket costs less than the offer forecast, never more.
 *
 * Asserted together because the difference between them is the whole point,
 * and because "per ticket" silently becoming "per order" in the offer (or the
 * reverse at checkout) would move money without moving any visible label.
 */
describe("per order at settlement, per ticket on an offer", () => {
  const PRICE = 25,
    TKT = 3,
    FAC = 3,
    TAX_RATE = 0.095;

  it("checkout charges ONE flat fee however many tickets are in the order", () => {
    const base = {
      ticketPriceCents: PRICE * 100,
      discountCentsPerTicket: 0,
      ticketingFee: TKT,
      facilityFee: FAC,
      taxRate: TAX_RATE,
      quantity: 1,
    };
    const one = calculateFees(base);
    const two = calculateFees({ ...base, quantity: 2 });

    // The base doubles...
    expect(two.subtotalBeforeStripeFee).toBe(one.subtotalBeforeStripeFee * 2);

    // ...but the surcharge does NOT, because only the percentage scales.
    // Two orders of one would have cost two flat fees; one order of two
    // costs a single $0.30, so the difference is exactly one flat fee.
    // The saving is one flat fee plus the gross-up on it: 30c becomes 32c,
    // because the surcharge that would have carried that second 30c is
    // itself grossed up.
    const twoSeparateOrders = one.stripeFeeCents * 2;
    expect(two.stripeFeeCents).toBeLessThan(twoSeparateOrders);
    const saving = twoSeparateOrders - two.stripeFeeCents;
    expect(saving).toBeGreaterThanOrEqual(STRIPE_ONLINE_FLAT_CENTS);
    expect(saving).toBe(32);
  });

  it("an offer charges one flat fee per seat, because it assumes one ticket per order", () => {
    const perTicketSubtotal = PRICE + TKT + FAC; // divisor: tax is inside the face
    const out = cardExpenseAtSellout(
      [{ sellable_cap: 2, price: perTicketSubtotal, net_price: PRICE }],
      { taxMethod: "divisor", taxRate: TAX_RATE },
    );
    // Two $31.00 orders, each grossed up to $1.23.
    expect(out.perTicket).toBeCloseTo(1.23, 6);
    expect(out.amount).toBeCloseTo(2.46, 2);
    expect(out.tickets).toBe(2);
    expect(stripeFeeOn(perTicketSubtotal + 1.23)).toBeCloseTo(1.23, 6);

    // More than the same two seats as ONE order, by a flat fee and the
    // gross-up on it -- the conservative assumption, stated.
    const asOneOrder =
      grossUpCents(2 * perTicketSubtotal * 100, CARD_RATE_PCT, CARD_RATE_FLAT * 100) / 100;
    expect(out.amount).toBeGreaterThan(asOneOrder);
  });

  it("bases the offer surcharge on face + fees + tax, the same subtotal checkout uses", () => {
    // Multiplier: tax rides on top, so it is inside the base the card is
    // charged on -- exactly as calculateFees builds subtotalBeforeStripeFee.
    const out = cardExpenseAtSellout(
      [{ sellable_cap: 1, price: PRICE + TKT + FAC, net_price: PRICE }],
      { taxMethod: "multiplier", taxRate: TAX_RATE },
    );
    const checkoutSubtotal = PRICE + TKT + FAC + PRICE * TAX_RATE;
    expect(out.perTicket).toBeCloseTo(
      grossUpCents(Math.round(checkoutSubtotal * 100), CARD_RATE_PCT, CARD_RATE_FLAT * 100) / 100,
      6,
    );
  });
});
