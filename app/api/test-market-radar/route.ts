import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Get total count
    const { count: totalEvents } = await supabase
      .from('market_radar_events')
      .select('*', { count: 'exact', head: true });

    // Get source breakdown
    const { data: sourceData } = await supabase
      .from('market_radar_events')
      .select('source');

    const sources: Record<string, number> = {};
    if (sourceData) {
      for (const row of sourceData) {
        sources[row.source] = (sources[row.source] || 0) + 1;
      }
    }

    // Get date range
    const { data: earliest } = await supabase
      .from('market_radar_events')
      .select('event_date')
      .order('event_date', { ascending: true })
      .limit(1)
      .single();

    const { data: latest } = await supabase
      .from('market_radar_events')
      .select('event_date')
      .order('event_date', { ascending: false })
      .limit(1)
      .single();

    // Get first 10 events
    const { data: events, error } = await supabase
      .from('market_radar_events')
      .select('*')
      .order('event_date', { ascending: true })
      .limit(10);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      metadata: {
        totalEvents: totalEvents || 0,
        sources,
        dateRange: {
          earliest: earliest?.event_date || null,
          latest: latest?.event_date || null,
        },
      },
      events: events || [],
    });
  } catch (error) {
    console.error('[Test Market Radar] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
