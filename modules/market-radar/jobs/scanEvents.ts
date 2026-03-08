import { collectAllEvents } from '../services/eventCollector';
import { detectRoutingClusters } from '../services/routingDetector';
import { analyzeCompetition } from '../services/competitionAnalyzer';
import { sendMarketRadarAlerts } from '../notifications/emailAlerts';
import { runMetricsJob } from './updateEventMetrics';

export async function runScanJob(): Promise<{
  collection: { inserted: number; duplicates: number; errors: string[] };
  routing: { clustersFound: number };
  competition: { pairsAnalyzed: number; highCompetition: number };
  metrics: { eventsUpdated: number };
  notifications: { sent: boolean };
}> {
  const startTime = Date.now();
  console.log('[Market Radar] Starting scan job...');

  try {
    // Step 1: Collect and insert events from all sources
    console.log('[Market Radar] Collecting events...');
    const collection = await collectAllEvents();
    console.log(`[Market Radar] Collection complete: ${collection.inserted} inserted, ${collection.duplicates} duplicates, ${collection.errors.length} errors`);

    // Step 2: Detect routing clusters (artists potentially touring through the area)
    console.log('[Market Radar] Detecting routing clusters...');
    const clusters = await detectRoutingClusters();
    const routing = { clustersFound: clusters.length };
    console.log(`[Market Radar] Routing detection complete: ${routing.clustersFound} clusters found`);

    // Step 3: Analyze competition between overlapping events
    console.log('[Market Radar] Analyzing competition...');
    const competition = await analyzeCompetition();
    console.log(`[Market Radar] Competition analysis complete: ${competition.pairsAnalyzed} pairs analyzed, ${competition.highCompetition} high-competition`);

    // Step 4: Update sales metrics estimates (capacity, velocity, etc.)
    console.log('[Market Radar] Updating sales metrics...');
    const metrics = await runMetricsJob();
    console.log(`[Market Radar] Metrics update complete: ${metrics.eventsUpdated} events updated`);

    // Step 5: Send email alerts for notable findings
    console.log('[Market Radar] Sending alerts...');
    const notifications = await sendMarketRadarAlerts({
      collection,
      routing,
      competition,
    });
    console.log(`[Market Radar] Alerts sent: ${notifications.sent}`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Market Radar] Scan job completed in ${elapsed}s`);

    return { collection, routing, competition, metrics, notifications };
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[Market Radar] Scan job failed after ${elapsed}s:`, error);
    throw error;
  }
}
