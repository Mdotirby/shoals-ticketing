"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

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
          .filter((ev: Record<string, unknown>) => artistEventIds ? artistEventIds!.includes(ev.id as string) : true);

        // Fetch ticket tiers for each event to get capacity + sold count
        const supabase = getSupabaseBrowser();
        const enriched: EventSales[] = await Promise.all(
          filteredEventsData.map(async (ev: Record<string, unknown>) => {
            const [tiersRes, scanRes, ticketCountRes] = await Promise.all([
              fetch(`/api/events/${ev.id}/ticket-types`).then((r) => r.json()),
              fetch(`/api/events/${ev.id}/drop-count`).then((r) => r.json()).catch(() => ({ scanned: 0 })),
              supabase.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", ev.id as string),
            ]);
            const tiers = Array.isArray(tiersRes) ? tiersRes : [];
            const totalCapacity = tiers.reduce((s: number, t: { capacity: number }) => s + (t.capacity || 0), 0);
            return {
              id: ev.id as string,
              title: ev.title as string,
              venue: ev.venue as string,
              date: ev.date as string,
              venue_id: ev.venue_id as string | null,
              total_capacity: totalCapacity || 500,
              tickets_sold: ticketCountRes.count || 0,
              tickets_scanned: scanRes?.scanned || 0,
            };
          })
        );

        setEvents(enriched);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    loadSales();
  }, [isOwner, isArtist]);

  const filteredEvents = venueFilter
    ? events.filter((e) => e.venue_id === venueFilter)
    : events;

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Sales</h1>
        {isOwner && venues.length > 1 && (
          <select
            className="admin-form-input admin-venue-filter-select"
            value={venueFilter}
            onChange={(e) => setVenueFilter(e.target.value)}
          >
            <option value="">All Venues</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        )}
      </div>

      {loading && <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>}

      {!loading && filteredEvents.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>No events found.</p>
      )}

      {!loading && filteredEvents.map((ev) => {
        const pct = ev.total_capacity > 0
          ? Math.min(100, Math.round((ev.tickets_sold / ev.total_capacity) * 100))
          : 0;
        const available = ev.total_capacity - ev.tickets_sold;

        return (
          <Link
            key={ev.id}
            href={`/admin/orders/${ev.id}`}
            className="sales-event-card"
          >
            <div className="sales-event-info">
              <h3 className="sales-event-name">{ev.title}</h3>
              <span className="sales-event-meta">
                {ev.venue} · {((d: string) => (d && d.length === 10 && d[4] === "-") ? new Date(d + "T12:00:00") : new Date(d.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, "")))(ev.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            </div>
            <div className="sales-event-stats">
              <div className="sales-stat">
                <span className="sales-stat-value">{ev.tickets_sold}</span>
                <span className="sales-stat-label">Sold</span>
              </div>
              <div className="sales-stat">
                <span className="sales-stat-value">{available}</span>
                <span className="sales-stat-label">Available</span>
              </div>
              {/* Drop Count Donut */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 56 }}>
                <DropCountDonut sold={ev.tickets_sold} scanned={ev.tickets_scanned} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Drop</span>
              </div>
              {/* Sold Percentage Donut */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 56 }}>
                <SoldDonut sold={ev.tickets_sold} capacity={ev.total_capacity} />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/** SVG donut chart: gold ring = drop count (scanned), white number in center */
function DropCountDonut({ sold, scanned }: { sold: number; scanned: number }) {
  const size = 48;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const pct = sold > 0 ? Math.min(scanned / sold, 1) : 0;
  const offset = circ * (1 - pct) + circ * 0.25;

  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke="#d0c290" strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        fill="#ffffff" fontSize="12" fontWeight="700"
      >
        {scanned}
      </text>
    </svg>
  );
}

/** SVG donut chart: sold percentage with white % in center */
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
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={isSoldOut ? "#ff6b6b" : "#d0c290"} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        fill="#ffffff" fontSize="11" fontWeight="700"
      >
        {pctDisplay}%
      </text>
    </svg>
  );
}
