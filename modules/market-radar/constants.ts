/**
 * Market Radar Module — Constants
 *
 * Shared configuration values used across all market-radar services.
 */

// ============================================================
// Geography — Florence / Shoals reference point
// ============================================================

/** Latitude of Florence, AL */
export const FLORENCE_LAT = 34.7998;

/** Longitude of Florence, AL */
export const FLORENCE_LNG = -87.6773;

/** Maximum search radius in miles from Florence */
export const MAX_RADIUS_MILES = 150;

// ============================================================
// Venue Capacity Filters
// ============================================================

/** Minimum venue capacity to include in results */
export const MIN_VENUE_CAPACITY = 300;

/** Maximum venue capacity to include in results */
export const MAX_VENUE_CAPACITY = 3000;

// ============================================================
// City Filters
// ============================================================

/** Cities to exclude from competition analysis (too large / different market) */
export const EXCLUDED_CITIES: string[] = ['Nashville'];

// ============================================================
// Ticketmaster Search Cities
// ============================================================

export interface TicketmasterCity {
  /** City name */
  city: string;
  /** Two-letter US state code */
  stateCode: string;
}

/** Cities (with state codes) to query in the Ticketmaster API */
export const TICKETMASTER_CITIES: TicketmasterCity[] = [
  { city: 'Florence', stateCode: 'AL' },
  { city: 'Birmingham', stateCode: 'AL' },
  { city: 'Huntsville', stateCode: 'AL' },
  { city: 'Memphis', stateCode: 'TN' },
  { city: 'Chattanooga', stateCode: 'TN' },
  { city: 'Atlanta', stateCode: 'GA' },
  { city: 'Knoxville', stateCode: 'TN' },
];

// ============================================================
// Routing Detection
// ============================================================

/** Minimum number of shows required to form a routing cluster */
export const ROUTING_MIN_SHOWS = 3;

/** Maximum number of days between first and last show in a cluster */
export const ROUTING_MAX_DAYS = 10;

// ============================================================
// Competition Analysis
// ============================================================

/** Radius (miles) within which two events are considered competing */
export const COMPETITION_RADIUS_MILES = 50;

// ============================================================
// Scheduling
// ============================================================

/** How often (hours) the event scan job runs */
export const SCAN_INTERVAL_HOURS = 6;

/** How often (hours) metrics / competition scoring runs */
export const METRICS_INTERVAL_HOURS = 12;

// ============================================================
// Notifications
// ============================================================

/** Hardcoded notification recipient email */
export const NOTIFICATION_EMAIL = 'matt@venuecore.live';
