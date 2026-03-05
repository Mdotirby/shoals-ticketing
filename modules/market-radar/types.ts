/**
 * Market Radar Module — TypeScript Types
 *
 * Type definitions for the market radar event intelligence system.
 * These types mirror the database schema in market_radar schema
 * and define the shapes of external API responses.
 */

// ============================================================
// Enums & Literal Types
// ============================================================

/** Data source identifier for an event record */
export type EventSource = 'ticketmaster' | 'bandsintown' | 'venue_scrape';

// ============================================================
// Database Row Types
// ============================================================

/** Matches the `market_radar.events` table */
export interface MarketRadarEvent {
  /** Primary key (UUID) */
  id: string;
  /** Name of the performing artist */
  artist_name: string;
  /** Optional display name for the event */
  event_name: string | null;
  /** Name of the venue hosting the event */
  venue_name: string;
  /** City where the venue is located */
  venue_city: string;
  /** US state code where the venue is located */
  venue_state: string;
  /** Venue capacity (number of attendees) */
  venue_capacity: number | null;
  /** Date the event takes place (ISO date string YYYY-MM-DD) */
  event_date: string;
  /** Date the event was publicly announced */
  announce_date: string | null;
  /** Lowest listed ticket price */
  ticket_price_low: number | null;
  /** Highest listed ticket price */
  ticket_price_high: number | null;
  /** URL to purchase tickets */
  ticket_url: string | null;
  /** Name of the ticketing provider */
  ticket_provider: string | null;
  /** Venue latitude */
  latitude: number | null;
  /** Venue longitude */
  longitude: number | null;
  /** Calculated distance from Florence, AL in miles */
  distance_from_shoals: number | null;
  /** Number of users tracking / following the event */
  tracker_count: number | null;
  /** Number of RSVPs */
  rsvp_count: number | null;
  /** Estimated number of tickets already sold */
  estimated_tickets_sold: number | null;
  /** Estimated number of tickets still available */
  estimated_tickets_remaining: number | null;
  /** Rate of ticket sales (tickets per day) */
  sale_velocity: number | null;
  /** Computed competition score (0–100) */
  competition_score: number | null;
  /** FK to routing_clusters if this event is part of a detected tour */
  routing_cluster_id: string | null;
  /** Data source that provided this event */
  source: EventSource;
  /** Unique event ID from the source system */
  source_event_id: string | null;
  /** Raw JSON payload from the source API */
  raw_data: Record<string, unknown> | null;
  /** Row creation timestamp */
  created_at: string;
  /** Row last-updated timestamp */
  updated_at: string;
}

/** Matches the `market_radar.routing_clusters` table */
export interface MarketRadarRoutingCluster {
  /** Primary key (UUID) */
  id: string;
  /** Artist whose shows form the cluster */
  artist_name: string;
  /** Earliest event date in the cluster */
  cluster_start_date: string;
  /** Latest event date in the cluster */
  cluster_end_date: string;
  /** Number of events in the cluster */
  event_count: number;
  /** Confidence that this cluster represents a real tour route (0–100) */
  confidence_score: number;
  /** Average distance in miles between consecutive stops */
  avg_distance_between_stops: number | null;
  /** List of cities in the cluster */
  cities: string[] | null;
  /** FK to the event in the cluster nearest to Shoals */
  nearest_event_id: string | null;
  /** Distance in miles of the nearest event to Shoals */
  nearest_distance: number | null;
  /** Row creation timestamp */
  created_at: string;
  /** Row last-updated timestamp */
  updated_at: string;
}

/** Matches the `market_radar.competition` table */
export interface MarketRadarCompetition {
  /** Primary key (UUID) */
  id: string;
  /** FK to the primary event being analysed */
  event_id: string;
  /** FK to the competing event */
  competing_event_id: string;
  /** Distance in miles between the two venues */
  distance_between: number;
  /** Whether the events occur on the same date */
  date_overlap: boolean;
  /** How similar the ticket prices are (0–100) */
  price_similarity: number | null;
  /** How much venue capacities overlap (0–100) */
  capacity_overlap: number | null;
  /** Overall competition score (0–100) */
  competition_score: number;
  /** Row creation timestamp */
  created_at: string;
}

// ============================================================
// External API Response Shapes
// ============================================================

