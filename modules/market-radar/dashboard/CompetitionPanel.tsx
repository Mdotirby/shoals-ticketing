'use client';

interface CompetitionEntry {
  id: string;
  event_id: string;
  competing_event_id: string;
  distance_between: number;
  date_overlap: boolean;
  price_similarity: number | null;
  capacity_overlap: number | null;
  competition_score: number;
  event?: {
    id: string;
    artist_name: string;
    event_name: string | null;
    venue_name: string;
    venue_city: string;
    event_date: string;
    ticket_url: string | null;
  } | null;
  competing_event?: {
    id: string;
    artist_name: string;
    event_name: string | null;
    venue_name: string;
    venue_city: string;
    event_date: string;
    ticket_url: string | null;
  } | null;
}

interface CompetitionPanelProps {
  competitions: CompetitionEntry[];
  loading: boolean;
}

function scoreColor(score: number) {
  if (score >= 70) return 'bg-red-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function scoreTextColor(score: number) {
  if (score >= 70) return 'text-red-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-emerald-400';
}

export default function CompetitionPanel({ competitions, loading }: CompetitionPanelProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (competitions.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-lg">No competition data yet</p>
        <p className="text-sm mt-1">Competition pairs are generated when overlapping events are detected in the region.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 text-xs text-gray-500 font-medium uppercase">
        <div className="col-span-3">Event 1</div>
        <div className="col-span-1 text-center">vs</div>
        <div className="col-span-3">Event 2</div>
        <div className="col-span-1 text-center">Date</div>
        <div className="col-span-1 text-center">Distance</div>
        <div className="col-span-1 text-center">Price Sim.</div>
        <div className="col-span-2 text-center">Competition</div>
      </div>

      {competitions.map((comp) => (
        <div
          key={comp.id}
          className="bg-gray-800 rounded-lg border border-gray-700 px-3 sm:px-4 py-3"
        >
          {/* Mobile layout */}
          <div className="md:hidden">
            {/* Competition score bar at top on mobile */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${scoreColor(comp.competition_score)}`}
                  style={{ width: `${Math.min(comp.competition_score, 100)}%` }}
                />
              </div>
              <span className={`text-sm font-semibold ${scoreTextColor(comp.competition_score)}`}>
                {comp.competition_score}
              </span>
            </div>

            {/* Event 1 */}
            <div className="mb-2">
              <p className="text-white font-medium text-sm">{comp.event?.artist_name || 'Unknown'}</p>
              <p className="text-xs text-gray-400">{comp.event?.venue_name || '—'} · {comp.event?.venue_city || ''}</p>
            </div>

            <div className="text-center my-1">
              <span className="text-gray-500 text-[10px] font-bold tracking-wider">VS</span>
            </div>

            {/* Event 2 */}
            <div className="mb-3">
              <p className="text-white font-medium text-sm">{comp.competing_event?.artist_name || 'Unknown'}</p>
              <p className="text-xs text-gray-400">{comp.competing_event?.venue_name || '—'} · {comp.competing_event?.venue_city || ''}</p>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 text-xs flex-wrap">
              {comp.date_overlap ? (
                <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded">Same Day</span>
              ) : (
                <span className="text-gray-500">Diff. Day</span>
              )}
              <span className="text-gray-400">{Math.round(comp.distance_between)} mi</span>
              <span className="text-gray-400">
                Price: {comp.price_similarity !== null ? `${comp.price_similarity}%` : '—'}
              </span>
              <div className="flex gap-2 ml-auto">
                {comp.event?.ticket_url && (
                  <a href={comp.event.ticket_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">E1 ↗</a>
                )}
                {comp.competing_event?.ticket_url && (
                  <a href={comp.competing_event.ticket_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">E2 ↗</a>
                )}
              </div>
            </div>
          </div>

          {/* Desktop layout */}
          <div className="hidden md:grid grid-cols-12 gap-3 items-center">
            {/* Event 1 */}
            <div className="col-span-3">
              <p className="text-white font-medium text-sm">{comp.event?.artist_name || 'Unknown'}</p>
              <p className="text-xs text-gray-400">{comp.event?.venue_name || '—'} · {comp.event?.venue_city || ''}</p>
              {comp.event?.ticket_url && (
                <a href={comp.event.ticket_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300">View Event 1 ↗</a>
              )}
            </div>

            {/* VS */}
            <div className="col-span-1 text-center">
              <span className="text-gray-500 text-xs font-bold">VS</span>
            </div>

            {/* Event 2 */}
            <div className="col-span-3">
              <p className="text-white font-medium text-sm">{comp.competing_event?.artist_name || 'Unknown'}</p>
              <p className="text-xs text-gray-400">{comp.competing_event?.venue_name || '—'} · {comp.competing_event?.venue_city || ''}</p>
              {comp.competing_event?.ticket_url && (
                <a href={comp.competing_event.ticket_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300">View Event 2 ↗</a>
              )}
            </div>

            {/* Same date */}
            <div className="col-span-1 text-center">
              {comp.date_overlap ? (
                <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">Same Day</span>
              ) : (
                <span className="text-xs text-gray-500">Diff. Day</span>
              )}
            </div>

            {/* Distance */}
            <div className="col-span-1 text-center text-sm text-gray-300">
              {Math.round(comp.distance_between)} mi
            </div>

            {/* Price similarity */}
            <div className="col-span-1 text-center text-sm text-gray-300">
              {comp.price_similarity !== null ? `${comp.price_similarity}%` : '—'}
            </div>

            {/* Competition score */}
            <div className="col-span-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${scoreColor(comp.competition_score)}`}
                    style={{ width: `${Math.min(comp.competition_score, 100)}%` }}
                  />
                </div>
                <span className={`text-sm font-semibold ${scoreTextColor(comp.competition_score)}`}>
                  {comp.competition_score}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
