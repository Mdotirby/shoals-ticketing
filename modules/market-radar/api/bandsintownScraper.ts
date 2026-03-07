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

/**
 * Map of full US state names → two-letter codes.
 * Bandsintown returns full state names in venue.region (e.g. "Alabama")
 * while our filter uses two-letter codes (e.g. "AL").
 */
const STATE_NAME_TO_CODE: Record<string, string> = {
  'alabama': 'AL',
  'alaska': 'AK',
  'arizona': 'AZ',
  'arkansas': 'AR',
  'california': 'CA',
  'colorado': 'CO',
  'connecticut': 'CT',
  'delaware': 'DE',
  'florida': 'FL',
  'georgia': 'GA',
  'hawaii': 'HI',
  'idaho': 'ID',
  'illinois': 'IL',
  'indiana': 'IN',
  'iowa': 'IA',
  'kansas': 'KS',
  'kentucky': 'KY',
  'louisiana': 'LA',
  'maine': 'ME',
  'maryland': 'MD',
  'massachusetts': 'MA',
  'michigan': 'MI',
  'minnesota': 'MN',
  'mississippi': 'MS',
  'missouri': 'MO',
  'montana': 'MT',
  'nebraska': 'NE',
  'nevada': 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  'ohio': 'OH',
  'oklahoma': 'OK',
  'oregon': 'OR',
  'pennsylvania': 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  'tennessee': 'TN',
  'texas': 'TX',
  'utah': 'UT',
  'vermont': 'VT',
  'virginia': 'VA',
  'washington': 'WA',
  'west virginia': 'WV',
  'wisconsin': 'WI',
  'wyoming': 'WY',
  'district of columbia': 'DC',
};

/**
 * Normalise a Bandsintown region string to a two-letter US state code.
 *
 * Handles both cases:
 *  - Already a 2-letter code (e.g. "AL") → returns uppercased
 *  - Full state name (e.g. "Alabama") → looks up in STATE_NAME_TO_CODE
 *
 * @returns Two-letter state code, or `null` if unrecognised
 */
function normalizeRegionToStateCode(region: string | undefined): string | null {
  if (!region) return null;
  const trimmed = region.trim();

  // Already a 2-letter code?
  if (trimmed.length === 2) {
    return trimmed.toUpperCase();
  }

  // Try full state name lookup
  const code = STATE_NAME_TO_CODE[trimmed.toLowerCase()];
  return code ?? null;
}

/** Bandsintown API base URL */
const BIT_BASE_URL = 'https://rest.bandsintown.com/artists';

/**
 * App ID sent with every request.
 * Note: Bandsintown requires a registered app ID. The public API
 * accepts any non-empty string but may rate-limit unregistered IDs.
 * If results are empty, try registering at https://artists.bandsintown.com/
 */
const APP_ID = process.env.BANDSINTOWN_APP_ID || 'VenueCoreRadar';

