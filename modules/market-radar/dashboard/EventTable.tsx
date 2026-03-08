'use client';

import { useState } from 'react';
import type { MarketRadarEvent } from '@/modules/market-radar/types';

interface EventTableProps {
  events: MarketRadarEvent[];
  loading: boolean;
}

type SortKey = keyof MarketRadarEvent;
type SortDir = 'asc' | 'desc';

function sourceBadge(source: string) {
  const map: Record<string, { bg: string; label: string }> = {
    ticketmaster: { bg: 'bg-blue-500/20 text-blue-400', label: 'TM' },
    bandsintown: { bg: 'bg-emerald-500/20 text-emerald-400', label: 'BIT' },
    venue_scrape: { bg: 'bg-orange-500/20 text-orange-400', label: 'Scrape' },
  };
  const info = map[source] || { bg: 'bg-gray-500/20 text-gray-400', label: source };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${info.bg}`}>
      {info.label}
    </span>
  );
}

function competitionBadge(score: number | null) {
  if (score === null || score === undefined) {
    return <span className="text-gray-500">—</span>;
  }
  let color = 'text-emerald-400';
  if (score >= 60) color = 'text-red-400';
  else if (score >= 30) color = 'text-amber-400';
  return <span className={`font-semibold ${color}`}>{score}</span>;
}

function sellThroughBar(sold: number | null, capacity: number | null) {
  if (sold === null || capacity === null || capacity <= 0) {
    return <span className="text-gray-500 text-xs">—</span>;
  }
  const pct = Math.min(100, Math.round((sold / capacity) * 100));
  let barColor = 'bg-emerald-500';
  if (pct >= 85) barColor = 'bg-red-500';
  else if (pct >= 60) barColor = 'bg-amber-500';

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 bg-gray-700 rounded-full h-1.5 min-w-[40px]">
        <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-300 whitespace-nowrap">{sold}/{capacity}</span>
    </div>
  );
}

export default function EventTable({ events, loading }: EventTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('event_date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = [...events].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return 0;
  });

  const columns: { key: SortKey; label: string; className?: string }[] = [
    { key: 'artist_name', label: 'Artist' },
    { key: 'event_name', label: 'Event' },
    { key: 'venue_name', label: 'Venue / City' },
    { key: 'venue_capacity', label: 'Capacity' },
    { key: 'event_date', label: 'Date' },
    { key: 'ticket_price_low', label: 'Price Range' },
    { key: 'estimated_tickets_sold', label: 'Est. Sold' },
    { key: 'sale_velocity', label: 'Velocity' },
    { key: 'distance_from_shoals', label: 'Distance' },
    { key: 'source', label: 'Source' },
    { key: 'competition_score', label: 'Competition' },
  ];

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-800 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-lg">No events found</p>
        <p className="text-sm mt-1">Try adjusting your filters or run a scan to import events.</p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile card layout */}
      <div className="md:hidden space-y-3">
        {/* Mobile sort control */}
        <div className="flex items-center gap-2 mb-2">
          <label className="text-xs text-gray-400">Sort:</label>
          <select
            value={sortKey}
            onChange={(e) => handleSort(e.target.value as SortKey)}
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white flex-1"
          >
            {columns.map((col) => (
              <option key={col.key} value={col.key}>{col.label}</option>
            ))}
          </select>
          <button
            onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white"
          >
            {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
          </button>
        </div>

        {sorted.map((event) => (
          <div key={event.id} className="bg-gray-800 rounded-lg border border-gray-700 p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="text-white font-semibold text-sm truncate">{event.artist_name}</p>
                {event.event_name && (
                  <p className="text-gray-400 text-xs truncate">{event.event_name}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {sourceBadge(event.source)}
                {event.ticket_url && (
                  <a
                    href={event.ticket_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-sm"
                    title="View tickets"
                  >
                    ↗
                  </a>
                )}
              </div>
            </div>

            <div className="text-xs text-gray-400 mb-2">
              {event.venue_name} · {event.venue_city}, {event.venue_state}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Date</span>
                <span className="text-gray-300">
                  {new Date(event.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Capacity</span>
                <span className="text-gray-300">
                  {event.venue_capacity != null ? event.venue_capacity.toLocaleString('en-US') : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Price</span>
                <span className="text-gray-300">
                  {event.ticket_price_low !== null || event.ticket_price_high !== null
                    ? `$${event.ticket_price_low ?? '?'} – $${event.ticket_price_high ?? '?'}`
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Distance</span>
                <span className="text-gray-300">
                  {event.distance_from_shoals !== null ? `${Math.round(event.distance_from_shoals)} mi` : '—'}
                </span>
              </div>
              <div className="flex justify-between col-span-2">
                <span className="text-gray-500">Est. Sold</span>
                <span className="text-gray-300">
                  {sellThroughBar(event.estimated_tickets_sold, event.venue_capacity)}
                </span>
              </div>
              {event.sale_velocity != null && event.sale_velocity > 0 && (
                <div className="flex justify-between col-span-2">
                  <span className="text-gray-500">Velocity</span>
                  <span className="text-gray-300">{event.sale_velocity}/day</span>
                </div>
              )}
              <div className="flex justify-between col-span-2">
                <span className="text-gray-500">Competition</span>
                {competitionBadge(event.competition_score)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table layout */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="text-left px-3 py-3 text-gray-400 font-medium cursor-pointer hover:text-white select-none whitespace-nowrap"
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
              <th className="px-3 py-3 text-gray-400 font-medium">Link</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((event) => (
              <tr key={event.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                <td className="px-3 py-3 font-medium text-white whitespace-nowrap">
                  {event.artist_name}
                </td>
                <td className="px-3 py-3 text-gray-300 max-w-[200px] truncate">
                  {event.event_name || '—'}
                </td>
                <td className="px-3 py-3 text-gray-300 whitespace-nowrap">
                  <div>{event.venue_name}</div>
                  <div className="text-xs text-gray-500">{event.venue_city}, {event.venue_state}</div>
                </td>
                <td className="px-3 py-3 text-gray-300 whitespace-nowrap">
                  {event.venue_capacity != null
                    ? event.venue_capacity.toLocaleString('en-US')
                    : '—'}
                </td>
                <td className="px-3 py-3 text-gray-300 whitespace-nowrap">
                  {new Date(event.event_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </td>
                <td className="px-3 py-3 text-gray-300 whitespace-nowrap">
                  {event.ticket_price_low !== null || event.ticket_price_high !== null
                    ? `$${event.ticket_price_low ?? '?'} – $${event.ticket_price_high ?? '?'}`
                    : '—'}
                </td>
                <td className="px-3 py-3 whitespace-nowrap min-w-[120px]">
                  {sellThroughBar(event.estimated_tickets_sold, event.venue_capacity)}
                </td>
                <td className="px-3 py-3 text-gray-300 whitespace-nowrap">
                  {event.sale_velocity != null && event.sale_velocity > 0
                    ? `${event.sale_velocity}/day`
                    : '—'}
                </td>
                <td className="px-3 py-3 text-gray-300 whitespace-nowrap">
                  {event.distance_from_shoals !== null
                    ? `${Math.round(event.distance_from_shoals)} mi`
                    : '—'}
                </td>
                <td className="px-3 py-3">{sourceBadge(event.source)}</td>
                <td className="px-3 py-3">{competitionBadge(event.competition_score)}</td>
                <td className="px-3 py-3">
                  {event.ticket_url ? (
                    <a
                      href={event.ticket_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300"
                      title="View tickets"
                    >
                      ↗
                    </a>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
