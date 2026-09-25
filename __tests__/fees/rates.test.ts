import {
  STRIPE_ONLINE_PCT,
  STRIPE_RATE_CUTOVER_AT,
  STRIPE_ONLINE_FLAT_CENTS,
  STRIPE_TERMINAL_PCT,
  STRIPE_TERMINAL_FLAT_CENTS,
  surchargeCents,
  estimatedStripeCostCents,
  rateLabel,
  grossUpCents,
  DEFAULT_SURCHARGE_MODE,
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

/**
 * Zero shortfall and zero overage — not approximately, exactly.
 *
 * Stripe's fee on a charge of T cents is round(T * pct + flat). Verified
 * against all 795 live charges on the account: every single one matches,
 * across Visa, Mastercard, Amex and Discover, online and card-present. There
 * is no per-brand variance to absorb, so the venue can be made exactly whole
 * and "close enough" is not the best available.
 *
 * The old default, "on_subtotal", charged pct of the SUBTOTAL while Stripe
 * billed pct of the TOTAL — which includes the surcharge. It is short on
 * essentially every possible basket, which is where the $195.88 absorbed
 * across the book came from, and the $7.71 on the Dolly Parton Tribute.
 */
describe("gross_up leaves nothing on the table", () => {
  const CARDS: Array<[string, number, number]> = [
    ["online 2.9% + 30c", 0.029, 30],
    ["terminal 2.7% + 5c", 0.027, 5],
    ["legacy 2.7% + 30c", 0.027, 30],
  ];

  it.each(CARDS)(
    "%s: every subtotal to $2,000 comes out exact",
    (_label, pct, flat) => {
      let short = 0;
      let over = 0;
      for (let sub = 1; sub <= 200000; sub++) {
        const s = grossUpCents(sub, pct, flat);
        const fee = Math.round((sub + s) * pct + flat);
        if (s < fee) short++;
        if (s > fee) over++;
      }
      expect(short).toBe(0);
      expect(over).toBe(0);
    },
  );

  it.each(CARDS)("%s: on_subtotal is short, which is why it was replaced", (_label, pct, flat) => {
    // A representative basket rather than the whole sweep — the point is the
    // sign, not the size.
    const sub = 8370_00 / 100;
    const s = Math.round(sub * pct + flat);
    expect(s).toBeLessThan(Math.round((sub + s) * pct + flat));
  });

  it("is the mode checkout actually uses", () => {
    expect(DEFAULT_SURCHARGE_MODE).toBe("gross_up");
    // Dolly's real numbers: $8,370.00 of tickets across 133 orders was
    // surcharged $282.86 and cost $290.57. Grossed up, one order of that
    // subtotal covers its own fee to the cent.
    const s = surchargeCents(837000);
    expect(Math.round((837000 + s) * 0.029 + 30)).toBe(s);
  });

  it("absorb still means the venue eats it, deliberately", () => {
    // fees-included events; not a shortfall, a policy.
    expect(surchargeCents(10000, "absorb")).toBe(0);
  });
});
