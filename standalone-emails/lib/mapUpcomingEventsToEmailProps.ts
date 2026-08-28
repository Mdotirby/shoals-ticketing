// Standalone West72 upcoming-events digest email.
// Deliberately does not import from /modules/email-engine or /emails —
// see standalone-emails/ isolation note in project memory.

import { createAdminClient } from "@/lib/supabase-server";
import type { UpcomingEventsEmailProps, UpcomingEventSummary } from "../templates/UpcomingEventsEmail";
import { buildEventUrl } from "./urls";

type EventRow = {
  id: string;
  title: string;
  event_venue_id: string | null;
  venue: string;
  date: string;
  email_flyer_url: string | null;
  price: number;
  is_free: boolean;
};

type EventVenueRow = {
  id: string;
  name: string;
};

function parseNaiveLocalDate(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return new Date(NaN);
  const [, y, mo, d, h, min] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, h ? +h : 12, min ? +min : 0));
}

/** e.g. "JULY 10" — matches the design's date/venue line (uppercase via CSS). */
function formatEventDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

/**
 * Pulls the events for the digest and maps them to the UpcomingEventsEmail
 * prop shape. Same public-visibility filter as the non-admin branch of
 * /api/events (published, non-private, non-hold) — not imported from there
 * since that's app-internal, just the same well-known schema semantics
 * replicated here.
 *
 * Default (opts.eventIds absent): the N soonest upcoming, public-eligible
 * events, `limit` = N — today's behavior, unchanged.
 * Curated (opts.eventIds set, non-empty): exactly those events, still
 * restricted to the same public-eligibility/upcoming filters (so a stale
 * or since-privated event can't accidentally get sent) and still sorted by
 * date ascending for display — `limit` is ignored in this mode.
 */
export async function mapUpcomingEventsToEmailProps(
  limit: number,
  opts?: { utmCampaign?: string; eventIds?: string[] },
): Promise<UpcomingEventsEmailProps> {
  const client = createAdminClient();
  const now = new Date().toISOString();
  const curated = !!opts?.eventIds && opts.eventIds.length > 0;

  let query = client
    .from("events")
    .select("id, title, event_venue_id, venue, date, email_flyer_url, price, is_free")
    .gte("date", now)
    .or("status.eq.published,status.is.null")
    .or("event_type.is.null,event_type.neq.private")
    .or("booking_status.eq.confirmed,booking_status.is.null")
    .order("date", { ascending: true });

  query = curated ? query.in("id", opts!.eventIds!) : query.limit(limit);

  const { data: events, error } = await query.returns<EventRow[]>();

  if (error) throw new Error(`mapUpcomingEventsToEmailProps: ${error.message}`);
  if (!events || events.length === 0) {
    return { events: [], previewText: "Check out what's on at West 72" };
  }

  const venueIds = events.map((e) => e.event_venue_id).filter((id): id is string => !!id);
  const venuesById = new Map<string, string>();
  if (venueIds.length > 0) {
    const { data: venueRows } = await client
      .from("event_venues")
      .select("id, name")
      .in("id", venueIds)
      .returns<EventVenueRow[]>();
    for (const v of venueRows ?? []) venuesById.set(v.id, v.name);
  }

  const summaries: UpcomingEventSummary[] = events.map((event) => ({
    id: event.id,
    eventName: event.title,
    eventDate: formatEventDate(parseNaiveLocalDate(event.date)),
    venueName: (event.event_venue_id && venuesById.get(event.event_venue_id)) || event.venue,
    ticketPrice: event.is_free ? "Free" : event.price ? `$${event.price}` : undefined,
    heroImageUrl: event.email_flyer_url ?? "",
    ticketUrl: buildEventUrl(
      event.id,
      opts?.utmCampaign ? { source: "broadcast", campaign: opts.utmCampaign } : undefined,
    ),
  }));

  const names = summaries.map((s) => s.eventName).join(", ");
  return {
    events: summaries,
    previewText: `Coming up: ${names}`,
  };
}
