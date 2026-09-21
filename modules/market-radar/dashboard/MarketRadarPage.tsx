'use client';

/**
 * Market radar — a tab of Marketing, restyled onto the shared primitives.
 *
 * Restyle only: every fetch, the pending/applied filter split, the scan and
 * the four views are unchanged. The shell (stats, filters, view switcher) is
 * built from ui.tsx; the four view components keep their Tailwind markup and
 * are brought onto the glass values by the scoped .mr rules in globals.css,
 * which remap the handful of grey/blue/emerald utilities they use.
 */

import { useState, useEffect, useCallback } from 'react';
import EventTable from './EventTable';
import RoutingPanel from './RoutingPanel';
import CompetitionPanel from './CompetitionPanel';
import TrendPanel from './TrendPanel';
import {
  Button,
  Card,
  Field,
  Kpi,
  KpiRow,
  Segmented,
  Spacer,
  Toolbar,
} from '@/app/components/admin/ui';
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

  const views: { value: Tab; label: string }[] = [
    { value: 'events', label: 'Events' },
    { value: 'routing', label: 'Routing' },
    { value: 'competition', label: 'Competition' },
    { value: 'trends', label: 'Trends & comp venues' },
  ];

  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setPendingFilters({ ...pendingFilters, [k]: e.target.value });

  const scanFailed = !!scanResult && (scanResult.startsWith('Error') || scanResult.startsWith('Scan failed'));

  return (
    <div className="mr">
      <Toolbar>
        <div className="mr-intro">
          <div className="mr-title">Market radar</div>
          <div className="mr-sub">Live event intelligence for the Shoals region</div>
        </div>
        <Spacer />
        <Button variant="primary" onClick={runScan} disabled={scanning}>
          {scanning ? 'Scanning…' : 'Run scan'}
        </Button>
      </Toolbar>

      {scanResult && <div className={`mr-banner ${scanFailed ? 'mr-banner--bad' : 'mr-banner--good'}`}>{scanResult}</div>}

      <KpiRow>
        <Kpi label="Events tracked" value={eventsTotal.toLocaleString('en-US')} />
        <Kpi label="Routing clusters" value={clusters.length} />
        <Kpi label="High competition" value={highCompetition} sub="score of 70 or more" />
        <Kpi
          label="Last scan"
          value={
            lastScan
              ? new Date(lastScan).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : '—'
          }
          sub={lastScan ? new Date(lastScan).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : undefined}
        />
      </KpiRow>

      {error && <div className="mr-banner mr-banner--bad">{error}</div>}

      <Card title="Filters">
        <div className="mr-filters">
          <Field label="City">
            <select value={pendingFilters.city} onChange={set('city')}>
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date from">
            <input type="date" value={pendingFilters.dateFrom} onChange={set('dateFrom')} />
          </Field>
          <Field label="Date to">
            <input type="date" value={pendingFilters.dateTo} onChange={set('dateTo')} />
          </Field>
          <Field label="Capacity min">
            <input type="number" placeholder="No min" value={pendingFilters.capacityMin} onChange={set('capacityMin')} />
          </Field>
          <Field label="Capacity max">
            <input type="number" placeholder="No max" value={pendingFilters.capacityMax} onChange={set('capacityMax')} />
          </Field>
          <Field label="Competition min">
            <input type="number" placeholder="0" value={pendingFilters.competitionMin} onChange={set('competitionMin')} />
          </Field>
          <Field label="Source">
            <select value={pendingFilters.source} onChange={set('source')}>
              <option value="">All sources</option>
              <option value="ticketmaster">Ticketmaster</option>
              <option value="bandsintown">Bandsintown</option>
              <option value="venue_scrape">Venue scrape</option>
            </select>
          </Field>
        </div>
        <div className="mr-filter-actions">
          <Button variant="ghost" onClick={handleResetFilters}>Reset</Button>
          <Button onClick={handleApplyFilters}>Apply filters</Button>
        </div>
      </Card>

      <div className="mr-views">
        <Segmented<Tab> options={views} value={activeTab} onChange={setActiveTab} />
      </div>

      <div className="mr-body">
        {activeTab === 'events' && (
          <Card>
            <EventTable events={events} loading={eventsLoading} />
          </Card>
        )}
        {activeTab === 'routing' && <RoutingPanel clusters={clusters} loading={clustersLoading} />}
        {activeTab === 'competition' && (
          <CompetitionPanel competitions={competitions} loading={competitionsLoading} />
        )}
        {activeTab === 'trends' && <TrendPanel />}
      </div>
    </div>
  );
}
