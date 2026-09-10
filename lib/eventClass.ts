import type { EventType } from "@/lib/types/event";

/**
 * What kind of event is this, ticketing-wise — one definition.
 *
 * The hard-ticket predicate existed three times and TWO OF THEM WERE WRONG:
 *
 *   app/admin/events/new/page.tsx:246  ["hard_ticket","ticketed","co_promote","rental_box_office"]
 *   app/admin/events/new/page.tsx:421  (the same list again)
 *   app/admin/events/[id]/edit/page.tsx:627  event_type === "hard_ticket" || === "ticketed"
 *   app/admin/events/[id]/edit/page.tsx:832  (the same narrow copy again)
 *
 * The edit form omitted co_promote and rental_box_office. In that form
 * isHardTicket gates tier validation, the lowestPrice calculation, the
 * event_venues.tax_method write, the presale PUT and — the one that bites —
 * the PUT to /api/events/[id]/ticket-types.
 *
 * So the failure was: create a co-promote or rental box office show with
 * tiers, which events/new does happily; open it in the edit form and save
 * anything at all; the tiers are not written and events.price is set to 0,
 * because lowestPrice falls to its non-ticketed branch. Silent, and it
 * survives every subsequent save.
 *
 * Both types are real and production writes them — events/new has explicit
 * branches for each at lines 405 and 408. Consolidating here fixes the edit
 * form by construction rather than by remembering to update four places.
 */

/** The six values `events.event_type` actually takes. */
export const EVENT_TYPES = [
  "hard_ticket",
  "ticketed",
  "co_promote",
  "rental_box_office",
  "non_ticketed",
  "private",
] as const;

/**
 * Types that sell tickets through our own ticketing: tiers, scaling, presale,
 * fees and an on-sale date all apply.
 *
 * co_promote and rental_box_office are included because we run the box office
 * for both — the money is split differently afterwards, but the ticketing
 * mechanics are identical. ADMIN_MERGE_PLAN.md § 8 question 4 asks whether
 * they belong in the DASHBOARD's hard-ticket revenue band, which is a separate
 * question about whose money it is; it does not change whether they sell
 * tickets. Do not use this predicate to answer that one.
 */
const HARD_TICKET_TYPES: ReadonlySet<string> = new Set([
  "hard_ticket",
  "ticketed",
  "co_promote",
  "rental_box_office",
]);

export function isHardTicket(eventType: EventType | string | null | undefined): boolean {
  return HARD_TICKET_TYPES.has((eventType ?? "").trim());
}

/** Private/rental bookings — no public on-sale, quoted and contracted instead. */
export function isPrivateEvent(eventType: EventType | string | null | undefined): boolean {
  return (eventType ?? "").trim() === "private";
}

/**
 * Settles to a third party as well as to us, so gross is not all ours. This is
 * the distinction § 8 question 4 is really about; kept separate from
 * isHardTicket so the two never get conflated again.
 */
export function settlesToThirdParty(
  eventType: EventType | string | null | undefined
): boolean {
  const t = (eventType ?? "").trim();
  return t === "co_promote" || t === "rental_box_office";
}
