import {
  localTodayISO,
  eventDayISO,
  isEventPast,
  isEventLive,
  isEventToday,
  compareEventsForDisplay,
} from "@/lib/dates";

/**
 * These tests exist because of a real, repeated production bug: comparing a
 * date-only event date against a UTC "now" on a UTC server ends the show day at
 * 6–7 PM Central — so the show in progress vanished from the box office and
 * scanner dropdowns right at doors.
 *
 * Every `now` below is written as an explicit UTC instant so the assertions
 * hold no matter what timezone the test process runs in.
 */

// Aug 5 2026 is CDT (UTC-5).
const SHOW_DAY = "2026-08-05";
const CDT_6PM = new Date("2026-08-05T23:00:00Z"); // 6:00 PM Central
const CDT_8PM = new Date("2026-08-06T01:00:00Z"); // 8:00 PM Central — past UTC midnight
const CDT_1159PM = new Date("2026-08-06T04:59:00Z"); // 11:59 PM Central
const CDT_1201AM = new Date("2026-08-06T05:01:00Z"); // 12:01 AM Central, next day

describe("localTodayISO", () => {
  it("returns the Central date, not the UTC date, after 7 PM CDT", () => {
    // UTC has already rolled over to Aug 6 at both of these instants.
    expect(localTodayISO(CDT_8PM)).toBe("2026-08-05");
    expect(localTodayISO(CDT_1159PM)).toBe("2026-08-05");
  });

  it("rolls over at Central midnight", () => {
    expect(localTodayISO(CDT_1201AM)).toBe("2026-08-06");
  });

  it("handles CST (winter, UTC-6) as well as CDT", () => {
    // 8:00 PM Central on Jan 15 is Jan 16 02:00Z.
    expect(localTodayISO(new Date("2026-01-16T02:00:00Z"))).toBe("2026-01-15");
    // 12:01 AM Central on Jan 16.
    expect(localTodayISO(new Date("2026-01-16T06:01:00Z"))).toBe("2026-01-16");
  });
});

describe("eventDayISO", () => {
  it("reads the day off a date-only string", () => {
    expect(eventDayISO("2026-08-05")).toBe("2026-08-05");
  });

  it("reads the day off a full timestamp", () => {
    expect(eventDayISO("2026-08-05T20:00:00")).toBe("2026-08-05");
    expect(eventDayISO("2026-08-05T20:00:00-05:00")).toBe("2026-08-05");
  });

  it("tolerates empty input", () => {
    expect(eventDayISO("")).toBe("");
  });
});

describe("isEventPast / isEventLive — the show in progress", () => {
  it("keeps tonight's show live at 6 PM Central", () => {
    expect(isEventPast(SHOW_DAY, CDT_6PM)).toBe(false);
    expect(isEventLive(SHOW_DAY, CDT_6PM)).toBe(true);
  });

  it("keeps tonight's show live at 8 PM Central, after UTC has rolled over", () => {
    // This is the exact instant the old UTC comparison dropped the event.
    expect(isEventPast(SHOW_DAY, CDT_8PM)).toBe(false);
    expect(isEventLive(SHOW_DAY, CDT_8PM)).toBe(true);
  });

  it("keeps tonight's show live at 11:59 PM Central", () => {
    expect(isEventLive(SHOW_DAY, CDT_1159PM)).toBe(true);
  });

  it("retires the show at Central midnight", () => {
    expect(isEventPast(SHOW_DAY, CDT_1201AM)).toBe(true);
    expect(isEventLive(SHOW_DAY, CDT_1201AM)).toBe(false);
  });

  it("treats tomorrow's show as live", () => {
    expect(isEventLive("2026-08-06", CDT_8PM)).toBe(true);
  });

  it("treats yesterday's show as past", () => {
    expect(isEventPast("2026-08-04", CDT_6PM)).toBe(true);
  });

  it("does not drop a show the evening before it happens", () => {
    // The box office bug: new Date("2026-08-05") is midnight UTC = 7 PM Aug 4
    // Central, so the show fell out of the dropdown a day early.
    const nightBefore = new Date("2026-08-05T01:00:00Z"); // 8 PM Central, Aug 4
    expect(isEventLive(SHOW_DAY, nightBefore)).toBe(true);
  });

  it("holds a full-timestamp event to the same rule", () => {
    expect(isEventLive("2026-08-05T20:00:00", CDT_1159PM)).toBe(true);
    expect(isEventPast("2026-08-05T20:00:00", CDT_1201AM)).toBe(true);
  });
});

describe("isEventToday", () => {
  it("is true through the whole Central day", () => {
    expect(isEventToday(SHOW_DAY, CDT_6PM)).toBe(true);
    expect(isEventToday(SHOW_DAY, CDT_1159PM)).toBe(true);
  });

  it("is false once Central midnight passes", () => {
    expect(isEventToday(SHOW_DAY, CDT_1201AM)).toBe(false);
  });
});

describe("compareEventsForDisplay", () => {
  it("puts today's show first, then upcoming soonest-first", () => {
    const events = [
      { date: "2026-08-20" },
      { date: "2026-08-05" }, // today
      { date: "2026-08-08" },
    ];
    const sorted = [...events].sort((a, b) => compareEventsForDisplay(a, b, CDT_8PM));
    expect(sorted.map((e) => e.date)).toEqual([
      "2026-08-05",
      "2026-08-08",
      "2026-08-20",
    ]);
  });

  it("sorts past events last, most recent first", () => {
    const events = [
      { date: "2026-07-01" },
      { date: "2026-08-05" }, // today
      { date: "2026-07-28" },
      { date: "2026-08-09" },
    ];
    const sorted = [...events].sort((a, b) => compareEventsForDisplay(a, b, CDT_8PM));
    expect(sorted.map((e) => e.date)).toEqual([
      "2026-08-05",
      "2026-08-09",
      "2026-07-28",
      "2026-07-01",
    ]);
  });
});
