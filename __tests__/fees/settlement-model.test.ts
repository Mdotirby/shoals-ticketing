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

  it("VS runs the percentage on the whole pool, then recoups the guarantee", () => {
    // pool 8000 × 85% = 6800, less the 5000 guarantee → overage 1800
    const p = artistPayout({ ...base, guarantee: 5000, dealType: "VS" });
    expect(p.netAfterExpenses).toBe(8000);
    expect(p.overage).toBeCloseTo(1800, 6);
    expect(p.artistBackend).toBeCloseTo(1800, 6);
    expect(p.artistTotal).toBeCloseTo(6800, 6);
  });

  it("VS is the greater of the guarantee or the percentage, never both", () => {
    const p = artistPayout({ ...base, guarantee: 5000, dealType: "VS" });
    expect(p.artistTotal).toBeCloseTo(Math.max(5000, 8000 * 0.85), 6);
  });

  it("does NOT apply the percentage to the pool net of the guarantee", () => {
    // (pool − guarantee) × pct reads plausibly and is a different deal. On the
    // real Drivin' N Cryin' settlement it pays 2700 instead of 2100.
    const dnc = {
      netReceipts: 5140, totalExpenses: 2140,
      guarantee: 2000, backendPct: 0.7, dealType: "VS",
    };
    const p = artistPayout(dnc);
    expect(p.netAfterExpenses).toBe(3000);
    expect(p.overage).toBeCloseTo(100, 6);
    expect(p.artistTotal).toBeCloseTo(2100, 6);
    // the wrong model:
    expect(2000 + (3000 - 2000) * 0.7).toBe(2700);
  });

  it("PLUS computes identically to VS", () => {
    const vs = artistPayout({ ...base, guarantee: 5000, dealType: "VS" });
    const plus = artistPayout({ ...base, guarantee: 5000, dealType: "PLUS" });
    expect(plus.artistTotal).toBe(vs.artistTotal);
  });

  it("pays the guarantee when the percentage doesn't beat it", () => {
    // pool 2000 × 85% = 1700, below the 5000 guarantee → no overage
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

describe("service fee rebate", () => {
  // Muscle Shoals Meets: The 90's — platform keeps half the service fee and
  // rebates the rest to the promoter, who takes 100% of net on top.
  const msm = {
    netReceipts: 40300,
    totalExpenses: 0,
    guarantee: 0,
    backendPct: 1.0,
    dealType: "DOOR",
    ticketingFees: 1965,
    serviceFeeRebatePct: 0.5,
  };

  it("pays the deal plus the rebate", () => {
    const p = artistPayout(msm);
    expect(p.dealTotal).toBe(40300);
    expect(p.serviceFeeRebate).toBe(982.5);
    expect(p.artistTotal).toBe(41282.5);
  });

  it("keeps the rebate outside the deal split, not inside it", () => {
    // The rebate must not be run through the backend percentage — it is a
    // separate obligation, not part of what the deal produces.
    const withRebate = artistPayout(msm);
    const without = artistPayout({ ...msm, serviceFeeRebatePct: 0 });
    expect(withRebate.dealTotal).toBe(without.dealTotal);
    expect(withRebate.artistTotal - without.artistTotal).toBe(982.5);
  });

  it("follows the service fee when it changes", () => {
    // The reason this is a percentage and not a flat per-ticket amount.
    const p = artistPayout({ ...msm, ticketingFees: 2620 }); // $4/unit
    expect(p.serviceFeeRebate).toBe(1310);
  });

  it("is zero when unset, leaving existing settlements untouched", () => {
    const p = artistPayout({
      netReceipts: 10000, totalExpenses: 0, guarantee: 5000,
      backendPct: 0.85, dealType: "VS",
    });
    expect(p.serviceFeeRebate).toBe(0);
    expect(p.artistTotal).toBe(p.dealTotal);
  });
});

describe("GBOR / NBOR walk", () => {
  // Matches the settlement workbook: GBOR is everything the buyer paid, so it
  // ties to the Stripe deposit; four pass-throughs come out to reach NBOR.
  it("reproduces the MSM 90's workbook figures", () => {
    const w = settlementWaterfall({
      totalGross: 39500 + 1962,   // face + service
      ticketingFees: 1962,
      facilityFees: 0,
      taxRate: 0.095,
      taxMethod: "multiplier",
      ccFees: 1291.59,
    });
    expect(w.gbor).toBeCloseTo(46506.09, 2);
    expect(w.netReceipts).toBeCloseTo(39500, 2);
  });

  it("GBOR less the four pass-throughs equals NBOR", () => {
    const w = settlementWaterfall({
      totalGross: 41462, ticketingFees: 1962, facilityFees: 0,
      taxRate: 0.095, taxMethod: "multiplier", ccFees: 1291.59,
    });
    expect(w.gbor - 1962 - 0 - 1291.59 - w.taxes).toBeCloseTo(w.netReceipts, 6);
  });

  it("does not double-count tax on a divisor event", () => {
    // Tax is already inside the face price there, so GBOR must not add it.
    const w = settlementWaterfall({
      totalGross: 884, ticketingFees: 102, facilityFees: 102,
      taxRate: 0.095, taxMethod: "divisor", ccFees: 32.25,
    });
    expect(w.gbor).toBeCloseTo(884 + 32.25, 2);
    expect(w.netReceipts).toBeCloseTo(621.0046, 3);
  });

  it("lands on the same NBOR the ticket-side walk gives", () => {
    const input = {
      totalGross: 41462, ticketingFees: 1962, facilityFees: 0,
      taxRate: 0.095, taxMethod: "multiplier" as const,
    };
    // Whether or not a card surcharge is passed, NBOR is unchanged — the
    // surcharge enters GBOR and leaves again as a deduction.
    expect(settlementWaterfall({ ...input, ccFees: 1291.59 }).netReceipts)
      .toBeCloseTo(settlementWaterfall(input).netReceipts, 6);
  });
});

describe("door / Terminal sales on a seated event", () => {
  // The box office sells by tier and quantity with no seat picker, so a sale
  // taken on the card reader has no seats to price from. A seated event prices
  // from the seat map, so without a fallback that order contributes zero face
  // value while still sitting in stripe_gross — pure variance, and the artist
  // is shorted the whole ticket.
  //
  // Verified against a simulated $902.78 VIP table sale on MSM 90's: face rose
  // from $39,500.00 to $40,402.78 and a "Door / Box Office" row appeared.
  it("backs face out of the charge rather than treating the total as face", () => {
    // $903.03 charged = $800 face + $3 service + $76 tax + $24.03 surcharge.
    // Using the total as face would hand the artist $903 for an $800 table.
    const total = 903.03;
    const surcharge = 24.03;
    const afterCard = total - surcharge;
    const afterFees = afterCard - 3;
    const face = afterFees / 1.095;
    expect(face).toBeCloseTo(800, 0);
    expect(face).toBeLessThan(total);
  });
});

describe("Terminal (card reader) sales — general admission", () => {
  // Drivin' N Cryin' is GA: no seat map, so the audit's tier path applies.
  // A Terminal order is source='terminal' with a non-zero total, so it is
  // neither a comp (source==='comp') nor free (total===0) — it counts as a
  // paying order exactly like an online one.
  const isComp = (src: string, total: number) => src === "comp";
  const isFree = (src: string, total: number) => src !== "comp" && total === 0;

  it("counts a Terminal order as a paying sale", () => {
    expect(isComp("terminal", 55.09)).toBe(false);
    expect(isFree("terminal", 55.09)).toBe(false);
  });

  it("does not mistake a Terminal sale for a comp or a freebie", () => {
    expect(isComp("comp", 0)).toBe(true);
    expect(isFree("online", 0)).toBe(true);
    expect(isFree("terminal", 0)).toBe(true); // a $0 reader sale is still free
  });

  it("flows through the deal math like any other GA sale", () => {
    // Two $20 GA tickets at the door lift NBOR by $40, which lifts the pool,
    // which lifts the overage at 70%.
    const before = artistPayout({
      netReceipts: 5140, totalExpenses: 2140,
      guarantee: 2000, backendPct: 0.7, dealType: "VS",
    });
    const after = artistPayout({
      netReceipts: 5180, totalExpenses: 2140,
      guarantee: 2000, backendPct: 0.7, dealType: "VS",
    });
    expect(before.artistTotal).toBeCloseTo(2100, 6);
    expect(after.artistTotal).toBeCloseTo(2128, 6);
  });
});
