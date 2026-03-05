/**
 * Market Radar — Bandsintown Data Source Connector
 *
 * Fetches upcoming artist events from the Bandsintown public API
 * for a seed list of regional Southeast artists. Filters results
 * to SE US states only.
 */

import type { RawBandsintownEvent } from '../types';

// ============================================================
// Internal Helpers
// ============================================================

/** Simple async sleep for rate-limiting */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Southeast US state codes to keep */
const SE_US_STATES = new Set([
  'AL', 'TN', 'GA', 'MS', 'AR', 'KY', 'SC', 'NC', 'VA', 'FL',
]);

/** Bandsintown API base URL */
const BIT_BASE_URL = 'https://rest.bandsintown.com/artists';

/** App ID sent with every request */
const APP_ID = 'VenueCoreRadar';

/** Delay between API requests (ms) */
const THROTTLE_MS = 300;

// ============================================================
// Artist Seed List
// ============================================================

/**
 * Returns a hardcoded seed list of ~20 regional Southeast artists
 * and bands likely to play venues in the area. Mix of country, rock,
 * indie, americana, and blues acts.
 */
export function getArtistSeedList(): string[] {
  return [
    'Tyler Childers',
    'Jason Isbell',
    'Sturgill Simpson',
    'Nathaniel Rateliff',
    'Hailey Whitters',
    'Charley Crockett',
    'Sierra Ferrell',
    'Colter Wall',
    'Zach Bryan',
    'Whiskey Myers',
    'Blackberry Smoke',
    'Drive-By Truckers',
    'St. Paul and the Broken Bones',
    'Alabama Shakes',
    'Lucero',
    'Old Crow Medicine Show',
    'Turnpike Troubadours',
    'Morgan Wade',
    'Marcus King',
    'Cody Jinks',
  ];
}

// ============================================================
// Public API
// ============================================================

/**
 * Fetch upcoming events for the given artists from the Bandsintown
 * public API. Results are filtered to Southeast US states only.
 *
 * @param artistNames - Array of artist names to query
 * @returns Combined array of raw Bandsintown events in SE US states
 */
export async function fetchBandsintownEvents(
  artistNames: string[]
): Promise<RawBandsintownEvent[]> {
  const allEvents: RawBandsintownEvent[] = [];

  for (const artist of artistNames) {
    try {
      await sleep(THROTTLE_MS);

      const encodedArtist = encodeURIComponent(artist);
      const url = `${BIT_BASE_URL}/${encodedArtist}/events?app_id=${APP_ID}&date=upcoming`;

      console.log(`[Bandsintown] Fetching events for "${artist}"…`);

      const response = await fetch(url);

      if (!response.ok) {
        console.error(
          `[Bandsintown] HTTP ${response.status} for "${artist}": ${response.statusText}`
        );
        continue;
      }

      const json = await response.json();

      // The API returns an array of event objects (or an error object)
      if (!Array.isArray(json)) {
        console.warn(
          `[Bandsintown] Unexpected response for "${artist}":`,
          typeof json === 'object' ? JSON.stringify(json).slice(0, 200) : json
        );
        continue;
      }

      const events = json as RawBandsintownEvent[];

      // Filter to Southeast US states
      const seEvents = events.filter((evt) => {
        const region = evt.venue?.region?.toUpperCase().trim();
        return region !== undefined && SE_US_STATES.has(region);
      });

      console.log(
        `[Bandsintown] ${seEvents.length}/${events.length} events in SE US for "${artist}"`
      );

      allEvents.push(...seEvents);
    } catch (err) {
      console.error(
        `[Bandsintown] Error fetching events for "${artist}":`,
        err instanceof Error ? err.message : err
      );
      // Continue with remaining artists — never throw
    }
  }

  console.log(
    `[Bandsintown] Returning ${allEvents.length} total SE US events`
  );

  return allEvents;
}
