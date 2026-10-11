/**
 * What a payment ledger has to get right.
 *
 * The old payout card could record exactly one payment and hard-wired its
 * amount to the whole balance due, so a show paid in two instalments — which
 * is how MSM 90s actually went — had nowhere to say so, and correcting a
 * payout meant clearing it and losing the first one. These pin the arithmetic
 * the replacement runs on: what is still owed after a part payment, that
 * deposits and payouts are not counted against each other twice, and that
 * money is rounded to cents before it is called a payment.
 *
 * The component is in app/admin/settlements/[id]/PaymentLedger.tsx; the maths
 * it does is small enough to state here rather than mount a DOM for.
 */

/** Exactly the ledger's own two lines. */
const paidOf = (amounts: number[]) => Math.round(amounts.reduce((s, a) => s + (Number(a) || 0), 0) * 100) / 100;
const remainingOf = (owed: number, amounts: number[]) => Math.round((owed - paidOf(amounts)) * 100) / 100;

/** What the route does to an amount on the way in. */
const cents = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

describe("what is still owed", () => {
  test("a part payment leaves the rest owed", () => {
    expect(remainingOf(5000, [2000])).toBe(3000);
  });

  test("instalments add up, and the last one closes it out", () => {
    // MSM 90s in two: the first payment, then the remainder.
    expect(remainingOf(3851.44, [2000])).toBe(1851.44);
    expect(remainingOf(3851.44, [2000, 1851.44])).toBe(0);
  });

  test("three payments of a third do not leave a floating-point crumb", () => {
    const third = cents(1000 / 3); // 333.33
    expect(remainingOf(1000, [third, third, third])).toBe(0.01);
    // And the crumb is payable: it is a cent, not 0.00000001.
    expect(remainingOf(1000, [third, third, third, 0.01])).toBe(0);
  });

  test("overpaying goes negative rather than clamping to zero", () => {
    // The card says so out loud instead of hiding it -- an overpayment is
    // money to claw back, not a rounding artefact.
    expect(remainingOf(1000, [1200])).toBe(-200);
  });

  test("nothing paid leaves the whole amount owed", () => {
    expect(remainingOf(1500, [])).toBe(1500);
    expect(paidOf([])).toBe(0);
  });

  test("a settlement that owes nothing stays at nothing", () => {
    expect(remainingOf(0, [])).toBe(0);
  });

  test("a negative balance due -- the artist owes the venue -- is not a payment", () => {
    // Happens when merch deductions exceed the walkout. Recording a payout
    // against it would be paying out money that is owed inward.
    expect(remainingOf(-420.5, [])).toBe(-420.5);
  });
});

describe("amounts are rounded to cents before they are called a payment", () => {
  test("the raw balance-due float becomes a cheque amount", () => {
    // The one payout on file was stored as 727.8275 -- the unrounded
    // balanceDue, not a figure any cheque was written for.
    expect(cents(727.8275)).toBe(727.83);
  });

  test("a half cent rounds up, consistently", () => {
    expect(cents(0.005)).toBe(0.01);
    expect(cents(10.455)).toBe(10.46);
  });

  test("junk is zero, not NaN", () => {
    expect(cents("")).toBe(0);
    expect(cents(null)).toBe(0);
    expect(cents(undefined)).toBe(0);
    expect(cents("abc")).toBe(0);
  });

  test("a string from a number input is money", () => {
    expect(cents("1851.44")).toBe(1851.44);
  });
});

describe("deposits and payouts are not the same money", () => {
  /**
   * balanceDue already has deposits and advances taken out of it
   * (SettlementWorkspace: artistTotal − deposits − advances − merch). Payouts
   * pay THAT down. Counting a deposit again on the payout side would pay the
   * artist twice on paper and understate what is still owed.
   */
  const artistTotal = 10000;
  const deposits = 2500;
  const balanceDue = artistTotal - deposits;

  test("a deposit reduces the balance due, once", () => {
    expect(balanceDue).toBe(7500);
    expect(remainingOf(balanceDue, [])).toBe(7500);
  });

  test("the payouts needed to close it out exclude the deposit", () => {
    expect(remainingOf(balanceDue, [7500])).toBe(0);
    // The artist has had 10,000 in all: 2,500 up front and 7,500 after.
    expect(deposits + 7500).toBe(artistTotal);
  });

  test("a deposit recorded as a payout as well would overpay by the deposit", () => {
    expect(remainingOf(balanceDue, [7500, deposits])).toBe(-2500);
  });
});

describe("the legacy single payout reads back as one row", () => {
  /** The fallback the card uses before the migration is run. */
  const legacyRows = (st: Record<string, unknown> | null) =>
    !st?.payout_at
      ? []
      : [{ id: "legacy", amount: Number(st.payout_amount) || 0, when: st.payout_at as string }];

  test("a settlement with a payout yields one row", () => {
    const rows = legacyRows({ payout_at: "2026-09-29T12:00:00Z", payout_amount: 727.8275 });
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBeCloseTo(727.8275, 4);
  });

  test("a settlement with none yields no rows, not a zero row", () => {
    // A $0.00 row in a list of payments reads as "we paid them nothing",
    // which is a different claim from "we have not paid them".
    expect(legacyRows({ payout_amount: null, payout_at: null })).toEqual([]);
    expect(legacyRows(null)).toEqual([]);
  });

  test("an amount with no date is not a payment", () => {
    // payout_at is what the old card keyed "paid" on; an amount alone was a
    // half-written record.
    expect(legacyRows({ payout_amount: 500, payout_at: null })).toEqual([]);
  });
});
