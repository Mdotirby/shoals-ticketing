import { cardPresentTotal, cashSuggestions, changeDue, parseCashInput } from "@/lib/pos/pricing";

describe("cardPresentTotal", () => {
  const ga = { faceCents: 1500, serviceCents: 300, facilityCents: 300, taxCents: 0 };

  it("matches what the reader charged at Bottomland", () => {
    expect(cardPresentTotal(ga, 2)).toEqual({ faceCents: 3000, feesCents: 1200, taxCents: 0, processingCents: 122, totalCents: 4322 });
  });

  it("prices one ticket as the design does", () => {
    expect(cardPresentTotal(ga, 1).totalCents).toBe(2163);
  });

  it("charges tax and honours a waived fee", () => {
    const r = cardPresentTotal({ faceCents: 2000, serviceCents: 0, facilityCents: 300, taxCents: 190 }, 1);
    expect(r.feesCents).toBe(300);
    expect(r.taxCents).toBe(190);
    expect(r.totalCents).toBe(2490 + r.processingCents);
  });
});

describe("cash", () => {
  it("suggests the next $10 steps and the next $100", () => {
    expect(cashSuggestions(3000, 3)).toEqual([4000, 5000, 6000, 10000]);
    expect(cashSuggestions(3000, 2)).toEqual([4000, 5000, 10000]);
    expect(cashSuggestions(9500, 1)).toEqual([10000]);
    expect(cashSuggestions(0, 3)).toEqual([]);
  });

  it("works out change, and what's still owed", () => {
    expect(changeDue(3000, 4000)).toEqual({ state: "enough", cents: 1000 });
    expect(changeDue(3000, 3000)).toEqual({ state: "enough", cents: 0 });
    expect(changeDue(3000, 2000)).toEqual({ state: "short", cents: 1000 });
    expect(changeDue(3000, null)).toEqual({ state: "empty", cents: 0 });
  });

  it("reads what's typed into the cash box", () => {
    expect(parseCashInput("40")).toBe(4000);
    expect(parseCashInput("$40.50")).toBe(4050);
    expect(parseCashInput("")).toBeNull();
    expect(parseCashInput("abc")).toBeNull();
    expect(parseCashInput("1.234")).toBeNull();
  });
});
