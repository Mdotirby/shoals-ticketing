import {
  inheritedMode,
  normalizeUnlockCode,
  resolveTierFees,
  unlocksTier,
  type InheritedFees,
} from "@/lib/fees/tierFees";

/** The Bend Hall's usual rate card: $3 service, $2 facility. */
const venue: InheritedFees = { ticketingFee: 3, facilityFee: 2 };

describe("resolveTierFees — inheritance", () => {
  it("adds both fees on top by default", () => {
    const r = resolveTierFees(venue, null);
    expect(r.service).toEqual({ mode: "added", charged: 3, earned: 3 });
    expect(r.facility).toEqual({ mode: "added", charged: 2, earned: 2 });
    expect(r.addedToFace).toBe(5);
    expect(r.anyWaived).toBe(false);
  });

  it("reads the event's fees_included_in_price as 'included'", () => {
    const r = resolveTierFees({ ...venue, feesIncludedInPrice: true }, null);
    expect(r.service.mode).toBe("included");
    expect(r.addedToFace).toBe(0);
    // Still earned — that is the whole difference from waived.
    expect(r.service.earned).toBe(3);
    expect(r.anyWaived).toBe(false);
  });

  it("reads facility_fee_enabled === false as a genuine waive", () => {
    const r = resolveTierFees({ ...venue, facilityFeeEnabled: false }, null);
    expect(r.facility).toEqual({ mode: "waived", charged: 0, earned: 0 });
    expect(r.service.mode).toBe("added");
    expect(r.anyWaived).toBe(true);
  });

  it("maps the old booleans without changing behaviour", () => {
    expect(inheritedMode("service", venue)).toBe("added");
    expect(inheritedMode("service", { ...venue, feesIncludedInPrice: true })).toBe("included");
    expect(inheritedMode("facility", { ...venue, facilityFeeEnabled: false })).toBe("waived");
  });
});

describe("resolveTierFees — the tier overrides the event", () => {
  it("waives both fees for a wristband tier on a normal show", () => {
    const r = resolveTierFees(venue, { service_fee_mode: "waived", facility_fee_mode: "waived" });
    expect(r.addedToFace).toBe(0);
    expect(r.service.earned).toBe(0);
    expect(r.facility.earned).toBe(0);
    expect(r.anyWaived).toBe(true);
  });

  it("keeps a waive distinct from included — same to the buyer, different to the show", () => {
    const waived = resolveTierFees(venue, { service_fee_mode: "waived", facility_fee_mode: "waived" });
    const included = resolveTierFees(venue, { service_fee_mode: "included", facility_fee_mode: "included" });

    // The buyer cannot tell these apart.
    expect(waived.addedToFace).toBe(included.addedToFace);
    // The show certainly can.
    expect(waived.service.earned + waived.facility.earned).toBe(0);
    expect(included.service.earned + included.facility.earned).toBe(5);
  });

  it("lets one tier waive while another on the same show still charges", () => {
    const ga = resolveTierFees(venue, null);
    const wristband = resolveTierFees(venue, { service_fee_mode: "waived", facility_fee_mode: "waived" });
    expect(ga.addedToFace).toBe(5);
    expect(wristband.addedToFace).toBe(0);
  });

  it("lets a tier opt back IN when the event bakes fees in", () => {
    const evt = { ...venue, feesIncludedInPrice: true };
    expect(resolveTierFees(evt, null).service.mode).toBe("included");
    expect(resolveTierFees(evt, { service_fee_mode: "added" }).service).toEqual({ mode: "added", charged: 3, earned: 3 });
  });

  it("overrides each fee independently", () => {
    const r = resolveTierFees(venue, { service_fee_mode: "waived" });
    expect(r.service.mode).toBe("waived");
    expect(r.facility.mode).toBe("added"); // untouched
    expect(r.addedToFace).toBe(2);
  });
});

describe("resolveTierFees — edges", () => {
  it("reports a zero-rate fee as waived rather than a $0 charge", () => {
    const r = resolveTierFees({ ticketingFee: 0, facilityFee: 0 }, null);
    expect(r.service.mode).toBe("waived");
    expect(r.addedToFace).toBe(0);
    // Nothing was actually given up, so this is not a waive worth flagging.
    expect(r.anyWaived).toBe(false);
  });

  it("does not accumulate float noise", () => {
    const r = resolveTierFees({ ticketingFee: 3.33, facilityFee: 2.34 }, null);
    expect(r.addedToFace).toBe(5.67);
  });

  it("treats a missing tier as inherit", () => {
    expect(resolveTierFees(venue, undefined).addedToFace).toBe(5);
  });
});

describe("unlock codes", () => {
  it("lets anyone buy a tier with no code", () => {
    expect(unlocksTier(null, "")).toBe(true);
    expect(unlocksTier("", "anything")).toBe(true);
  });

  it("ignores case and surrounding space", () => {
    expect(unlocksTier("WRISTBAND", " wristband ")).toBe(true);
    expect(unlocksTier("WRISTBAND", "WrIsTbAnD")).toBe(true);
  });

  it("refuses the wrong code or none at all", () => {
    expect(unlocksTier("WRISTBAND", "GA")).toBe(false);
    expect(unlocksTier("WRISTBAND", "")).toBe(false);
    expect(unlocksTier("WRISTBAND", null)).toBe(false);
  });

  it("normalises for storage", () => {
    expect(normalizeUnlockCode(" wristband ")).toBe("WRISTBAND");
    expect(normalizeUnlockCode(null)).toBe("");
  });
});
