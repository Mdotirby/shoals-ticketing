import { wrongShowReason } from "@/lib/tickets/scanShow";

describe("wrongShowReason", () => {
  const ticket = { event_id: "a", event_title: "Bottomland", event_date: "2026-10-30T20:00:00+00:00" };

  it("lets a ticket through at its own show", () => {
    expect(wrongShowReason(ticket, "a")).toBeNull();
  });

  it("names the show a ticket is really for", () => {
    expect(wrongShowReason(ticket, "b")).toBe("This ticket is for Bottomland on Oct 30, 2026.");
  });

  it("still refuses when the show's details are missing", () => {
    expect(wrongShowReason({ event_id: "a" }, "b")).toBe("This ticket is for a different show.");
  });

  it("doesn't judge when the scanner has no show selected", () => {
    expect(wrongShowReason(ticket, "")).toBeNull();
    expect(wrongShowReason(ticket, undefined)).toBeNull();
  });
});