/** Delay between API requests (ms) — increased to avoid rate limiting */
const THROTTLE_MS = 500;

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
    // Americana / Country / Roots — headliner tier for 350-800 cap
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
    'Lucero',
    'Old Crow Medicine Show',
    'Turnpike Troubadours',
    'Morgan Wade',
    'Marcus King',
    'Cody Jinks',
    // Additional acts sized for 350-800 cap rooms
    'Caamp',
    'Trampled by Turtles',
    'Shakey Graves',
    'Arlo McKinley',
    'Shane Smith and the Saints',
    'Drayton Farley',
    'Brent Cobb',
    'Cody Johnson',
    'Zach Top',
    'Hayes Carll',
    'Caitlin Rose',
    'Ruston Kelly',
    'Lainey Wilson',
    'Dylan Gossett',
    'The Red Clay Strays',
    'American Aquarium',
    'Muscadine Bloodline',
    'Vandoliers',
    'Joshua Ray Walker',
    'Paul Cauthen',
    'Flatland Cavalry',
    'Houndmouth',
    'Rayland Baxter',
    'Adia Victoria',
    'Joy Oladokun',
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
  const scanErrors: { artist: string; status: number; message: string }[] = [];

  for (const artist of artistNames) {
    try {
      await sleep(THROTTLE_MS);

      const encodedArtist = encodeURIComponent(artist);
      const url = `${BIT_BASE_URL}/${encodedArtist}/events?app_id=${APP_ID}&date=upcoming`;

      console.log(`[Bandsintown] Fetching events for "${artist}"…`);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'VenueCore-MarketRadar/1.0 (event intelligence)',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '(unreadable)');
        console.error(
          `[Bandsintown] HTTP ${response.status} for "${artist}": ${response.statusText}. ` +
          `Body preview: ${body.slice(0, 200)}`
        );
        // Track this failure for diagnostics
        scanErrors.push({ artist, status: response.status, message: response.statusText });
        continue;
      }

      const json = await response.json();

      // The API returns an array of event objects (or an error object)
      if (!Array.isArray(json)) {
        console.warn(
          `[Bandsintown] Unexpected non-array response for "${artist}" ` +
          `(type=${typeof json}): ${JSON.stringify(json).slice(0, 300)}`
        );
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const events = json as any[];

      if (events.length === 0) {
        console.log(`[Bandsintown] 0 events returned for "${artist}"`);
        continue;
      }

      // Log first event shape for debugging field mapping
      console.log(
        `[Bandsintown] ${events.length} events returned for "${artist}". ` +
        `First event keys: ${Object.keys(events[0]).join(', ')}. ` +
        `Region sample: "${events[0]?.venue?.region}"`
      );

      // Filter to Southeast US states — normalise region to 2-letter code
      const seEvents: RawBandsintownEvent[] = [];
      for (const evt of events) {
        const stateCode = normalizeRegionToStateCode(evt.venue?.region);
        if (stateCode && SE_US_STATES.has(stateCode)) {
          // Coerce the raw event into our typed shape, patching known field differences
          seEvents.push(normalizeBandsintownRaw(evt));
        }
      }

      console.log(
        `[Bandsintown] ${seEvents.length}/${events.length} events in SE US for "${artist}"`
      );

      allEvents.push(...seEvents);
    } catch (err) {
      console.error(
        `[Bandsintown] Error fetching events for "${artist}":`,
        err instanceof Error ? `${err.message}\n${err.stack}` : err
      );
      // Continue with remaining artists — never throw
    }
  }

  if (scanErrors.length > 0) {
    console.warn(
      `[Bandsintown] ${scanErrors.length} artists failed:`,
      scanErrors.map((e) => `${e.artist} (${e.status})`).join(', ')
    );
  }

  console.log(
    `[Bandsintown] Returning ${allEvents.length} total SE US events (${scanErrors.length} errors)`
  );

  return allEvents;
}

// ============================================================
// Raw Response Normalisation
// ============================================================

/**
 * Patch the raw Bandsintown API response object into the shape
 * expected by {@link RawBandsintownEvent}.
 *
 * Key differences from the real API vs our original type:
 *  - `id` is a number in the API → coerce to string
 *  - `artist_id` doesn't exist as a flat field; artist info is in `artist.name`
 *  - `tracker_count` may be on `artist` sub-object, not event root
 *  - `venue.region` may be a full state name → normalise to 2-letter code
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeBandsintownRaw(raw: any): RawBandsintownEvent {
  return {
    id: String(raw.id ?? ''),
    artist_id: raw.artist?.name ?? raw.artist_id ?? '',
    url: raw.url ?? '',
    datetime: raw.datetime ?? raw.starts_at ?? '',
    title: raw.title ?? '',
    description: raw.description ?? '',
    venue: {
      name: raw.venue?.name ?? 'Unknown Venue',
      city: raw.venue?.city ?? 'Unknown',
      region: normalizeRegionToStateCode(raw.venue?.region) ?? raw.venue?.region ?? 'Unknown',
      country: raw.venue?.country ?? '',
      latitude: String(raw.venue?.latitude ?? ''),
      longitude: String(raw.venue?.longitude ?? ''),
    },
    lineup: Array.isArray(raw.lineup) ? raw.lineup : [],
    offers: Array.isArray(raw.offers) ? raw.offers : [],
    tracker_count: raw.tracker_count ?? raw.artist?.tracker_count ?? undefined,
  };
}
