/**
 * Capacity, in the two senses a venue actually uses.
 *
 * ── THE DISTINCTION ────────────────────────────────────────────────────────
 *   room      — what the fire marshal says. The physical capacity.
 *   sellable  — what is actually loaded for sale.
 *
 * Sell-through is measured against SELLABLE. Dividing by the room counts
 * seats that were never for sale as unsold inventory and makes every show look
 * softer than it is. Tyler Halverson reads 5.6% against a 750 room and 5.8%
 * against the 720 that were on sale.
 *
 * ── WHERE THE DECOMPOSITION ACTUALLY LIVES ────────────────────────────────
 * The offer is the source of truth, and it already carries it per tier:
 *
 *   artist_offers.ticket_scaling
 *     [{ name, seats: 750, comps: 30, kills: 0, sellable_cap: 720, price, … }]
 *   artist_offers.artist_comps / .marketing_comps   → 10 / 20 of those 30
 *
 * Gross potential at the offer stage is computed off `sellable_cap`, not
 * `seats` — which is why the tier that later gets created carries 720 and the
 * venue record carries 750. The two numbers were never in conflict; nothing
 * on the admin screens said which was which.
 *
 * ── WHY THE GAP IS NOT ASSUMED TO BE COMPS ─────────────────────────────────
 * Measured across the book: of 18 hard-ticket shows with tiers and a recorded
 * room, 16 have a room larger than their sellable cap — but the gap is only
 * sometimes comps. Shemekia Copeland is 2000 against 500 and Food Truck Fright
 * Fest is 750 against 250; those are partial-house configurations, not 1,500
 * and 500 comps. So this module reports THAT the two differ and by how much,
 * and names the reason only when an offer says so. Guessing would put an
 * invented comp count on a settlement screen.
 *
 * `event_holds` (quantity, hold_type, owner_label) reduces the sellable cap
 * further when rows exist — it is empty in production today.
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
  /**
   * The linked offer's scaling, when the event has one. This is the ONLY
   * source that can say what the off-sale seats are; nothing else knows.
   */
  offerScaling?: { comps?: number | null; kills?: number | null }[] | null;
  offerArtistComps?: number | null;
  offerMarketingComps?: number | null;
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
  /**
   * True when the room is bigger than what is on sale. Says nothing about WHY
   * — comps, kills, a partial house and a staged release all look like this.
   */
  roomDiffers: boolean;
  /** Seats in the room that are not on sale. Unattributed unless an offer says. */
  offSale: number;
  /** From the linked offer's ticket_scaling, when there is one. Never guessed. */
  comps: number | null;
  kills: number | null;
  /** artist_offers.artist_comps / .marketing_comps — who the comps are for. */
  artistComps: number | null;
  marketingComps: number | null;
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
  const scaling = input.offerScaling ?? null;
  const sum = (k: "comps" | "kills") =>
    scaling ? scaling.reduce((n, r) => n + (Number(r[k]) || 0), 0) : null;

  return {
    room,
    sellable,
    held,
    sold,
    sellThrough: sellable > 0 ? Math.round((sold / sellable) * 1000) / 10 : 0,
    roomDiffers: room !== null && sellable > 0 && sellable < room,
    offSale: room !== null && sellable > 0 ? Math.max(0, room - sellable) : 0,
    comps: sum("comps"),
    kills: sum("kills"),
    artistComps: input.offerArtistComps ?? null,
    marketingComps: input.offerMarketingComps ?? null,
  };
}

/** "42 / 720" — or "42 / 720 of 750" when the room is bigger. */
export function capacityLabel(c: Capacity): string {
  if (c.sellable === 0) return `${c.sold.toLocaleString()} / —`;
  const base = `${c.sold.toLocaleString()} / ${c.sellable.toLocaleString()}`;
  return c.roomDiffers ? `${base} of ${c.room!.toLocaleString()}` : base;
}

/**
 * Why the room and the sellable cap differ, in one line — but only as far as
 * the data actually knows. With an offer: "30 comps (10 artist, 20 marketing)".
 * Without one: "30 seats not on sale", which is the truthful limit.
 */
export function offSaleLabel(c: Capacity): string | null {
  if (!c.roomDiffers) return null;
  const parts: string[] = [];
  if (c.comps) {
    const who = [
      c.artistComps ? `${c.artistComps} artist` : null,
      c.marketingComps ? `${c.marketingComps} marketing` : null,
    ].filter(Boolean).join(", ");
    parts.push(who ? `${c.comps} comps (${who})` : `${c.comps} comps`);
  }
  if (c.kills) parts.push(`${c.kills} kills`);
  if (c.held) parts.push(`${c.held} held`);
  if (parts.length === 0) return `${c.offSale.toLocaleString()} seats not on sale`;
  return parts.join(" · ");
}
