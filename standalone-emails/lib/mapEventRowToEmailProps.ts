// Standalone West72 event-announcement email system.
// Deliberately does not import from /modules/email-engine or /emails —
// see standalone-emails/ isolation note in project memory.

import { createAdminClient } from "@/lib/supabase-server";
import { getAnnouncementBodyText, type EventAnnouncementEmailProps, type ReminderStage } from "../templates/EventAnnouncementEmail";
import { parseNaiveLocalDate } from "./reminderStage";
import { buildEventUrl } from "./urls";

type EventRow = {
  id: string;
  title: string;
  subtitle: string | null;
  venue: string;
  event_venue_id: string | null;
  date: string;
  start_time: string | null;
  email_flyer_url: string | null;
  price: number;
  is_free: boolean;
  on_sale_at: string | null;
};

// NOTE: `venues` (events.venue_id) is the white-label TENANT/operator config
// row (custom_domain, homepage_headline, brand colors) — not a physical
// venue. The real assigned venue lives in event_venues (events.event_venue_id).
// Confirmed by a real bad send: an event with venue_id set to the platform's
// own row rendered "West 72 Entertainment LLC" as the venue instead of the
// actual room.
type EventVenueRow = {
  name: string;
  full_address: string | null;
};

type LineupRow = {
  artist_name: string;
  is_headliner: boolean;
  sort_order: number;
};

type SponsorRow = {
  name: string;
  logo_url: string | null;
  tier: "title" | "presenting" | "supporting";
};

// Real presale feature (app/api/events/[id]/presale, plans/presale-migration.sql)
// — NOT promo_codes. One row per type (artist/venue), upserted from the admin
// edit page's "Presale Access" section. starts_at/ends_at are typed timestamptz
// but written from a raw <input type="datetime-local"> value with no timezone
// conversion applied (unlike on_sale_at, which does go through chicagoToUtcIso)
// — so despite the column type, treat them as naive Central wall-clock values.
type EventPresaleRow = {
  type: "artist" | "venue";
  enabled: boolean;
  code: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

// parseNaiveLocalDate now lives in ./reminderStage.ts (imported above) so
// the admin broadcast wizard, a client component, can reuse the exact same
// parser for its Reminder Stage suggestion without duplicating it.
const NAIVE_TZ = "UTC"; // paired with parseNaiveLocalDate's fake-UTC encoding

// on_sale_at IS properly converted true UTC (see the admin edit page's
// chicagoToUtcIso) — parse directly, respecting the real offset. The old
// code stripped it here, which shifted it by the server process's UTC
// offset (5-6h in America/Chicago), silently breaking the
// presale-vs-countdown Date.now() comparison below.
function parseUtcDate(s: string): Date {
  return new Date(s);
}

// Explicit America/Chicago for true-UTC dates — the venue's actual timezone,
// not the server process's (which is not guaranteed to be Central).
const VENUE_TZ = "America/Chicago";

// event_presales.starts_at/ends_at need real Date.now() comparisons AND a
// correct "CDT"/"CST" zone-name display, so the fake-UTC trick used for
// events.date isn't precise enough — do the actual Central->UTC conversion,
// mirroring the admin edit page's chicagoToUtcIso (same iterative DST-aware
// correction, just returning a Date instead of an ISO string).
function naiveCentralToUtc(raw: string): Date {
  // Supabase returns timestamptz columns with an offset already attached
  // (typically +00:00, since the naive value got written straight into a
  // timestamptz column with no conversion) — strip it so we're working with
  // the same bare "YYYY-MM-DDTHH:MM:SS" the admin UI originally submitted.
  const naive = raw.replace(/([+-]\d{2}:\d{2}|Z)$/, "");
  let guess = new Date(`${naive}-06:00`); // CST = UTC-6, starting guess
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: VENUE_TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(guess);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    const hour = get("hour") === "24" ? "00" : get("hour");
    const roundTrip = `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}`;
    const diff = new Date(naive).getTime() - new Date(roundTrip).getTime();
    if (Math.abs(diff) < 30000) break;
    guess = new Date(guess.getTime() + diff);
  }
  return guess;
}

