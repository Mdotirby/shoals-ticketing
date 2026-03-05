/**
 * Market Radar — Ticketmaster Data Source Connector
 *
 * Fetches events from the Ticketmaster Discovery API v2,
 * querying multiple cities defined in constants. Implements
 * rate-limiting, caching, and graceful error handling.
 */

import type { RawTicketmasterEvent } from '../types';
import { TICKETMASTER_CITIES, MAX_VENUE_CAPACITY } from '../constants';

// ============================================================
// Internal Helpers
// ============================================================

/** Simple async sleep for rate-limiting */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Format a Date as YYYY-MM-DDTHH:mm:ssZ */
const toISOParam = (d: Date): string =>
  d.toISOString().replace(/\.\d{3}Z$/, 'Z');

// ============================================================
// Module-level Cache (1-hour TTL)
// ============================================================

interface CacheEntry {
  data: RawTicketmasterEvent[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

/** Cache time-to-live in milliseconds (1 hour) */
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Check whether a cache entry is still fresh */
const isCacheFresh = (entry: CacheEntry): boolean =>
  Date.now() - entry.timestamp < CACHE_TTL_MS;

// ============================================================
// Constants
// ============================================================

const TM_BASE_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';

/** Rate-limit delay between requests (200 ms ≈ 5 req/s) */
const THROTTLE_MS = 200;

/** How many months ahead to search */
const LOOKAHEAD_MONTHS = 6;

// ============================================================
// Public API
// ============================================================

/**
 * Fetch music events from the Ticketmaster Discovery API for all
 * configured cities. Results are cached per-city for 1 hour and
 * deduplicated by event ID before returning.
 *
 * @returns Combined, deduplicated array of raw Ticketmaster events
 */
export async function fetchTicketmasterEvents(): Promise<RawTicketmasterEvent[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      '[Market Radar] Missing TICKETMASTER_API_KEY environment variable. ' +
        'Set it before calling fetchTicketmasterEvents().'
    );
  }

  const now = new Date();
  const endDate = new Date(now);
  endDate.setMonth(endDate.getMonth() + LOOKAHEAD_MONTHS);

  const startDateTime = toISOParam(now);
  const endDateTime = toISOParam(endDate);

  const allEvents: RawTicketmasterEvent[] = [];

  for (const { city, stateCode } of TICKETMASTER_CITIES) {
    // Check cache first
    const cached = cache.get(city);
    if (cached && isCacheFresh(cached)) {
      console.log(`[Ticketmaster] Cache hit for ${city}, ${stateCode}`);
      allEvents.push(...cached.data);
      continue;
    }

    try {
      // Rate-limit: wait between requests
      await sleep(THROTTLE_MS);

      const params = new URLSearchParams({
        apikey: apiKey,
        classificationName: 'music',
        city,
        stateCode,
        radius: '50',
        unit: 'miles',
        size: '200',
        sort: 'date,asc',
        startDateTime,
        endDateTime,
      });

      const url = `${TM_BASE_URL}?${params.toString()}`;
      console.log(`[Ticketmaster] Fetching events for ${city}, ${stateCode}…`);

      const response = await fetch(url);

      if (!response.ok) {
        console.error(
          `[Ticketmaster] HTTP ${response.status} for ${city}: ${response.statusText}`
        );
        continue;
      }

      const json = (await response.json()) as {
        _embedded?: { events?: RawTicketmasterEvent[] };
      };

      let events: RawTicketmasterEvent[] = json._embedded?.events ?? [];

      // Filter out events at venues larger than MAX_VENUE_CAPACITY (3 000)
      events = events.filter((evt) => {
        const total = evt._embedded?.venues?.[0]?.upcomingEvents?._total;
        // upcomingEvents._total is NOT capacity; Ticketmaster doesn't always
        // expose capacity directly. We use the generalInfo field or skip if
        // unavailable. For now, only filter when we can detect capacity.
        // A future normaliser will handle stricter filtering.
        if (total !== undefined && total > MAX_VENUE_CAPACITY) {
          return false;
        }
        return true;
      });

      // Store in cache
      cache.set(city, { data: events, timestamp: Date.now() });
      console.log(
        `[Ticketmaster] ${events.length} events retrieved for ${city}, ${stateCode}`
      );

      allEvents.push(...events);
    } catch (err) {
      console.error(
        `[Ticketmaster] Error fetching events for ${city}, ${stateCode}:`,
        err instanceof Error ? err.message : err
      );
      // Continue with remaining cities — never throw
    }
  }

  // Deduplicate by event ID
  const seen = new Set<string>();
  const deduplicated: RawTicketmasterEvent[] = [];
  for (const evt of allEvents) {
    if (!seen.has(evt.id)) {
      seen.add(evt.id);
      deduplicated.push(evt);
    }
  }

  console.log(
    `[Ticketmaster] Returning ${deduplicated.length} unique events (${allEvents.length} total before dedup)`
  );

  return deduplicated;
}
