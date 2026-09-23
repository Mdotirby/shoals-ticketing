import { refusalReason } from "@/lib/tickets/void";

/**
 * One definition of a valid ticket, shared by the handheld scanner and the
 * bulk check-in list. They used to disagree — bulk check-in looked only at
 * is_scanned — and six tickets from a fully refunded VIP table were admitted
 * through the looser one.
 */
describe("refusalReason — what the door turns away", () => {
  it("admits a clean ticket", () => {
    expect(refusalReason({ is_scanned: false, orderStatus: "paid" })).toBeNull();
  });

  it("turns away a voided ticket and says why", () => {
    expect(refusalReason({ voided_at: "2026-08-15T12:00:00Z", void_reason: "Order refunded" }))
      .toBe("Void — order refunded.");
  });

  it("turns away a voided ticket with no reason recorded", () => {
    expect(refusalReason({ voided_at: "2026-08-15T12:00:00Z" })).toBe("This ticket has been voided.");
  });

  it("turns away a ticket on a refunded order even before it is voided", () => {
    // The backstop that already existed on the scanner, now shared.
    expect(refusalReason({ is_scanned: false, orderStatus: "refunded" }))
      .toBe("This order was refunded — ticket is no longer valid.");
  });

  it("turns away an already-scanned ticket", () => {
    expect(refusalReason({ is_scanned: true, scanned_at: "2026-08-15T23:36:57Z" }))
      .toMatch(/^Already scanned at /);
  });

  it("handles an already-scanned ticket with no timestamp", () => {
    expect(refusalReason({ is_scanned: true })).toBe("Already scanned.");
  });

  it("reports the VOID ahead of the scan — the Haggar Noah case", () => {
    // Scanned on the night, refunded and voided afterwards. The honest answer
    // is that the ticket is void, not merely that it was used.
    expect(
      refusalReason({
        voided_at: "2026-09-23T10:00:00Z",
        void_reason: "Order refunded",
        is_scanned: true,
        scanned_at: "2026-08-15T23:36:57Z",
        orderStatus: "refunded",
      }),
    ).toBe("Void — order refunded.");
  });

  it("treats a missing voided_at column as not voided", () => {
    // A database without the migration still has to let paying customers in.
    expect(refusalReason({ voided_at: null, void_reason: null, is_scanned: false, orderStatus: "paid" })).toBeNull();
  });
});
