'use client';

import { useState, useEffect, useCallback } from 'react';
import EventTable from './EventTable';
import RoutingPanel from './RoutingPanel';
import CompetitionPanel from './CompetitionPanel';
import TrendPanel from './TrendPanel';
import type { MarketRadarEvent, MarketRadarRoutingCluster, MarketRadarCompetition } from '@/modules/market-radar/types';

type Tab = 'events' | 'routing' | 'competition' | 'trends';

interface Filters {
  city: string;
  dateFrom: string;
  dateTo: string;
  capacityMin: string;
  capacityMax: string;
  competitionMin: string;
  source: string;
}

const defaultFilters: Filters = {
  city: '',
  dateFrom: '',
  dateTo: '',
  capacityMin: '',
  capacityMax: '',
  competitionMin: '',
  source: '',
};

export default function MarketRadarPage() {
  const [activeTab, setActiveTab] = useState<Tab>('events');
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [pendingFilters, setPendingFilters] = useState<Filters>(defaultFilters);

  // Data states
  const [events, setEvents] = useState<MarketRadarEvent[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsLoading, setEventsLoading] = useState(true);

  const [clusters, setClusters] = useState<MarketRadarRoutingCluster[]>([]);
  const [clustersLoading, setClustersLoading] = useState(true);

  const [competitions, setCompetitions] = useState<(MarketRadarCompetition & { event?: MarketRadarEvent; competing_event?: MarketRadarEvent })[]>([]);
  const [competitionsLoading, setCompetitionsLoading] = useState(true);

  const [cities, setCities] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  const runScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch('/api/market-radar/scan', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        setScanResult(`Error: ${data.error}`);
      } else {
        const c = data.collection || {};
        setScanResult(`Scan complete: ${c.inserted || 0} new events, ${c.duplicates || 0} duplicates, ${data.routing?.clustersFound || 0} routing clusters`);
        fetchEvents();
        fetchClusters();
        fetchCompetitions();
      }
    } catch {
      setScanResult('Scan failed — check server logs');
    } finally {
      setScanning(false);
    }
  };

  // Fetch events
  const fetchEvents = useCallback(async () => {
    setEventsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.city) params.set('city', filters.city);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      if (filters.capacityMin) params.set('capacityMin', filters.capacityMin);
      if (filters.capacityMax) params.set('capacityMax', filters.capacityMax);
      if (filters.competitionMin) params.set('competitionMin', filters.competitionMin);
      if (filters.source) params.set('source', filters.source);
      params.set('pageSize', '100');

      const res = await fetch(`/api/market-radar/events?${params.toString()}`);
      const data = await res.json();
      if (data.error && !data.events?.length) {
        setError(data.error);
      }
      setEvents(data.events || []);
      setEventsTotal(data.total || 0);
    } catch (err) {
      setError('Failed to fetch events');
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, [filters]);

  // Fetch routing clusters
  const fetchClusters = useCallback(async () => {
    setClustersLoading(true);
    try {
      const res = await fetch('/api/market-radar/routing');
      const data = await res.json();
      setClusters(data.clusters || []);
    } catch {
      setClusters([]);
    } finally {
      setClustersLoading(false);
    }
  }, []);

  // Fetch competition data
  const fetchCompetitions = useCallback(async () => {
    setCompetitionsLoading(true);
    try {
      const res = await fetch('/api/market-radar/competition');
      const data = await res.json();
      setCompetitions(data.competitions || []);
    } catch {
      setCompetitions([]);
    } finally {
      setCompetitionsLoading(false);
    }
  }, []);

  // Fetch unique cities for the dropdown
  useEffect(() => {
    async function loadCities() {
      try {
        const res = await fetch('/api/market-radar/events?pageSize=1000');
        const data = await res.json();
        const uniqueCities = Array.from(
          new Set((data.events || []).map((e: MarketRadarEvent) => e.venue_city).filter(Boolean))
        ) as string[];
        setCities(uniqueCities.sort());
      } catch {
        // ignore
      }
    }
    loadCities();
  }, []);

  // Load data on mount and when filters change
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    fetchClusters();
    fetchCompetitions();
  }, [fetchClusters, fetchCompetitions]);

  // Derive stats
  useEffect(() => {
    if (events.length > 0) {
      const latestUpdated = events.reduce((latest, e) => {
        return e.updated_at > latest ? e.updated_at : latest;
      }, events[0].updated_at);
      setLastScan(latestUpdated);
    }
  }, [events]);

  const handleApplyFilters = () => {
    setFilters({ ...pendingFilters });
  };

  const handleResetFilters = () => {
    setPendingFilters(defaultFilters);
    setFilters(defaultFilters);
  };

  const highCompetition = competitions.filter((c) => c.competition_score >= 70).length;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'events', label: 'Events' },
    { key: 'routing', label: 'Routing' },
    { key: 'competition', label: 'Competition' },
    { key: 'trends', label: 'Trends & Comp Venues' },
  ];

  return (
    <div className="min-h-screen text-white px-4 py-6 md:p-10">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Market Radar</h1>
          <p className="text-gray-400 mt-1 text-sm sm:text-base">Live event intelligence for the Shoals region</p>
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white rounded-lg font-medium transition-colors text-sm"
        >
          {scanning ? '⏳ Scanning...' : '🔄 Run Scan'}
        </button>
      </div>
      {scanResult && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${scanResult.startsWith('Error') || scanResult.startsWith('Scan failed') ? 'bg-red-900/50 text-red-300' : 'bg-green-900/50 text-green-300'}`}>
          {scanResult}
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Events" value={eventsTotal} />
        <StatCard label="Routing Clusters" value={clusters.length} />
        <StatCard label="High Competition" value={highCompetition} />
        <StatCard
          label="Last Scan"
          value={
            lastScan
              ? new Date(lastScan).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—'
          }
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-gray-800 rounded-lg p-3 sm:p-4 mb-6 border border-gray-700">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">City</label>
            <select
              value={pendingFilters.city}
              onChange={(e) => setPendingFilters({ ...pendingFilters, city: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
            >
              <option value="">All Cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Date From</label>
            <input
              type="date"
              value={pendingFilters.dateFrom}
              onChange={(e) => setPendingFilters({ ...pendingFilters, dateFrom: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Date To</label>
            <input
              type="date"
              value={pendingFilters.dateTo}
              onChange={(e) => setPendingFilters({ ...pendingFilters, dateTo: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Capacity Min</label>
            <input
              type="number"
              placeholder="No min"
              value={pendingFilters.capacityMin}
              onChange={(e) => setPendingFilters({ ...pendingFilters, capacityMin: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Capacity Max</label>
            <input
              type="number"
              placeholder="No max"
              value={pendingFilters.capacityMax}
              onChange={(e) => setPendingFilters({ ...pendingFilters, capacityMax: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Competition Min</label>
            <input
              type="number"
              placeholder="0"
              value={pendingFilters.competitionMin}
              onChange={(e) =>
                setPendingFilters({ ...pendingFilters, competitionMin: e.target.value })
              }
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Source</label>
            <select
              value={pendingFilters.source}
              onChange={(e) => setPendingFilters({ ...pendingFilters, source: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"
            >
              <option value="">All Sources</option>
              <option value="ticketmaster">Ticketmaster</option>
              <option value="bandsintown">Bandsintown</option>
              <option value="venue_scrape">Venue Scrape</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          <button
            onClick={handleApplyFilters}
            className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 sm:py-1.5 rounded transition-colors"
          >
            Apply Filters
          </button>
          <button
            onClick={handleResetFilters}
            className="flex-1 sm:flex-none bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm px-4 py-2 sm:py-1.5 rounded transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 border-b border-gray-700 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-t transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === tab.key
                ? 'bg-gray-800 text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'events' && <EventTable events={events} loading={eventsLoading} />}
        {activeTab === 'routing' && <RoutingPanel clusters={clusters} loading={clustersLoading} />}
        {activeTab === 'competition' && (
          <CompetitionPanel competitions={competitions} loading={competitionsLoading} />
        )}
        {activeTab === 'trends' && <TrendPanel />}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-800 rounded-lg p-3 sm:p-4 border border-gray-700">
      <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-lg sm:text-2xl font-bold mt-1 truncate">{value}</p>
    </div>
  );
}
