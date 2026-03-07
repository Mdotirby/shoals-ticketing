"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────

type LivePulseData = {
  event: {
    id: string;
    title: string;
    venue: string;
    date: string;
    image_url: string | null;
  };
  capacity: {
    total: number;
    sold: number;
    scanned: number;
    remaining: number;
    percentSold: number;
    percentScanned: number;
  };
  revenue: {
    total: number;
    today: number;
    timeline: { time: string; revenue: number; orders: number }[];
  };
  sales: {
    today: number;
    total: number;
  };
  scanning: {
    total: number;
    velocity: number;
    timeline: { time: string; scans: number }[];
  };
  views: {
    total: number;
    unique: number;
    conversionRate: number;
  };
  tiers: {
    id: string;
    name: string;
    price: number;
    capacity: number;
    sold: number;
    percentSold: number;
  }[];
  recentScans: {
    id: string;
    customerName: string;
    scannedAt: string;
    tierName: string;
  }[];
  recentOrders: {
    id: string;
    customerName: string;
    email: string;
    amount: number;
    quantity: number;
    createdAt: string;
  }[];
  lastUpdated: string;
};

// ── Helpers ────────────────────────────────────────────────────

const GOLD = "#d0c290";
const DARK = "#0b0d1d";
const GREEN = "#22c55e";
const RED = "#ef4444";
const BLUE = "#7eb8da";

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

// ── Gauge Component ────────────────────────────────────────────

function CapacityGauge({ percent, label, color }: { percent: number; label: string; color: string }) {
  const radius = 60;
  const circumference = Math.PI * radius; // semi-circle
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference;

  return (
    <div style={{ textAlign: "center" }}>
      <svg width="150" height="90" viewBox="0 0 150 90">
        <path
          d="M 15 80 A 60 60 0 0 1 135 80"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M 15 80 A 60 60 0 0 1 135 80"
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
        <text x="75" y="65" textAnchor="middle" fill="white" fontSize="22" fontWeight="bold">
          {percent}%
        </text>
        <text x="75" y="82" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="11">
          {label}
        </text>
      </svg>
    </div>
  );
}

// ── Pulse Dot ──────────────────────────────────────────────────

