/**
 * Market Radar — Event Collector Service
 *
 * Orchestrates fetching events from all configured sources (Ticketmaster,
 * Bandsintown, venue scrapers), normalises them into a unified format,
 * applies geographic / capacity filters, deduplicates, and upserts the
 * results into the `market_radar_events` table via Supabase.
 */

import type { NormalizedEvent } from '../types';
import { createAdminClient } from '../../../lib/supabase-server';
import { fetchTicketmasterEvents } from '../api/ticketmaster';
import {
  fetchBandsintownEvents,
  getArtistSeedList,
} from '../api/bandsintownScraper';
import { fetchVenueScrapedEvents } from '../api/venueScraper';
import {
  normalizeTicketmasterEvent,
  normalizeBandsintownEvent,
  normalizeVenueScrapedEvent,
} from './eventNormalizer';
import {
  isWithinRadius,
  isExcludedCity,
  isValidCapacity,
  deduplicateEvents,
} from '../utils';

// ============================================================
// Table name
// ============================================================

/**
 * Supabase table for market radar events.
 *
 * NOTE: The Supabase JS client does not support custom Postgres schemas
 * directly via `.schema()`. If your DB uses a `market_radar` schema you
 * have two options:
 *   1. Create a view / synonym in the `public` schema (recommended).
 *   2. Use `.rpc()` with a raw SQL wrapper function.
 *
 * We default to the public-schema table name `market_radar_events` which
 * should be a view or the actual table exposed on the public schema.
 */
const EVENTS_TABLE = 'market_radar_events';

// ============================================================
// Main Collector
// ============================================================

export interface CollectResult {
  /** Number of rows successfully inserted / updated */
  inserted: number;
  /** Number of duplicates removed before upsert */
  duplicates: number;
  /** Any non-fatal error messages from individual sources */
  errors: string[];
}

/**
 * Fetch events from every configured source, normalise, filter,
 * deduplicate, and upsert into the database.
 *
 * Sources are fetched concurrently via `Promise.allSettled` so that a
 * failure in one source does not block the others.
 *
 * @returns Summary counts of inserted rows, duplicates, and errors
 */
export async function collectAllEvents(): Promise<CollectResult> {
  const errors: string[] = [];
  const allNormalized: NormalizedEvent[] = [];

  // ── Fetch from all sources concurrently ──────────────────────
  const [tmResult, bitResult, vsResult] = await Promise.allSettled([
    fetchTicketmasterEvents(),
    fetchBandsintownEvents(getArtistSeedList()),
    fetchVenueScrapedEvents(),
  ]);

  // ── Ticketmaster ─────────────────────────────────────────────
  if (tmResult.status === 'fulfilled') {
    const normalized = tmResult.value.map(normalizeTicketmasterEvent);
    allNormalized.push(...normalized);
    console.log(`[MarketRadar] Ticketmaster: ${normalized.length} events normalised`);
  } else {
    const msg = `Ticketmaster fetch failed: ${String(tmResult.reason)}`;
    errors.push(msg);
    console.error(`[MarketRadar] ${msg}`);
  }

  // ── Bandsintown ──────────────────────────────────────────────
  if (bitResult.status === 'fulfilled') {
    const normalized = bitResult.value.map(normalizeBandsintownEvent);
    allNormalized.push(...normalized);
    console.log(`[MarketRadar] Bandsintown: ${normalized.length} events normalised`);
  } else {
    const msg = `Bandsintown fetch failed: ${String(bitResult.reason)}`;
    errors.push(msg);
    console.error(`[MarketRadar] ${msg}`);
  }

  // ── Venue Scraper ────────────────────────────────────────────
  if (vsResult.status === 'fulfilled') {
    const normalized = vsResult.value.map(normalizeVenueScrapedEvent);
    allNormalized.push(...normalized);
    console.log(`[MarketRadar] VenueScraper: ${normalized.length} events normalised`);
  } else {
    const msg = `Venue scraper failed: ${String(vsResult.reason)}`;
    errors.push(msg);
    console.error(`[MarketRadar] ${msg}`);
  }

  // ── Filter ───────────────────────────────────────────────────
  const filtered = allNormalized.filter((event) => {
    // Radius check (skip if no coordinates — venue scrape events pass through)
    if (
      event.latitude !== null &&
      event.longitude !== null &&
      !isWithinRadius(event.latitude, event.longitude)
    ) {
      return false;
    }

    // Excluded city check
    if (isExcludedCity(event.venue_city)) {
      return false;
    }

    // Capacity check (only when capacity is known)
    if (event.venue_capacity !== null && !isValidCapacity(event.venue_capacity)) {
      return false;
    }

    return true;
  });

  console.log(
    `[MarketRadar] After filters: ${filtered.length} / ${allNormalized.length} events remain`,
  );

  // ── Deduplicate ──────────────────────────────────────────────
  const unique = deduplicateEvents(filtered);
  const duplicates = filtered.length - unique.length;

  console.log(
    `[MarketRadar] Deduplicated: ${unique.length} unique, ${duplicates} duplicates removed`,
  );

  if (unique.length === 0) {
    console.log('[MarketRadar] No events to upsert — done.');
    return { inserted: 0, duplicates, errors };
  }

  // ── Upsert into Supabase ─────────────────────────────────────
  const supabase = createAdminClient();

  const { data, error: upsertError } = await supabase
    .from(EVENTS_TABLE)
    .upsert(unique, {
      onConflict: 'artist_name,venue_name,event_date',
      ignoreDuplicates: false, // update existing rows on conflict
    })
    .select('id');

  if (upsertError) {
    const msg = `Supabase upsert error: ${upsertError.message}`;
    errors.push(msg);
    console.error(`[MarketRadar] ${msg}`);
    return { inserted: 0, duplicates, errors };
  }

  const inserted = data?.length ?? 0;

  console.log(
    `[MarketRadar] Upsert complete — ${inserted} rows inserted/updated, ${duplicates} pre-upsert duplicates, ${errors.length} errors`,
  );

  return { inserted, duplicates, errors };
}
