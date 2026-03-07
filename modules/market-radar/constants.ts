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
// Comp Venues (350–800 capacity)
// ============================================================

export interface CompVenue {
  /** Venue display name */
  name: string;
  /** City */
  city: string;
  /** US state code */
  state: string;
  /** Approximate capacity */
  capacity: number;
  /** Ticketmaster venue ID (if known — used for direct TM venue queries) */
  tmVenueId?: string;
  /** Latitude */
  lat: number;
  /** Longitude */
  lng: number;
}

/** Comp venues in the 350–800 cap range for SE US market analysis */
export const COMP_VENUES: CompVenue[] = [
  { name: 'Saturn', city: 'Birmingham', state: 'AL', capacity: 800, lat: 33.5093, lng: -86.8022, tmVenueId: 'KovZpZAFnkEA' },
  { name: 'Zydeco', city: 'Birmingham', state: 'AL', capacity: 500, lat: 33.5086, lng: -86.8009 },
  { name: 'WorkPlay', city: 'Birmingham', state: 'AL', capacity: 350, lat: 33.5033, lng: -86.7918 },
  { name: 'The Camp', city: 'Muscle Shoals', state: 'AL', capacity: 500, lat: 34.7448, lng: -87.6676 },
  { name: 'Track 29', city: 'Chattanooga', state: 'TN', capacity: 800, lat: 35.0574, lng: -85.3110 },
  { name: 'The Basement East', city: 'Nashville', state: 'TN', capacity: 800, lat: 36.1753, lng: -86.7390 },
  { name: '3rd & Lindsley', city: 'Nashville', state: 'TN', capacity: 400, lat: 36.1540, lng: -86.7730 },
  { name: 'Cannery Ballroom', city: 'Nashville', state: 'TN', capacity: 675, lat: 36.1478, lng: -86.7945 },
  { name: 'Exit/In', city: 'Nashville', state: 'TN', capacity: 475, lat: 36.1520, lng: -86.8037 },
  { name: 'The Grey Eagle', city: 'Asheville', state: 'NC', capacity: 375, lat: 35.5787, lng: -82.5653 },
  { name: 'The Orange Peel', city: 'Asheville', state: 'NC', capacity: 950, lat: 35.5910, lng: -82.5556 },
  { name: 'SweetWater', city: 'Atlanta', state: 'GA', capacity: 350, lat: 33.7979, lng: -84.4127 },
  { name: 'The Eastern', city: 'Atlanta', state: 'GA', capacity: 700, lat: 33.7562, lng: -84.3518 },
  { name: 'Terminal West', city: 'Atlanta', state: 'GA', capacity: 1000, lat: 33.7823, lng: -84.4100 },
  { name: 'Duling Hall', city: 'Jackson', state: 'MS', capacity: 500, lat: 32.3147, lng: -90.1828 },
];

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

/**
 * How often (hours) the event scan job runs.
 * Set to 24 for Vercel Hobby plan (min frequency = once/day).
 * Reduce to 6 if upgrading to Vercel Pro.
 */
export const SCAN_INTERVAL_HOURS = 24;

/**
 * How often (hours) metrics / competition scoring runs.
 * Set to 24 for Vercel Hobby plan (min frequency = once/day).
 * Reduce to 12 if upgrading to Vercel Pro.
 */
export const METRICS_INTERVAL_HOURS = 24;

// ============================================================
// Notifications
// ============================================================

/** Hardcoded notification recipient email */
export const NOTIFICATION_EMAIL = 'matt@venuecore.live';