/** e.g. "September 10" — matches the design's date strip, no weekday/year. */
function formatEventDate(d: Date, timeZone: string): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone });
}

function formatOnSaleDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: VENUE_TZ,
  }) + " at " + d.toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: VENUE_TZ,
  });
}

// suggestReminderStage lives in ./reminderStage.ts, not here — that file has
// zero server-only imports so the admin broadcast wizard (a client
// component) can call it directly for the "Reminder Stage" selector's
// default, without pulling this file's Supabase service-role client into
// the browser bundle.

function formatEventTime(d: Date, startTime: string | null): string {
  const hour24 = +new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: NAIVE_TZ }).format(d) % 24;
  const minute = +new Intl.DateTimeFormat("en-US", { minute: "2-digit", timeZone: NAIVE_TZ }).format(d);
  if (hour24 !== 0 || minute !== 0) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: NAIVE_TZ }).replace(" ", "");
  }
  if (startTime) {
    const match = startTime.match(/T(\d{1,2}):(\d{2})/) || startTime.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      const hr = parseInt(match[1], 10);
      const ampm = hr >= 12 ? "PM" : "AM";
      const disp = ((hr + 11) % 12) + 1;
      return `${disp}:${match[2]}${ampm}`;
    }
  }
  return "";
}

/**
 * Snapshot at send time — not a live-ticking countdown (email has no JS).
 * Three states: public on-sale already live wins outright; otherwise an
 * active presale window; otherwise a plain countdown to public on-sale
 * (or "available_now" if there's nothing to count down to at all).
 */
function resolveOnSaleState(
  onSaleAt: string | null,
  presale: EventPresaleRow | null,
): {
  onSaleState: "countdown" | "presale" | "available_now";
  onSaleDateLabel?: string;
  daysUntilOnSale?: number;
  hoursUntilOnSale?: number;
  presaleCode?: string;
  presaleOpensLabel?: string;
  publicOnSaleLabel?: string;
} {
  const publicOnSaleD = onSaleAt ? parseUtcDate(onSaleAt) : null;
  const publicOnSaleValid = !!(publicOnSaleD && !Number.isNaN(publicOnSaleD.getTime()));
  const publicOnSaleFuture = publicOnSaleValid && publicOnSaleD!.getTime() > Date.now();

  if (!publicOnSaleFuture) return { onSaleState: "available_now" };

  if (presale?.enabled && presale.code && presale.starts_at) {
    const presaleStartD = naiveCentralToUtc(presale.starts_at);
    const presaleEndD = presale.ends_at ? naiveCentralToUtc(presale.ends_at) : null;
    const started = !Number.isNaN(presaleStartD.getTime()) && presaleStartD.getTime() <= Date.now();
    const notEnded = !presaleEndD || Number.isNaN(presaleEndD.getTime()) || presaleEndD.getTime() > Date.now();
    if (started && notEnded) {
      return {
        onSaleState: "presale",
        presaleCode: presale.code,
        presaleOpensLabel: formatOnSaleDate(presaleStartD),
        publicOnSaleLabel: formatEventDate(publicOnSaleD!, VENUE_TZ),
      };
    }
  }

  const msUntil = publicOnSaleD!.getTime() - Date.now();
  return {
    onSaleState: "countdown",
    onSaleDateLabel: formatOnSaleDate(publicOnSaleD!),
    daysUntilOnSale: Math.floor(msUntil / 86_400_000),
    hoursUntilOnSale: Math.floor((msUntil % 86_400_000) / 3_600_000),
  };
}

/**
 * Pulls one event + its venue/lineup/sponsors and maps snake_case DB rows
 * to the EventAnnouncementEmail prop shape. Schema changes should only
 * ever require editing this function, never the template component.
 */
