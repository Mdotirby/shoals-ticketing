import { createAdminClient } from '@/lib/supabase-server';

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

    for (const event of events) {
      const venueCapacity = event.venue_capacity;
      if (!venueCapacity || venueCapacity <= 0) continue;

      if (event.source === 'ticketmaster' && event.source_event_id) {
        // Estimate sales based on lifecycle position
        const announceDate = event.announce_date
          ? new Date(event.announce_date)
          : new Date(event.discovered_at || event.created_at);
        const eventDate = new Date(event.event_date);
        const currentDate = new Date();

        const totalDays = Math.max(
          1,
          (eventDate.getTime() - announceDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const daysSinceAnnounce = Math.max(
          0,
          (currentDate.getTime() - announceDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Simple decay model: 30% base + 50% scaled by lifecycle position
        const lifecyclePosition = Math.min(1, daysSinceAnnounce / totalDays);
        const estimatedTicketsSold = Math.round(
          venueCapacity * (0.3 + 0.5 * lifecyclePosition)
        );
        const estimatedTicketsRemaining = Math.max(0, venueCapacity - estimatedTicketsSold);
        const saleVelocity =
          daysSinceAnnounce > 0
            ? Math.round((estimatedTicketsSold / daysSinceAnnounce) * 100) / 100
            : 0;

        updates.push({
          id: event.id,
          estimated_tickets_sold: estimatedTicketsSold,
          estimated_tickets_remaining: estimatedTicketsRemaining,
          sale_velocity: saleVelocity,
        });
      } else if (event.source === 'bandsintown' && event.tracker_count) {
        // Use tracker_count as a rough proxy for interest
        const estimatedTicketsSold = Math.min(
          venueCapacity,
          Math.round(event.tracker_count * 0.15)
        );
        const estimatedTicketsRemaining = Math.max(0, venueCapacity - estimatedTicketsSold);

        updates.push({
          id: event.id,
          estimated_tickets_sold: estimatedTicketsSold,
          estimated_tickets_remaining: estimatedTicketsRemaining,
          sale_velocity: 0,
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
