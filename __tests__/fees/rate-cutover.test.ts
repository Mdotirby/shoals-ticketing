import {
  STRIPE_ONLINE_PCT,
  LEGACY_ONLINE_PCT,
  STRIPE_RATE_CUTOVER_AT,
  currentOnlinePct,
  ratesFor,
  surchargeCents,
} from "@/lib/fees/rates";

const BEFORE = new Date(STRIPE_RATE_CUTOVER_AT.getTime() - 60_000);
const AFTER = new Date(STRIPE_RATE_CUTOVER_AT.getTime() + 60_000);

describe("dated rate cutover", () => {
  it("keeps the old rate for shows already on sale", () => {
    // A show mid-run must finish at the price it opened at — a buyer shouldn't
    // pay more than the friend who bought the next seat over yesterday.
    expect(currentOnlinePct(BEFORE)).toBe(LEGACY_ONLINE_PCT);
  });

  it("applies the corrected rate after the cutover", () => {
    expect(currentOnlinePct(AFTER)).toBe(STRIPE_ONLINE_PCT);
  });

  it("switches exactly at the cutover instant, not a moment before", () => {
    expect(currentOnlinePct(STRIPE_RATE_CUTOVER_AT)).toBe(STRIPE_ONLINE_PCT);
  });

  it("carries the cutover through ratesFor", () => {
    expect(ratesFor("online", BEFORE).pct).toBe(LEGACY_ONLINE_PCT);
    expect(ratesFor("online", AFTER).pct).toBe(STRIPE_ONLINE_PCT);
  });

  it("never applies the cutover to card-present", () => {
    // Terminal is 2.7% + $0.05 on its own merits, not because of the legacy
    // online rate. It must not move when the online rate does.
    expect(ratesFor("terminal", BEFORE).pct).toBe(ratesFor("terminal", AFTER).pct);
    expect(ratesFor("terminal", AFTER).flatCents).toBe(5);
  });

  it("changes the buyer's surcharge by about six cents on a $27.90 subtotal", () => {
    // Drivin' N Cryin': $20 face + $3 service + $3 facility + $1.90 tax.
    const before = surchargeCents(2790, "on_subtotal");
    const rate = ratesFor("online", AFTER);
    const after = Math.round(2790 * rate.pct + rate.flatCents);
    expect(after - before).toBeLessThanOrEqual(7);
    expect(after).toBeGreaterThan(before);
  });
});
