import { breakEvenShare, guaranteeInExpenses, walkoutAt, type WalkoutBasis } from "@/lib/offers/walkout";

// $18k vs 85% after costs, guarantee outside expenses.
const VS: WalkoutBasis = {
  netPotential: 60000,
  totalFixed: 20000,
  totalVariable: 4000,
  sellable: 2000,
  guarantee: 18000,
  backendPct: 85,
  dealType: "VS",
};

describe("walkout scenarios", () => {
  it("pays the percentage when it beats the guarantee, at sellout", () => {
    // pool 60,000 − 24,000 = 36,000; 85% = 30,600 > 18,000
    const w = walkoutAt(1, VS);
    expect(w.sold).toBe(2000);
    expect(w.expenses).toBe(24000);
    expect(w.artist).toBeCloseTo(30600, 6);
    expect(w.venue).toBeCloseTo(5400, 6);
  });

  it("holds the guarantee when the percentage falls short", () => {
    // half the room: net 30,000, expenses 22,000, pool 8,000 → 85% is 6,800
    const w = walkoutAt(0.5, VS);
    expect(w.expenses).toBe(22000);
    expect(w.artist).toBe(18000);
    expect(w.venue).toBe(-10000);
  });

  it("finds the share where the venue stops losing money", () => {
    // guarantee region: 56,000·s − 20,000 − 18,000 = 0
    expect(breakEvenShare(VS)).toBeCloseTo(38000 / 56000, 6);
  });

  it("does not take the guarantee twice when it is already the Talent line", () => {
    // FLAT: $8k talent sits inside the $12k fixed expenses
    const flat: WalkoutBasis = {
      netPotential: 30000,
      totalFixed: 12000,
      totalVariable: 1000,
      sellable: 1000,
      guarantee: 8000,
      backendPct: 0,
      dealType: "FLAT",
    };
    expect(guaranteeInExpenses("FLAT")).toBe(true);
    const w = walkoutAt(1, flat);
    expect(w.artist).toBe(8000);
    expect(w.venue).toBe(17000);
    expect(breakEvenShare(flat)).toBeCloseTo(12000 / 29000, 6);
  });

  it("charges only the backend on top of expenses for a PLUS deal", () => {
    // pool 30,000 × 50% = 15,000 → overage 5,000 over the $10k guarantee
    const plus: WalkoutBasis = {
      netPotential: 50000,
      totalFixed: 20000,
      totalVariable: 0,
      sellable: 1000,
      guarantee: 10000,
      backendPct: 50,
      dealType: "PLUS",
    };
    const w = walkoutAt(1, plus);
    expect(w.artist).toBe(15000);
    expect(w.venue).toBe(25000);
  });

  it("reports no break-even when the show loses money even sold out", () => {
    expect(breakEvenShare({ ...VS, netPotential: 10000 })).toBeNull();
  });

  it("clamps the share to the room", () => {
    expect(walkoutAt(1.4, VS).sold).toBe(2000);
    expect(walkoutAt(-1, VS).sold).toBe(0);
  });
});
