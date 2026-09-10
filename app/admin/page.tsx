"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
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
  /** The SELLABLE cap — room less kills and comps. What sell-through divides by. */
  totalCapacity: number;
  /** The room itself. Null when nothing records it. Differs from the sellable
   *  cap whenever seats are killed or comped — see lib/capacity.ts. */
  roomCapacity: number | null;
  heldSeats: number;
  sellThrough: number;
  avgTicket: number;
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
  // The decomposition the old shape could not express. `totalRevenue` used to
  // be a sum of orders.total_amount, which could not tell face value from fees
  // from tax; it now comes from settlement_ledger and these travel with it.
  faceValue: number;
  netToVenue: number;
  ticketingFees: number;
  facilityFees: number;
  taxCollected: number;
  cardFees: number;
  refunds: number;
  paidTickets: number;
  compedTickets: number;
  avgTicket: number;
  sellThrough: number;
  totalCapacity: number;
  // Calendar month, not a rolling window — a venue closes its books on a month.
  monthTicketsSold: number;
  monthGross: number;
  monthFaceValue: number;
  monthNetToVenue: number;
  monthAvgTicket: number;
  lastMonthTicketsSold: number;
  lastMonthGross: number;
  eventsWithSales: number;
  eventsTotal: number;
  tierBreakdown: { tier_name: string; tickets_sold: number }[];
  dailySales: Record<string, unknown>[];
  eventNames: string[];
  upcomingEvents: UpcomingEvent[];
  recentOrders: RecentOrder[];
};

/**
 * The zero state, in one place.
 *
 * This was written inline where an artist has no assigned events, listing the
 * response's fields by hand — so every field added to the endpoint silently
 * left it behind. It is `Record<keyof DashboardData, …>`-shaped on purpose:
 * the type is what fails the build when the two diverge, rather than a
 * dashboard rendering `undefined` for a number nobody thought to add here.
 */
const EMPTY_DASHBOARD: DashboardData = {
  totalEvents: 0,
  ticketsSoldToday: 0,
  ticketsSoldYesterday: 0,
  ticketsSoldThisWeek: 0,
  totalTicketsSold: 0,
  totalRevenue: 0,
  revenueToday: 0,
  revenueThisWeek: 0,
  faceValue: 0,
  netToVenue: 0,
  ticketingFees: 0,
  facilityFees: 0,
  taxCollected: 0,
  cardFees: 0,
  refunds: 0,
  paidTickets: 0,
  compedTickets: 0,
  avgTicket: 0,
  sellThrough: 0,
  totalCapacity: 0,
  monthTicketsSold: 0,
  monthGross: 0,
  monthFaceValue: 0,
  monthNetToVenue: 0,
  monthAvgTicket: 0,
  lastMonthTicketsSold: 0,
  lastMonthGross: 0,
  eventsWithSales: 0,
  eventsTotal: 0,
  tierBreakdown: [],
  dailySales: [],
  eventNames: [],
  upcomingEvents: [],
  recentOrders: [],
};

