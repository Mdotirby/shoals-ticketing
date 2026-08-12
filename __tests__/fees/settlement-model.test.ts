import { settlementWaterfall, artistPayout } from "@/lib/settlement/model";

describe("settlementWaterfall", () => {
  it("subtracts service and facility fees to reach adjusted gross", () => {
    // Payton Howie at Singin' River LIVE, from production:
    // 34 tickets at $20 face, $3 service + $3 facility per unit.
    const w = settlementWaterfall({
      totalGross: 884, // 680 face + 102 svc + 102 fac
      ticketingFees: 102,
      facilityFees: 102,
      taxRate: 0.095,
      taxMethod: "divisor",
    });
    expect(w.adjGross).toBe(680);
  });

  it("backs tax out of adjusted gross on a divisor event", () => {
    const w = settlementWaterfall({
      totalGross: 884,
      ticketingFees: 102,
      facilityFees: 102,
      taxRate: 0.095,
      taxMethod: "divisor",
    });
    // 680 − 680/1.095. The waterfall returns unrounded values; callers round
    // for storage, giving the $59.00 / $621.00 that appears on the settlement.
    expect(w.taxes).toBeCloseTo(58.9954, 3);
    expect(w.netReceipts).toBeCloseTo(621.0046, 3);
    expect(Math.round(w.netReceipts * 100) / 100).toBe(621);
  });

  it("does NOT reduce the split base on a multiplier event", () => {
    // Additive tax was charged on top of face and was never inside adjusted
    // gross. Subtracting it would take it from the artist a second time.
    const w = settlementWaterfall({
      totalGross: 884,
      ticketingFees: 102,
      facilityFees: 102,
      taxRate: 0.095,
      taxMethod: "multiplier",
    });
    expect(w.netReceipts).toBe(680);
    expect(w.taxes).toBeCloseTo(64.6, 2); // collected and remitted, memo only
  });

  it("never collapses to an identity that returns gross unchanged", () => {
    // The settlement page previously added every fee then subtracted the same
    // set, so net receipts was algebraically just total_gross.
    const w = settlementWaterfall({
      totalGross: 1000,
      ticketingFees: 100,
      facilityFees: 50,
      taxRate: 0.095,
      taxMethod: "divisor",
    });
    expect(w.netReceipts).not.toBe(1000);
    expect(w.netReceipts).toBeLessThan(w.adjGross);
  });
});

describe("artistPayout", () => {
  const base = { netReceipts: 20000, totalExpenses: 12000, backendPct: 0.85 };

  it("VS pays guarantee plus a share of the overage", () => {
    // net after expenses 8000, guarantee 5000 → overage 3000 → 85% = 2550
    const p = artistPayout({ ...base, guarantee: 5000, dealType: "VS" });
    expect(p.netAfterExpenses).toBe(8000);
    expect(p.overage).toBe(3000);
    expect(p.artistBackend).toBe(2550);
    expect(p.artistTotal).toBe(7550);
  });

  it("VS is NOT the greater of guarantee or a percentage of net", () => {
    // The offer builder used max(guarantee, pool × backend%), which on these
    // numbers pays 6800 — a different deal for the same contract.
    const p = artistPayout({ ...base, guarantee: 5000, dealType: "VS" });
    const oldOfferModel = Math.max(5000, 8000 * 0.85);
    expect(p.artistTotal).not.toBeCloseTo(oldOfferModel, 2);
  });

  it("PLUS computes identically to VS", () => {
    const vs = artistPayout({ ...base, guarantee: 5000, dealType: "VS" });
    const plus = artistPayout({ ...base, guarantee: 5000, dealType: "PLUS" });
    expect(plus.artistTotal).toBe(vs.artistTotal);
  });

  it("pays no backend when the show doesn't clear the guarantee", () => {
    const p = artistPayout({
      netReceipts: 10000,
      totalExpenses: 8000,
      guarantee: 5000,
      backendPct: 0.85,
      dealType: "VS",
    });
    expect(p.overage).toBeLessThan(0);
    expect(p.artistBackend).toBe(0);
    expect(p.artistTotal).toBe(5000);
  });

  it("uses the guarantee as the splitpoint threshold, not the pool", () => {
    const p = artistPayout({ ...base, guarantee: 5000, dealType: "VS" });
    expect(p.splitpoint).toBe(5000);
    expect(p.splitpoint).not.toBe(p.netAfterExpenses);
  });

  it("FLAT pays the guarantee with no backend", () => {
    const p = artistPayout({ ...base, guarantee: 5000, dealType: "FLAT" });
    expect(p.artistBackend).toBe(0);
    expect(p.artistTotal).toBe(5000);
  });

  it("DOOR pays a straight percentage of net with no guarantee floor", () => {
    const p = artistPayout({
      netReceipts: 20000,
      totalExpenses: 12000,
      guarantee: 0,
      backendPct: 0.7,
      dealType: "DOOR",
    });
    expect(p.artistTotal).toBe(14000);
  });

  it("treats deal type case-insensitively", () => {
    const upper = artistPayout({ ...base, guarantee: 5000, dealType: "VS" });
    const lower = artistPayout({ ...base, guarantee: 5000, dealType: "vs" });
    expect(lower.artistTotal).toBe(upper.artistTotal);
  });
});
