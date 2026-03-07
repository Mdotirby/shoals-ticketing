/**
 * Market Radar — Venue Event Fetcher
 *
 * Fetches events at comp venues using two strategies:
 * 1. Ticketmaster API venue/city queries (primary — works for most venues)
 * 2. Direct venue URL fetch with basic HTML extraction (fallback)
 *
 * Replaces the original placeholder implementation.
 */

import type { RawVenueScrapedEvent } from '../types';
import { COMP_VENUES } from '../constants';
import type { CompVenue } from '../constants';

// ============================================================
// Internal Helpers
// ============================================================

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const THROTTLE_MS = 300;

/** Format a Date as YYYY-MM-DDTHH:mm:ssZ */
const toISOParam = (d: Date): string =>
  d.toISOString().replace(/\.\d{3}Z$/, 'Z');

// ============================================================
// Ticketmaster Venue Search
// ============================================================

/**
 * Query Ticketmaster for events at a specific venue's city.
 * Uses the keyword parameter to match venue name.
 */
async function fetchTMEventsForVenue(
  venue: CompVenue,
  apiKey: string,
  startDateTime: string,
  endDateTime: string,
): Promise<RawVenueScrapedEvent[]> {
  const events: RawVenueScrapedEvent[] = [];

  try {
    await sleep(THROTTLE_MS);

    // If we have a TM venue ID, query directly
    const params = new URLSearchParams({
      apikey: apiKey,
      classificationName: 'music',
      size: '100',
      sort: 'date,asc',
      startDateTime,
      endDateTime,
    });

    if (venue.tmVenueId) {
      params.set('venueId', venue.tmVenueId);
    } else {
      // Search by city + keyword matching venue name
      params.set('city', venue.city);
      params.set('stateCode', venue.state);
      params.set('radius', '10');
      params.set('unit', 'miles');
      params.set('keyword', venue.name);
    }

    const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`;
    console.log(`[VenueScraper] Querying TM for "${venue.name}" (${venue.city}, ${venue.state})…`);

    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`[VenueScraper] TM HTTP ${response.status} for "${venue.name}": ${response.statusText}`);
      return events;
    }

    const json = (await response.json()) as {
      _embedded?: {
        events?: Array<{
          id: string;
          name: string;
          dates: { start: { localDate: string; localTime?: string } };
          _embedded?: {
            venues?: Array<{
              name: string;
              city?: { name: string };
              state?: { stateCode: string };
              location?: { latitude: string; longitude: string };
            }>;
            attractions?: Array<{ name: string }>;
          };
          priceRanges?: Array<{ min: number; max: number }>;
          url?: string;
        }>;
      };
    };

    const tmEvents = json._embedded?.events ?? [];

    for (const evt of tmEvents) {
      const tmVenue = evt._embedded?.venues?.[0];
      const venueName = tmVenue?.name ?? venue.name;
      const artistName = evt._embedded?.attractions?.[0]?.name ?? evt.name;

      events.push({
        artist_name: artistName,
        event_name: evt.name,
        venue_name: venueName,
        venue_city: tmVenue?.city?.name ?? venue.city,
        venue_state: tmVenue?.state?.stateCode ?? venue.state,
        venue_capacity: venue.capacity,
        event_date: evt.dates.start.localDate,
        ticket_price_low: evt.priceRanges?.[0]?.min,
        ticket_price_high: evt.priceRanges?.[0]?.max,
        ticket_url: evt.url,
        source_url: `https://www.ticketmaster.com/event/${evt.id}`,
      });
    }

    console.log(`[VenueScraper] ${events.length} events found at "${venue.name}" via TM`);
  } catch (err) {
    console.error(
      `[VenueScraper] Error querying TM for "${venue.name}":`,
      err instanceof Error ? err.message : err
    );
  }

  return events;
}

// ============================================================
// Fallback: Basic HTML extraction
// ============================================================

/**
 * Attempt to extract events from a venue's HTML calendar page.
 * Uses basic regex patterns — not as reliable as TM but catches
 * non-TM events.
 */
