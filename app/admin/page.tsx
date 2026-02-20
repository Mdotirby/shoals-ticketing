"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type UpcomingEvent = {
  id: string;
  title: string;
  date: string;
  venue: string;
  image_url: string | null;
  ticketsSold: number;
  revenue: number;
};

type RecentOrder = {
  id: string;
  customerName: string;
  email: string;
  amount: number;
  quantity: number;
  createdAt: string;
  eventTitle: string;
};

type DashboardData = {
  totalEvents: number;
  ticketsSoldToday: number;
  ticketsSoldYesterday: number;
  ticketsSoldThisWeek: number;
  totalTicketsSold: number;
  totalRevenue: number;
  revenueToday: number;
  revenueThisWeek: number;
  tierBreakdown: { tier_name: string; tickets_sold: number }[];
  dailySales: Record<string, unknown>[];
  eventNames: string[];
  upcomingEvents: UpcomingEvent[];
  recentOrders: RecentOrder[];
};

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

function formatCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function daysUntil(dateStr: string) {
  const eventDate = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `${diff} days`;
}

function TrendIndicator({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (previous === 0 && current === 0) return <span className="dash-trend dash-trend-neutral">—</span>;
  if (previous === 0) return <span className="dash-trend dash-trend-up">↑ New {label}</span>;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return <span className="dash-trend dash-trend-up">↑ {pct}% vs yesterday</span>;
  if (pct < 0) return <span className="dash-trend dash-trend-down">↓ {Math.abs(pct)}% vs yesterday</span>;
  return <span className="dash-trend dash-trend-neutral">→ Same as yesterday</span>;
}

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
        <div className="dash-header">
          <h1 className="admin-page-title">Command Center</h1>
        </div>
        <div className="dash-loading-state">
          <div className="dash-spinner" />
          <p>Loading your analytics...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="admin-dashboard">
        <div className="dash-header">
          <h1 className="admin-page-title">Command Center</h1>
        </div>
        <div className="dash-loading-state">
          <p>Failed to load dashboard data. Check your connection.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      {/* ── HEADER ── */}
      <div className="dash-header">
        <div>
          <h1 className="admin-page-title">Command Center</h1>
          <p className="dash-subtitle">Your shows at a glance</p>
        </div>
        <div className="dash-header-actions">
          <Link href="/admin/events/new" className="dash-action-btn dash-action-primary">
            + New Event
          </Link>
          <Link href="/admin/reports" className="dash-action-btn">
            View Reports
          </Link>
        </div>
      </div>

      {/* ── TOP KPI ROW ── */}
      <div className="dash-kpi-grid">
        <div className="dash-kpi-card dash-kpi-highlight">
          <div className="dash-kpi-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div className="dash-kpi-content">
            <span className="dash-kpi-label">Revenue Today</span>
            <span className="dash-kpi-value">{formatCurrency(data.revenueToday)}</span>
          </div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-icon dash-kpi-icon-tickets">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
              <path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" />
            </svg>
          </div>
          <div className="dash-kpi-content">
            <span className="dash-kpi-label">Tickets Today</span>
            <span className="dash-kpi-value">{data.ticketsSoldToday}</span>
            <TrendIndicator current={data.ticketsSoldToday} previous={data.ticketsSoldYesterday} label="sales" />
          </div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-icon dash-kpi-icon-week">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
            </svg>
          </div>
          <div className="dash-kpi-content">
            <span className="dash-kpi-label">This Week</span>
            <span className="dash-kpi-value">{data.ticketsSoldThisWeek} tickets</span>
            <span className="dash-kpi-secondary">{formatCurrency(data.revenueThisWeek)} revenue</span>
          </div>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-icon dash-kpi-icon-total">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div className="dash-kpi-content">
            <span className="dash-kpi-label">Active Events</span>
            <span className="dash-kpi-value">{data.totalEvents}</span>
          </div>
        </div>
      </div>

      {/* ── LIFETIME BANNER ── */}
      <div className="dash-lifetime-banner">
        <div className="dash-lifetime-item">
          <span className="dash-lifetime-label">All-Time Tickets</span>
          <span className="dash-lifetime-value">{data.totalTicketsSold.toLocaleString()}</span>
        </div>
        <div className="dash-lifetime-divider" />
        <div className="dash-lifetime-item">
          <span className="dash-lifetime-label">All-Time Revenue</span>
          <span className="dash-lifetime-value">{formatCurrency(data.totalRevenue)}</span>
        </div>
        <div className="dash-lifetime-divider" />
        <div className="dash-lifetime-item">
          <span className="dash-lifetime-label">Avg. per Ticket</span>
          <span className="dash-lifetime-value">
            {data.totalTicketsSold > 0
              ? formatCurrency(data.totalRevenue / data.totalTicketsSold)
              : "$0.00"}
          </span>
        </div>
      </div>

      {/* ── MAIN CONTENT GRID ── */}
      <div className="dash-main-grid">
        {/* LEFT COLUMN: Chart + Tier Breakdown */}
        <div className="dash-main-left">
          {/* Sales Chart */}
          <div className="dash-panel">
            <div className="dash-panel-header">
              <h2 className="dash-panel-title">Sales Trend</h2>
              <span className="dash-panel-badge">Last 30 Days</span>
            </div>
            {data.dailySales.length > 0 ? (
              <div className="dash-chart-wrapper">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={data.dailySales}>
                    <defs>
                      {data.eventNames.map((name, i) => (
                        <linearGradient key={name} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis
                      dataKey="date"
                      stroke="rgba(255,255,255,0.2)"
                      tick={{ fontSize: 11, fill: "rgba(255,255,255,0.35)" }}
                      tickFormatter={(d: string) => {
                        const parts = d.split("-");
                        return `${parts[1]}/${parts[2]}`;
                      }}
                    />
                    <YAxis
                      stroke="rgba(255,255,255,0.2)"
                      tick={{ fontSize: 11, fill: "rgba(255,255,255,0.35)" }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#12122e",
                        border: "1px solid rgba(208,194,144,0.2)",
                        borderRadius: 10,
                        color: "#fff",
                        fontSize: 12,
                        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }} />
                    {data.eventNames.map((name, i) => (
                      <Area
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={CHART_COLORS[i % CHART_COLORS.length]}
                        fill={`url(#grad-${i})`}
                        strokeWidth={2}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="dash-empty-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                </svg>
                <p>Sales data will appear here once tickets start selling</p>
              </div>
            )}
          </div>

          {/* Tier Breakdown */}
          {data.tierBreakdown.length > 0 && (
            <div className="dash-panel">
              <div className="dash-panel-header">
                <h2 className="dash-panel-title">Sales by Tier</h2>
              </div>
              <div className="dash-tier-grid">
                {data.tierBreakdown.map((tier) => (
                  <div key={tier.tier_name} className="dash-tier-item">
                    <div className="dash-tier-bar-wrapper">
                      <div
                        className="dash-tier-bar"
                        style={{
                          width: `${Math.max(
                            8,
                            (tier.tickets_sold / Math.max(...data.tierBreakdown.map((t) => t.tickets_sold))) * 100
                          )}%`,
                        }}
                      />
                    </div>
                    <div className="dash-tier-info">
                      <span className="dash-tier-name">{tier.tier_name}</span>
                      <span className="dash-tier-count">{tier.tickets_sold} sold</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Upcoming Events + Recent Orders */}
        <div className="dash-main-right">
          {/* Upcoming Events */}
          <div className="dash-panel">
            <div className="dash-panel-header">
              <h2 className="dash-panel-title">Upcoming Shows</h2>
              <Link href="/admin/events" className="dash-panel-link">View All →</Link>
            </div>
            {data.upcomingEvents.length > 0 ? (
              <div className="dash-events-list">
                {data.upcomingEvents.map((ev) => (
                  <Link
                    key={ev.id}
                    href={`/admin/events/${ev.id}/edit`}
                    className="dash-event-row"
                  >
                    <div className="dash-event-date-badge">
                      <span className="dash-event-countdown">{daysUntil(ev.date)}</span>
                      <span className="dash-event-date-text">
                        {new Date(ev.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <div className="dash-event-info">
                      <span className="dash-event-name">{ev.title}</span>
                      <span className="dash-event-venue">{ev.venue}</span>
                    </div>
                    <div className="dash-event-stats">
                      <span className="dash-event-tickets">{ev.ticketsSold} tickets</span>
                      <span className="dash-event-revenue">{formatCurrency(ev.revenue)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="dash-empty-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <p>No upcoming events scheduled</p>
                <Link href="/admin/events/new" className="dash-empty-cta">Create your first event →</Link>
              </div>
            )}
          </div>

          {/* Recent Orders */}
          <div className="dash-panel">
            <div className="dash-panel-header">
              <h2 className="dash-panel-title">Recent Orders</h2>
              <Link href="/admin/orders" className="dash-panel-link">View All →</Link>
            </div>
            {data.recentOrders.length > 0 ? (
              <div className="dash-orders-list">
                {data.recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/admin/orders/${order.id}`}
                    className="dash-order-row"
                  >
                    <div className="dash-order-avatar">
                      {(order.customerName || "?")[0].toUpperCase()}
                    </div>
                    <div className="dash-order-info">
                      <span className="dash-order-name">{order.customerName}</span>
                      <span className="dash-order-event">{order.eventTitle} · {order.quantity} ticket{order.quantity !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="dash-order-meta">
                      <span className="dash-order-amount">{formatCurrency(order.amount)}</span>
                      <span className="dash-order-time">{timeAgo(order.createdAt)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="dash-empty-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5">
                  <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
                <p>Orders will show up here as they come in</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
