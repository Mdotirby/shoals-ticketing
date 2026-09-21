"use client";

/**
 * Marketing — Campaigns tab, rebuilt on the shared primitives against
 * handoff/screens/marketing.dc.html.
 *
 * Restyle only: the /api/marketing/event-performance fetch, the
 * all/upcoming/past filter, the search and the click-through to the per-show
 * marketing page are unchanged. The Tailwind grey card grid becomes the
 * design's glass table.
 *
 * The design's table is campaigns with spend and ROAS. Nothing here records a
 * campaign or its spend against a show, so the rows stay what the endpoint
 * actually returns — shows — and no ROAS is shown rather than one invented.
 *
 * The money column is labelled "Order revenue", not gross: the endpoint sums
 * orders.total_amount, which doesn't net refunds and won't match the
 * settlement ledger (PHASE1B rule 1). Repointing it is its own change.
 */

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  DataTable,
  EmptyState,
  Kpi,
  KpiRow,
  Meter,
  Segmented,
  Spacer,
  Toolbar,
  fmtUSD,
} from "@/app/components/admin/ui";

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

function fmtDate(dateStr: string) {
  if (!dateStr) return "TBD";
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const fmtNumber = (n: number) => new Intl.NumberFormat("en-US").format(n);

// Broadcasts is a sibling tab now, so it isn't repeated here.
const marketingTools = [
  { title: "Email KPIs", href: "/admin/marketing/email-kpis", desc: "Open rates, click rates and delivery" },
  { title: "FWB loyalty hub", href: "/admin/marketing/fwb", desc: "Loyalty program, tiers and rewards" },
  { title: "Ad spend", href: "/admin/marketing/ad-spend", desc: "Meta ad spend and ROAS" },
  { title: "Social media", href: "/admin/marketing/social", desc: "Social engagement metrics" },
  { title: "Demographics", href: "/admin/marketing/demographics", desc: "Audience insights and segments" },
  { title: "LFV analytics", href: "/admin/marketing/lfv", desc: "Lifetime fan value" },
  { title: "FWB import", href: "/admin/marketing/fwb-import", desc: "Import newsletter subscribers to FWB" },
];

type Filter = "all" | "upcoming" | "past";

export default function MarketingHubPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventPerf[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

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

  const filtered = useMemo(() => {
    let list = events;
    if (filter === "upcoming") list = list.filter((e) => !e.is_past);
    if (filter === "past") list = list.filter((e) => e.is_past);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) => (e.title || "").toLowerCase().includes(q) || (e.venue || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [events, filter, search]);

  const totalRevenue = events.reduce((s, e) => s + e.total_revenue, 0);
  const avgPercent =
    events.length > 0 ? Math.round(events.reduce((s, e) => s + e.percent_sold, 0) / events.length) : 0;
  const totalSold = events.reduce((s, e) => s + e.total_sold, 0);
  const upcoming = events.filter((e) => !e.is_past).length;

  return (
    <div className="mkt">
      <KpiRow>
        <Kpi label="Shows" value={fmtNumber(events.length)} sub={`${upcoming} upcoming`} />
        <Kpi label="Tickets sold" value={fmtNumber(totalSold)} />
        <Kpi label="Avg sell-through" value={`${avgPercent}%`} sub="across every show listed" />
        <Kpi label="Order revenue" value={fmtUSD(totalRevenue)} sub="order totals, before refunds" />
      </KpiRow>

      <Card
        title="Show performance"
        count={loading ? undefined : filtered.length}
        sub="Open a show for its tracking links, drop and page views"
      >
        <div className="mkt-toolbar">
          <Toolbar>
            <input
              type="search"
              className="mkt-search"
              placeholder="Search shows or venues"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search shows"
            />
            <Spacer />
            <Segmented<Filter>
              options={[
                { value: "all", label: "All" },
                { value: "upcoming", label: "Upcoming" },
                { value: "past", label: "Past" },
              ]}
              value={filter}
              onChange={setFilter}
            />
          </Toolbar>
        </div>

        {loading ? (
          <div className="mkt-state">Loading shows…</div>
        ) : error ? (
          <div className="mkt-state mkt-state--bad">{error}</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No shows found"
            description={search ? "Try a different search." : "Shows appear here once they're created."}
          />
        ) : (
          <DataTable
            columns={[
              "Show",
              "Date",
              <span key="s" className="mkt-num">Sold</span>,
              "Sell-through",
              <span key="v" className="mkt-num">Page views</span>,
              <span key="d" className="mkt-num">Drop</span>,
              <span key="r" className="mkt-num">Order revenue</span>,
            ]}
          >
            {filtered.map((e) => (
              <tr
                key={e.id}
                className="mkt-row"
                onClick={() => router.push(`/admin/marketing/events/${e.id}`)}
              >
                <td>
                  <div className="mkt-show">
                    <span
                      className="mkt-thumb"
                      style={e.image_url ? { backgroundImage: `url(${e.image_url})` } : undefined}
                    />
                    <span className="mkt-show-text">
                      <span className="mkt-show-name">{e.title || "Untitled event"}</span>
                      <span className="mkt-show-venue">{e.venue || "—"}</span>
                    </span>
                  </div>
                </td>
                <td className="mkt-date">
                  {fmtDate(e.date)}
                  <span className={e.is_past ? "mkt-when" : "mkt-when mkt-when--live"}>
                    {e.is_past ? "Past" : "Upcoming"}
                  </span>
                </td>
                <td className="mkt-num">
                  {fmtNumber(e.total_sold)}
                  {e.total_capacity > 0 && <span className="mkt-of"> / {fmtNumber(e.total_capacity)}</span>}
                </td>
                <td className="mkt-meter">
                  <Meter percent={e.percent_sold} tone={e.percent_sold >= 70 ? "good" : "neutral"} />
                  <span>{e.percent_sold}%</span>
                </td>
                <td className="mkt-num">{fmtNumber(e.page_views)}</td>
                <td className="mkt-num">{fmtNumber(e.drop_count)}</td>
                <td className="mkt-num mkt-money">{fmtUSD(e.total_revenue)}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <Card title="Marketing tools">
        <div className="mkt-tools">
          {marketingTools.map((tool) => (
            <Link key={tool.href} href={tool.href} className="mkt-tool">
              <span className="mkt-tool-text">
                <span className="mkt-tool-title">{tool.title}</span>
                <span className="mkt-tool-desc">{tool.desc}</span>
              </span>
              <span className="mkt-tool-go" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
