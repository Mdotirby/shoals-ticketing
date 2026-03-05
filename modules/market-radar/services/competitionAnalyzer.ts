/**
 * Market Radar — Competition Analyzer Service
 *
 * Identifies pairs of events happening on the same date within a geographic
 * radius and calculates a competition score based on proximity, price
 * similarity, and venue capacity overlap.
 */

import type { MarketRadarEvent, MarketRadarCompetition } from '../types';
import { createAdminClient } from '../../../lib/supabase-server';
import { COMPETITION_RADIUS_MILES } from '../constants';
import { calculateDistance } from '../utils';

// ============================================================
// Table names (see eventCollector.ts for schema note)
// ============================================================

const EVENTS_TABLE = 'market_radar_events';
const COMPETITION_TABLE = 'market_radar_competition';

// ============================================================
// Scoring Helpers
// ============================================================

/**
 * Calculate price similarity between two events on a 0–1 scale.
 * Returns `null` if neither event has pricing data.
 *
 * Formula: `1 - |avgA - avgB| / max(avgA, avgB)`
 */
function calculatePriceSimilarity(
  a: MarketRadarEvent,
  b: MarketRadarEvent,
): number | null {
  const avgA = averagePrice(a);
  const avgB = averagePrice(b);
  if (avgA === null || avgB === null) return null;
  if (avgA === 0 && avgB === 0) return 1;

  const maxAvg = Math.max(avgA, avgB);
  return maxAvg > 0 ? 1 - Math.abs(avgA - avgB) / maxAvg : 1;
}

/**
 * Calculate capacity overlap between two venues on a 0–1 scale.
 * Returns `null` if either venue lacks capacity data.
 */
function calculateCapacityOverlap(
  a: MarketRadarEvent,
  b: MarketRadarEvent,
): number | null {
  if (a.venue_capacity == null || b.venue_capacity == null) return null;
  if (a.venue_capacity === 0 && b.venue_capacity === 0) return 1;

  const maxCap = Math.max(a.venue_capacity, b.venue_capacity);
  return maxCap > 0
    ? 1 - Math.abs(a.venue_capacity - b.venue_capacity) / maxCap
    : 1;
}

/**
 * Average of low and high ticket price, or whichever is available.
 */
function averagePrice(event: MarketRadarEvent): number | null {
  const low = event.ticket_price_low;
  const high = event.ticket_price_high;
  if (low != null && high != null) return (low + high) / 2;
  if (low != null) return low;
  if (high != null) return high;
  return null;
}

/**
 * Convert a distance in miles to a proximity score (0–1).
 * 0 miles → 1.0, COMPETITION_RADIUS_MILES → 0.0
 */
function proximityScore(distanceMiles: number): number {
  if (distanceMiles <= 0) return 1;
  if (distanceMiles >= COMPETITION_RADIUS_MILES) return 0;
  return 1 - distanceMiles / COMPETITION_RADIUS_MILES;
}

// ============================================================
// Main Analysis
// ============================================================

export interface CompetitionResult {
  /** Total pairs of events analysed */
  pairsAnalyzed: number;
  /** Number of pairs with competition_score ≥ 60 */
  highCompetition: number;
}

/**
 * Analyse competition between all pairs of upcoming events occurring
 * on the same date within {@link COMPETITION_RADIUS_MILES}.
 *
 * For each qualifying pair:
 * - Calculate proximity, price similarity, and capacity overlap scores
 * - Compute a weighted competition score (0–100)
 * - Upsert a row into `market_radar_competition`
 * - Update `competition_score` on each event record
 *
 * @returns Summary statistics of the analysis run
 */
