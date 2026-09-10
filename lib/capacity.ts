/**
 * Capacity, in the two senses a venue actually uses.
 *
 * ── THE DISTINCTION ────────────────────────────────────────────────────────
 *   room      — what the fire marshal says. The physical capacity of the room.
 *   sellable  — room, less kills and comps. What is actually for sale.
 *
 * A 750-cap room with 30 comps has a sellable cap of 720. Both numbers are
 * real and neither is a correction of the other; they answer different
 * questions. Sell-through is measured against SELLABLE, because measuring it
 * against the room counts seats nobody was ever allowed to sell as unsold
 * inventory and makes every show look softer than it is.
 *
 * ── WHY THIS MODULE EXISTS ─────────────────────────────────────────────────
 * Two screens had already picked different answers without knowing there was
 * a question. The event workspace read `venue.capacity ?? Σ tiers` and showed
 * Tyler Halverson at 42/750; the dashboard summed tier capacity and showed
 * 42/720 for the same show on the same afternoon. Sell-through therefore
 * differed between two screens an operator flips between — 5.6% against 5.8%
 * — with nothing on either to say why.
 *
 * ── WHERE THE NUMBERS LIVE TODAY ───────────────────────────────────────────
 * `event_venues.capacity` (and `venues.capacity`) hold the room.
 * `ticket_tiers.capacity` holds what was loaded for sale, which is where the
 * kills and comps have been subtracted BY HAND up to now — Tyler Halverson's
 * single tier is set to 720 against a 750 room.
 *
 * `event_holds` exists (quantity, hold_type, owner_label) and is the proper
 * home for kills, but it is empty in production, so it is read here as an
 * ADDITIONAL reduction rather than the source of the 750→720 gap. When holds
 * start being used, `sellable` falls by their quantity on top of whatever the
 * tiers already carry — which is correct, and is why the two are not summed
 * into one number here.
 */

export type CapacityInput = {
  /** event_venues.capacity or venues.capacity — the room. */
  roomCapacity?: number | null;
  /** ticket_tiers rows for the event. */
  tiers?: { capacity?: number | null }[] | null;
  /** event_holds rows — kills, artist holds, production kills. */
  holds?: { quantity?: number | null; released_at?: string | null }[] | null;
  /** Tickets issued, comps included — a comped seat is still gone. */
  sold?: number;
};

export type Capacity = {
  /** The room. Null when nothing records it — do not fall back to sellable. */
  room: number | null;
  /** What is for sale: tier capacity less unreleased holds. */
  sellable: number;
  /** Seats withheld by unreleased holds. */
  held: number;
  sold: number;
  /** sold / sellable, as a percentage to one decimal. 0 when unknown. */
  sellThrough: number;
  /** True when the room and the sellable cap disagree — worth showing both. */
  hasKills: boolean;
};

export function resolveCapacity(input: CapacityInput): Capacity {
  const room =
    typeof input.roomCapacity === "number" && input.roomCapacity > 0
      ? input.roomCapacity
      : null;

  const tierTotal = (input.tiers ?? []).reduce(
    (n, t) => n + (Number(t.capacity) || 0),
    0
  );

  // A released hold is back on sale, so it stops reducing the sellable cap.
  const held = (input.holds ?? [])
    .filter((h) => !h.released_at)
    .reduce((n, h) => n + (Number(h.quantity) || 0), 0);

  // Tiers are the authority on what is loaded. Fall back to the room only
  // when no tier says otherwise — a show with no tiers has nothing for sale,
  // but reporting 0 there reads as an error rather than as a fact, and the
  // callers that care check `sellable === 0` explicitly.
  const base = tierTotal > 0 ? tierTotal : room ?? 0;
  const sellable = Math.max(0, base - held);

  const sold = input.sold ?? 0;

  return {
    room,
    sellable,
    held,
    sold,
    sellThrough: sellable > 0 ? Math.round((sold / sellable) * 1000) / 10 : 0,
    hasKills: room !== null && sellable > 0 && sellable < room,
  };
}

/** "42 / 720" — or "42 / 720 of 750" when kills mean the two differ. */
export function capacityLabel(c: Capacity): string {
  if (c.sellable === 0) return `${c.sold.toLocaleString()} / —`;
  const base = `${c.sold.toLocaleString()} / ${c.sellable.toLocaleString()}`;
  return c.hasKills ? `${base} of ${c.room!.toLocaleString()}` : base;
}
