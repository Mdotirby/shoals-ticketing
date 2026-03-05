"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Event } from "@/lib/types/event";
import { getCookie } from "@/lib/cookies";

function safeDate(d: string) { return (d && d.length === 10 && d[4] === "-") ? new Date(d + "T12:00:00") : new Date(d.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, "")); }

function formatDate(date: string) {
  return safeDate(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  hard_ticket: "Hard Ticket",
  ticketed: "Hard Ticket",
  non_ticketed: "Non-Ticketed",
  private: "Private",
};

const BOOKING_STATUS_COLORS: Record<string, string> = {
  confirmed: "#50c878",
  hold: "#ffc832",
  cancelled: "#ff6b6b",
};

export default function AdminEventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventTypeFilter, setEventTypeFilter] = useState("all");

  useEffect(() => {
    const venueId = getCookie("venue-id");
    const params = new URLSearchParams({ all: "1" });
    if (venueId) params.set("venue_id", venueId);
    if (eventTypeFilter !== "all") params.set("event_type", eventTypeFilter);

    setLoading(true);
    fetch(`/api/events?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setEvents(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [eventTypeFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this event? This cannot be undone.")) return;

    const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
    if (res.ok) {
      setEvents((prev) => prev.filter((e) => e.id !== id));
    }
  };

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Events</h1>
        <div className="admin-page-header-actions">
          <Link href="/admin/calendar" className="admin-header-btn admin-header-btn-outline">
            Calendar View
          </Link>
          <Link href="/admin/events/new" className="admin-header-btn">
            + Create Event
          </Link>
        </div>
      </div>

      {/* Event Type Filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { value: "all", label: "All Events" },
          { value: "hard_ticket", label: "Hard Ticket" },
          { value: "private", label: "Private Events" },
          { value: "non_ticketed", label: "Non-Ticketed" },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setEventTypeFilter(opt.value)}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: `1px solid ${eventTypeFilter === opt.value ? "rgba(208,194,144,0.4)" : "rgba(255,255,255,0.1)"}`,
              background: eventTypeFilter === opt.value ? "rgba(208,194,144,0.1)" : "transparent",
              color: eventTypeFilter === opt.value ? "#d0c290" : "rgba(255,255,255,0.5)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading && (
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading events…</p>
      )}

      {!loading && events.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>
          No events found. Click &quot;+ Create Event&quot; to add one.
        </p>
      )}

      {!loading && events.length > 0 && (
        <div className="admin-events-list">
          {events.map((ev) => {
            const eventType = (ev as Record<string, unknown>).event_type as string || "hard_ticket";
            const bookingStatus = (ev as Record<string, unknown>).booking_status as string || "confirmed";
            const statusColor = BOOKING_STATUS_COLORS[bookingStatus] || BOOKING_STATUS_COLORS.confirmed;

            return (
              <div key={ev.id} className="admin-event-card">
                <div className="admin-event-info">
                  {/* Booking status indicator dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: statusColor, flexShrink: 0,
                    marginTop: 6,
                  }} />
                  {ev.image_url && (
                    <div
                      className="admin-event-thumb"
                      style={{ backgroundImage: `url(${ev.image_url})` }}
                    />
                  )}
                  <div>
                    <h3 className="admin-event-name">{ev.title}</h3>
                    <span className="admin-event-meta">
                      {ev.venue} · {formatDate(ev.date)}
                    </span>
                    <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 4,
                        background: "rgba(255,255,255,0.06)",
                        color: "rgba(255,255,255,0.5)",
                      }}>
                        {EVENT_TYPE_LABELS[eventType] || eventType}
                      </span>
                      <span style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 4,
                        background: statusColor + "18",
                        color: statusColor,
                        fontWeight: 600,
                      }}>
                        {bookingStatus}
                      </span>
                      <span className={`admin-event-status status-${ev.status || "published"}`}>
                        {ev.status || "published"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="admin-event-actions">
                  <span className="admin-event-price">
                    ${ev.price?.toFixed(2)}
                  </span>
                  <Link
                    href={eventType === 'private' ? `/admin/private-events/${ev.id}` : `/admin/events/${ev.id}/edit`}
                    className="admin-sponsor-edit-btn"
                  >
                    {eventType === 'private' ? 'Manage' : 'Edit'}
                  </Link>
                  <button
                    className="admin-sponsor-delete-btn"
                    onClick={() => handleDelete(ev.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
