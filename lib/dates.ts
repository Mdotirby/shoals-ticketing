/**
 * Shared date utilities for VenueCore.
 *
 * Centralises the "safe date" parsing logic that was previously
 * duplicated in 7+ files across the codebase.
 */

/**
 * Parse a date string safely.
 *
 * - Date-only strings ("2025-11-08") get "T12:00:00" appended so they
 *   are treated as noon local time instead of midnight UTC.
 * - Timezone offsets and trailing "Z" are stripped so the stored time
 *   is treated as the intended *local display* time.
 */
export function safeDate(date: string): Date {
  if (date && date.length === 10 && date[4] === "-") {
    return new Date(date + "T12:00:00");
  }
  return new Date(
    date.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, "")
  );
}

/** Format a date as "November 8, 2025" */
export function formatEventDateLong(date: string): string {
  return safeDate(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Format a date as "Nov 8, 2025" */
export function formatEventDateShort(date: string): string {
  return safeDate(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Format a date as "Saturday, November 8, 2025" */
export function formatEventDateFull(date: string): string {
  return safeDate(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Format a date as "Sat, Nov 8, 2025" (used in marketing pages) */
export function formatEventDateWeekday(date: string): string {
  return safeDate(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format the time portion of a date string.
 * Returns null if the time is midnight (meaning no time was set).
 */
export function formatEventTime(date: string): string | null {
  const d = safeDate(date);
  if (d.getHours() === 0 && d.getMinutes() === 0) return null;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Returns true if a date-only string was provided (no time component).
 */
export function isDateOnly(date: string): boolean {
  return !!(date && date.length === 10);
}

// ── Venue-local "is this show still live?" ──────────────────────────────────
//
// Everything below exists because the app runs on UTC servers (Vercel) while
// the venues run on Central time. Comparing a date-only event date against a
// UTC "now" ends the show day at 6–7 PM local — i.e. right at doors, the show
// in progress disappears from the box office and scanner dropdowns.
//
// The rule, one place, every surface: a show stays live through the whole of
// its own day in venue-local time and turns "past" at local midnight.

/** Every venue on both brands (venuecore.live, west72ent.com) runs Central. */
export const VENUE_TZ = "America/Chicago";

/**
 * Today's date as "YYYY-MM-DD" in venue-local time.
 *
 * Use this anywhere you would have reached for
 * `new Date().toISOString().slice(0, 10)` — that returns the *UTC* date, which
 * rolls over at 7 PM CDT / 6 PM CST.
 */
export function localTodayISO(now: Date = new Date()): string {
  // "en-CA" formats as YYYY-MM-DD, which is exactly the shape we compare on.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VENUE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The calendar day a stored event date falls on, as "YYYY-MM-DD".
 *
 * Stored dates come in two shapes: date-only ("2026-08-05") and full
 * timestamps. `safeDate` already treats the time portion of a timestamp as the
 * intended *local* wall clock (it strips "Z" and offsets), so the leading 10
 * characters are the venue-local day in both cases — and that keeps this in
 * agreement with every date the UI already renders.
 */
export function eventDayISO(date: string): string {
  return (date || "").slice(0, 10);
}

/** True once the show's own day has ended in venue-local time (local midnight). */
export function isEventPast(date: string, now: Date = new Date()): boolean {
  const day = eventDayISO(date);
  if (!day) return false;
  return day < localTodayISO(now);
}

/** True while the show is still sellable / scannable — through local midnight. */
export function isEventLive(date: string, now: Date = new Date()): boolean {
  return !isEventPast(date, now);
}

/** True when the show is happening today in venue-local time. */
export function isEventToday(date: string, now: Date = new Date()): boolean {
  const day = eventDayISO(date);
  return !!day && day === localTodayISO(now);
}

/**
 * Sort comparator for admin event lists: today's show(s) first, then upcoming
 * soonest-first. Past events sort last (most recent first) for the cases where
 * they're shown deliberately.
 */
export function compareEventsForDisplay(
  a: { date: string },
  b: { date: string },
  now: Date = new Date()
): number {
  const today = localTodayISO(now);
  const dayA = eventDayISO(a.date);
  const dayB = eventDayISO(b.date);

  // Rank: 0 = today, 1 = upcoming, 2 = past
  const rank = (day: string) => (day === today ? 0 : day > today ? 1 : 2);
  const rankA = rank(dayA);
  const rankB = rank(dayB);
  if (rankA !== rankB) return rankA - rankB;

  // Past archive reads most-recent-first; today/upcoming read soonest-first.
  return rankA === 2 ? dayB.localeCompare(dayA) : dayA.localeCompare(dayB);
}