export async function analyzeCompetition(): Promise<CompetitionResult> {
  const supabase = createAdminClient();

  // ── Fetch upcoming events (next 3 months) ────────────────────
  const now = new Date();
  const threeMonths = new Date(now);
  threeMonths.setMonth(threeMonths.getMonth() + 3);

  const { data: events, error: fetchError } = await supabase
    .from(EVENTS_TABLE)
    .select('*')
    .gte('event_date', now.toISOString().slice(0, 10))
    .lte('event_date', threeMonths.toISOString().slice(0, 10))
    .order('event_date', { ascending: true });

  if (fetchError) {
    console.error(
      `[MarketRadar] Failed to fetch events for competition analysis: ${fetchError.message}`,
    );
    return { pairsAnalyzed: 0, highCompetition: 0 };
  }

  const allEvents = (events ?? []) as MarketRadarEvent[];

  // ── Group events by date ─────────────────────────────────────
  const byDate = new Map<string, MarketRadarEvent[]>();
  for (const event of allEvents) {
    if (!byDate.has(event.event_date)) byDate.set(event.event_date, []);
    byDate.get(event.event_date)!.push(event);
  }

  let pairsAnalyzed = 0;
  let highCompetition = 0;

  // Track the highest competition score per event for later update
  const maxScoreByEvent = new Map<string, number>();

  // ── Compare all pairs on the same date ───────────────────────
  for (const [, dateEvents] of byDate) {
    if (dateEvents.length < 2) continue;

    for (let i = 0; i < dateEvents.length; i++) {
      for (let j = i + 1; j < dateEvents.length; j++) {
        const a = dateEvents[i];
        const b = dateEvents[j];

        // Both events must have coordinates to calculate distance
        if (
          a.latitude == null ||
          a.longitude == null ||
          b.latitude == null ||
          b.longitude == null
        ) {
          continue;
        }

        const distance = calculateDistance(
          a.latitude,
          a.longitude,
          b.latitude,
          b.longitude,
        );

        if (distance > COMPETITION_RADIUS_MILES) continue;

        // ── Calculate component scores ──────────────────────────
        const proxScore = proximityScore(distance);
        const priceSim = calculatePriceSimilarity(a, b);
        const capOverlap = calculateCapacityOverlap(a, b);

        // Use available components; fall back to proximity-only if
        // price and capacity data are missing.
        const priceWeight = priceSim !== null ? 0.3 : 0;
        const capWeight = capOverlap !== null ? 0.3 : 0;
        const proxWeight = 1 - priceWeight - capWeight; // absorbs unused weight

        const competitionScore = Math.round(
          (proxWeight * proxScore +
            priceWeight * (priceSim ?? 0) +
            capWeight * (capOverlap ?? 0)) *
            100,
        );

        pairsAnalyzed++;
        if (competitionScore >= 60) highCompetition++;

        // ── Upsert competition record ───────────────────────────
        const competitionRow = {
          event_id: a.id,
          competing_event_id: b.id,
          distance_between: Math.round(distance * 10) / 10,
          date_overlap: true,
          price_similarity: priceSim !== null ? Math.round(priceSim * 100) : null,
          capacity_overlap:
            capOverlap !== null ? Math.round(capOverlap * 100) : null,
          competition_score: competitionScore,
        };

        const { error: upsertError } = await supabase
          .from(COMPETITION_TABLE)
          .upsert(competitionRow, {
            onConflict: 'event_id,competing_event_id',
            ignoreDuplicates: false,
          });

        if (upsertError) {
          console.error(
            `[MarketRadar] Competition upsert error (${a.id} vs ${b.id}): ${upsertError.message}`,
          );
        }

        // Track max score per event
        const prevA = maxScoreByEvent.get(a.id) ?? 0;
        const prevB = maxScoreByEvent.get(b.id) ?? 0;
        if (competitionScore > prevA) maxScoreByEvent.set(a.id, competitionScore);
        if (competitionScore > prevB) maxScoreByEvent.set(b.id, competitionScore);
      }
    }
  }

  // ── Update competition_score on each event ───────────────────
  for (const [eventId, score] of maxScoreByEvent) {
    const { error: updateError } = await supabase
      .from(EVENTS_TABLE)
      .update({ competition_score: score })
      .eq('id', eventId);

    if (updateError) {
      console.error(
        `[MarketRadar] Failed to update competition_score on event ${eventId}: ${updateError.message}`,
      );
    }
  }

  console.log(
    `[MarketRadar] Competition analysis complete — ${pairsAnalyzed} pairs analysed, ${highCompetition} high-competition`,
  );

  return { pairsAnalyzed, highCompetition };
}

// ============================================================
// Single-Event Query
// ============================================================

/**
 * Retrieve all competition records for a specific event.
 *
 * Returns rows where the event appears as either `event_id` or
 * `competing_event_id`.
 *
 * @param eventId - UUID of the event to look up
 * @returns Array of {@link MarketRadarCompetition} records
 */
export async function getCompetitionForEvent(
  eventId: string,
): Promise<MarketRadarCompetition[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from(COMPETITION_TABLE)
    .select('*')
    .or(`event_id.eq.${eventId},competing_event_id.eq.${eventId}`);

  if (error) {
    console.error(
      `[MarketRadar] Failed to fetch competition for event ${eventId}: ${error.message}`,
    );
    return [];
  }

  return (data ?? []) as MarketRadarCompetition[];
}
