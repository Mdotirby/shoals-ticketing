import type { TicketScalingRow } from "@/lib/types/offer";

/**
 * "$1 a ticket of the facility fee to the band." Stored per tier on the
 * offer's ticket_scaling (`artist_fac`), so it needs no new column and can
 * differ by tier; the builder sets every tier from one field.
 *
 * Capped at the tier's own facility fee: you can't hand over more of the fee
 * than the buyer paid.
 */
type Row = Partial<TicketScalingRow> & Record<string, unknown>;

const perTier = (r: Row) => Math.max(0, Math.min(Number(r.artist_fac) || 0, Number(r.facility_fee) || 0));

/** The total at sellout. */
export function artistFacilityShare(scaling: Row[] | undefined): number {
  return (Array.isArray(scaling) ? scaling : []).reduce((s, r) => s + perTier(r) * (Number(r.sellable_cap) || 0), 0);
}

/** The per-ticket figure the builder shows — the first tier's. */
export function artistFacPerTicket(scaling: Row[] | undefined): number {
  return Array.isArray(scaling) && scaling.length ? Number(scaling[0].artist_fac) || 0 : 0;
}

/** Every tier set to the same per-ticket figure. */
export function withArtistFac<T extends Row>(scaling: T[] | undefined, perTicket: number): T[] {
  const v = Math.max(0, Number(perTicket) || 0);
  return (Array.isArray(scaling) ? scaling : []).map((r) => ({ ...r, artist_fac: v }));
}
