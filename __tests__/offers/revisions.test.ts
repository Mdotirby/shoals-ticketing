import { blockingTerms, changedTerms, openRevision, operativeVersion, type OfferVersion } from "@/lib/offers/revisions";

const signed = { guarantee: 18000, backend_percentage: 85, deal_type: "vs", notes: "old", status: "accepted", ticket_scaling: [{ tier: "GA", price: 25 }] };

describe("changedTerms", () => {
  test("the builder re-sending the same values changes nothing", () => {
    expect(changedTerms(signed, { guarantee: "18000", backend_percentage: "85", deal_type: "vs", ticket_scaling: [{ tier: "GA", price: 25 }] })).toEqual([]);
  });
  test("notes and status may change on a signed offer", () => {
    expect(changedTerms(signed, { notes: "new", status: "declined" })).toEqual([]);
  });
  test("moving the guarantee or the scaling is a term change", () => {
    expect(changedTerms(signed, { guarantee: 20000 })).toEqual(["guarantee"]);
    expect(changedTerms(signed, { ticket_scaling: [{ tier: "GA", price: 30 }] })).toEqual(["ticket_scaling"]);
  });
  test("empty and null are the same", () => {
    expect(changedTerms({ other_terms: null }, { other_terms: "" })).toEqual([]);
  });
});

const v = (o: Partial<OfferVersion>): OfferVersion => ({
  id: "x", version: 1, status: "draft", revision_of: null, superseded_at: null, created_at: "", updated_at: null,
  guarantee: null, backend_percentage: null, deal_type: null, ...o,
});

describe("chain", () => {
  const chain = [
    v({ id: "a", version: 1, status: "accepted", superseded_at: "2026-10-01" }),
    v({ id: "b", version: 2, status: "accepted", revision_of: "a" }),
    v({ id: "c", version: 3, status: "draft", revision_of: "b" }),
  ];
  test("the operative version is the newest signed one not superseded — never the draft", () => {
    expect(operativeVersion(chain)?.id).toBe("b");
  });
  test("an unsigned revision is the open one", () => {
    expect(openRevision(chain)?.id).toBe("c");
    expect(openRevision(chain.slice(0, 2))).toBeNull();
  });
});

/**
 * blockingTerms — the one exception to "a countersigned offer is frozen".
 *
 * Accepting an offer is what creates its show, so event_id can only ever be
 * filled in after acceptance. It is allowed exactly once.
 */
describe("blockingTerms — linking a countersigned offer to its show", () => {
  const unlinked = { status: "accepted", guarantee: 8000, event_id: null };

  it("lets an unlinked signed offer take an event_id", () => {
    expect(blockingTerms(unlinked, { event_id: "evt-1" })).toEqual([]);
  });

  it("still refuses a term change sent alongside the link", () => {
    expect(blockingTerms(unlinked, { event_id: "evt-1", guarantee: 9000 })).toEqual(["guarantee"]);
  });

  it("refuses re-pointing an already-linked offer at a different show", () => {
    expect(blockingTerms({ ...unlinked, event_id: "evt-1" }, { event_id: "evt-2" })).toEqual(["event_id"]);
  });

  it("refuses clearing an existing link", () => {
    expect(blockingTerms({ ...unlinked, event_id: "evt-1" }, { event_id: null })).toEqual(["event_id"]);
  });

  it("is a no-op when the link is already what it should be", () => {
    expect(blockingTerms({ ...unlinked, event_id: "evt-1" }, { event_id: "evt-1" })).toEqual([]);
  });
});
