import { createAdminClient } from '@/lib/supabase-server';

/**
 * Estimate ticket sales using a multi-signal model:
 *
 * 1. **Lifecycle position** — how far through the on-sale window we are
 *    (early = fewer sold, closer to show = more sold). Uses an S-curve
 *    rather than linear to model real-world front-loading of sales.
 *
 * 2. **Tracker / demand signal** — TM attraction upcoming event count or
 *    Bandsintown tracker_count as a demand proxy.
 *
 * 3. **Price signal** — higher average prices correlate with slower
 *    sell-through rates for smaller venues (300–800 cap).
 *
 * The model blends these signals into a single estimated sold number
 * bounded by [0, venueCapacity].
 */
function estimateTicketsSold(
  venueCapacity: number,
  announceDate: Date,
  eventDate: Date,
  currentDate: Date,
  trackerCount: number | null,
  priceLow: number | null,
  priceHigh: number | null,
): { sold: number; remaining: number; velocity: number; sellThroughPct: number } {
  const totalDays = Math.max(
    1,
    (eventDate.getTime() - announceDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  const daysSinceAnnounce = Math.max(
    0,
    (currentDate.getTime() - announceDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  const daysUntilEvent = Math.max(
    0,
    (eventDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  // S-curve lifecycle (front-loaded sales + last-minute bump)
  const t = Math.min(1, daysSinceAnnounce / totalDays);
  const sCurve = 1 / (1 + Math.exp(-10 * (t - 0.4))); // sigmoid centered at 40%
  const lifecyclePct = 0.15 + 0.70 * sCurve; // range: 15% to 85%

  // Demand signal from trackers (normalize: 50+ events = high demand artist)
  let demandMultiplier = 1.0;
  if (trackerCount !== null && trackerCount > 0) {
    if (trackerCount >= 50) demandMultiplier = 1.15;
    else if (trackerCount >= 20) demandMultiplier = 1.05;
    else if (trackerCount <= 5) demandMultiplier = 0.85;
  }

  // Price signal: higher prices = slightly slower sell-through
  let priceMultiplier = 1.0;
  const avgPrice = priceLow && priceHigh ? (priceLow + priceHigh) / 2 : priceLow ?? priceHigh;
  if (avgPrice !== null) {
    if (avgPrice > 80) priceMultiplier = 0.90;
    else if (avgPrice > 50) priceMultiplier = 0.95;
    else if (avgPrice < 25) priceMultiplier = 1.10;
  }

  // Last-minute urgency boost (within 7 days)
  const urgencyBoost = daysUntilEvent <= 7 ? 1.05 : 1.0;

  const sellThroughPct = Math.min(
    0.95,
    lifecyclePct * demandMultiplier * priceMultiplier * urgencyBoost,
  );

  const sold = Math.round(venueCapacity * sellThroughPct);
  const remaining = Math.max(0, venueCapacity - sold);
  const velocity =
    daysSinceAnnounce > 0
      ? Math.round((sold / daysSinceAnnounce) * 100) / 100
      : 0;

  return { sold, remaining, velocity, sellThroughPct };
}

export async function runMetricsJob(): Promise<{ eventsUpdated: number }> {
  const startTime = Date.now();
  console.log('[Market Radar] Starting metrics update job...');

  try {
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    // Query all future events
    const { data: events, error } = await supabase
      .from('market_radar_events')
      .select('*')
      .gte('event_date', now);

    if (error) {
      console.error('[Market Radar] Failed to fetch events for metrics:', error);
      throw error;
    }

    if (!events || events.length === 0) {
      console.log('[Market Radar] No future events found for metrics update');
      return { eventsUpdated: 0 };
    }

    console.log(`[Market Radar] Updating metrics for ${events.length} future events`);

    const updates: Array<{
      id: string;
      estimated_tickets_sold: number;
      estimated_tickets_remaining: number;
      sale_velocity: number;
    }> = [];

    const currentDate = new Date();

    for (const event of events) {
      const venueCapacity = event.venue_capacity;
      if (!venueCapacity || venueCapacity <= 0) continue;

      const announceDate = event.announce_date
        ? new Date(event.announce_date)
        : new Date(event.discovered_at || event.created_at);
      const eventDate = new Date(event.event_date);

      if (event.source === 'ticketmaster' && event.source_event_id) {
        const { sold, remaining, velocity } = estimateTicketsSold(
          venueCapacity,
          announceDate,
          eventDate,
          currentDate,
          event.tracker_count,
          event.ticket_price_low,
          event.ticket_price_high,
        );

        updates.push({
          id: event.id,
          estimated_tickets_sold: sold,
          estimated_tickets_remaining: remaining,
          sale_velocity: velocity,
        });
      } else if (event.source === 'bandsintown') {
        // Use tracker_count + lifecycle for Bandsintown
        const trackerBasedSold = event.tracker_count
          ? Math.round(event.tracker_count * 0.15)
          : 0;

        const { sold: lifecycleSold } = estimateTicketsSold(
          venueCapacity,
          announceDate,
          eventDate,
          currentDate,
          event.tracker_count,
          event.ticket_price_low,
          event.ticket_price_high,
        );

        // Blend tracker-based and lifecycle estimates
        const blended = Math.round(
          Math.min(venueCapacity, (trackerBasedSold + lifecycleSold) / 2),
        );
        const remaining = Math.max(0, venueCapacity - blended);

        const daysSinceAnnounce = Math.max(
          1,
          (currentDate.getTime() - announceDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        updates.push({
          id: event.id,
          estimated_tickets_sold: blended,
          estimated_tickets_remaining: remaining,
          sale_velocity: Math.round((blended / daysSinceAnnounce) * 100) / 100,
        });
      } else {
        // Venue scrape — basic lifecycle only
        const { sold, remaining, velocity } = estimateTicketsSold(
          venueCapacity,
          announceDate,
          eventDate,
          currentDate,
          null,
          event.ticket_price_low,
          event.ticket_price_high,
        );

        updates.push({
          id: event.id,
          estimated_tickets_sold: sold,
          estimated_tickets_remaining: remaining,
          sale_velocity: velocity,
        });
      }
    }

    // Batch update events in Supabase
    if (updates.length > 0) {
      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('market_radar_events')
          .update({
            estimated_tickets_sold: update.estimated_tickets_sold,
            estimated_tickets_remaining: update.estimated_tickets_remaining,
            sale_velocity: update.sale_velocity,
            metrics_updated_at: new Date().toISOString(),
          })
          .eq('id', update.id);

        if (updateError) {
          console.error(`[Market Radar] Failed to update metrics for event ${update.id}:`, updateError);
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Market Radar] Metrics update completed in ${elapsed}s: ${updates.length} events updated`);

    return { eventsUpdated: updates.length };
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[Market Radar] Metrics job failed after ${elapsed}s:`, error);
    throw error;
  }
}
