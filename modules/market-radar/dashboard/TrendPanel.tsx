'use client';

import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts';

const GOLD = '#d0c290';
const GREEN = '#22c55e';
const BLUE = '#7eb8da';

type TrendData = {
  total_events: number;
  capacity_range: { min: number; max: number };
  day_of_week: { day: string; shortDay: string; count: number; avgDemand: number }[];
  monthly_volume: { month: string; label: string; count: number; avgDemand: number }[];
  lead_time: { label: string; count: number; avgDemand: number }[];
  pricing: {
    average: number;
    median: number;
    by_capacity: { label: string; avgPrice: number; count: number }[];
  };
  top_artists: { name: string; eventCount: number; totalDemand: number; avgPrice: number }[];
  top_venues: { name: string; city: string; state: string; capacity: number; eventCount: number; avgDemand: number }[];
  velocity_insights: { artist: string; venue: string; date: string; velocity: number; trackerCount: number; estimatedSold: number; capacity: number }[];
};

export default function TrendPanel() {
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [capMin, setCapMin] = useState(350);
  const [capMax, setCapMax] = useState(800);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/market-radar/trends?capacity_min=${capMin}&capacity_max=${capMax}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [capMin, capMax]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Loading trend data...</div>;
  if (!data || data.total_events === 0) return <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>No market data yet. Run a scan first to populate events.</div>;

  return (
    <div>
      {/* Capacity Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Capacity:</span>
        {[
          { label: '350–800', min: 350, max: 800 },
          { label: '300–500', min: 300, max: 500 },
          { label: '500–1000', min: 500, max: 1000 },
          { label: 'All', min: 0, max: 99999 },
        ].map((opt) => (
          <button
            key={opt.label}
            onClick={() => { setCapMin(opt.min); setCapMax(opt.max); }}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: capMin === opt.min && capMax === opt.max ? `1px solid ${GOLD}` : '1px solid rgba(255,255,255,0.1)',
              background: capMin === opt.min && capMax === opt.max ? 'rgba(208,194,144,0.15)' : 'rgba(255,255,255,0.03)',
              color: capMin === opt.min && capMax === opt.max ? GOLD : 'rgba(255,255,255,0.5)',
            }}
          >
            {opt.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
          {data.total_events} events in range
        </span>
      </div>

      {/* Day of Week + Monthly Volume Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Events by Day of Week</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.day_of_week}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="shortDay" stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
              <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#12122e', border: '1px solid rgba(208,194,144,0.2)', borderRadius: 10, color: '#fff', fontSize: 12 }} />
              <Bar dataKey="count" fill={GOLD} radius={[4, 4, 0, 0]} name="Events" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Monthly Event Volume</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.monthly_volume}>
              <defs>
                <linearGradient id="monthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={BLUE} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={BLUE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="label" stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} />
              <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#12122e', border: '1px solid rgba(208,194,144,0.2)', borderRadius: 10, color: '#fff', fontSize: 12 }} />
              <Area type="monotone" dataKey="count" stroke={BLUE} fill="url(#monthGrad)" strokeWidth={2} name="Events" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Lead Time + Pricing */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Announce Lead Time</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.lead_time}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="label" stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)' }} />
              <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#12122e', border: '1px solid rgba(208,194,144,0.2)', borderRadius: 10, color: '#fff', fontSize: 12 }} />
              <Bar dataKey="count" fill={GREEN} radius={[4, 4, 0, 0]} name="Events" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Pricing by Venue Size</h3>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: GOLD, fontSize: 24, fontWeight: 700 }}>${data.pricing.average}</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Avg Price</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>${data.pricing.median}</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Median</div>
            </div>
          </div>
          {data.pricing.by_capacity.map((tier) => (
            <div key={tier.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{tier.label}</span>
              <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>${tier.avgPrice} avg ({tier.count} events)</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Artists */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Top Artists by Demand (350-800 Cap Rooms)</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Artist</th>
                <th style={thStyle}>Shows</th>
                <th style={thStyle}>Total Demand</th>
                <th style={thStyle}>Avg Price</th>
              </tr>
            </thead>
            <tbody>
              {data.top_artists.slice(0, 15).map((a) => (
                <tr key={a.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={tdStyle}>{a.name}</td>
                  <td style={tdStyle}>{a.eventCount}</td>
                  <td style={tdStyle}>{a.totalDemand.toLocaleString()}</td>
                  <td style={tdStyle}>{a.avgPrice > 0 ? `$${a.avgPrice}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Venues */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 20 }}>
        <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Most Active Comp Venues</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Venue</th>
                <th style={thStyle}>City</th>
                <th style={thStyle}>Capacity</th>
                <th style={thStyle}>Events</th>
                <th style={thStyle}>Avg Demand</th>
              </tr>
            </thead>
            <tbody>
              {data.top_venues.map((v) => (
                <tr key={v.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={tdStyle}>{v.name}</td>
                  <td style={tdStyle}>{v.city}, {v.state}</td>
                  <td style={tdStyle}>{v.capacity.toLocaleString()}</td>
                  <td style={tdStyle}>{v.eventCount}</td>
                  <td style={tdStyle}>{v.avgDemand.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 600,
  color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px',
  borderBottom: '1px solid rgba(255,255,255,0.1)',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', fontSize: 13, color: 'rgba(255,255,255,0.7)',
};