const CHART_COLORS = [
  "#ffffff",
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

/**
 * Whole days from now until the show, as a NUMBER.
 *
 * daysUntil() above returns display text — "Today", "Tomorrow", "3 days" —
 * and the artist dashboard renders it directly, so it cannot also be the thing
 * arithmetic is done on. Comparing its output to a number silently does
 * nothing useful.
 */
function daysOut(dateStr: string): number {
  // CALENDAR days, not elapsed milliseconds. A show at 8pm tonight is 0 days
  // out, not 1 — `Math.ceil` on the raw difference rounds any fraction of a
  // day up, so the queue told you tonight's show was "1 day to go" on the one
  // morning that number matters.
  const d = new Date(dateStr);
  const showDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const now = new Date();
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((showDay.getTime() - todayDay.getTime()) / 86_400_000);
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
  const [isArtist, setIsArtist] = useState(false);
  const [artistEventIds, setArtistEventIds] = useState<string[]>([]);

  useEffect(() => {
    const role = getCookie("user-role");
    const isArtistRole = role === "artist";
    setIsArtist(isArtistRole);

    async function loadDashboard() {
      let eventIdsParam = "";

      // If artist, first fetch their assigned event IDs
      if (isArtistRole) {
        try {
          const supabase = getSupabaseBrowser();
          const { data: authData } = await supabase.auth.getUser();
          if (authData?.user) {
            const res = await fetch(`/api/artists/assignments?artist_id=${authData.user.id}`);
            if (res.ok) {
              const assignments = await res.json();
              const ids = Array.isArray(assignments)
                ? assignments.map((a: { event_id: string }) => a.event_id)
                : [];
              setArtistEventIds(ids);
              if (ids.length > 0) {
                eventIdsParam = `event_ids=${ids.join(",")}`;
              } else {
                // Artist has no assigned events — show empty dashboard
                setData(EMPTY_DASHBOARD);
                setLoading(false);
                return;
              }
            }
          }
        } catch (err) {
          console.error("Failed to fetch artist assignments:", err);
        }
      }

      // Build dashboard API URL
      const venueId = getCookie("venue-id");
      const params = new URLSearchParams();
      if (eventIdsParam) {
        params.set("event_ids", artistEventIds.length > 0 ? artistEventIds.join(",") : eventIdsParam.replace("event_ids=", ""));
      } else if (venueId) {
        params.set("venue_id", venueId);
      }

      // Re-parse eventIdsParam properly
      let apiUrl = "/api/admin/dashboard";
      if (isArtistRole && eventIdsParam) {
        apiUrl += `?${eventIdsParam}`;
      } else if (venueId) {
        apiUrl += `?venue_id=${venueId}`;
      }

      fetch(apiUrl)
        .then(async (res) => {
          if (!res.ok) throw new Error("Failed");
          return res.json();
        })
        .then((d) => setData(d))
        .catch(() => {})
        .finally(() => setLoading(false));
    }

    loadDashboard();
  }, []);

  const dashboardTitle = isArtist ? "Artist Dashboard" : "Command Center";
  const dashboardSubtitle = isArtist ? "Sales data for your assigned events" : "Your shows at a glance";

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="dash-header">
          <h1 className="admin-page-title">{dashboardTitle}</h1>
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
          <h1 className="admin-page-title">{dashboardTitle}</h1>
        </div>
        <div className="dash-loading-state">
          <p>Failed to load dashboard data. Check your connection.</p>
        </div>
      </div>
    );
  }

  // ── ARTIST DASHBOARD (simplified) ──
  if (isArtist) {
    return (
      <div className="admin-dashboard">
        {/* ── HEADER ── */}
        <div className="dash-header">
          <div>
            <h1 className="admin-page-title">{dashboardTitle}</h1>
            <p className="dash-subtitle">{dashboardSubtitle}</p>
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
                <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
                <path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" />
              </svg>
            </div>
            <div className="dash-kpi-content">
              <span className="dash-kpi-label">Total Tickets Sold</span>
              <span className="dash-kpi-value">{data.totalTicketsSold.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* ── LIFETIME BANNER ── */}
        <div className="dash-lifetime-banner">
          <div className="dash-lifetime-item">
            <span className="dash-lifetime-label">Total Tickets</span>
            <span className="dash-lifetime-value">{data.totalTicketsSold.toLocaleString()}</span>
          </div>
          <div className="dash-lifetime-divider" />
          <div className="dash-lifetime-item">
            <span className="dash-lifetime-label">Total Revenue</span>
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

        {/* ── SALES TREND CHART ── */}
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
                      border: "1px solid rgba(255, 255, 255, 0.2)",
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

        {/* ── TIER BREAKDOWN ── */}
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
    );
  }
  // ── OWNER / ADMIN DASHBOARD — the mockup's `dash` screen ──────────────────
  //
  // The mockup's shape is an argument about what a venue operator looks at
  // first: one hard-ticket number for the month, the shows that made it, and
  // then everything that needs a decision. The old screen led with four
  // "today" tiles, which is a number that is zero most mornings and tells you
  // nothing about whether the month is working.
  //
  // WHAT IS REAL HERE AND WHAT IS NOT. The mockup also draws cash position,
  // deposits held in trust, receivables aging and merch/bar ancillary. Those
  // need the invoices and deposits data plumbed through — it exists in the
  // repo (`invoices`, `private_event_revenue`) but nothing aggregates it yet,
  // and that is § 5's job, not this screen's. Rather than draw those panels
  // with invented numbers, they are left out and the money panel shows the
  // decomposition settlement_ledger actually gives. See REBUILD-REPORT.md.
  const today = new Date().toISOString().slice(0, 10);
  const dosEvent = data.upcomingEvents.find((ev) => ev.date === today);

  const ticketDelta = data.monthTicketsSold - data.lastMonthTicketsSold;
  const grossDelta = data.monthGross - data.lastMonthGross;
  const monthName = new Date().toLocaleDateString("en-US", { month: "long" });

  // Sell-through decides the bar's colour, on the mockup's thresholds:
  // 85%+ is mint, 55%+ is plain white, below that is dim. A room at 40% two
  // days out is a different conversation from one at 90%.
  const barTone = (pct: number) =>
    pct >= 85 ? "var(--cc-good)" : pct >= 55 ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.40)";

  // The queue is DERIVED, not stored. Every item below is computed from data
  // already on this page, so it can never disagree with the numbers above it.
  // The mockup's version also surfaces offer expiries and unsigned
  // settlements; those live in tables this endpoint does not read, and a
  // half-populated attention list is worse than a short honest one.
  const queue: { title: string; body: string; age: string; tone: string; href: string }[] = [];
  for (const ev of data.upcomingEvents) {
    const days = daysOut(ev.date);
    const pct = Math.round(ev.sellThrough);
    if (ev.totalCapacity > 0 && days >= 0 && days <= 14 && pct < 50) {
      queue.push({
        title: `${ev.title} is ${pct}% sold with ${days === 0 ? "doors tonight" : `${days} day${days === 1 ? "" : "s"} to go`}`,
        body: `${ev.ticketsSold.toLocaleString()} of ${ev.totalCapacity.toLocaleString()} gone. Releasing a held tier or a papering push is still worth it at this range.`,
        age: days === 0 ? "tonight" : `${days}d out`,
        tone: pct < 30 ? "var(--cc-bad)" : "var(--cc-warn)",
        href: `/admin/events/${ev.id}`,
      });
    }
    if (ev.totalCapacity === 0) {
      queue.push({
        title: `${ev.title} has no ticket tiers`,
        body: "Capacity is zero, so sell-through cannot be measured and the storefront has nothing to sell. Add a tier or the show will not appear as available.",
        age: days === 0 ? "tonight" : `${days}d out`,
        tone: "var(--cc-bad)",
        href: `/admin/events/${ev.id}/edit`,
      });
    }
  }
  if (data.compedTickets > 0 && data.totalTicketsSold > 0) {
    const compPct = Math.round((data.compedTickets / data.totalTicketsSold) * 1000) / 10;
    if (compPct >= 5) {
      queue.push({
        title: `Comps are ${compPct}% of every ticket issued`,
        body: `${data.compedTickets} of ${data.totalTicketsSold.toLocaleString()}. Comps carry no revenue but do occupy capacity, so they pull sell-through down without paying for it.`,
        age: "band total",
        tone: "var(--cc-warn)",
        href: "/admin/reports",
      });
    }
  }

  return (
    <div className="admin-dashboard cc">
      {/* ── Header ── */}
      <div className="dash-header">
        <div>
          <h1 className="admin-page-title">Command Center</h1>
          <p className="dash-subtitle">Your shows at a glance</p>
        </div>
        <div className="cc-actions">
          <Link href="/admin/events/new" className="cc-btn cc-btn--primary">+ New event</Link>
          <Link href="/admin/reports" className="cc-btn">Reporting</Link>
          {dosEvent && <Link href={`/admin/live/${dosEvent.id}`} className="cc-btn">Tonight: {dosEvent.title}</Link>}
        </div>
      </div>

      {/* ══ Hero + by-event ═══════════════════════════════════════════════ */}
      <div className="cc-top">

        {/* Hard ticket — this month */}
        <div className="cc-card cc-card--hero">
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <div className="cc-eyebrow">Hard ticket — {monthName}</div>
            <span className="cc-dot-good" />
            <span style={{ flex: 1 }} />
            <div style={{ fontSize: 9.5, color: "var(--cc-w32)" }}>ticketed only</div>
          </div>

          <div className="cc-hero-pair">
            <div>
              <div className="cc-hero-label">Tickets sold</div>
              <div className="cc-hero-value">{data.monthTicketsSold.toLocaleString()}</div>
              <div className="cc-hero-sub" style={{ color: ticketDelta >= 0 ? "var(--cc-good)" : "var(--cc-bad)" }}>
                {ticketDelta >= 0 ? "+" : "−"}{Math.abs(ticketDelta).toLocaleString()} vs. last month
              </div>
            </div>
            <div>
              <div className="cc-hero-label">Gross revenue</div>
              <div className="cc-hero-value">{formatCurrency(data.monthGross)}</div>
              <div className="cc-hero-sub">face + fees + tax collected</div>
            </div>
          </div>

          <div className="cc-hero-foot">
            <div>
              <div className="cc-foot-label">Net to venue</div>
              <div className="cc-foot-value">{formatCurrency(data.monthNetToVenue)}</div>
            </div>
            <div>
              <div className="cc-foot-label">Avg ticket</div>
              <div className="cc-foot-value">{formatCurrency(data.monthAvgTicket)}</div>
            </div>
            <div>
              <div className="cc-foot-label">Ticketed events</div>
              <div className="cc-foot-value" style={{ color: "var(--cc-w72)" }}>
                {data.eventsWithSales} of {data.eventsTotal}
              </div>
            </div>
          </div>

          <div className="cc-note" style={{ marginTop: 14 }}>
            Excludes RSVP events, private rentals, comps and internal holds.
            {grossDelta !== 0 && (
              <> Last month closed at {formatCurrency(data.lastMonthGross)} on {data.lastMonthTicketsSold.toLocaleString()} tickets.</>
            )}
          </div>
        </div>

        {/* By event — sold & gross */}
        <div className="cc-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="cc-eyebrow">By event — sold &amp; gross</div>
            <span style={{ flex: 1 }} />
            <Link href="/admin/reports" style={{ fontSize: 10.5, color: "var(--cc-w50)", textDecoration: "none" }}>Reporting →</Link>
          </div>

          <div className="cc-thead" style={{ marginTop: 14 }}>
            <div>Event</div>
            <div style={{ textAlign: "right" }}>Sold / cap</div>
            <div style={{ textAlign: "right" }}>Sell-thru</div>
            <div style={{ textAlign: "right" }}>Gross</div>
          </div>

          {data.upcomingEvents.length === 0 && (
            <div className="cc-note" style={{ marginTop: 14 }}>No upcoming ticketed shows on the books.</div>
          )}

          {data.upcomingEvents.map((ev) => {
            // Comes from resolveCapacity() server-side; recomputing it here is
            // how the two screens drifted apart in the first place.
            const pct = Math.round(ev.sellThrough);
            return (
              <Link key={ev.id} href={`/admin/events/${ev.id}`} className="cc-trow">
                <div style={{ minWidth: 0 }}>
                  <div className="cc-tname">{ev.title}</div>
                  <div className="cc-twhen">
                    {new Date(ev.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    {ev.venue ? ` · ${ev.venue}` : ""}
                  </div>
                </div>
                <div className="cc-tnum">
                  {ev.ticketsSold.toLocaleString()}{ev.totalCapacity > 0 ? ` / ${ev.totalCapacity.toLocaleString()}` : ""}
                  {/* The room, when kills or comps make it differ from what is
                      actually for sale. Sell-through divides by the sellable
                      cap; showing the room beside it stops the smaller number
                      reading as an error. */}
                  {ev.roomCapacity != null && ev.totalCapacity > 0 && ev.roomCapacity !== ev.totalCapacity && (
                    <div style={{ fontSize: 9.5, color: "var(--cc-w32)" }}>of {ev.roomCapacity.toLocaleString()} room</div>
                  )}
                </div>
                <div>
                  <div className="cc-tnum" style={{ color: pct >= 85 ? "var(--cc-good)" : "var(--cc-w62)" }}>
                    {ev.totalCapacity > 0 ? `${pct}%` : "no tiers"}
                  </div>
                  {ev.totalCapacity > 0 && (
                    <div className="cc-bar">
                      <span style={{ width: `${Math.min(100, pct)}%`, background: barTone(pct) }} />
                    </div>
                  )}
                </div>
                <div className="cc-tgross" style={{ color: pct >= 85 ? "var(--cc-good)" : "#fff" }}>
                  {formatCurrency(ev.revenue)}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ══ Where the money went ═════════════════════════════════════════ */}
      <div className="cc-kpis">
        {[
          { icon: "$", label: "Gross, all time", value: formatCurrency(data.totalRevenue), delta: `${data.totalTicketsSold.toLocaleString()} tickets`, deltaTone: "var(--cc-w40)", note: "Net of refunds and disputes — settlement_ledger, the same source the settlements screen reads." },
          { icon: "◆", label: "Face value", value: formatCurrency(data.faceValue), delta: `${formatCurrency(data.avgTicket)} avg`, deltaTone: "var(--cc-w40)", note: "The artist's number. Fees, tax and the card surcharge backed out." },
          { icon: "▣", label: "Net to venue", value: formatCurrency(data.netToVenue), delta: `${formatCurrency(data.taxCollected)} tax held`, deltaTone: "var(--cc-w40)", note: "After the platform's service fee and what the card actually cost." },
          { icon: "✓", label: "Fees retained", value: formatCurrency(data.ticketingFees + data.facilityFees), delta: `${formatCurrency(data.cardFees)} card cost`, deltaTone: "var(--cc-good)", note: "Service plus facility. Card cost is Stripe's real deduction where it is known, the billed surcharge where it is not." },
        ].map((k) => (
          <div key={k.label} className="cc-card">
            <div className="cc-kpi-icon">{k.icon}</div>
            <div className="cc-kpi-label">{k.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
              <div className="cc-kpi-value">{k.value}</div>
              <div className="cc-kpi-delta" style={{ color: k.deltaTone }}>{k.delta}</div>
            </div>
            <div className="cc-note" style={{ marginTop: 9 }}>{k.note}</div>
          </div>
        ))}
      </div>

      {/* ══ Lower grid ═══════════════════════════════════════════════════ */}
      <div className="cc-lower">

        {/* Where the gross splits */}
        <div className="cc-card">
          <div className="cc-eyebrow">Where the gross splits</div>
          <div style={{ fontSize: 10.5, color: "var(--cc-w32)", marginTop: 3 }}>face → fees → tax → card</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 16 }}>
            {[
              { label: "Face value", value: data.faceValue, fill: "linear-gradient(90deg, rgba(255,255,255,0.88), rgba(255,255,255,0.55))" },
              { label: "Service fee", value: data.ticketingFees, fill: "linear-gradient(90deg, rgba(255,255,255,0.62), rgba(255,255,255,0.38))" },
              { label: "Facility fee", value: data.facilityFees, fill: "linear-gradient(90deg, rgba(255,255,255,0.48), rgba(255,255,255,0.28))" },
              { label: "Tax collected", value: data.taxCollected, fill: "linear-gradient(90deg, rgba(255,255,255,0.40), rgba(255,255,255,0.22))" },
              { label: "Card processing", value: data.cardFees, fill: "linear-gradient(90deg, #8fd6a8, rgba(143,214,168,0.45))" },
            ].map((m) => {
              const pct = data.totalRevenue > 0 ? (m.value / data.totalRevenue) * 100 : 0;
              return (
                <div key={m.label} className="cc-motion-row">
                  <div className="cc-motion-label">{m.label}</div>
                  <div className="cc-motion-track"><span style={{ width: `${Math.min(100, pct)}%`, background: m.fill }} /></div>
                  <div className="cc-motion-value">{formatCurrency(m.value)}</div>
                </div>
              );
            })}
          </div>
          <div className="cc-split" style={{ marginTop: 18, paddingTop: 15, borderTop: "1px solid rgba(255,255,255,0.10)" }}>
            <div>
              <div className="cc-split-label">Paid tickets</div>
              <div className="cc-split-value">{data.paidTickets.toLocaleString()}</div>
            </div>
            <div>
              <div className="cc-split-label">Comped</div>
              <div className="cc-split-value" style={{ color: "var(--cc-w72)" }}>{data.compedTickets.toLocaleString()}</div>
              <div className="cc-split-sub">no revenue, real capacity</div>
            </div>
            <div>
              <div className="cc-split-label">Refunded</div>
              <div className="cc-split-value" style={{ color: data.refunds > 0 ? "var(--cc-warn)" : "var(--cc-w72)" }}>{formatCurrency(data.refunds)}</div>
              <div className="cc-split-sub">already netted off gross</div>
            </div>
          </div>
        </div>

        {/* Needs a decision */}
        <div className="cc-card">
          <div className="cc-eyebrow">Needs a decision</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
            {queue.length === 0 && (
              <div className="cc-note">
                Nothing pacing badly and no show missing tiers. This list is derived from what is on this page,
                so it stays empty until one of those numbers says otherwise.
              </div>
            )}
            {queue.slice(0, 6).map((q) => (
              <Link key={q.title} href={q.href} className="cc-queue-item">
                <span style={{ width: 3, alignSelf: "stretch", borderRadius: 999, background: q.tone, flex: "none" }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="cc-queue-title">{q.title}</div>
                  <div className="cc-queue-body">{q.body}</div>
                </div>
                <div className="cc-queue-age">{q.age}</div>
              </Link>
            ))}
          </div>
        </div>

        {/* Latest sales */}
        <div className="cc-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="cc-eyebrow">Latest sales</div>
            <span style={{ flex: 1 }} />
            <Link href="/admin/orders" style={{ fontSize: 10.5, color: "var(--cc-w50)", textDecoration: "none" }}>All orders →</Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 14 }}>
            {data.recentOrders.length === 0 && <div className="cc-note">No orders yet.</div>}
            {data.recentOrders.slice(0, 8).map((o) => (
              <div key={o.id} className="cc-feedrow">
                <div className="cc-feed-time">{timeAgo(o.createdAt)}</div>
                <div className="cc-feed-what">{o.quantity} × {o.customerName} · {o.eventTitle}</div>
                <div className="cc-feed-amt">{formatCurrency(o.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ Sales over time ══════════════════════════════════════════════ */}
      {data.dailySales.length > 0 && (
        <div className="cc-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="cc-eyebrow">Tickets sold — last 30 days</div>
            <span style={{ flex: 1 }} />
            <div style={{ fontSize: 9.5, color: "var(--cc-w32)" }}>{data.eventNames.length} show{data.eventNames.length === 1 ? "" : "s"}</div>
          </div>
          <div style={{ height: 240, marginTop: 16 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.dailySales as Record<string, string | number>[]}>
                <defs>
                  {data.eventNames.map((name, i) => (
                    <linearGradient key={name} id={`cc-g-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.30)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.30)" fontSize={10} tickLine={false} axisLine={false} width={28} />
                <Tooltip
                  contentStyle={{ background: "rgba(16,16,18,0.96)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 12, fontSize: 12 }}
                  labelStyle={{ color: "rgba(255,255,255,0.55)" }}
                />
                <Legend wrapperStyle={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)" }} />
                {data.eventNames.map((name, i) => (
                  <Area
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stackId="1"
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={1.5}
                    fill={`url(#cc-g-${i})`}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
