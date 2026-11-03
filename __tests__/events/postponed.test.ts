import { POSTPONED_SALES_REASON, pastEventReason } from "@/lib/events/closeout";

describe("a postponed show", () => {
  it("isn't on sale, however far off its date is", () => {
    expect(pastEventReason({ date: "2099-01-01", status: "postponed" })).toBe(POSTPONED_SALES_REASON);
  });

  it("goes back on sale once it's published with a new date", () => {
    expect(pastEventReason({ date: "2099-01-01", status: "published" })).toBeNull();
  });
});
