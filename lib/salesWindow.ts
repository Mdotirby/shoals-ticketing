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
 *
 *   SHOW DAY, Central:
 *     00:00 → 12:00   storefront only        the till has not opened yet
 *     12:00 → 22:00   storefront AND door    both sell, in parallel
 *     22:00 → 24:00   door only              web closes at 10pm
 *     after 24:00     nobody                 the show has happened
 *
 * The two windows OVERLAP on purpose. An earlier version of this handed the
 * whole afternoon to the box office, which would have refused 81 real
 * inline-checkout orders worth $3,099.28 — most of them 7–9pm, people buying
 * on a phone at or near the venue. Selling to someone standing in your own
 * parking lot is not a problem to solve; selling a ticket to a show that
 * finished last month is.
 *
 * The box office also sells ADVANCE tickets for FUTURE shows at any hour. The
 * noon opening is about the day-of till, not a restriction on the window
 * clerk taking money for next Friday.
 *
 * ── TIME ZONE ─────────────────────────────────────────────────────────────
 * Central, via Intl, never a fixed offset. The venues run Central and Vercel
 * runs UTC; a hardcoded −6 would be an hour wrong for eight months of the year
 * and would move the noon handover to 11am or 1pm depending on the season.
 */

/**
 * The two hours that bound show day, venue-local.
 *
 * They are constants because they are a venue policy, not a fact about the
 * software, and this is where the policy lives. Both are overridable at
 * runtime so a change does not need a deploy.
 *
 * STOREFRONT_CLOSE_HOUR (22 — 10pm): when the web stops selling.
 * BOX_OFFICE_OPEN_HOUR (12 — noon): when the day-of till opens.
 *
 * Measured against the whole order history, these two cost NOTHING: zero web
 * orders were placed at or after 10pm on a show day, and zero door orders
 * before noon. A noon web cutoff, by contrast, would have refused 81 orders
 * worth $3,099.28. The hours are set where the sales are not.
 */
export const STOREFRONT_CLOSE_HOUR = (() => {
  const raw = Number(process.env.STOREFRONT_CLOSE_HOUR);
  return Number.isInteger(raw) && raw >= 0 && raw <= 24 ? raw : 22;
})();

export const BOX_OFFICE_OPEN_HOUR = (() => {
  const raw = Number(process.env.BOX_OFFICE_OPEN_HOUR);
  return Number.isInteger(raw) && raw >= 0 && raw <= 24 ? raw : 12;
})();

export type SalesChannel = "storefront" | "box_office";

export type SalesWindow = {
  /** The public storefront and any customer-facing checkout may sell. */
  storefrontOpen: boolean;
  /** The box office may sell — advance, or during the day-of window. */
  boxOfficeOpen: boolean;
  /**
   * advance — before the till opens · door — both channels · late — door only,
   * after the web closes · past — over.
   */
  state: "advance" | "door" | "late" | "past";
  /** Noon Central on show day — when the day-of till opens. */
  doorOpensAt: Date | null;
  /** 10pm Central on show day — when the web stops. */
  storefrontClosesAt: Date | null;
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
      doorOpensAt: null, storefrontClosesAt: null, salesCloseAt: null, reason: null,
    };
  }

  const doorOpensAt = venueLocalInstant(day, BOX_OFFICE_OPEN_HOUR);
  const storefrontClosesAt = venueLocalInstant(day, STOREFRONT_CLOSE_HOUR);
  const salesCloseAt = venueLocalInstant(addDaysISO(day, 1), 0);

  const today = localTodayISO(now);
  const base = { doorOpensAt, storefrontClosesAt, salesCloseAt };

  // Over: the show's own day has ended.
  if (day < today || now >= salesCloseAt) {
    return {
      ...base, storefrontOpen: false, boxOfficeOpen: false, state: "past",
      reason: "This event has already taken place — tickets are no longer on sale.",
    };
  }

  // A future show. The web sells, and so does the box office — that is an
  // advance sale at the window, which the day-of hours have no bearing on.
  if (day > today) {
    return { ...base, storefrontOpen: true, boxOfficeOpen: true, state: "advance", reason: null };
  }

  // Show day, before the till opens.
  if (now < doorOpensAt) {
    return { ...base, storefrontOpen: true, boxOfficeOpen: false, state: "advance", reason: null };
  }

  // Show day, web closed, door still running.
  if (now >= storefrontClosesAt) {
    return {
      ...base, storefrontOpen: false, boxOfficeOpen: true, state: "late",
      reason:
        "Online sales for tonight have closed. Tickets are available at the " +
        "box office — come see us at the door.",
    };
  }

  // Show day, both channels open.
  return { ...base, storefrontOpen: true, boxOfficeOpen: true, state: "door", reason: null };
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
