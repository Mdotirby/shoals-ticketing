import { checkLocks, touchesLockedFields } from "@/lib/events/editLocks";

const current = {
  title: "Kestrel Bloom",
  date: "2026-11-14T19:00:00+00:00",
  venue: "Singin' River Brewing Co.",
  event_venue_id: "ev-1",
  venue_id: "v-1",
  event_type: "hard_ticket",
  description: "old",
};

describe("checkLocks", () => {
  test("an unchanged save changes nothing — the form's date format included", () => {
    const r = checkLocks(current, {
      title: "Kestrel Bloom",
      date: "2026-11-14T19:00:00",
      venue: "Singin' River Brewing Co.",
      event_venue_id: "ev-1",
      venue_id: "v-1",
      event_type: "hard_ticket",
    });
    expect(r).toEqual({ hardChanged: [], lockableChanged: [] });
  });

  test("changing event class is a hard-field change", () => {
    expect(checkLocks(current, { event_type: "private" }).hardChanged).toEqual(["event_type"]);
  });

  test("moving the date is recorded with before and after", () => {
    expect(checkLocks(current, { date: "2026-11-15T20:00:00" }).lockableChanged).toEqual([
      { field: "date", before: "2026-11-14T19:00:00+00:00", after: "2026-11-15T20:00:00" },
    ]);
  });

  test("open fields are never locked", () => {
    expect(checkLocks(current, { description: "new" })).toEqual({ hardChanged: [], lockableChanged: [] });
    expect(touchesLockedFields({ description: "new", image_url: "x" })).toBe(false);
  });

  test("fields the update doesn't send are not compared", () => {
    expect(checkLocks(current, {})).toEqual({ hardChanged: [], lockableChanged: [] });
  });

  test("null and empty read as the same value", () => {
    expect(checkLocks({ ...current, event_venue_id: null }, { event_venue_id: "" }).lockableChanged).toEqual([]);
  });
});
