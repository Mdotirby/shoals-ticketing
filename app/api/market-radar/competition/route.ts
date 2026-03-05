import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Fetch top 50 competition pairs by score
    const { data: competitions, error } = await supabase
      .from('market_radar_competition')
      .select('*')
      .order('competition_score', { ascending: false })
      .limit(50);

    if (error) throw error;

    // Enrich with event details for both sides
    const eventIds = new Set<string>();
    (competitions || []).forEach((c) => {
      if (c.event_id) eventIds.add(c.event_id);
      if (c.competing_event_id) eventIds.add(c.competing_event_id);
    });

    let eventsMap: Record<string, any> = {};
    if (eventIds.size > 0) {
      const { data: events } = await supabase
        .from('market_radar_events')
        .select('id, artist_name, event_name, venue_name, venue_city, event_date, ticket_url')
        .in('id', Array.from(eventIds));

      if (events) {
        eventsMap = Object.fromEntries(events.map((e) => [e.id, e]));
      }
    }

    const enriched = (competitions || []).map((c) => ({
      ...c,
      event: eventsMap[c.event_id] || null,
      competing_event: eventsMap[c.competing_event_id] || null,
    }));

    return NextResponse.json({ competitions: enriched });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: message, competitions: [] },
      { status: 500 }
    );
  }
}
