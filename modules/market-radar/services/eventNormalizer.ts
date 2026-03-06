/**
 * Market Radar — Event Normalizer Service
 *
 * Transforms raw data from each external source (Ticketmaster, Bandsintown,
 * venue scrapers) into the unified {@link NormalizedEvent} format ready for
 * database insertion.
 */

import type {
  RawTicketmasterEvent,
  RawBandsintownEvent,
  RawVenueScrapedEvent,
  NormalizedEvent,
} from '../types';
import { FLORENCE_LAT, FLORENCE_LNG } from '../constants';
import { calculateDistance, formatEventDate } from '../utils';

// ============================================================
// Ticketmaster
// ============================================================

/**
 * Normalise a raw Ticketmaster Discovery API event into the unified format.
 *
 * @param raw - Raw event payload from the Ticketmaster API
 * @returns A {@link NormalizedEvent} ready for DB upsert
 */
export function normalizeTicketmasterEvent(
  raw: RawTicketmasterEvent,
): NormalizedEvent {
  const venue = raw._embedded?.venues?.[0];
  const attraction = raw._embedded?.attractions?.[0];

  const lat = venue?.location?.latitude
    ? parseFloat(venue.location.latitude)
    : null;
  const lng = venue?.location?.longitude
    ? parseFloat(venue.location.longitude)
    : null;

  const distanceFromShoals =
    lat !== null && lng !== null
      ? calculateDistance(FLORENCE_LAT, FLORENCE_LNG, lat, lng)
      : null;

  const eventDate = raw.dates?.start?.localDate ?? '';
  const announceDate = raw.sales?.public?.startDateTime
    ? formatEventDate(raw.sales.public.startDateTime)
    : null;

  return {
    artist_name: attraction?.name ?? raw.name,
    event_name: raw.name,
    venue_name: venue?.name ?? 'Unknown Venue',
    venue_city: venue?.city?.name ?? 'Unknown',
    venue_state: venue?.state?.stateCode ?? 'Unknown',
    venue_capacity: venue?.capacity ?? venue?.maximumCapacity ?? null,
    event_date: eventDate,
    announce_date: announceDate,
    ticket_price_low: raw.priceRanges?.[0]?.min ?? null,
    ticket_price_high: raw.priceRanges?.[0]?.max ?? null,
    ticket_url: raw.url ?? null,
    ticket_provider: 'Ticketmaster',
    latitude: lat,
    longitude: lng,
    distance_from_shoals: distanceFromShoals,
    tracker_count: null,
    rsvp_count: null,
    estimated_tickets_sold: null,
    estimated_tickets_remaining: null,
    sale_velocity: null,
    competition_score: null,
    routing_cluster_id: null,
    source: 'ticketmaster',
    source_event_id: raw.id,
    raw_data: raw as unknown as Record<string, unknown>,
  };
}

// ============================================================
// Bandsintown
// ============================================================

/**
 * Normalise a raw Bandsintown API event into the unified format.
 *
 * @param raw - Raw event payload from the Bandsintown API
 * @returns A {@link NormalizedEvent} ready for DB upsert
 */
export function normalizeBandsintownEvent(
  raw: RawBandsintownEvent,
): NormalizedEvent {
  const lat = raw.venue?.latitude ? parseFloat(raw.venue.latitude) : null;
  const lng = raw.venue?.longitude ? parseFloat(raw.venue.longitude) : null;

  // Filter out invalid 0,0 coordinates (Bandsintown sometimes returns these)
  const validLat = lat !== null && lat !== 0 ? lat : null;
  const validLng = lng !== null && lng !== 0 ? lng : null;

  const distanceFromShoals =
    validLat !== null && validLng !== null
      ? calculateDistance(FLORENCE_LAT, FLORENCE_LNG, validLat, validLng)
      : null;

  const eventDate = raw.datetime ? formatEventDate(raw.datetime) : '';

  // Bandsintown doesn't have a dedicated announce/on_sale field on the
  // standard event object, so we leave it null.
  const announceDate: string | null = null;

  // artist_id is patched by normalizeBandsintownRaw() in the scraper to
  // contain the artist name (from raw.artist.name). Fall back to lineup[0].
  const artistName = raw.artist_id || raw.lineup?.[0] || 'Unknown Artist';

  // venue.region is already normalised to a 2-letter state code by the
  // scraper's normalizeBandsintownRaw() function.
  const venueState = raw.venue?.region ?? 'Unknown';

  return {
    artist_name: artistName,
    event_name: raw.title || artistName,
    venue_name: raw.venue?.name ?? 'Unknown Venue',
    venue_city: raw.venue?.city ?? 'Unknown',
    venue_state: venueState,
    venue_capacity: null,
    event_date: eventDate,
    announce_date: announceDate,
    ticket_price_low: null, // Bandsintown rarely exposes pricing
    ticket_price_high: null,
    ticket_url: raw.offers?.[0]?.url ?? raw.url ?? null,
    ticket_provider: 'Bandsintown',
    latitude: validLat,
    longitude: validLng,
    distance_from_shoals: distanceFromShoals,
    tracker_count: raw.tracker_count ?? null,
    rsvp_count: null,
    estimated_tickets_sold: null,
    estimated_tickets_remaining: null,
    sale_velocity: null,
    competition_score: null,
    routing_cluster_id: null,
    source: 'bandsintown',
    source_event_id: String(raw.id),
    raw_data: raw as unknown as Record<string, unknown>,
  };
}

// ============================================================
// Venue Scraper
// ============================================================

/**
 * Normalise a raw venue-scraped event into the unified format.
 *
 * Venue scraper data is already fairly close to the normalised shape,
 * so this is mostly a direct mapping with distance calculation.
 *
 * @param raw - Raw event payload from the venue scraper
 * @returns A {@link NormalizedEvent} ready for DB upsert
 */
export function normalizeVenueScrapedEvent(
  raw: RawVenueScrapedEvent,
): NormalizedEvent {
  // Venue scraper doesn't provide lat/lng — distance will be null
  // unless we geocode separately.
  const lat: number | null = null;
  const lng: number | null = null;
  const distanceFromShoals: number | null = null;

  const eventDate = raw.event_date ? formatEventDate(raw.event_date) : '';

  return {
    artist_name: raw.artist_name,
    event_name: raw.event_name ?? null,
    venue_name: raw.venue_name,
    venue_city: raw.venue_city,
    venue_state: raw.venue_state,
    venue_capacity: raw.venue_capacity ?? null,
    event_date: eventDate,
    announce_date: null,
    ticket_price_low: raw.ticket_price_low ?? null,
    ticket_price_high: raw.ticket_price_high ?? null,
    ticket_url: raw.ticket_url ?? null,
    ticket_provider: raw.ticket_provider ?? null,
    latitude: lat,
    longitude: lng,
    distance_from_shoals: distanceFromShoals,
    tracker_count: null,
    rsvp_count: null,
    estimated_tickets_sold: null,
    estimated_tickets_remaining: null,
    sale_velocity: null,
    competition_score: null,
    routing_cluster_id: null,
    source: 'venue_scrape',
    source_event_id: null,
    raw_data: raw as unknown as Record<string, unknown>,
  };
}
