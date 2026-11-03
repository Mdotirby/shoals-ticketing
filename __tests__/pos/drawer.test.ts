import { countedCents, drawerVariance } from "@/lib/pos/drawer";

describe("the drawer", () => {
  it("adds up the count", () => {
    expect(countedCents({ "100": 1, "20": 7, "10": 1, "5": 1 })).toBe(25500);
    expect(countedCents({ q: 3, d: 10 })).toBe(175);
    expect(countedCents({ "20": -2, "1": 1.9 })).toBe(100);
  });

  it("compares it with the float plus cash sales", () => {
    expect(drawerVariance(20000, 5500, 25500)).toEqual({ expected: 25500, variance: 0, matches: true });
    expect(drawerVariance(20000, 5500, 25000)).toEqual({ expected: 25500, variance: -500, matches: false });
  });
});
