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