function PulseDot({ active }: { active: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: active ? GREEN : "rgba(255,255,255,0.2)",
        boxShadow: active ? `0 0 8px ${GREEN}` : "none",
        marginRight: 8,
        animation: active ? "pulse 2s infinite" : "none",
      }}
    />
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function LivePulsePage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [data, setData] = useState<LivePulseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/live-pulse?event_id=${eventId}`);
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError("Failed to load live data");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchData, 15000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchData]);

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="dash-header">
          <h1 className="admin-page-title">Live Show Pulse</h1>
        </div>
        <div className="dash-loading-state">
          <div className="dash-spinner" />
          <p>Connecting to live data...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="admin-dashboard">
        <div className="dash-header">
          <h1 className="admin-page-title">Live Show Pulse</h1>
        </div>
        <div className="dash-loading-state">
          <p>{error || "Event not found"}</p>
          <Link href="/admin" style={{ color: GOLD, textDecoration: "underline", marginTop: 12 }}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const { event, capacity, revenue, sales, scanning, views, tiers, recentScans, recentOrders } = data;
  const isShowDay = new Date(event.date).toDateString() === new Date().toDateString();
  const capacityColor = capacity.percentSold >= 90 ? GREEN : capacity.percentSold >= 60 ? GOLD : BLUE;

  return (
    <div className="admin-dashboard">
      {/* Inline keyframes for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* ── HEADER ── */}
      <div className="dash-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <PulseDot active={autoRefresh} />
            <h1 className="admin-page-title" style={{ margin: 0 }}>Live Show Pulse</h1>
            {isShowDay && (
              <span style={{
                background: "rgba(34,197,94,0.15)", color: GREEN, fontSize: 11, fontWeight: 700,
                padding: "3px 10px", borderRadius: 20, border: `1px solid rgba(34,197,94,0.3)`,
                textTransform: "uppercase",
              }}>
                SHOW DAY
              </span>
            )}
          </div>
          <p className="dash-subtitle">{event.title} — {event.venue}</p>
        </div>
        <div className="dash-header-actions">
          <button
            type="button"
            className={`dash-action-btn ${autoRefresh ? "dash-action-primary" : ""}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? "Auto-Refresh ON" : "Auto-Refresh OFF"}
          </button>
          <button type="button" className="dash-action-btn" onClick={fetchData}>
            Refresh Now
          </button>
        </div>
      </div>

      {/* ── CAPACITY GAUGES ── */}
      <div className="dash-kpi-grid">
        <div className="dash-kpi-card dash-kpi-highlight" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <CapacityGauge percent={capacity.percentSold} label="Tickets Sold" color={capacityColor} />
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            <span>{capacity.sold} sold</span>
            <span>{capacity.remaining} left</span>
            <span>{capacity.total} cap</span>
          </div>
        </div>

        <div className="dash-kpi-card" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <CapacityGauge percent={capacity.percentScanned} label="Checked In" color={GREEN} />
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            <span>{capacity.scanned} scanned</span>
            <span>of {capacity.sold} sold</span>
          </div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div className="dash-kpi-content">
            <span className="dash-kpi-label">Total Revenue</span>
            <span className="dash-kpi-value">{fmt(revenue.total)}</span>
            <span className="dash-kpi-secondary">{fmt(revenue.today)} today</span>
          </div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-icon dash-kpi-icon-tickets">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
            </svg>
          </div>
          <div className="dash-kpi-content">
            <span className="dash-kpi-label">Scan Velocity</span>
            <span className="dash-kpi-value">{scanning.velocity}/min</span>
            <span className="dash-kpi-secondary">{sales.today} tickets today</span>
          </div>
        </div>
      </div>

      {/* ── LIFETIME BANNER ── */}
      <div className="dash-lifetime-banner">
        <div className="dash-lifetime-item">
          <span className="dash-lifetime-label">Page Views</span>
          <span className="dash-lifetime-value">{views.total.toLocaleString()}</span>
        </div>
        <div className="dash-lifetime-divider" />
        <div className="dash-lifetime-item">
          <span className="dash-lifetime-label">Unique Visitors</span>
          <span className="dash-lifetime-value">{views.unique.toLocaleString()}</span>
        </div>
        <div className="dash-lifetime-divider" />
        <div className="dash-lifetime-item">
          <span className="dash-lifetime-label">Conversion Rate</span>
          <span className="dash-lifetime-value">{views.conversionRate}%</span>
        </div>
        <div className="dash-lifetime-divider" />
        <div className="dash-lifetime-item">
          <span className="dash-lifetime-label">Avg. Ticket Price</span>
          <span className="dash-lifetime-value">
            {sales.total > 0 ? fmt(revenue.total / sales.total) : "$0.00"}
          </span>
        </div>
      </div>

      {/* ── CHARTS ROW ── */}
      <div className="dash-main-grid">
        {/* Scan Velocity Chart */}
        <div className="dash-panel">
          <div className="dash-panel-header">
            <h2 className="dash-panel-title">Scan Velocity</h2>
            <span className="dash-panel-badge">Last 30 Min</span>
          </div>
          {scanning.timeline.length > 0 ? (
            <div className="dash-chart-wrapper">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={scanning.timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="time"
                    stroke="rgba(255,255,255,0.2)"
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                  />
                  <YAxis
                    stroke="rgba(255,255,255,0.2)"
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#12122e",
                      border: "1px solid rgba(208,194,144,0.2)",
                      borderRadius: 10,
                      color: "#fff",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="scans" fill={GREEN} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="dash-empty-state">
              <p>Scan data will appear once doors open</p>
            </div>
          )}
        </div>

        {/* Revenue Timeline Chart */}
        <div className="dash-panel">
          <div className="dash-panel-header">
            <h2 className="dash-panel-title">Revenue Flow</h2>
            <span className="dash-panel-badge">Last Hour</span>
          </div>
          {revenue.timeline.length > 0 ? (
            <div className="dash-chart-wrapper">
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={revenue.timeline}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={GOLD} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={GOLD} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="time"
                    stroke="rgba(255,255,255,0.2)"
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                  />
                  <YAxis
                    stroke="rgba(255,255,255,0.2)"
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                    tickFormatter={(v: number) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#12122e",
                      border: "1px solid rgba(208,194,144,0.2)",
                      borderRadius: 10,
                      color: "#fff",
                      fontSize: 12,
                    }}
                    formatter={(value) => [fmt(Number(value ?? 0)), "Revenue"]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke={GOLD} fill="url(#revGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="dash-empty-state">
              <p>Revenue data will appear as sales come in</p>
            </div>
          )}
        </div>
      </div>

      {/* ── TIER BREAKDOWN ── */}
      {tiers.length > 0 && (
        <div className="dash-panel">
          <div className="dash-panel-header">
            <h2 className="dash-panel-title">Tier Breakdown</h2>
          </div>
          <div className="dash-tier-grid">
            {tiers.map((tier) => (
              <div key={tier.id} className="dash-tier-item">
                <div className="dash-tier-bar-wrapper">
                  <div
                    className="dash-tier-bar"
                    style={{
                      width: `${Math.max(8, tier.percentSold)}%`,
                      background: tier.percentSold >= 90 ? GREEN : tier.percentSold >= 60 ? GOLD : BLUE,
                    }}
                  />
                </div>
                <div className="dash-tier-info">
                  <span className="dash-tier-name">{tier.name} — {fmt(tier.price)}</span>
                  <span className="dash-tier-count">
                    {tier.sold} / {tier.capacity} ({tier.percentSold}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ACTIVITY FEED ── */}
      <div className="dash-main-grid">
        {/* Recent Scans */}
        <div className="dash-panel">
          <div className="dash-panel-header">
            <h2 className="dash-panel-title">Recent Check-Ins</h2>
            <span className="dash-panel-badge">{scanning.total} total</span>
          </div>
          {recentScans.length > 0 ? (
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {recentScans.map((scan) => (
                <div
                  key={scan.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <div>
                    <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
                      {scan.customerName}
                    </span>
                    <span style={{
                      marginLeft: 8, fontSize: 11, color: "rgba(255,255,255,0.4)",
                      background: "rgba(255,255,255,0.05)", padding: "2px 8px", borderRadius: 12,
                    }}>
                      {scan.tierName}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                    {timeAgo(scan.scannedAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="dash-empty-state">
              <p>Scan activity will appear here</p>
            </div>
          )}
        </div>

        {/* Recent Orders */}
        <div className="dash-panel">
          <div className="dash-panel-header">
            <h2 className="dash-panel-title">Recent Sales</h2>
            <span className="dash-panel-badge">{sales.total} tickets</span>
          </div>
          {recentOrders.length > 0 ? (
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <div>
                    <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
                      {order.customerName}
                    </span>
                    <span style={{ marginLeft: 8, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                      {order.quantity} ticket{order.quantity !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ color: GOLD, fontSize: 13, fontWeight: 600 }}>
                      {fmt(order.amount)}
                    </span>
                    <br />
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                      {timeAgo(order.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="dash-empty-state">
              <p>Sales will appear here once tickets start selling</p>
            </div>
          )}
        </div>
      </div>

      {/* ── LAST UPDATED ── */}
      <div style={{
        textAlign: "center", padding: "16px 0", fontSize: 11,
        color: "rgba(255,255,255,0.25)",
      }}>
        Last updated: {new Date(data.lastUpdated).toLocaleTimeString("en-US", {
          hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
        })}
        {autoRefresh && " · Auto-refreshing every 15s"}
      </div>
    </div>
  );
}