/** Shape of a Ticketmaster Discovery API event object (relevant fields) */
export interface RawTicketmasterEvent {
  /** Ticketmaster event ID */
  id: string;
  /** Event name / title */
  name: string;
  /** Event dates information */
  dates: {
    start: {
      localDate: string;
      localTime?: string;
    };
    status?: {
      code: string;
    };
  };
  /** Embedded resources (venues, attractions) */
  _embedded?: {
    venues?: Array<{
      name: string;
      city?: { name: string };
      state?: { stateCode: string };
      location?: { latitude: string; longitude: string };
      generalInfo?: { generalRule?: string; childRule?: string };
      boxOfficeInfo?: { phoneNumberDetail?: string };
      upcomingEvents?: { _total?: number };
      capacity?: number;
      maximumCapacity?: number;
    }>;
    attractions?: Array<{
      name: string;
      id: string;
      externalLinks?: Record<string, Array<{ url: string }>>;
      upcomingEvents?: { _total?: number };
    }>;
  };
  /** Price range information */
  priceRanges?: Array<{
    type: string;
    currency: string;
    min: number;
    max: number;
  }>;
  /** Sales / presale windows */
  sales?: {
    public?: {
      startDateTime?: string;
      endDateTime?: string;
    };
  };
  /** Direct URL to the event on Ticketmaster */
  url?: string;
}

/** Shape of a Bandsintown API event object (relevant fields) */
export interface RawBandsintownEvent {
  /** Bandsintown event ID */
  id: string;
  /** Artist name */
  artist_id: string;
  /** Event URL on Bandsintown */
  url: string;
  /** Event date/time (ISO 8601) */
  datetime: string;
  /** Event title */
  title: string;
  /** Description text */
  description: string;
  /** Venue details */
  venue: {
    name: string;
    city: string;
    region: string;
    country: string;
    latitude: string;
    longitude: string;
  };
  /** Lineup of performing artists */
  lineup: string[];
  /** Ticket offers */
  offers: Array<{
    type: string;
    url: string;
    status: string;
  }>;
  /** Number of RSVPs */
  tracker_count?: number;
}

/** Shape of a venue-scraped event before normalisation */
export interface RawVenueScrapedEvent {
  /** Name of the artist / headliner */
  artist_name: string;
  /** Optional event title */
  event_name?: string;
  /** Venue name as listed on the source page */
  venue_name: string;
  /** City of the venue */
  venue_city: string;
  /** State code of the venue */
  venue_state: string;
  /** Event date string (various formats accepted) */
  event_date: string;
  /** Ticket purchase URL */
  ticket_url?: string;
  /** Ticket provider name */
  ticket_provider?: string;
  /** Low ticket price if available */
  ticket_price_low?: number;
  /** High ticket price if available */
  ticket_price_high?: number;
  /** Known or estimated venue capacity */
  venue_capacity?: number;
  /** Source URL that was scraped */
  source_url: string;
}

// ============================================================
// Normalised / Insert Types
// ============================================================

/**
 * Unified event shape after normalisation, ready for DB insert.
 * Excludes auto-generated columns (id, created_at, updated_at).
 */
export interface NormalizedEvent {
  /** Name of the performing artist */
  artist_name: string;
  /** Optional display name for the event */
  event_name: string | null;
  /** Name of the venue hosting the event */
  venue_name: string;
  /** City where the venue is located */
  venue_city: string;
  /** US state code where the venue is located */
  venue_state: string;
  /** Venue capacity (number of attendees) */
  venue_capacity: number | null;
  /** Date the event takes place (YYYY-MM-DD) */
  event_date: string;
  /** Date the event was publicly announced (YYYY-MM-DD) */
  announce_date: string | null;
  /** Lowest listed ticket price */
  ticket_price_low: number | null;
  /** Highest listed ticket price */
  ticket_price_high: number | null;
  /** URL to purchase tickets */
  ticket_url: string | null;
  /** Name of the ticketing provider */
  ticket_provider: string | null;
  /** Venue latitude */
  latitude: number | null;
  /** Venue longitude */
  longitude: number | null;
  /** Calculated distance from Florence, AL in miles */
  distance_from_shoals: number | null;
  /** Number of users tracking / following the event */
  tracker_count: number | null;
  /** Number of RSVPs */
  rsvp_count: number | null;
  /** Estimated number of tickets already sold */
  estimated_tickets_sold: number | null;
  /** Estimated number of tickets still available */
  estimated_tickets_remaining: number | null;
  /** Rate of ticket sales (tickets per day) */
  sale_velocity: number | null;
  /** Computed competition score (0–100) */
  competition_score: number | null;
  /** FK to routing_clusters if this event is part of a detected tour */
  routing_cluster_id: string | null;
  /** Data source that provided this event */
  source: EventSource;
  /** Unique event ID from the source system */
  source_event_id: string | null;
  /** Raw JSON payload from the source API */
  raw_data: Record<string, unknown> | null;
}
