import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Fetch routing clusters ordered by confidence
    const { data: clusters, error } = await supabase
      .from('market_radar_routing_clusters')
      .select('*')
      .order('confidence_score', { ascending: false });

    if (error) throw error;

    // For each cluster with a nearest_event_id, fetch the event info
    const enrichedClusters = await Promise.all(
      (clusters || []).map(async (cluster) => {
        let nearestEvent = null;
        if (cluster.nearest_event_id) {
          const { data } = await supabase
            .from('market_radar_events')
            .select('id, artist_name, event_name, venue_name, venue_city, venue_state, event_date, distance_from_shoals')
            .eq('id', cluster.nearest_event_id)
            .single();
          nearestEvent = data;
        }
        return { ...cluster, nearest_event: nearestEvent };
      })
    );

    return NextResponse.json({ clusters: enrichedClusters });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: message, clusters: [] },
      { status: 500 }
    );
  }
}
