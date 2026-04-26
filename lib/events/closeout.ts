/**
 * Shared helpers for the event close-out workflow.
 *
 * An event is considered PAST (and locked from public ticket sales) when:
 *   • `closed_out_at` is set (admin manually closed the show), OR
 *   • the event date is strictly before today (server-local midnight)
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
};

/** True if the event has been manually closed out by an admin. */
export function isClosedOut(event: EventLikeForCloseout | null | undefined): boolean {
  return !!event?.closed_out_at;
}

/** True if the event date is strictly before today (server-local midnight). */
export function isPastByDate(event: EventLikeForCloseout | null | undefined): boolean {
  if (!event?.date) return false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const d =
    event.date.length === 10 && event.date[4] === "-"
      ? new Date(`${event.date}T23:59:59`)
      : new Date(event.date);
  if (Number.isNaN(d.getTime())) return false;
  return d < startOfToday;
}

/**
 * True if the event should be locked from public ticket sales —
 * either because an admin closed it out OR because the show date has passed.
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