export async function mapEventIdToEmailProps(
  eventId: string,
  opts?: { utmCampaign?: string; reminderStage?: ReminderStage },
): Promise<EventAnnouncementEmailProps> {
  const client = createAdminClient();

  const { data: event, error } = await client
    .from("events")
    .select("id, title, subtitle, venue, event_venue_id, date, start_time, email_flyer_url, price, is_free, on_sale_at")
    .eq("id", eventId)
    .single<EventRow>();

  if (error || !event) {
    throw new Error(`mapEventIdToEmailProps: no event found for id ${eventId}`);
  }

  let venueName = event.venue;
  if (event.event_venue_id) {
    const { data: eventVenue } = await client
      .from("event_venues")
      .select("name, full_address")
      .eq("id", event.event_venue_id)
      .single<EventVenueRow>();
    if (eventVenue?.name) venueName = eventVenue.name;
  }

  const { data: lineupRows } = await client
    .from("event_lineup")
    .select("artist_name, is_headliner, sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })
    .returns<LineupRow[]>();

  const headliner = lineupRows?.find((r) => r.is_headliner)?.artist_name ?? event.title;
  const supportingActs = (lineupRows ?? [])
    .filter((r) => !r.is_headliner)
    .map((r) => r.artist_name);

  const { data: sponsorRows } = await client
    .from("sponsors")
    .select("name, logo_url, tier")
    .eq("event_id", eventId)
    .returns<SponsorRow[]>();

  const sponsorLogos = (sponsorRows ?? [])
    .filter((s) => !!s.logo_url)
    .map((s) => ({ name: s.name, logoUrl: s.logo_url as string }));

  const { data: presaleRows } = await client
    .from("event_presales")
    .select("type, enabled, code, starts_at, ends_at")
    .eq("event_id", eventId)
    .eq("enabled", true)
    .returns<EventPresaleRow[]>();

  // Artist presale takes priority over venue presale when both are enabled.
  const presaleRow =
    presaleRows?.find((r) => r.type === "artist") ??
    presaleRows?.find((r) => r.type === "venue") ??
    null;

  const dateObj = parseNaiveLocalDate(event.date);
  const eventDayOfWeek = dateObj.toLocaleDateString("en-US", { weekday: "long", timeZone: NAIVE_TZ });
  const onSale = resolveOnSaleState(event.on_sale_at, presaleRow ?? null);
  // Always the main event page (/events/[id]), never the landing page
  // (/e/[slug]) even when one exists — standing rule, see urls.ts. Deep-links
  // the presale code (if in an active presale window) so tapping the CTA
  // auto-unlocks it — nothing to copy/retype.
  const ticketUrl = buildEventUrl(
    event.id,
    opts?.utmCampaign ? { source: "broadcast", campaign: opts.utmCampaign } : undefined,
    onSale.onSaleState === "presale" ? onSale.presaleCode : undefined,
  );

  return {
    eventName: event.title,
    eventSubtitle: event.subtitle ?? undefined,
    eventDate: formatEventDate(dateObj, NAIVE_TZ),
    eventTime: formatEventTime(dateObj, event.start_time),
    eventDayOfWeek,
    venueName,
    // Deliberately NOT events.image_url (the website's wide hero crop) —
    // this is a dedicated 1080x1350 flyer, purpose-built for email/social.
    // No fallback to image_url on purpose: a wrong-aspect-ratio image would
    // be worse than an empty hero section (which the template already
    // handles by just not rendering it).
    heroImageUrl: event.email_flyer_url ?? "",
    headlinerName: headliner,
    supportingActs,
    ticketUrl,
    ticketPrice: event.is_free ? "Free" : event.price ? `$${event.price}` : undefined,
    sponsorLogos,
    // Mirrors the copy shown just above the CTA (see getAnnouncementBodyText)
    // rather than a generic "event — date at venue" string.
    previewText: getAnnouncementBodyText({ ...onSale, eventDayOfWeek, reminderStage: opts?.reminderStage }),
    ...onSale,
    // Deliberately a plain passthrough, NOT auto-suggested here — this
    // function backs the regular announcement send too, and auto-applying a
    // reminder stage whenever an event happens to be N days out would
    // silently change what that send looks like. Auto-suggestion only lives
    // in the admin broadcast UI (suggestReminderStage), which always sends
    // an explicit choice.
    reminderStage: opts?.reminderStage,
  };
}
