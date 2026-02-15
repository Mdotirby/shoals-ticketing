"use client";

import { useEffect, useState } from "react";
import { getCookie } from "@/lib/cookies";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type DashboardData = {
  totalEvents: number;
  ticketsSoldToday: number;
  totalTicketsSold: number;
  totalRevenue: number;
  tierBreakdown: { tier_name: string; tickets_sold: number }[];
  dailySales: Record<string, unknown>[];
  eventNames: string[];
};

// Soft color palette for chart lines
const CHART_COLORS = [
  "#d0c290",
  "#7eb8da",
  "#c78dba",
  "#8dd4a8",
  "#e8a87c",
  "#91a7ff",
  "#ff9a9e",
  "#a3d9a5",
];

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const venueId = getCookie("venue-id");
    const params = venueId ? `?venue_id=${venueId}` : "";

    fetch(`/api/admin/dashboard${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="admin-dashboard">
        <h1 className="admin-page-title">Dashboard</h1>
        <p className="dash-loading">Loading analytics…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="admin-dashboard">
        <h1 className="admin-page-title">Dashboard</h1>
        <p className="dash-loading">Failed to load dashboard data.</p>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <h1 className="admin-page-title">Dashboard</h1>

      {/* ── KPI Cards ── */}
      <div className="dash-kpi-grid">
        <div className="dash-kpi-card">
          <span className="dash-kpi-label">Tickets Sold Today</span>
          <span className="dash-kpi-value">{data.ticketsSoldToday}</span>
        </div>
        <div className="dash-kpi-card">
          <span className="dash-kpi-label">Total Tickets Sold</span>
          <span className="dash-kpi-value">{data.totalTicketsSold}</span>
        </div>
        <div className="dash-kpi-card">
          <span className="dash-kpi-label">Total Revenue</span>
          <span className="dash-kpi-value">
            ${data.totalRevenue.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        <div className="dash-kpi-card">
          <span className="dash-kpi-label">Active Events</span>
          <span className="dash-kpi-value">{data.totalEvents}</span>
        </div>
      </div>

      {/* ── Daily Sales Line Chart ── */}
      {data.dailySales.length > 0 && (
        <div className="dash-chart-section">
          <h2 className="dash-section-title">Daily Ticket Sales (Last 30 Days)</h2>
          <div className="dash-chart-wrapper">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={data.dailySales}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.06)"
                />
                <XAxis
                  dataKey="date"
                  stroke="rgba(255,255,255,0.3)"
                  tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }}
                  tickFormatter={(d: string) => {
                    const parts = d.split("-");
                    return `${parts[1]}/${parts[2]}`;
                  }}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.3)"
                  tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1a1a3e",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 12,
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}
                />
                {data.eventNames.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {data.dailySales.length === 0 && (
        <div className="dash-chart-section">
          <h2 className="dash-section-title">Daily Ticket Sales</h2>
          <p className="dash-empty">No sales data yet.</p>
        </div>
      )}

      {/* ── Tier Breakdown Table ── */}
      <div className="dash-table-section">
        <h2 className="dash-section-title">Tickets Sold by Tier</h2>
        {data.tierBreakdown.length > 0 ? (
          <table className="dash-table">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Tickets Sold</th>
              </tr>
            </thead>
            <tbody>
              {data.tierBreakdown.map((row) => (
                <tr key={row.tier_name}>
                  <td>{row.tier_name}</td>
                  <td>{row.tickets_sold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="dash-empty">No tier data yet.</p>
        )}
      </div>
    </div>
  );
}
