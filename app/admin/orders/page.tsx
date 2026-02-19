"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";

type EventSales = {
  id: string;
  title: string;
  venue: string;
  date: string;
  venue_id: string | null;
  total_capacity: number;
  tickets_sold: number;
};

type VenueOption = { id: string; name: string };

export default function AdminSalesPage() {
  const [events, setEvents] = useState<EventSales[]>([]);
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [venueFilter, setVenueFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const isOwner = getCookie("user-role") === "owner";

  useEffect(() => {
    const venueId = getCookie("venue-id");
    const params = new URLSearchParams({ all: "1" });
    if (venueId) params.set("venue_id", venueId);

    Promise.all([
      fetch(`/api/events?${params}`).then((r) => r.json()),
      isOwner ? fetch("/api/venues").then((r) => r.json()) : Promise.resolve([]),
    ])
      .then(async ([eventsData, venuesData]) => {
        if (Array.isArray(venuesData)) setVenues(venuesData);
        if (!Array.isArray(eventsData)) return;

        // Fetch ticket tiers for each event to get capacity + sold count
        const enriched: EventSales[] = await Promise.all(
          eventsData.map(async (ev: Record<string, unknown>) => {
            const tiersRes = await fetch(`/api/events/${ev.id}/ticket-types`).then((r) => r.json());
            const tiers = Array.isArray(tiersRes) ? tiersRes : [];
            const totalCapacity = tiers.reduce((s: number, t: { capacity: number }) => s + (t.capacity || 0), 0);
            // For now, tickets_sold is estimated from orders (actual count needs tickets table)
            return {
              id: ev.id as string,
              title: ev.title as string,
              venue: ev.venue as string,
              date: ev.date as string,
              venue_id: ev.venue_id as string | null,
              total_capacity: totalCapacity || 500,
              tickets_sold: 0, // Will be populated when webhook is wired
            };
          })
        );

        setEvents(enriched);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOwner]);

  const filteredEvents = venueFilter
    ? events.filter((e) => e.venue_id === venueFilter)
    : events;

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Sales</h1>
        {isOwner && venues.length > 1 && (
          <select
            className="admin-form-input"
            style={{ maxWidth: 200 }}
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
                {ev.venue} · {((d: string) => (d && d.length === 10 && d[4] === "-") ? new Date(d + "T12:00:00") : new Date(d))(ev.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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
              <div className="sales-progress-wrapper">
                <div className="sales-progress-bar">
                  <div
                    className="sales-progress-fill"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="sales-progress-label">
                  {pct}%{pct >= 100 ? " — SOLD OUT" : ""}
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
