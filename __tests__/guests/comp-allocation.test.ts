import { allocationFor, checkedInGuestComps, generalAdmissionTier, isCompAllocation } from "@/lib/guests/compAllocation";

describe("guest comps", () => {
  it("counts only guests who have checked in, by their whole party", () => {
    expect(checkedInGuestComps([
      { quantity: 2, checked_in_at: "x", comp_allocation: "artist" },
      { quantity: 1, checked_in_at: "x", comp_allocation: "marketing" },
      { quantity: 3, checked_in_at: "x", comp_allocation: "venue" },
      { quantity: 5, checked_in_at: null, comp_allocation: "artist" },
    ])).toEqual({ total: 6, byAllocation: { artist: 2, venue: 3, marketing: 1 } });
  });

  it("treats a guest saved before the choice existed as venue, or artist if on an artist's list", () => {
    expect(allocationFor(null, "artist")).toBe("artist");
    expect(allocationFor(null, "house")).toBe("venue");
    expect(allocationFor("marketing", "artist")).toBe("marketing");
    expect(isCompAllocation("sponsor")).toBe(false);
  });

  it("finds General Admission, or falls back to the first tier", () => {
    expect(generalAdmissionTier(["VIP", "General Admission"])).toBe("General Admission");
    expect(generalAdmissionTier(["VIP", "GA Floor"])).toBe("GA Floor");
    expect(generalAdmissionTier(["VIP", "Balcony"])).toBe("VIP");
    expect(generalAdmissionTier([])).toBeUndefined();
  });
});
