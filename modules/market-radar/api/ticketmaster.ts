/**
 * Market Radar — Ticketmaster Data Source Connector
 *
 * Fetches events from the Ticketmaster Discovery API v2,
 * querying multiple cities defined in constants. Implements
 * rate-limiting, caching, and graceful error handling.
 *
 * Enhanced with:
 *  - Event detail fetching for price enrichment
 *  - Venue detail fetching for capacity estimation
 *  - Cross-reference with COMP_VENUES for known capacities
 */

import type { RawTicketmasterEvent, EnrichedTicketmasterEvent } from '../types';
import { TICKETMASTER_CITIES, MAX_VENUE_CAPACITY, COMP_VENUES } from '../constants';

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
  data: EnrichedTicketmasterEvent[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

/** Venue capacity cache — keyed by TM venue ID */
const venueCapacityCache = new Map<string, number | null>();

/** Cache time-to-live in milliseconds (1 hour) */
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Check whether a cache entry is still fresh */
const isCacheFresh = (entry: CacheEntry): boolean =>
  Date.now() - entry.timestamp < CACHE_TTL_MS;

// ============================================================
// Constants
// ============================================================

const TM_BASE_URL = 'https://app.ticketmaster.com/discovery/v2';

/** Rate-limit delay between requests (200 ms ≈ 5 req/s) */
const THROTTLE_MS = 250;

/** How many months ahead to search */
const LOOKAHEAD_MONTHS = 6;

/** Max events to enrich with detail endpoint per scan (avoid rate limits) */
const MAX_DETAIL_ENRICHMENTS = 50;

// ============================================================
// Venue Capacity Resolution
// ============================================================

/**
 * Attempt to resolve venue capacity from multiple sources:
 * 1. COMP_VENUES known list (fast, no API call)
 * 2. TM venue detail endpoint (API call, cached)
 * 3. TM event venue data (capacity / maximumCapacity fields)
 */
function resolveCompVenueCapacity(venueName: string, cityName: string): number | null {
  const normalizedName = venueName.toLowerCase().trim();
  const normalizedCity = cityName.toLowerCase().trim();

  for (const cv of COMP_VENUES) {
    const cvName = cv.name.toLowerCase().trim();
    const cvCity = cv.city.toLowerCase().trim();

    // Match by name similarity + city
    if (
      (normalizedName.includes(cvName) || cvName.includes(normalizedName)) &&
      normalizedCity === cvCity
    ) {
      return cv.capacity;
    }
  }
  return null;
}

/**
 * Fetch venue details from TM API to get capacity.
 * Results are cached in-memory by venue ID.
 */
async function fetchVenueCapacity(
  venueId: string,
  apiKey: string,
): Promise<number | null> {
  // Check cache first
  if (venueCapacityCache.has(venueId)) {
    return venueCapacityCache.get(venueId) ?? null;
  }

  try {
    await sleep(THROTTLE_MS);

    const url = `${TM_BASE_URL}/venues/${venueId}.json?apikey=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      venueCapacityCache.set(venueId, null);
      return null;
    }

    const venueData = (await response.json()) as {
      capacity?: number;
      maximumCapacity?: number;
      generalInfo?: { generalRule?: string };
      boxOfficeInfo?: { openHoursDetail?: string };
    };

    const capacity = venueData.capacity ?? venueData.maximumCapacity ?? null;
    venueCapacityCache.set(venueId, capacity);

    if (capacity) {
      console.log(`[Ticketmaster] Venue ${venueId} capacity: ${capacity}`);
    }

    return capacity;
  } catch {
    venueCapacityCache.set(venueId, null);
    return null;
  }
}

// ============================================================
// Event Detail Enrichment
// ============================================================

/**
 * Fetch individual event details to enrich with price ranges and
 * additional data not available in the list endpoint.
 */
async function fetchEventDetails(
  eventId: string,
  apiKey: string,
): Promise<RawTicketmasterEvent | null> {
  try {
    await sleep(THROTTLE_MS);

    const url = `${TM_BASE_URL}/events/${eventId}.json?apikey=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) return null;

    return (await response.json()) as RawTicketmasterEvent;
  } catch {
    return null;
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * Fetch music events from the Ticketmaster Discovery API for all
 * configured cities. Results are cached per-city for 1 hour and
 * deduplicated by event ID before returning.
 *
 * Events are enriched with:
 * - Venue capacity from COMP_VENUES cross-reference + TM venue detail
 * - Price ranges from individual event detail endpoint (for events missing prices)
 *
 * @returns Combined, deduplicated array of enriched Ticketmaster events
 */
export async function fetchTicketmasterEvents(): Promise<EnrichedTicketmasterEvent[]> {
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

  const allEvents: EnrichedTicketmasterEvent[] = [];

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

      const url = `${TM_BASE_URL}/events.json?${params.toString()}`;
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
        const venue = evt._embedded?.venues?.[0];
        const knownCapacity = venue?.capacity ?? venue?.maximumCapacity;
        if (knownCapacity && knownCapacity > MAX_VENUE_CAPACITY) {
          return false;
        }
        return true;
      });

      // Enrich each event with venue capacity resolution
      const enriched: EnrichedTicketmasterEvent[] = events.map((evt) => {
        const venue = evt._embedded?.venues?.[0];
        const venueName = venue?.name ?? '';
        const venueCity = venue?.city?.name ?? '';
        const venueId = venue?.id ?? null;

        // Try COMP_VENUES first (no API call)
        let resolvedCapacity = resolveCompVenueCapacity(venueName, venueCity);

        // Fall back to TM venue data
        if (!resolvedCapacity) {
          resolvedCapacity = venue?.capacity ?? venue?.maximumCapacity ?? null;
        }

        return {
          ...evt,
          _resolvedVenueCapacity: resolvedCapacity,
          _tmVenueId: venueId,
          _priceEnriched: false,
        };
      });

      // Store in cache
      cache.set(city, { data: enriched, timestamp: Date.now() });
      console.log(
        `[Ticketmaster] ${enriched.length} events retrieved for ${city}, ${stateCode}`
      );

      allEvents.push(...enriched);
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
  const deduplicated: EnrichedTicketmasterEvent[] = [];
  for (const evt of allEvents) {
    if (!seen.has(evt.id)) {
      seen.add(evt.id);
      deduplicated.push(evt);
    }
  }

  console.log(
    `[Ticketmaster] Returning ${deduplicated.length} unique events (${allEvents.length} total before dedup)`
  );

  // ── Enrich events missing prices or capacity via detail endpoint ──
  const needsEnrichment = deduplicated.filter(
    (evt) => !evt.priceRanges?.length || !evt._resolvedVenueCapacity
  );

  const toEnrich = needsEnrichment.slice(0, MAX_DETAIL_ENRICHMENTS);
  if (toEnrich.length > 0) {
    console.log(
      `[Ticketmaster] Enriching ${toEnrich.length} events with detail endpoint…`
    );

    let enrichedCount = 0;
    for (const evt of toEnrich) {
      const detail = await fetchEventDetails(evt.id, apiKey);
      if (!detail) continue;

      // Enrich price ranges
      if (!evt.priceRanges?.length && detail.priceRanges?.length) {
        evt.priceRanges = detail.priceRanges;
        evt._priceEnriched = true;
        enrichedCount++;
      }

      // Enrich seatmap
      if (!evt.seatmap && detail.seatmap) {
        evt.seatmap = detail.seatmap;
      }

      // Enrich accessibility / ticket limit
      if (!evt.accessibility && detail.accessibility) {
        evt.accessibility = detail.accessibility;
      }

      // Try to get venue capacity from detail if still missing
      if (!evt._resolvedVenueCapacity) {
        const detailVenue = detail._embedded?.venues?.[0];
        const detailCapacity = detailVenue?.capacity ?? detailVenue?.maximumCapacity;
        if (detailCapacity) {
          evt._resolvedVenueCapacity = detailCapacity;
        }

        // Last resort: fetch venue detail by ID
        if (!evt._resolvedVenueCapacity && evt._tmVenueId) {
          const venueCapacity = await fetchVenueCapacity(evt._tmVenueId, apiKey);
          if (venueCapacity) {
            evt._resolvedVenueCapacity = venueCapacity;
          }
        }
      }
    }

    console.log(`[Ticketmaster] Price enrichment complete: ${enrichedCount} events got prices`);
  }

  // Log pricing stats
  const withPrices = deduplicated.filter((e) => e.priceRanges?.length).length;
  const withCapacity = deduplicated.filter((e) => e._resolvedVenueCapacity).length;
  console.log(
    `[Ticketmaster] Final stats: ${withPrices}/${deduplicated.length} have prices, ${withCapacity}/${deduplicated.length} have capacity`
  );

  return deduplicated;
}
