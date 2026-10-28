import {
  sectionTakesSeatMarks,
  seatsForMark,
  countMarks,
  showCapacity,
  sellableAfterMarks,
  type MarkableSeat,
  type MarkableSection,
} from "@/lib/seating/showMarks";

/**
 * Show mode decides whether real inventory comes off sale, so these pin the
 * refusals as hard as the permissions: a sold seat cannot be held, a table
 * holds whole, and a section that does not name seats cannot be painted at
 * all.
 */

const assigned: MarkableSection = { id: "s1", name: "Orchestra", seating_mode: "assigned" };
const firstCome: MarkableSection = { id: "s2", name: "Balcony", seating_mode: "first_come" };
const standing: MarkableSection = { id: "s3", name: "Floor", type: "ga" };
const tables: MarkableSection = { id: "s4", name: "VIP Tables", seating_mode: "assigned", sells_as_table: true };

const seat = (id: string, status = "available", sectionId = "s1", objectId?: string): MarkableSeat =>
  ({ id, status, sectionId, objectId });

describe("which sections can be painted at all", () => {
  test("an assigned section can", () => {
    expect(sectionTakesSeatMarks(assigned)).toBe(true);
  });

  test("a first-come section cannot — a ticket there names no seat", () => {
    expect(sectionTakesSeatMarks(firstCome)).toBe(false);
  });

  test("standing cannot", () => {
    expect(sectionTakesSeatMarks(standing)).toBe(false);
  });

  test("a section with no mode set is assigned, which is what every section was", () => {
    expect(sectionTakesSeatMarks({ id: "x", name: "Old" })).toBe(true);
  });

  test("painting a first-come section is refused, and says what to do instead", () => {
    const r = seatsForMark(seat("a", "available", "s2"), firstCome, []);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toMatch(/by the count/i);
    expect(r.reason).toContain("Balcony");
  });
});

describe("seats that are spoken for", () => {
  test("a sold seat cannot be held", () => {
    // Somebody holds that ticket. Taking it off sale does not un-sell it.
    const r = seatsForMark(seat("a", "sold"), assigned, []);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toMatch(/sold/i);
  });

  test("a seat in a live checkout cannot be held", () => {
    // Pulling it now takes the seat out from under a card being charged.
    const r = seatsForMark(seat("a", "held"), assigned, []);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toMatch(/checking out/i);
  });

  test("an available seat marks just itself", () => {
    const r = seatsForMark(seat("a"), assigned, [seat("a"), seat("b")]);
    expect(r).toEqual({ ok: true, seatIds: ["a"] });
  });
});

describe("a table holds whole", () => {
  const table = [
    seat("t1", "available", "s4", "obj1"),
    seat("t2", "available", "s4", "obj1"),
    seat("t3", "available", "s4", "obj1"),
    seat("other", "available", "s4", "obj2"),
  ];

  test("clicking one seat marks the whole table", () => {
    // Half a held table is a table nobody can sell and the artist cannot use.
    const r = seatsForMark(table[0], tables, table);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.seatIds.sort()).toEqual(["t1", "t2", "t3"]);
  });

  test("a table with a sold seat cannot be held, and says how many", () => {
    const withSold = [{ ...table[1], status: "sold" }, table[0], table[2]];
    const r = seatsForMark(table[0], tables, withSold);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toMatch(/1 of that table's seats are sold/i);
  });

  test("a table with a seat mid-checkout cannot be held", () => {
    const inFlight = [{ ...table[1], status: "held" }, table[0], table[2]];
    const r = seatsForMark(table[0], tables, inFlight);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toMatch(/checking out/i);
  });

  test("an assigned section that is not tables marks one seat even with an object", () => {
    const r = seatsForMark(seat("a", "available", "s1", "obj1"), assigned, table);
    expect(r).toEqual({ ok: true, seatIds: ["a"] });
  });
});

describe("counting", () => {
  const marks = [
    { mark: "artist" }, { mark: "artist" },
    { mark: "production" },
    { mark: "house_comp" }, { mark: "house_comp" }, { mark: "house_comp" },
    { mark: "kill" },
    { mark: "nonsense" },
  ];

  test("each kind, and nothing else", () => {
    expect(countMarks(marks)).toEqual({ artist: 2, production: 1, house_comp: 3, kill: 1 });
  });

  test("nothing marked is all zeroes, not an empty object", () => {
    expect(countMarks([])).toEqual({ artist: 0, production: 0, house_comp: 0, kill: 0 });
  });
});

describe("what the room holds, and what is left to sell", () => {
  const room = { seats: 300, gaCapacity: 100, sold: 50 };
  const counts = { artist: 10, production: 4, house_comp: 6, kill: 8 };

  test("fire-code capacity drops by kills only", () => {
    // A held seat still has a body in it — the artist's guest is a person.
    // A killed seat is out of the room for the night.
    expect(showCapacity(room, counts)).toBe(392);
  });

  test("holds do not change capacity", () => {
    const noHolds = { ...counts, artist: 0, production: 0, house_comp: 0 };
    expect(showCapacity(room, noHolds)).toBe(showCapacity(room, counts));
  });

  test("sellable takes out kills, every hold, and what already sold", () => {
    // 400 − 8 killed − 20 held − 12 by count − 50 sold
    expect(sellableAfterMarks(room, counts, 12)).toBe(310);
  });

  test("sellable never goes negative", () => {
    expect(sellableAfterMarks({ seats: 10, gaCapacity: 0, sold: 9 }, { artist: 5, production: 0, house_comp: 0, kill: 0 }, 0)).toBe(0);
  });

  test("a room with nothing marked sells everything unsold", () => {
    const none = { artist: 0, production: 0, house_comp: 0, kill: 0 };
    expect(sellableAfterMarks(room, none, 0)).toBe(350);
  });
});
