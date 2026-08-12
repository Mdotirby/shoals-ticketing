import { calculateFees } from "@/lib/checkout-helpers";
import { surchargeCents, STRIPE_RATE_CUTOVER_AT } from "@/lib/fees/rates";

const base = {
  ticketPriceCents: 2500,
  discountCentsPerTicket: 0,
  ticketingFee: 3,
  facilityFee: 3,
  taxRate: 0.095,
  quantity: 1,
};

describe("calculateFees", () => {
  it("adds service, facility, and tax on top of the ticket price", () => {
    const f = calculateFees(base);
    expect(f.ticketingFeeCents).toBe(300);
    expect(f.facilityFeeCents).toBe(300);
    expect(f.taxCents).toBe(238); // 2500 × 0.095
    expect(f.subtotalBeforeStripeFee).toBe(2500 + 300 + 300 + 238);
  });

  it("taxes the discounted price, not the list price", () => {
    const f = calculateFees({ ...base, discountCentsPerTicket: 500 });
    expect(f.discountedTicketPriceCents).toBe(2000);
    expect(f.taxCents).toBe(190); // 2000 × 0.095
  });

  it("never produces a negative price from an over-large discount", () => {
    const f = calculateFees({ ...base, discountCentsPerTicket: 9999 });
    expect(f.discountedTicketPriceCents).toBe(0);
    expect(f.taxCents).toBe(0);
  });

  it("scales the whole subtotal by quantity", () => {
    const one = calculateFees(base);
    const four = calculateFees({ ...base, quantity: 4 });
    expect(four.subtotalBeforeStripeFee).toBe(one.subtotalBeforeStripeFee * 4);
  });

  it("takes the card surcharge from the rate card, not a local constant", () => {
    const f = calculateFees(base);
    // Asserted against the rate card rather than a literal, because the exact
    // figure depends on whether the dated cutover has passed. What must always
    // hold is that checkout and the rate card agree.
    expect(f.stripeFeeCents).toBe(surchargeCents(f.subtotalBeforeStripeFee));
    expect(f.totalCents).toBe(f.subtotalBeforeStripeFee + f.stripeFeeCents);
  });

  it("charges 2.9% + $0.30 once the cutover has passed", () => {
    const after = new Date(STRIPE_RATE_CUTOVER_AT.getTime() + 86_400_000);
    const f = calculateFees(base);
    // subtotal 3338 → 3338 × 0.029 + 30 = 126.8 → 127
    expect(surchargeCents(f.subtotalBeforeStripeFee, "on_subtotal", "online", after)).toBe(127);
  });

  describe("when fees are baked into the price", () => {
    const inclusive = { ...base, feesIncludedInPrice: true };

    it("does not add service or facility on top of the charge", () => {
      const f = calculateFees(inclusive);
      expect(f.subtotalBeforeStripeFee).toBe(2500 + 238);
    });

    it("still reports the nominal fees for settlement to carve out", () => {
      const f = calculateFees(inclusive);
      expect(f.ticketingFeeCents).toBe(300);
      expect(f.facilityFeeCents).toBe(300);
      expect(f.feesIncludedInPrice).toBe(true);
    });

    it("charges exactly the sticker price — the venue absorbs the card fee", () => {
      const f = calculateFees(inclusive);
      expect(f.totalCents).toBe(f.subtotalBeforeStripeFee);
      // The surcharge is still reported so settlement knows what was absorbed.
      expect(f.stripeFeeCents).toBeGreaterThan(0);
    });
  });

  describe("divisor tax events", () => {
    it("charges no additive tax when callers zero the rate", () => {
      // Checkout resolves taxRate to 0 for divisor events because the tax is
      // already inside the face price. Charging it again double-taxed the buyer.
      const f = calculateFees({ ...base, taxRate: 0 });
      expect(f.taxCents).toBe(0);
      expect(f.subtotalBeforeStripeFee).toBe(2500 + 300 + 300);
    });
  });
});
