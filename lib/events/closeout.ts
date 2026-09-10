/**
 * Shared helpers for the event close-out workflow.
 *
 * An event is locked from PUBLIC ticket sales when:
 *   • `closed_out_at` is set (admin manually closed the show), OR
 *   • the storefront's sales window has closed — noon Central on show day.
 *
 * The window itself lives in lib/salesWindow.ts, which also knows that the
 * BOX OFFICE keeps selling until midnight Central. This file is only ever
 * asked about the public side, so it delegates and does not re-derive.
 *
 * Used by:
 *   • /api/checkout/create-intent  — to block paid ticket purchases
 *   • /api/checkout                — legacy paid checkout path
 *   • /api/checkout/free           — to block free RSVPs
 *   • /api/events                  — to filter the public list
 *   • app/events/[id]/EventDetailClient.tsx — to swap the buy UI for an
 *     archive-style "past show" message
 */

import { salesWindowFor } from "@/lib/salesWindow";

export type EventLikeForCloseout = {
  date?: string | null;
  closed_out_at?: string | null;
  start_time?: string | null;
};

/** True if the event has been manually closed out by an admin. */
export function isClosedOut(event: EventLikeForCloseout | null | undefined): boolean {
  return !!event?.closed_out_at;
}

/**
 * True if the storefront's sales window for this event has passed.
 *
 * ── REWRITTEN, AND THE OLD MATH IS WHY ─────────────────────────────────────
 * This used to compute the cutoff by hand from UTC midnight:
 *
 *     midnightUTC + (startHour + 7) * 3_600_000     // "5h CDT + 2h grace"
 *     midnightUTC + 30 * 3_600_000                  // "≈ midnight–1am Central"
 *
 * The 7 and the 30 hardcode CDT. For the four winter months the venues are on
 * CST and every cutoff landed an hour off, and the file's own comment admitted
 * it ("CST events get ~1h grace"). It also had nothing to say about WHO was
 * selling, so there was no way to keep the box office open after the web had
 * closed.
 *
 * lib/salesWindow.ts owns that now: noon Central on show day for the
 * storefront, midnight Central for the box office, resolved through Intl so
 * the offset is whatever Central actually is that week.
 *
 * `start_time` no longer participates. The storefront closes at noon on show
 * day regardless of doors, which is earlier than every cutoff this function
 * used to compute, so nothing that was sellable before is sellable now by
 * accident.
 */
export function isPastByDate(event: EventLikeForCloseout | null | undefined): boolean {
  if (!event?.date) return false;
  return !salesWindowFor(event.date).storefrontOpen;
}

/**
 * True if the event should be locked from public ticket sales —
 * either because an admin closed it out OR because the sales window has passed.
 */
export function isEventPast(event: EventLikeForCloseout | null | undefined): boolean {
  return isClosedOut(event) || isPastByDate(event);
}

/**
 * Human-readable reason for why an event can't accept ticket purchases.
 * Returns `null` if the event is open for sales.
 */
export function pastEventReason(
  event: EventLikeForCloseout | null | undefined
): string | null {
  if (isClosedOut(event)) return "This show has been closed out and is no longer on sale.";
  if (event?.date) {
    const w = salesWindowFor(event.date);
    // "Buy at the door" and "you have missed it" are different messages and
    // the buyer deserves the right one — between noon and midnight there is
    // still a way to get in.
    if (!w.storefrontOpen) return w.reason;
  }
  return null;
}
