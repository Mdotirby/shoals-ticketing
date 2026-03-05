/**
 * Market Radar — Routing Detector Service
 *
 * Detects touring / routing patterns by identifying artists with multiple
 * shows within a short time window in the region. When an artist has ≥ N
 * shows within M days the events are grouped into a "routing cluster"
 * which signals a tour route passing through the area.
 */

import type { MarketRadarEvent, MarketRadarRoutingCluster } from '../types';
import { createAdminClient } from '../../../lib/supabase-server';
import {
  ROUTING_MIN_SHOWS,
  ROUTING_MAX_DAYS,
  FLORENCE_LAT,
  FLORENCE_LNG,
} from '../constants';
import { calculateDistance } from '../utils';

// ============================================================
// Table names (see eventCollector.ts for schema note)
// ============================================================

const EVENTS_TABLE = 'market_radar_events';
const CLUSTERS_TABLE = 'market_radar_routing_clusters';

// ============================================================
// Helpers
// ============================================================

/** Number of milliseconds in one day */
const MS_PER_DAY = 86_400_000;

/**
 * Return the number of calendar days between two ISO date strings.
 */
function daysBetween(a: string, b: string): number {
  return Math.abs(
    (new Date(a).getTime() - new Date(b).getTime()) / MS_PER_DAY,
  );
}

// ============================================================
// Confidence Scoring
// ============================================================

/**
 * Calculate a routing confidence score for a set of clustered events.
 *
 * The score is based on three weighted factors:
 * - **Event density**: more events in the window → higher score
 * - **Date tightness**: smaller average gap between shows → higher
 * - **Proximity to Florence**: closer nearest event → higher
 *
 * @param events - Array of events belonging to the cluster (sorted by date)
 * @returns Confidence score clamped to 0–100
 */
export function calculateRoutingConfidence(
  events: MarketRadarEvent[],
): number {
  if (events.length < 2) return 0;

  const sorted = [...events].sort(
    (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime(),
  );

  // Average gap in days between consecutive events
  let totalGapDays = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalGapDays += daysBetween(sorted[i].event_date, sorted[i - 1].event_date);
  }
  const avgGapDays = totalGapDays / (sorted.length - 1);

  // Average distance between consecutive stops
  let totalDistance = 0;
  let distancePairs = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (
      prev.latitude != null &&
      prev.longitude != null &&
      curr.latitude != null &&
      curr.longitude != null
    ) {
      totalDistance += calculateDistance(
        prev.latitude,
        prev.longitude,
        curr.latitude,
        curr.longitude,
      );
      distancePairs++;
    }
  }
  const avgDistanceBetweenStops =
    distancePairs > 0 ? totalDistance / distancePairs : 200; // default fallback

  // Nearest event to Florence
  const nearestDistance = Math.min(
    ...sorted
      .filter((e) => e.distance_from_shoals != null)
      .map((e) => e.distance_from_shoals!),
    999, // sentinel if none have distance
  );

  // Composite score
  const densityFactor = Math.min(sorted.length / ROUTING_MAX_DAYS, 1); // 0–1
  const tightnessFactor = avgGapDays > 0 ? Math.min(3 / avgGapDays, 1) : 1; // 0–1
  const proximityFactor = nearestDistance < 150 ? 1 - nearestDistance / 150 : 0; // 0–1

  const raw = (densityFactor * 0.35 + tightnessFactor * 0.35 + proximityFactor * 0.3) * 100;
  return Math.min(Math.round(raw), 100);
}

// ============================================================
// Cluster Detection
// ============================================================

/**
 * Find consecutive sequences of events within {@link ROUTING_MAX_DAYS}
 * for a single artist's sorted event list.
 *
 * Uses a sliding-window approach: expand the window as long as the span
 * from window start to current event is ≤ ROUTING_MAX_DAYS, then emit
 * a cluster when the window reaches the minimum size.
 */
