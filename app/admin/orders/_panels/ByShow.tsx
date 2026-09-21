"use client";

/**
 * Ticket Sales list — rebuilt on the shared primitives
 * (app/components/admin/ui.tsx) against design/liquid-glass/admin_sales.png
 * and admin_sales_mobile.png.
 *
 * Restyle only: the artist-assignment gate, the private-event exclusion, the
 * event-performance enrichment (real seat counts, not ticket_tiers.capacity),
 * the venue filter and the past/upcoming split are all unchanged.
 *
 * The two hand-rolled SVG donuts stay as local components — the shared
 * GaugeRing is a conic-gradient ring sized for dashboards, while these are
 * 48px SVG rings that carry a value in the middle and colour the sold-out
 * case red. Same shape, different job; folding them together would lose that.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import {
  compareEventsForDisplay,
  formatEventDateShort,
  isEventPast,
  isEventToday,
} from "@/lib/dates";
import {
  Button,
  Card,
  EmptyState,
  ListRow,
  ListStat,
  PageHeader,
  Spacer,
  StatusBadge,
  Toolbar,
} from "@/app/components/admin/ui";

type EventSales = {
  id: string;
  title: string;
  venue: string;
  date: string;
  venue_id: string | null;
  total_capacity: number;
  tickets_sold: number;
  tickets_scanned: number;
};

type VenueOption = { id: string; name: string };

export default function AdminSalesPage() {
  const [events, setEvents] = useState<EventSales[]>([]);
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [venueFilter, setVenueFilter] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [loading, setLoading] = useState(true);
  const userRole = getCookie("user-role") || "";
  const isOwner = userRole === "owner";
  const isArtist = userRole === "artist";

  useEffect(() => {
    async function loadSales() {
      const venueId = getCookie("venue-id");

      // If artist, fetch their assigned event IDs first
      let artistEventIds: string[] | null = null;
      if (isArtist) {
        try {
          const supabase = getSupabaseBrowser();
          const { data: authData } = await supabase.auth.getUser();
          if (authData?.user) {
            const res = await fetch(`/api/artists/assignments?artist_id=${authData.user.id}`);
            if (res.ok) {
              const assignments = await res.json();
              artistEventIds = Array.isArray(assignments)
                ? assignments.map((a: { event_id: string }) => a.event_id)
                : [];
            }
          }
        } catch (err) {
          console.error("Failed to fetch artist assignments:", err);
        }

        // If artist has no assignments, show empty
        if (!artistEventIds || artistEventIds.length === 0) {
          setEvents([]);
          setLoading(false);
          return;
        }
      }

      // For artists, skip venue_id filter — fetch all events then filter by assigned IDs
      const params = new URLSearchParams({ all: "1" });
      if (!isArtist && venueId) params.set("venue_id", venueId);

      try {
        const [eventsData, venuesData] = await Promise.all([
          fetch(`/api/events?${params}`).then((r) => r.json()),
          isOwner ? fetch("/api/venues").then((r) => r.json()) : Promise.resolve([]),
        ]);

        if (Array.isArray(venuesData)) setVenues(venuesData);
        if (!Array.isArray(eventsData)) return;

        // Filter to artist's assigned events if applicable, and always exclude private events from sales
        const filteredEventsData = eventsData
          .filter((ev: Record<string, unknown>) => ev.event_type !== "private")
          .filter((ev: Record<string, unknown>) =>
            artistEventIds ? artistEventIds!.includes(ev.id as string) : true
          );

        // Pull real sold/capacity/scanned numbers from the shared performance
        // endpoint — for reserved-seating events this counts the seats table
        // directly rather than ticket_tiers.capacity (a static number that
        // drifts from the real per-section seat count) or orders.quantity
        // (which drifts on refunded-but-reserved or mixed-section orders).
        type PerfEntry = { id: string; total_capacity: number; total_sold: number; drop_count: number };
        const performanceRes: { events?: PerfEntry[] } = await fetch("/api/marketing/event-performance")
          .then((r) => r.json())
          .catch(() => ({ events: [] }));
        const perfById = new Map((performanceRes.events || []).map((p) => [p.id, p]));

        const enriched: EventSales[] = filteredEventsData.map((ev: Record<string, unknown>) => {
          const perf = perfById.get(ev.id as string);
          return {
            id: ev.id as string,
            title: ev.title as string,
            venue: ev.venue as string,
            date: ev.date as string,
            venue_id: ev.venue_id as string | null,
            total_capacity: perf?.total_capacity || 500,
            tickets_sold: perf?.total_sold || 0,
            tickets_scanned: perf?.drop_count || 0,
          };
        });

        setEvents(enriched);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    loadSales();
  }, [isOwner, isArtist]);

  const venueScoped = venueFilter ? events.filter((e) => e.venue_id === venueFilter) : events;

  // Same story as the Events page: `all=1` pulls past shows back in, ascending,
  // so the oldest dead show sat at the top. Today's show leads now.
  const pastCount = venueScoped.filter((e) => isEventPast(e.date)).length;
  const filteredEvents = (showPast ? venueScoped : venueScoped.filter((e) => !isEventPast(e.date)))
    .slice()
    .sort(compareEventsForDisplay);

  return (
    <>
      <PageHeader title="Ticket Sales" sub="Every show's inventory, drop count and sell-through." />

      {((isOwner && venues.length > 1) || pastCount > 0) && (
        <Toolbar>
          {isOwner && venues.length > 1 && (
            <select value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)}>
              <option value="">All Venues</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
          <Spacer />
          {pastCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowPast((v) => !v)}>
              {showPast ? "Hide past shows" : `Show past shows (${pastCount})`}
            </Button>
          )}
        </Toolbar>
      )}

      {loading && <p className="ui-intro">Loading…</p>}

      {!loading && filteredEvents.length === 0 && (
        <Card>
          <EmptyState
            title={pastCount > 0 && !showPast ? "No active or upcoming shows" : "No events found"}
            description={
              pastCount > 0 && !showPast ? "Use “Show past shows” to see the archive." : undefined
            }
          />
        </Card>
      )}

      {!loading && filteredEvents.length > 0 && (
        <Card flush>
          {filteredEvents.map((ev) => (
            <ListRow
              key={ev.id}
              link={Link}
              href={`/admin/orders/${ev.id}`}
              thumb={false}
              title={
                <>
                  {ev.title}
                  {isEventToday(ev.date) && <StatusBadge variant="live">Tonight</StatusBadge>}
                </>
              }
              meta={`${ev.venue} · ${formatEventDateShort(ev.date)}`}
              stats={
                <>
                  <ListStat n={ev.tickets_sold} label="Sold" />
                  <ListStat n={Math.max(0, ev.total_capacity - ev.tickets_sold)} label="Available" />
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 56 }}>
                    <DropCountDonut sold={ev.tickets_sold} scanned={ev.tickets_scanned} />
                    <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.34)", marginTop: 2 }}>Drop</span>
                  </div>
                  <SoldDonut sold={ev.tickets_sold} capacity={ev.total_capacity} />
                </>
              }
            />
          ))}
        </Card>
      )}
    </>
  );
}

/** Ring = share of sold tickets scanned at the door; centre shows the count. */
function DropCountDonut({ sold, scanned }: { sold: number; scanned: number }) {
  const size = 48;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const pct = sold > 0 ? Math.min(scanned / sold, 1) : 0;
  const offset = circ * (1 - pct) + circ * 0.25;

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#ffffff"
        strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize="12" fontWeight="700">
        {scanned}
      </text>
    </svg>
  );
}

/** Ring = sell-through; turns red at 100% so a sold-out show is obvious. */
function SoldDonut({ sold, capacity }: { sold: number; capacity: number }) {
  const size = 48;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const pct = capacity > 0 ? Math.min(sold / capacity, 1) : 0;
  const offset = circ * (1 - pct) + circ * 0.25;
  const pctDisplay = Math.round(pct * 100);
  const isSoldOut = pctDisplay >= 100;

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={isSoldOut ? "var(--lg-bad)" : "#ffffff"}
        strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize="11" fontWeight="700">
        {pctDisplay}%
      </text>
    </svg>
  );
}
