import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const city = searchParams.get('city');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const capacityMin = searchParams.get('capacityMin');
    const capacityMax = searchParams.get('capacityMax');
    const competitionMin = searchParams.get('competitionMin');
    const source = searchParams.get('source');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);

    // Build filtered query
    let query = supabase
      .from('market_radar_events')
      .select('*', { count: 'exact' });

    if (city) query = query.eq('venue_city', city);
    if (dateFrom) query = query.gte('event_date', dateFrom);
    if (dateTo) query = query.lte('event_date', dateTo);
    if (capacityMin) query = query.gte('venue_capacity', parseInt(capacityMin, 10));
    if (capacityMax) query = query.lte('venue_capacity', parseInt(capacityMax, 10));
    if (competitionMin) query = query.gte('competition_score', parseInt(competitionMin, 10));
    if (source) query = query.eq('source', source);

    query = query
      .order('event_date', { ascending: true })
      .range((page - 1) * pageSize, page * pageSize - 1);

    const { data: events, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      events: events || [],
      total: count || 0,
      page,
      pageSize,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // Check if the table doesn't exist yet
    if (message.includes('relation') && message.includes('does not exist')) {
      return NextResponse.json({
        error: 'Market Radar tables not created yet. Run the migration SQL in Supabase SQL Editor: plans/market-radar-migration.sql',
        events: [],
        total: 0,
        needsMigration: true,
      });
    }
    return NextResponse.json(
      { error: message, events: [], total: 0 },
      { status: 500 }
    );
  }
}
