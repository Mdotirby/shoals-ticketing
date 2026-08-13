import {
  STRIPE_ONLINE_PCT,
  STRIPE_RATE_CUTOVER_AT,
  STRIPE_ONLINE_FLAT_CENTS,
  STRIPE_TERMINAL_PCT,
  STRIPE_TERMINAL_FLAT_CENTS,
  surchargeCents,
  estimatedStripeCostCents,
  offerSurchargePerTicket,
  rateLabel,
} from "@/lib/fees/rates";

describe("platform rate card", () => {
  it("uses Stripe's published US online rate", () => {
    // Verified against live balance transactions: blended 2.903% + $0.30.
    expect(STRIPE_ONLINE_PCT).toBe(0.029);
    expect(STRIPE_ONLINE_FLAT_CENTS).toBe(30);
  });

  it("keeps card-present on its own rate, not a copy of the online one", () => {
    expect(STRIPE_TERMINAL_PCT).toBe(0.027);
    expect(STRIPE_TERMINAL_FLAT_CENTS).toBe(5);
    expect(STRIPE_TERMINAL_PCT).not.toBe(STRIPE_ONLINE_PCT);
  });

  it("labels the rate actually in force, not a hardcoded string", () => {
    const after = new Date(STRIPE_RATE_CUTOVER_AT.getTime() + 86_400_000);
    const before = new Date(STRIPE_RATE_CUTOVER_AT.getTime() - 86_400_000);
    expect(rateLabel("online", after)).toBe("2.9% + $0.30");
    // Before the cutover the label must match what buyers are really charged.
    expect(rateLabel("online", before)).toBe("2.7% + $0.30");
    expect(rateLabel("terminal", after)).toBe("2.7% + $0.05");
  });
});

// All of these pin the clock past the cutover: they assert the CORRECTED
// rate, which is deliberately not in force until in-flight shows have run.
// The cutover behaviour itself is covered in rate-cutover.test.ts.
const AFTER = new Date(STRIPE_RATE_CUTOVER_AT.getTime() + 86_400_000);

describe("surchargeCents", () => {
  it("on_subtotal applies the rate to the subtotal", () => {
    // $100.00 subtotal → 2.9% + $0.30 = $3.20
    expect(surchargeCents(10000, "on_subtotal", "online", AFTER)).toBe(320);
  });

  it("models Stripe's real cost regardless of our own cutover", () => {
    // The cutover governs what WE bill the buyer. Stripe charges its published
    // rate either way, so the cost estimate must not be gated on it.
    expect(estimatedStripeCostCents(10000)).toBe(Math.round(10000 * 0.029 + 30));
  });

  it("gross_up recovers the fee Stripe actually takes", () => {
    const subtotal = 10000;
    const surcharge = surchargeCents(subtotal, "gross_up", "online", AFTER);
    const total = subtotal + surcharge;
    const stripeTakes = estimatedStripeCostCents(total, "online");
    // The venue should be left whole (within a cent of rounding).
    expect(Math.abs(total - stripeTakes - subtotal)).toBeLessThanOrEqual(1);
  });

  it("on_subtotal always under-recovers — this is why gross_up exists", () => {
    const subtotal = 10000;
    const total = subtotal + surchargeCents(subtotal, "on_subtotal");
    const shortfall = estimatedStripeCostCents(total, "online") - (total - subtotal);
    expect(shortfall).toBeGreaterThan(0);
  });

  it("absorb charges the buyer nothing extra", () => {
    expect(surchargeCents(10000, "absorb", "online", AFTER)).toBe(0);
  });

  it("returns zero for a zero or negative subtotal rather than billing $0.30", () => {
    expect(surchargeCents(0, "on_subtotal", "online", AFTER)).toBe(0);
    expect(surchargeCents(-500, "on_subtotal", "online", AFTER)).toBe(0);
  });

  it("uses the card-present rate when the capture method is terminal", () => {
    expect(surchargeCents(10000, "on_subtotal", "terminal", AFTER)).toBe(275);
  });
});

describe("offerSurchargePerTicket", () => {
  it("always quotes the corrected rate, since offers are for future shows", () => {
    // 2.9% of $100 plus half the $0.30 flat fee = $3.05
    expect(offerSurchargePerTicket(100)).toBeCloseTo(3.05, 2);
  });

  it("includes the flat fee, amortised — not just the percentage", () => {
    // The offer builder used to model a bare 2.7% with no flat fee at all,
    // which understates processing cost badly on cheap inventory.
    const perTicket = offerSurchargePerTicket(25);
    expect(perTicket).toBeGreaterThan(25 * STRIPE_ONLINE_PCT);
  });

  it("costs proportionally more on a cheap ticket than an expensive one", () => {
    const cheapRate = offerSurchargePerTicket(10) / 10;
    const dearRate = offerSurchargePerTicket(100) / 100;
    expect(cheapRate).toBeGreaterThan(dearRate);
  });

  it("is zero for a free ticket", () => {
    expect(offerSurchargePerTicket(0)).toBe(0);
  });
});
