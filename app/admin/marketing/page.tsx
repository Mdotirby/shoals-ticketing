"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface EventPerf {
  id: string;
  title: string;
  date: string;
  venue: string;
  image_url: string | null;
  status: string;
  event_type: string;
  total_sold: number;
  total_capacity: number;
  total_available: number;
  percent_sold: number;
  drop_count: number;
  page_views: number;
  total_revenue: number;
  is_past: boolean;
}

/* ------------------------------------------------------------------ */
/*  Donut Chart                                                        */
/* ------------------------------------------------------------------ */

function DonutChart({ percent, size = 60 }: { percent: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const color = percent >= 70 ? "#10b981" : percent >= 30 ? "#f59e0b" : "#ef4444";

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#374151"
        strokeWidth="6"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize="12"
        fontWeight="bold"
        className="transform rotate-90"
        style={{ transformOrigin: "center" }}
      >
        {percent}%
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtDate(dateStr: string) {
  if (!dateStr) return "TBD";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

/* ------------------------------------------------------------------ */
/*  Marketing Tools Config                                             */
/* ------------------------------------------------------------------ */

const marketingTools = [
  {
    emoji: "📊",
    title: "Email KPIs",
    href: "/admin/marketing/email-kpis",
    desc: "Track open rates, click rates, and delivery",
  },
  {
    emoji: "🏆",
    title: "FWB Loyalty Hub",
    href: "/admin/marketing/fwb",
    desc: "Manage loyalty program, tiers, and rewards",
  },
  {
    emoji: "📧",
    title: "Newsletter",
    href: "/admin/marketing/newsletters",
    desc: "Create and send email newsletters",
  },
  {
    emoji: "🎨",
    title: "Email Templates",
    href: "/admin/marketing/templates",
    desc: "Design email templates",
  },
  {
    emoji: "📢",
    title: "Campaigns",
    href: "/admin/marketing/campaigns",
    desc: "Manage marketing campaigns",
  },
  {
    emoji: "⚡",
    title: "Automations",
    href: "/admin/marketing/automations",
    desc: "Set up automated email flows",
  },
  {
    emoji: "💰",
    title: "Ad Spend",
    href: "/admin/marketing/ad-spend",
    desc: "Track Meta ad spend and ROAS",
  },
  {
    emoji: "📱",
    title: "Social Media",
    href: "/admin/marketing/social",
    desc: "Monitor social engagement metrics",
  },
  {
    emoji: "👥",
    title: "Demographics",
    href: "/admin/marketing/demographics",
    desc: "Audience insights and segments",
  },
  {
    emoji: "📈",
    title: "LFV Analytics",
    href: "/admin/marketing/lfv",
    desc: "Lifetime fan value analysis",
  },
  {
    emoji: "👤",
    title: "FWB Import",
    href: "/admin/marketing/fwb-import",
    desc: "Import newsletter subscribers to FWB",
  },
];

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function MarketingHubPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventPerf[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("all");

  useEffect(() => {
    fetch("/api/marketing/event-performance")
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load events");
        const data = await r.json();
        setEvents(data.events || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  /* Derived data */
  const filtered = useMemo(() => {
    let list = events;
    if (filter === "upcoming") list = list.filter((e) => !e.is_past);
    if (filter === "past") list = list.filter((e) => e.is_past);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          (e.title || "").toLowerCase().includes(q) ||
          (e.venue || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [events, filter, search]);

  const totalRevenue = events.reduce((s, e) => s + e.total_revenue, 0);
  const avgPercent =
    events.length > 0
      ? Math.round(events.reduce((s, e) => s + e.percent_sold, 0) / events.length)
      : 0;
  const totalSold = events.reduce((s, e) => s + e.total_sold, 0);

  return (
    <div className="min-h-screen text-white p-8 md:p-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold mb-1">Marketing Hub</h1>
        <p className="text-gray-400 text-sm">
          Event performance, campaigns, and audience insights
        </p>
      </div>

      {/* Summary Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Total Events</p>
          <p className="text-2xl font-bold">{fmtNumber(events.length)}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Total Revenue</p>
          <p className="text-2xl font-bold text-green-400">{fmtCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Total Sold</p>
          <p className="text-2xl font-bold">{fmtNumber(totalSold)}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Avg % Sold</p>
          <p className="text-2xl font-bold">{avgPercent}%</p>
        </div>
      </div>

      {/* Event Performance Section */}
      <div className="mb-12">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <h2 className="text-xl font-semibold">Event Performance</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <input
              type="text"
              placeholder="Search events..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 w-full sm:w-64"
            />
            {/* Filter */}
            <div className="flex rounded-lg overflow-hidden border border-gray-700">
              {(["all", "upcoming", "past"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-2 text-xs font-medium capitalize transition-colors ${
                    filter === f
                      ? "bg-gray-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg mb-2">No events found</p>
            <p className="text-sm">
              {search ? "Try adjusting your search" : "Events will appear here once created"}
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {filtered.map((event) => (
              <div
                key={event.id}
                onClick={() => router.push(`/admin/marketing/events/${event.id}`)}
                className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden cursor-pointer transition-all hover:border-gray-500 hover:shadow-lg hover:shadow-black/20 group flex flex-row sm:flex-col"
              >
                {/* Event Image — compact on mobile, full on desktop */}
                <div className="w-24 sm:w-full h-full sm:h-36 relative overflow-hidden flex-shrink-0">
                  {event.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={event.image_url}
                      alt={event.title || "Event"}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center min-h-[80px] sm:min-h-0">
                      <span className="text-2xl sm:text-4xl opacity-30">🎵</span>
                    </div>
                  )}
                  {/* Status badge */}
                  <span
                    className={`absolute top-2 right-2 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full hidden sm:inline ${
                      event.is_past
                        ? "bg-gray-900/80 text-gray-400"
                        : "bg-green-900/80 text-green-400"
                    }`}
                  >
                    {event.is_past ? "Past" : "Upcoming"}
                  </span>
                </div>

                {/* Card Body */}
                <div className="p-3 sm:p-4 flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 sm:mb-1">
                    <h3 className="font-bold text-xs sm:text-sm truncate group-hover:text-white flex-1">
                      {event.title || "Untitled Event"}
                    </h3>
                    {/* Mobile-only inline badge */}
                    <span
                      className={`sm:hidden text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                        event.is_past
                          ? "bg-gray-900/80 text-gray-400"
                          : "bg-green-900/80 text-green-400"
                      }`}
                    >
                      {event.is_past ? "Past" : "Live"}
                    </span>
                  </div>
                  <p className="text-gray-400 text-[11px] sm:text-xs mb-0.5 sm:mb-1">{fmtDate(event.date)}</p>
                  <p className="text-gray-500 text-[11px] sm:text-xs truncate mb-2 sm:mb-3">{event.venue || "—"}</p>

                  {/* Stats + Donut — compact on mobile */}
                  <div className="flex items-center gap-3 sm:gap-4">
                    <DonutChart percent={event.percent_sold} size={40} />
                    <div className="flex-1 space-y-0.5 sm:space-y-1 text-[11px] sm:text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Sold</span>
                        <span className="font-medium">
                          {fmtNumber(event.total_sold)}
                          {event.total_capacity > 0 && (
                            <span className="text-gray-500 hidden sm:inline"> / {fmtNumber(event.total_capacity)}</span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Avail</span>
                        <span className="font-medium">{fmtNumber(event.total_available)}</span>
                      </div>
                      <div className="hidden sm:flex justify-between">
                        <span className="text-gray-400">
                          <svg
                            className="inline w-3 h-3 mr-0.5 -mt-0.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                          Drop
                        </span>
                        <span className="font-medium">{fmtNumber(event.drop_count)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Revenue */}
                  <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-gray-700 flex items-center justify-between">
                    <span className="text-green-400 font-semibold text-xs sm:text-sm">
                      {fmtCurrency(event.total_revenue)}
                    </span>
                    <span className="text-gray-500 text-[11px] sm:text-xs group-hover:text-gray-300 transition-colors">
                      Details &rarr;
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Marketing Tools Section */}
      <div>
        <h2 className="text-xl font-semibold mb-6">Marketing Tools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {marketingTools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="bg-gray-800 rounded-xl border border-gray-700 p-5 flex items-start gap-4 transition-all hover:border-gray-500 hover:bg-gray-800/80 group"
            >
              <span className="text-2xl flex-shrink-0 mt-0.5">{tool.emoji}</span>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm mb-1 group-hover:text-white">
                  {tool.title}
                </h3>
                <p className="text-gray-500 text-xs leading-relaxed">{tool.desc}</p>
              </div>
              <span className="text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0 mt-1">
                &rarr;
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
