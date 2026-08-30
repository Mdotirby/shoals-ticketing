"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";
import { formatEventDateShort } from "@/lib/dates";

type EventOption = {
  id: string;
  title: string;
  venue: string;
  date: string;
  image_url: string | null;
};

const GOLD = "#ffffff";

export default function LivePulsePickerPage() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const venueId = getCookie("venue-id");
    const params = venueId ? `?venue_id=${venueId}` : "";
    fetch(`/api/events${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          // Sort by date, upcoming first
          const sorted = data
            .filter((e: EventOption) => new Date(e.date) >= new Date(Date.now() - 24 * 60 * 60 * 1000))
            .sort((a: EventOption, b: EventOption) => new Date(a.date).getTime() - new Date(b.date).getTime());
          setEvents(sorted);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="admin-dashboard">
      <div className="dash-header">
        <div>
          <h1 className="admin-page-title">Live Show Pulse</h1>
          <p className="dash-subtitle">Select an event to view real-time show day analytics</p>
        </div>
      </div>

      {loading && (
        <div className="dash-loading-state">
          <div className="dash-spinner" />
          <p>Loading events...</p>
        </div>
      )}

      {!loading && events.length === 0 && (
        <div className="dash-empty-state" style={{ padding: 40 }}>
          <p>No upcoming events found. Create an event first.</p>
        </div>
      )}

      {!loading && events.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 16,
        }}>
          {events.map((event) => {
            const isToday = new Date(event.date).toDateString() === new Date().toDateString();
            return (
              <Link
                key={event.id}
                href={`/admin/live/${event.id}`}
                style={{
                  display: "block",
                  background: "rgba(255,255,255,0.03)",
                  border: isToday ? `1px solid rgba(34,197,94,0.4)` : "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 12,
                  padding: 20,
                  textDecoration: "none",
                  transition: "border-color 0.2s, background 0.2s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h3 style={{ color: "#fff", fontSize: 16, fontWeight: 700, margin: 0 }}>
                      {event.title}
                    </h3>
                    <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: "6px 0 0" }}>
                      {event.venue} · {formatEventDateShort(event.date)}
                    </p>
                  </div>
                  {isToday && (
                    <span style={{
                      background: "rgba(34,197,94,0.15)",
                      color: "#22c55e",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: 20,
                      border: "1px solid rgba(34,197,94,0.3)",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}>
                      TODAY
                    </span>
                  )}
                </div>
                <div style={{
                  marginTop: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: GOLD,
                  fontSize: 13,
                  fontWeight: 600,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    <polyline points="17 6 23 6 23 12" />
                  </svg>
                  View Live Pulse
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
