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
  velocity_insights: { artist: string; venue: string; date: string; velocity: number; trackerCount: number; estimatedSold: number; estimatedRemaining: number; capacity: number }[];
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
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-6 items-center">
        <span className="text-gray-400 text-xs sm:text-sm w-full sm:w-auto">Capacity:</span>
        {[
          { label: '350–800', min: 350, max: 800 },
          { label: '300–500', min: 300, max: 500 },
          { label: '500–1000', min: 500, max: 1000 },
          { label: 'All', min: 0, max: 99999 },
        ].map((opt) => (
          <button
            key={opt.label}
            onClick={() => { setCapMin(opt.min); setCapMax(opt.max); }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
            style={{
              border: capMin === opt.min && capMax === opt.max ? `1px solid ${GOLD}` : '1px solid rgba(255,255,255,0.1)',
              background: capMin === opt.min && capMax === opt.max ? 'rgba(208,194,144,0.15)' : 'rgba(255,255,255,0.03)',
              color: capMin === opt.min && capMax === opt.max ? GOLD : 'rgba(255,255,255,0.5)',
            }}
          >
            {opt.label}
          </button>
        ))}
        <span className="sm:ml-auto text-gray-500 text-xs">
          {data.total_events} events in range
        </span>
      </div>

      {/* Day of Week + Monthly Volume Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16 }}>
          <h3 className="text-white text-sm sm:text-[15px] font-semibold mb-4">Events by Day of Week</h3>
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

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16 }}>
          <h3 className="text-white text-sm sm:text-[15px] font-semibold mb-4">Monthly Event Volume</h3>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16 }}>
          <h3 className="text-white text-sm sm:text-[15px] font-semibold mb-4">Announce Lead Time</h3>
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

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16 }}>
          <h3 className="text-white text-sm sm:text-[15px] font-semibold mb-4">Pricing by Venue Size</h3>
          <div className="flex gap-4 sm:gap-6 mb-4">
            <div className="text-center">
              <div style={{ color: GOLD }} className="text-xl sm:text-2xl font-bold">${data.pricing.average}</div>
              <div className="text-gray-400 text-[10px] sm:text-xs">Avg Price</div>
            </div>
            <div className="text-center">
              <div className="text-white text-xl sm:text-2xl font-bold">${data.pricing.median}</div>
              <div className="text-gray-400 text-[10px] sm:text-xs">Median</div>
            </div>
          </div>
          {data.pricing.by_capacity.map((tier) => (
            <div key={tier.label} className="flex justify-between py-2 border-b border-white/5 text-xs sm:text-[13px]">
              <span className="text-gray-400">{tier.label}</span>
              <span className="text-white font-semibold">${tier.avgPrice} avg ({tier.count})</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Artists */}
      <div className="mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16 }}>
        <h3 className="text-white text-sm sm:text-[15px] font-semibold mb-4">Top Artists by Demand (350-800 Cap Rooms)</h3>
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

      {/* Velocity Insights — Fastest Selling Events */}
      {data.velocity_insights.length > 0 && (
        <div className="mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16 }}>
          <h3 className="text-white text-sm sm:text-[15px] font-semibold mb-4">🔥 Fastest Selling Events</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Artist</th>
                  <th style={thStyle}>Venue</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Velocity</th>
                  <th style={thStyle}>Est. Sold</th>
                  <th style={thStyle}>Capacity</th>
                  <th style={thStyle}>Sell-Through</th>
                </tr>
              </thead>
              <tbody>
                {data.velocity_insights.slice(0, 15).map((v, i) => {
                  const pct = v.capacity > 0 ? Math.round((v.estimatedSold / v.capacity) * 100) : 0;
                  let pctColor = 'rgba(34,197,94,0.8)';
                  if (pct >= 85) pctColor = 'rgba(239,68,68,0.8)';
                  else if (pct >= 60) pctColor = 'rgba(245,158,11,0.8)';

                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={tdStyle}>{v.artist}</td>
                      <td style={tdStyle}>{v.venue}</td>
                      <td style={tdStyle}>
                        {new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td style={{ ...tdStyle, color: '#d0c290', fontWeight: 600 }}>
                        {v.velocity}/day
                      </td>
                      <td style={tdStyle}>
                        {v.estimatedSold?.toLocaleString() ?? '—'}
                      </td>
                      <td style={tdStyle}>
                        {v.capacity?.toLocaleString() ?? '—'}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 6, minWidth: 40 }}>
                            <div style={{ width: `${pct}%`, height: 6, borderRadius: 4, background: pctColor }} />
                          </div>
                          <span style={{ fontSize: 11, color: pctColor, fontWeight: 600, whiteSpace: 'nowrap' }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Venues */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16 }}>
        <h3 className="text-white text-sm sm:text-[15px] font-semibold mb-4">Most Active Comp Venues</h3>
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
  textAlign: 'left', padding: '8px 8px', fontSize: 10, fontWeight: 600,
  color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px',
  borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 8px', fontSize: 12, color: 'rgba(255,255,255,0.7)',
};