function findClusters(events: MarketRadarEvent[]): MarketRadarEvent[][] {
  if (events.length < ROUTING_MIN_SHOWS) return [];

  const sorted = [...events].sort(
    (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime(),
  );

  const clusters: MarketRadarEvent[][] = [];
  let windowStart = 0;

  for (let i = 0; i < sorted.length; i++) {
    // Shrink window from the left while span exceeds max days
    while (
      windowStart < i &&
      daysBetween(sorted[i].event_date, sorted[windowStart].event_date) >
        ROUTING_MAX_DAYS
    ) {
      windowStart++;
    }

    const windowSize = i - windowStart + 1;
    if (windowSize >= ROUTING_MIN_SHOWS) {
      // Check we haven't already captured an overlapping cluster ending here
      const cluster = sorted.slice(windowStart, i + 1);
      const clusterKey = cluster.map((e) => e.id).join(',');
      const isDuplicate = clusters.some(
        (c) => c.map((e) => e.id).join(',') === clusterKey,
      );
      if (!isDuplicate) {
        clusters.push(cluster);
      }
    }
  }

  return clusters;
}

// ============================================================
// Main Detection
// ============================================================

/**
 * Detect routing clusters across all artists with upcoming events
 * in the next 3 months.
 *
 * For each qualifying cluster the function:
 * 1. Calculates a confidence score
 * 2. Identifies the nearest event to Florence, AL
 * 3. Upserts the cluster into `market_radar_routing_clusters`
 * 4. Updates associated events with the `routing_cluster_id`
 *
 * @returns Array of detected {@link MarketRadarRoutingCluster} records
 */
export async function detectRoutingClusters(): Promise<
  MarketRadarRoutingCluster[]
> {
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
      `[MarketRadar] Failed to fetch events for routing detection: ${fetchError.message}`,
    );
    return [];
  }

  const allEvents = (events ?? []) as MarketRadarEvent[];

  // ── Group by artist ──────────────────────────────────────────
  const byArtist = new Map<string, MarketRadarEvent[]>();
  for (const event of allEvents) {
    const key = event.artist_name.toLowerCase().trim();
    if (!byArtist.has(key)) byArtist.set(key, []);
    byArtist.get(key)!.push(event);
  }

  const detectedClusters: MarketRadarRoutingCluster[] = [];

  // ── Detect clusters per artist ───────────────────────────────
  for (const [, artistEvents] of byArtist) {
    if (artistEvents.length < ROUTING_MIN_SHOWS) continue;

    const clusters = findClusters(artistEvents);

    for (const clusterEvents of clusters) {
      const sorted = clusterEvents.sort(
        (a, b) =>
          new Date(a.event_date).getTime() - new Date(b.event_date).getTime(),
      );

      const confidence = calculateRoutingConfidence(sorted);

      // Average distance between consecutive stops
      let totalDist = 0;
      let distPairs = 0;
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (
          prev.latitude != null &&
          prev.longitude != null &&
          curr.latitude != null &&
          curr.longitude != null
        ) {
          totalDist += calculateDistance(
            prev.latitude,
            prev.longitude,
            curr.latitude,
            curr.longitude,
          );
          distPairs++;
        }
      }
      const avgDistance = distPairs > 0 ? Math.round(totalDist / distPairs) : null;

      // Nearest event to Florence
      const eventsWithDist = sorted.filter(
        (e) => e.distance_from_shoals != null,
      );
      const nearest =
        eventsWithDist.length > 0
          ? eventsWithDist.reduce((a, b) =>
              a.distance_from_shoals! < b.distance_from_shoals! ? a : b,
            )
          : null;

      const cities = [
        ...new Set(sorted.map((e) => `${e.venue_city}, ${e.venue_state}`)),
      ];

      const clusterRow = {
        artist_name: sorted[0].artist_name,
        cluster_start_date: sorted[0].event_date,
        cluster_end_date: sorted[sorted.length - 1].event_date,
        event_count: sorted.length,
        confidence_score: confidence,
        avg_distance_between_stops: avgDistance,
        cities,
        nearest_event_id: nearest?.id ?? null,
        nearest_distance: nearest?.distance_from_shoals ?? null,
      };

      // ── Upsert cluster ────────────────────────────────────────
      const { data: upserted, error: clusterError } = await supabase
        .from(CLUSTERS_TABLE)
        .upsert(clusterRow, {
          onConflict: 'artist_name,cluster_start_date',
          ignoreDuplicates: false,
        })
        .select('*')
        .single();

      if (clusterError) {
        console.error(
          `[MarketRadar] Cluster upsert error for ${clusterRow.artist_name}: ${clusterError.message}`,
        );
        continue;
      }

      const cluster = upserted as MarketRadarRoutingCluster;
      detectedClusters.push(cluster);

      // ── Update events with cluster FK ─────────────────────────
      const eventIds = sorted.map((e) => e.id);
      const { error: updateError } = await supabase
        .from(EVENTS_TABLE)
        .update({ routing_cluster_id: cluster.id })
        .in('id', eventIds);

      if (updateError) {
        console.error(
          `[MarketRadar] Failed to link events to cluster ${cluster.id}: ${updateError.message}`,
        );
      }
    }
  }

  console.log(
    `[MarketRadar] Routing detection complete — ${detectedClusters.length} clusters found`,
  );

  return detectedClusters;
}