async function fetchHTMLEvents(venue: CompVenue & { url?: string }): Promise<RawVenueScrapedEvent[]> {
  if (!('url' in venue) || !venue.url) return [];

  try {
    await sleep(THROTTLE_MS);

    const response = await fetch(venue.url, {
      headers: {
        'User-Agent': 'VenueCore-MarketRadar/1.0 (venue calendar aggregation)',
      },
    });

    if (!response.ok) {
      console.warn(`[VenueScraper] HTML HTTP ${response.status} for "${venue.name}"`);
      return [];
    }

    const html = await response.text();

    // Basic extraction: look for JSON-LD structured data (common on modern venue sites)
    const events: RawVenueScrapedEvent[] = [];
    const jsonLdMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);

    if (jsonLdMatches) {
      for (const match of jsonLdMatches) {
        try {
          const jsonStr = match.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
          const ld = JSON.parse(jsonStr);

          // Handle both single objects and arrays
          const items = Array.isArray(ld) ? ld : [ld];

          for (const item of items) {
            if (item['@type'] === 'MusicEvent' || item['@type'] === 'Event') {
              events.push({
                artist_name: item.performer?.name ?? item.name ?? 'Unknown',
                event_name: item.name,
                venue_name: item.location?.name ?? venue.name,
                venue_city: venue.city,
                venue_state: venue.state,
                venue_capacity: venue.capacity,
                event_date: item.startDate?.split('T')[0] ?? '',
                ticket_price_low: item.offers?.lowPrice,
                ticket_price_high: item.offers?.highPrice,
                ticket_url: item.offers?.url ?? item.url,
                source_url: venue.url || '',
              });
            }
          }
        } catch {
          // JSON parse error — skip this block
        }
      }
    }

    console.log(`[VenueScraper] ${events.length} events extracted from "${venue.name}" HTML (JSON-LD)`);
    return events;
  } catch (err) {
    console.error(`[VenueScraper] HTML error for "${venue.name}":`, err instanceof Error ? err.message : err);
    return [];
  }
}

// ============================================================
// Legacy venue URLs for HTML fallback
// ============================================================

const VENUE_URLS: Record<string, string> = {
  'Saturn': 'https://www.saturnbirmingham.com/events',
  'The Camp': 'https://www.thecampmuscleshoals.com/events',
  'The Grey Eagle': 'https://www.thegreyeagle.com/events',
  'Track 29': 'https://www.track29.co/events',
  'Duling Hall': 'https://www.dulinghall.com/events',
  'The Orange Peel': 'https://www.theorangepeel.net/events',
  'Terminal West': 'https://www.terminalwestatl.com/events',
};

// ============================================================
// Public API
// ============================================================

/**
 * Fetch events from comp venues using Ticketmaster API (primary)
 * and HTML extraction (fallback for venues with known URLs).
 *
 * @returns Array of venue-sourced events
 */
export async function fetchVenueScrapedEvents(): Promise<RawVenueScrapedEvent[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  const allEvents: RawVenueScrapedEvent[] = [];

  const now = new Date();
  const endDate = new Date(now);
  endDate.setMonth(endDate.getMonth() + 4);
  const startDateTime = toISOParam(now);
  const endDateTime = toISOParam(endDate);

  // Strategy 1: Ticketmaster venue queries (if API key available)
  if (apiKey) {
    for (const venue of COMP_VENUES) {
      const events = await fetchTMEventsForVenue(venue, apiKey, startDateTime, endDateTime);
      allEvents.push(...events);
    }
  } else {
    console.warn('[VenueScraper] No TICKETMASTER_API_KEY — skipping TM venue queries');
  }

  // Strategy 2: HTML extraction for venues with known URLs
  for (const venue of COMP_VENUES) {
    const url = VENUE_URLS[venue.name];
    if (url) {
      const htmlEvents = await fetchHTMLEvents({ ...venue, url });
      // Only add events not already found via TM (dedupe by artist+date)
      for (const evt of htmlEvents) {
        const isDupe = allEvents.some(
          (e) =>
            e.artist_name.toLowerCase() === evt.artist_name.toLowerCase() &&
            e.event_date === evt.event_date &&
            e.venue_name.toLowerCase().includes(venue.name.toLowerCase())
        );
        if (!isDupe) {
          allEvents.push(evt);
        }
      }
    }
  }

  // Deduplicate by artist+date+venue combo
  const seen = new Set<string>();
  const deduped = allEvents.filter((evt) => {
    const key = `${evt.artist_name.toLowerCase()}|${evt.event_date}|${evt.venue_name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(
    `[VenueScraper] Complete. ${COMP_VENUES.length} venues queried, ${deduped.length} unique events found.`
  );

  return deduped;
}

// Re-export for backwards compatibility
export { COMP_VENUES as TRACKED_VENUES } from '../constants';
export type { CompVenue as TrackedVenue } from '../constants';
