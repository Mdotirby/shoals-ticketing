import { VENUE_TZ, eventDayISO, localTodayISO } from "@/lib/dates";

/**
 * WHEN A SHOW CAN BE SOLD, AND BY WHICH CHANNEL.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Someone bought and paid for a ticket to a show that had already happened.
 * Nothing in checkout ever asked whether the event was still in the future:
 * every path — hosted checkout, inline checkout, free registration, the box
 * office, the card reader — went straight from "here is an event id" to
 * "charge this card". A past event's page is still reachable, the tiers are
 * still there, and the tier capacity check passes because barely anything
 * sold. So it charged.
 *
 * ── THE RULE (Matt's, and it is a venue rule, not a technical one) ─────────
 *   Before noon on show day   the storefront sells.
 *   Noon → midnight, show day the BOX OFFICE sells, and only the box office.
 *   After midnight            nobody sells. The show has happened.
 *
 * The handover at noon is the point where the door takes over: from then on a
 * sale should be going through a channel that can hand someone a ticket and
 * check them in on the spot, not a web page that emails a QR code to somebody
 * already standing at the door.
 *
 * The box office keeps selling ADVANCE tickets for future shows — the window
 * is about who owns the show *on the day*, not a restriction on the till.
 *
 * ── TIME ZONE ─────────────────────────────────────────────────────────────
 * Central, via Intl, never a fixed offset. The venues run Central and Vercel
 * runs UTC; a hardcoded −6 would be an hour wrong for eight months of the year
 * and would move the noon handover to 11am or 1pm depending on the season.
 */

/**
 * The hour, venue-local, when the door takes over from the web on show day.
 *
 * ── WHAT THIS COSTS, MEASURED ──────────────────────────────────────────────
 * Set to 12 (noon) per Matt's instruction. It is worth knowing what that
 * closes off: across the whole order history, **81 inline-checkout orders
 * worth $3,099.28** were placed on a show day at or after noon Central — most
 * of them between 7pm and 9pm, i.e. people buying on their phone at or near
 * the venue. Under this rule every one of those is refused and has to become
 * a box-office sale instead.
 *
 * The bug this whole module exists to stop was, by contrast, ONE paid order:
 * $31.56 on 2026-09-10 for a show on 2026-08-08 (plus four free RSVPs to a
 * show already gone). Blocking past events costs nothing. Blocking show-day
 * afternoons is the part with a price on it.
 *
 * So it is a constant, deliberately. Moving the handover to doors (19) or
 * dropping it entirely (24, i.e. web sells until midnight alongside the box
 * office) is a one-line change here and nowhere else.
 *
 * Override without a deploy: STOREFRONT_DOOR_HANDOVER_HOUR.
 */
export const DOOR_HANDOVER_HOUR = (() => {
  const raw = Number(process.env.STOREFRONT_DOOR_HANDOVER_HOUR);
  return Number.isInteger(raw) && raw >= 0 && raw <= 24 ? raw : 12;
})();

export type SalesChannel = "storefront" | "box_office";

export type SalesWindow = {
  /** The public storefront and any customer-facing checkout may sell. */
  storefrontOpen: boolean;
  /** The box office may sell — advance, or during the day-of window. */
  boxOfficeOpen: boolean;
  /** advance = before show day noon · door = the box-office window · past = over. */
  state: "advance" | "door" | "past";
  /** Noon Central on show day — when the door takes over. */
  doorOpensAt: Date | null;
  /** Midnight Central ending show day — when selling stops entirely. */
  salesCloseAt: Date | null;
  /** Plain-language refusal, safe to show a buyer. */
  reason: string | null;
};

/** Minutes that `tz` is offset from UTC at the given instant. */
function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
  );
  return (asUTC - at.getTime()) / 60000;
}

/** The instant of `hour:00` venue-local on the calendar day `dayISO`. */
function venueLocalInstant(dayISO: string, hour: number): Date {
  const naive = new Date(`${dayISO}T${String(hour).padStart(2, "0")}:00:00Z`);
  // US DST changes at 2am local, so noon and midnight never land on a fold —
  // a single offset correction is exact for both.
  return new Date(naive.getTime() - tzOffsetMinutes(VENUE_TZ, naive) * 60000);
}

/** Add whole days to a "YYYY-MM-DD" string. */
function addDaysISO(dayISO: string, days: number): string {
  const d = new Date(`${dayISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function salesWindowFor(
  eventDate: string | null | undefined,
  now: Date = new Date()
): SalesWindow {
  const day = eventDayISO(eventDate ?? "");

  // No date on the event: nothing to reason about, so nothing is blocked.
  // Refusing here would take down every show whose date has not been set yet.
  if (!day) {
    return {
      storefrontOpen: true, boxOfficeOpen: true, state: "advance",
      doorOpensAt: null, salesCloseAt: null, reason: null,
    };
  }

  const doorOpensAt = venueLocalInstant(day, DOOR_HANDOVER_HOUR);
  const salesCloseAt = venueLocalInstant(addDaysISO(day, 1), 0); // midnight after

  const today = localTodayISO(now);

  if (day < today || now >= salesCloseAt) {
    return {
      storefrontOpen: false, boxOfficeOpen: false, state: "past",
      doorOpensAt, salesCloseAt,
      reason: "This event has already taken place — tickets are no longer on sale.",
    };
  }

  if (now >= doorOpensAt) {
    return {
      storefrontOpen: false, boxOfficeOpen: true, state: "door",
      doorOpensAt, salesCloseAt,
      reason:
        "Online sales for this show have closed. Tickets are available at the " +
        "box office — come see us at the door.",
    };
  }

  return {
    storefrontOpen: true, boxOfficeOpen: true, state: "advance",
    doorOpensAt, salesCloseAt, reason: null,
  };
}

/** True when `channel` may take money for this event right now. */
export function canSell(
  eventDate: string | null | undefined,
  channel: SalesChannel,
  now: Date = new Date()
): boolean {
  const w = salesWindowFor(eventDate, now);
  return channel === "box_office" ? w.boxOfficeOpen : w.storefrontOpen;
}
