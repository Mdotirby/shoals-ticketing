import type { EventType, EventDealType } from "@/lib/types/event";

/**
 * What kind of event is this — one definition, on two axes.
 *
 * TWO AXES (ADMIN_MERGE_PLAN.md § 9.1):
 *
 *   event_type  → does this sell through our ticketing?
 *   deal_type   → whose money is it?
 *
 * They used to be one. co_promote and rental_box_office sat in event_type as
 * if they were classes, which is why that enum had six values that did not
 * sort cleanly and why "do co-promotes belong in the hard-ticket band" had no
 * clean answer. They are deal structures on a show that sells here normally,
 * so they moved to deal_type and the band filters on class.
 *
 * WHAT THIS FIXES, HISTORICALLY: the predicate below existed four times and two
 * copies were wrong. app/admin/events/[id]/edit/page.tsx defined it as
 * `hard_ticket || ticketed`, omitting the other two, and it gates the PUT to
 * /api/events/[id]/ticket-types. So creating a co-promote show with tiers and
 * then saving the edit form dropped the tiers and set events.price to 0,
 * silently. Under the new model that whole class of bug cannot recur: a
 * co-promote show IS a hard_ticket show, so there is nothing to forget.
 */

/** The five event classes. */
export const EVENT_TYPES = [
  "hard_ticket",
  "ticketed",
  "non_ticketed",
  "private",
  "external_promotion",
] as const;

/** The four deal structures. NOT offer.ts's DealType — see lib/types/event.ts. */
export const EVENT_DEAL_TYPES = [
  "own_risk",
  "co_promote",
  "rental_box_office",
  "guarantee",
] as const;

/**
 * Sells through our ticketing: tiers, scaling, presale, fees, on-sale date.
 *
 * `ticketed` is a legacy synonym for hard_ticket, kept because the constraint
 * still allows it. Deal structure is irrelevant here — a co-promoted show is
 * still our box office; only the settlement differs.
 */
const HARD_TICKET_TYPES: ReadonlySet<string> = new Set(["hard_ticket", "ticketed"]);

export function isHardTicket(eventType: EventType | string | null | undefined): boolean {
  return HARD_TICKET_TYPES.has((eventType ?? "").trim());
}

/** Private/rental booking — quoted and contracted, never a public on-sale. */
export function isPrivateEvent(eventType: EventType | string | null | undefined): boolean {
  return (eventType ?? "").trim() === "private";
}

/**
 * Promoted by us, sold on someone else's platform. No inventory here, so it
 * must never reach the storefront, generate a ticket, or count toward the
 * hard-ticket band — it is a promoter P&L line, not our gross.
 */
export function isExternalPromotion(
  eventType: EventType | string | null | undefined
): boolean {
  return (eventType ?? "").trim() === "external_promotion";
}

/**
 * Does someone else take a cut of this show's money?
 *
 * Reads DEAL TYPE, not class — that is the whole point of the split. Used for
 * settlement and for reporting whose money it is; never for deciding whether a
 * show sells here.
 */
export function settlesToThirdParty(
  dealType: EventDealType | string | null | undefined
): boolean {
  const t = (dealType ?? "").trim();
  return t === "co_promote" || t === "rental_box_office";
}

/**
 * Belongs in the dashboard's hard-ticket revenue band.
 *
 * Answers § 8.4 by construction rather than by special case: the band filters
 * on CLASS, so a co-promoted show is in — it is our inventory and our box
 * office — and an external promotion is out, because it never was. Whose money
 * it is gets reported separately, by deal type, in settlements.
 */
export function inHardTicketBand(
  eventType: EventType | string | null | undefined
): boolean {
  return isHardTicket(eventType);
}
