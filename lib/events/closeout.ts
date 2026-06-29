/**
 * Shared helpers for the event close-out workflow.
 *
 * An event is considered PAST (and locked from public ticket sales) when:
 *   • `closed_out_at` is set (admin manually closed the show), OR
 *   • it is more than 2 hours past the show's start_time on the show date, OR
 *   • (no start_time) the show date has fully passed (next day 06:00 UTC)
 *
 * The 2-hour grace window means walk-up / late-arrival sales stay open until
 * roughly 2 hours after doors. The +7h UTC offset converts US Central local
 * show times (CDT = UTC−5) to UTC correctly; CST (UTC−6) events get ~1h grace.
 *
 * Used by:
 *   • /api/checkout/create-intent  — to block paid ticket purchases
 *   • /api/checkout                — legacy paid checkout path
 *   • /api/checkout/free           — to block free RSVPs
 *   • /api/events                  — to filter the public list
 *   • app/events/[id]/EventDetailClient.tsx — to swap the buy UI for an
 *     archive-style "past show" message
 */

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
 * True if the sales window for this event has passed.
 *
 * With start_time (e.g. "19:00"):  sales close 2 hours after show start in
 *   US Central time (CDT/CST). Implemented as: midnight UTC of show date +
 *   start_time hours + 7h (= 5h CDT offset + 2h grace).
 *
 * Without start_time: sales close at 06:00 UTC the next day
 *   (≈ midnight–1am Central), preventing midnight-UTC rollover from
 *   cutting off same-day shows.
 */
export function isPastByDate(event: EventLikeForCloseout | null | undefined): boolean {
  if (!event?.date) return false;

  const now = Date.now();

  // UTC midnight of the show date
  const [y, mo, d] = event.date.split("-").map(Number);
  const midnightUTC = Date.UTC(y, mo - 1, d);

  if (event.start_time) {
    const [hStr, mStr] = event.start_time.split(":");
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr ?? "0", 10);
    if (!Number.isNaN(h) && !Number.isNaN(m)) {
      // start_time is US Central local. Add 7h (CDT offset 5 + 2h grace)
      // so the cutoff lands ~2 hours after the show starts in Central time.
      const cutoff = midnightUTC + (h + 7) * 3_600_000 + m * 60_000;
      return now > cutoff;
    }
  }

  // No start_time: close at 06:00 UTC the next day (≈ midnight–1am Central)
  return now > midnightUTC + 30 * 3_600_000;
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
  if (isPastByDate(event)) return "This show has already happened.";
  return null;
}
