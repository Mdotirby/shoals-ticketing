/**
 * What may be marked, and what a mark means — Show mode's rules.
 *
 * The builder's Show mode locks the room and lets you paint holds and kills
 * onto one show: artist, production, comp, kill, and release to put a seat
 * back on sale (handoff/screens/seatmap-builder.dc.html).
 *
 * The rules live here rather than in the canvas because they decide whether
 * real inventory comes off sale, and because the API has to enforce them
 * again on the way in — a tool that refuses to paint a seat is a courtesy,
 * not a guarantee.
 */

/** Matches event_holds.hold_type, so painted seats and counted holds add up. */
export const SEAT_MARKS = ["artist", "production", "house_comp", "kill"] as const;
export type SeatMark = (typeof SEAT_MARKS)[number];

export type MarkableSeat = {
  id: string;
  /** From the seats table: available, held (a live checkout), or sold. */
  status: string | null;
  /** The section it belongs to, for the sell-mode rules below. */
  sectionId: string | null;
  /** Table seats share an object; marking one marks the table. */
  objectId?: string | null;
};

export type MarkableSection = {
  id: string;
  name: string;
  /** assigned | first_come — whether a ticket names a seat. */
  seating_mode?: string | null;
  /** A section sold as whole tables. */
  sells_as_table?: boolean | null;
  /** Standing room. */
  type?: string | null;
};

export type MarkRefusal = { ok: false; reason: string };
export type MarkAllowed = { ok: true; seatIds: string[] };

/**
 * A standing or first-come section has no particular seat to point at: a
 * ticket does not name one, so holding "that seat" would promise something
 * the buyer never receives. Those sections hold by count instead, through
 * event_holds — which is what the design does, and what lib/capacity.ts
 * already totals.
 */
export function sectionTakesSeatMarks(section: MarkableSection | null | undefined): boolean {
  if (!section) return false;
  if ((section.type ?? "").toLowerCase() === "ga") return false;
  return (section.seating_mode ?? "assigned") === "assigned";
}

/**
 * Which seats one click actually marks.
 *
 * A table section holds the whole table — the design says so in as many
 * words, and it is the only sane answer: half a held table is a table nobody
 * can sell and the artist cannot use.
 *
 * Sold seats are never included. Somebody holds that ticket; taking it off
 * sale now does not un-sell it, it just makes the map lie about the room.
 */
export function seatsForMark(
  clicked: MarkableSeat,
  section: MarkableSection | null | undefined,
  allSeats: MarkableSeat[],
): MarkAllowed | MarkRefusal {
  if (!section) {
    return { ok: false, reason: "That seat is not in a section yet." };
  }
  if (!sectionTakesSeatMarks(section)) {
    return {
      ok: false,
      reason: `${section.name} sells by the count, not by the seat — hold it by quantity instead.`,
    };
  }
  if (clicked.status === "sold") {
    return { ok: false, reason: "That seat is sold. Refund the order to put it back." };
  }

  // A live checkout hold is somebody mid-purchase. Marking it would pull the
  // seat out from under a card that is being charged.
  if (clicked.status === "held") {
    return { ok: false, reason: "Somebody is checking out with that seat right now." };
  }

  if (section.sells_as_table && clicked.objectId) {
    const table = allSeats.filter((s) => s.objectId === clicked.objectId);
    const sold = table.filter((s) => s.status === "sold");
    if (sold.length > 0) {
      return {
        ok: false,
        reason: `${sold.length} of that table's seats are sold, so the table cannot be held.`,
      };
    }
    const inFlight = table.filter((s) => s.status === "held");
    if (inFlight.length > 0) {
      return { ok: false, reason: "Somebody is checking out with that table right now." };
    }
    return { ok: true, seatIds: table.map((s) => s.id) };
  }

  return { ok: true, seatIds: [clicked.id] };
}

export type MarkCounts = Record<SeatMark, number>;

/** Totals for the show summary panel, in the design's own order. */
export function countMarks(marks: Array<{ mark: string }>): MarkCounts {
  const out: MarkCounts = { artist: 0, production: 0, house_comp: 0, kill: 0 };
  for (const m of marks) {
    if ((SEAT_MARKS as readonly string[]).includes(m.mark)) out[m.mark as SeatMark]++;
  }
  return out;
}

/**
 * What the room seats for this show.
 *
 * The design's bar is `seats + ga − killed`: a killed seat is out of the room
 * for the night, so it does not count against the fire code. A held seat
 * still has a body in it — the artist's guest is a person — so holds are NOT
 * subtracted here. They come off what is SELLABLE, which is a different
 * number and a different question.
 */
export function showCapacity(
  { seats, gaCapacity }: { seats: number; gaCapacity: number },
  counts: MarkCounts,
): number {
  return seats + gaCapacity - counts.kill;
}

/** What is left to sell: the room, less everything spoken for. */
export function sellableAfterMarks(
  { seats, gaCapacity, sold }: { seats: number; gaCapacity: number; sold: number },
  counts: MarkCounts,
  countHolds: number,
): number {
  const held = counts.artist + counts.production + counts.house_comp + countHolds;
  return Math.max(0, seats + gaCapacity - counts.kill - held - sold);
}
