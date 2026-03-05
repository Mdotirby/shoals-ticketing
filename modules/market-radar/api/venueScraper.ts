/**
 * Market Radar — Venue Scraper Data Source Connector
 *
 * Scrapes venue calendar pages for event listings. Currently uses a
 * placeholder approach — each venue needs site-specific CSS selectors
 * or API integration to extract structured event data.
 */

import type { RawVenueScrapedEvent } from '../types';

// ============================================================
// Internal Helpers
// ============================================================

/** Simple async sleep for rate-limiting */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Delay between venue requests (ms) */
const THROTTLE_MS = 500;

// ============================================================
// Tracked Venues
// ============================================================

/** Scraping strategy for a venue */
export type VenueScraperType = 'css_selector' | 'rss' | 'json_api';

/** A venue whose calendar we track for events */
export interface TrackedVenue {
  /** Venue display name */
  name: string;
  /** City */
  city: string;
  /** US state code */
  state: string;
  /** URL to the venue's event calendar / listing page */
  url: string;
  /** Venue latitude */
  latitude: number;
  /** Venue longitude */
  longitude: number;
  /** Approximate capacity */
  capacity: number;
  /** How we scrape this venue */
  type: VenueScraperType;
}

/**
 * Southeast venues in the 300–3 000 capacity range that we track
 * for upcoming events. Excludes venues above 3 000 cap and those
 * in excluded cities (e.g. Nashville).
 */
export const TRACKED_VENUES: TrackedVenue[] = [
  {
    name: 'Saturn',
    city: 'Birmingham',
    state: 'AL',
    url: 'https://www.saturnbirmingham.com/events',
    latitude: 33.5093,
    longitude: -86.8022,
    capacity: 800,
    type: 'css_selector',
  },
  {
    name: 'Iron City',
    city: 'Birmingham',
    state: 'AL',
    url: 'https://ironcitybham.com/events',
    latitude: 33.5139,
    longitude: -86.8024,
    capacity: 1200,
    type: 'css_selector',
  },
  {
    name: 'The Caverns',
    city: 'Pelham',
    state: 'TN',
    url: 'https://www.thecaverns.com/events',
    latitude: 35.2852,
    longitude: -85.8196,
    capacity: 900,
    type: 'css_selector',
  },
  {
    name: 'Minglewood Hall',
    city: 'Memphis',
    state: 'TN',
    url: 'https://www.minglewoodhall.com/events',
    latitude: 35.1404,
    longitude: -89.9905,
    capacity: 1500,
    type: 'css_selector',
  },
  {
    name: 'Variety Playhouse',
    city: 'Atlanta',
    state: 'GA',
    url: 'https://www.varietyplayhouse.com/events',
    latitude: 33.7640,
    longitude: -84.3493,
    capacity: 1100,
    type: 'css_selector',
  },
  {
    name: 'Terminal West',
    city: 'Atlanta',
    state: 'GA',
    url: 'https://www.terminalwestatl.com/events',
    latitude: 33.7823,
    longitude: -84.4100,
    capacity: 1000,
    type: 'css_selector',
  },
  {
    name: 'Track 29',
    city: 'Chattanooga',
    state: 'TN',
    url: 'https://www.track29.co/events',
    latitude: 35.0574,
    longitude: -85.3110,
    capacity: 800,
    type: 'css_selector',
  },
  {
    name: 'The Camp',
    city: 'Muscle Shoals',
    state: 'AL',
    url: 'https://www.thecampmuscleshoals.com/events',
    latitude: 34.7448,
    longitude: -87.6676,
    capacity: 500,
    type: 'css_selector',
  },
  {
    name: 'Duling Hall',
    city: 'Jackson',
    state: 'MS',
    url: 'https://www.dulinghall.com/events',
    latitude: 32.3147,
    longitude: -90.1828,
    capacity: 500,
    type: 'css_selector',
  },
  {
    name: 'The Grey Eagle',
    city: 'Asheville',
    state: 'NC',
    url: 'https://www.thegreyeagle.com/events',
    latitude: 35.5787,
    longitude: -82.5653,
    capacity: 375,
    type: 'css_selector',
  },
];

// ============================================================
// Public API
// ============================================================

/**
 * Scrape tracked venue calendar pages for upcoming events.
 *
 * **Current implementation is a placeholder.** Each venue requires
 * site-specific CSS selectors, RSS parsing, or JSON API integration
 * to reliably extract event data. For now the function attempts to
 * fetch each venue URL and logs the result, but returns an empty
 * array until per-venue parsers are built.
 *
 * @returns Array of scraped venue events (currently empty — placeholder)
 */
export async function fetchVenueScrapedEvents(): Promise<RawVenueScrapedEvent[]> {
  const allEvents: RawVenueScrapedEvent[] = [];

  for (const venue of TRACKED_VENUES) {
    try {
      await sleep(THROTTLE_MS);

      console.log(
        `[VenueScraper] Attempting fetch for "${venue.name}" (${venue.city}, ${venue.state}) — ${venue.url}`
      );

      const response = await fetch(venue.url, {
        headers: {
          'User-Agent':
            'VenueCore-MarketRadar/1.0 (venue calendar aggregation)',
        },
      });

      if (!response.ok) {
        console.warn(
          `[VenueScraper] HTTP ${response.status} for "${venue.name}": ${response.statusText}`
        );
        continue;
      }

      const contentType = response.headers.get('content-type') ?? '';
      const body = await response.text();

      console.log(
        `[VenueScraper] ✓ "${venue.name}" responded (${contentType}, ${body.length} bytes)`
      );

      // TODO: Implement site-specific parsing for each venue.
      // Each venue's calendar page has a unique DOM structure.
      // Parsers should extract: artist_name, event_date, ticket_url,
      // ticket_price_low/high from the HTML.
      //
      // Possible strategies per venue.type:
      //   'css_selector' — use a DOM parser (e.g. cheerio) with venue-specific selectors
      //   'rss'          — parse the venue's RSS/Atom feed
      //   'json_api'     — call the venue's public JSON API (e.g. Eventbrite widget)
      //
      // For now we log the fetch attempt and return no events.

      // Placeholder: attempt basic pattern detection on HTML responses
      if (contentType.includes('text/html')) {
        // TODO: Replace with per-venue CSS selector parsing (e.g. cheerio).
        // Common patterns to look for:
        //   - <time datetime="..."> elements
        //   - <h2>/<h3> headings with artist names
        //   - <a href="..."> links to ticket pages
        console.log(
          `[VenueScraper] ⚠ "${venue.name}" — HTML parsing not yet implemented. Skipping event extraction.`
        );
      }
    } catch (err) {
      console.error(
        `[VenueScraper] Error scraping "${venue.name}" (${venue.city}, ${venue.state}):`,
        err instanceof Error ? err.message : err
      );
      // Continue with remaining venues — never throw
    }
  }

  console.log(
    `[VenueScraper] Scrape complete. ${TRACKED_VENUES.length} venues attempted, ${allEvents.length} events extracted.`
  );

  return allEvents;
}
