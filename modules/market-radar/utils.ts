/**
 * Market Radar Module — Utility Functions
 *
 * Shared helpers for distance calculations, filtering, deduplication,
 * and date formatting used across market-radar services.
 */

import {
  FLORENCE_LAT,
  FLORENCE_LNG,
  MAX_RADIUS_MILES,
  MIN_VENUE_CAPACITY,
  MAX_VENUE_CAPACITY,
  EXCLUDED_CITIES,
} from './constants';
import type { NormalizedEvent } from './types';

// ============================================================
// Distance
// ============================================================

/**
 * Calculate the great-circle distance between two geographic points
 * using the Haversine formula.
 *
 * @param lat1 - Latitude of point 1 (degrees)
 * @param lng1 - Longitude of point 1 (degrees)
 * @param lat2 - Latitude of point 2 (degrees)
 * @param lng2 - Longitude of point 2 (degrees)
 * @returns Distance in **miles**
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const EARTH_RADIUS_MILES = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MILES * c;
}

/**
 * Check whether a geographic point is within a given radius of
 * Florence, AL (the Shoals).
 *
 * @param lat - Latitude to test
 * @param lng - Longitude to test
 * @param radiusMiles - Radius in miles (defaults to {@link MAX_RADIUS_MILES})
 * @returns `true` if the point falls within the radius
 */
export function isWithinRadius(
  lat: number,
  lng: number,
  radiusMiles: number = MAX_RADIUS_MILES,
): boolean {
  return calculateDistance(FLORENCE_LAT, FLORENCE_LNG, lat, lng) <= radiusMiles;
}

// ============================================================
// Filters
// ============================================================

/**
 * Determine if a city should be excluded from analysis.
 *
 * @param city - City name to check
 * @returns `true` if the city is in the exclusion list
 */
export function isExcludedCity(city: string): boolean {
  return EXCLUDED_CITIES.some(
    (excluded) => excluded.toLowerCase() === city.toLowerCase(),
  );
}

/**
 * Validate that a venue capacity falls within the acceptable range.
 *
 * @param capacity - Venue capacity to validate
 * @returns `true` if capacity is between {@link MIN_VENUE_CAPACITY} and {@link MAX_VENUE_CAPACITY} inclusive
 */
export function isValidCapacity(capacity: number): boolean {
  return capacity >= MIN_VENUE_CAPACITY && capacity <= MAX_VENUE_CAPACITY;
}

// ============================================================
// Deduplication
// ============================================================

/**
 * Deduplicate an array of normalised events using a composite key
 * of `(artist_name, venue_name, event_date)` with improved normalisation.
 *
 * - Artist names: lowercased, trimmed, "the " prefix removed, non-alphanumeric stripped
 * - Venue names: lowercased, trimmed, non-alphanumeric stripped
 * - Dates: normalised to YYYY-MM-DD via {@link formatEventDate}
 *
 * When duplicates are found, the event from the highest-priority source wins
 * (ticketmaster > bandsintown > venue_scrape).
 *
 * @param events - Array of normalised events
 * @returns Deduplicated array
 */
export function deduplicateEvents(events: NormalizedEvent[]): NormalizedEvent[] {
  const seen = new Map<string, NormalizedEvent>();

  for (const event of events) {
    // Normalize for comparison
    const artistKey = (event.artist_name || '')
      .toLowerCase()
      .trim()
      .replace(/^the\s+/, '')
      .replace(/[^a-z0-9\s]/g, '');
    const venueKey = (event.venue_name || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '');
    const dateKey = formatEventDate(event.event_date ? new Date(event.event_date) : new Date());

    const key = `${artistKey}|${venueKey}|${dateKey}`;

    if (!seen.has(key)) {
      seen.set(key, event);
    } else {
      // Prefer ticketmaster data over bandsintown over venue_scrape
      const existing = seen.get(key)!;
      const sourcePriority: Record<string, number> = { ticketmaster: 3, bandsintown: 2, venue_scrape: 1 };
      if ((sourcePriority[event.source] || 0) > (sourcePriority[existing.source] || 0)) {
        seen.set(key, event);
      }
    }
  }

  return Array.from(seen.values());
}

// ============================================================
// Date Formatting
// ============================================================

/**
 * Format a Date (or date-like string) to `YYYY-MM-DD`.
 *
 * @param date - A `Date` object or a string parseable by `new Date()`
 * @returns ISO date string in `YYYY-MM-DD` format
 */
export function formatEventDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
