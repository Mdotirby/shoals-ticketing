import { offTopNames } from "@/lib/offers/door";
import { artistFacPerTicket } from "@/lib/offers/facilityShare";
import type { ExpenseItem, TicketScalingRow } from "@/lib/types/offer";

/**
 * The two offer terms a settlement pays on, read from the linked offer
 * rather than stored on the settlement: which expense lines come off the
 * door before a DOOR split, and how much of the facility fee goes to the
 * artist. Settlement expenses are created from the offer's by name, so the
 * names line up.
 */
export type OfferSettleTerms = { offTop: string[]; facPerTicket: number };

export const NO_TERMS: OfferSettleTerms = { offTop: [], facPerTicket: 0 };

export function offerSettleTerms(offer: { fixed_expenses?: ExpenseItem[]; ticket_scaling?: TicketScalingRow[] } | null | undefined): OfferSettleTerms {
  if (!offer) return NO_TERMS;
  return { offTop: offTopNames(offer.fixed_expenses), facPerTicket: artistFacPerTicket(offer.ticket_scaling) };
}

/** The settlement's actual amounts on the lines the offer takes off the top. DOOR only. */
export function settlementDoorDeductions(
  expenses: Array<{ name?: string | null; actual_amount?: number | null }>,
  offTop: string[],
  dealType: string,
): number {
  if (String(dealType || "").toUpperCase() !== "DOOR" || !offTop.length) return 0;
  const names = new Set(offTop.map((n) => n.trim().toLowerCase()));
  return expenses.reduce((s, e) => s + (names.has(String(e.name || "").trim().toLowerCase()) ? Number(e.actual_amount) || 0 : 0), 0);
}

/**
 * The artist's share of the facility fees actually collected: the offer's
 * per-ticket figure as a fraction of the per-ticket fee charged. Tickets that
 * carried no facility fee (comps, cash at the door) pay nothing, as they
 * collected nothing.
 */
export function settlementArtistFac(facilityFeesCollected: number, facPerTicketCharged: number, facPerTicketToArtist: number): number {
  if (!(facPerTicketCharged > 0) || !(facPerTicketToArtist > 0)) return 0;
  const share = Math.min(facPerTicketToArtist, facPerTicketCharged) / facPerTicketCharged;
  return Math.round((Number(facilityFeesCollected) || 0) * share * 100) / 100;
}
