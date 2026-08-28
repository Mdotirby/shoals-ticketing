"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Event } from "@/lib/types/event";
import { getCookie } from "@/lib/cookies";
import {
  compareEventsForDisplay,
  formatEventDateShort as formatDate,
  isEventPast,
  isEventToday,
} from "@/lib/dates";

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
  const [bookingStatusFilter, setBookingStatusFilter] = useState("all");
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    const venueId = getCookie("venue-id");
    const params = new URLSearchParams({ all: "1" });
    if (venueId) params.set("venue_id", venueId);
    if (eventTypeFilter !== "all") params.set("event_type", eventTypeFilter);
    if (bookingStatusFilter !== "all") {
      params.set("booking_status", bookingStatusFilter);
    } else {
      // Only hide holds by default when no explicit status filter is picked —
      // an explicit "Hold" selection should actually show hold events.
      params.set("exclude_holds", "1");
    }

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
  }, [eventTypeFilter, bookingStatusFilter]);

  // `all=1` is what carries the type/status filters, but it also returns past
  // shows, date-ascending — which buried tonight's show under every dead one.
  // Split it here instead: today first, then upcoming, past behind a toggle.
  const pastCount = events.filter((ev) => isEventPast(ev.date)).length;
  const visibleEvents = (showPast ? events : events.filter((ev) => !isEventPast(ev.date)))
    .slice()
    .sort(compareEventsForDisplay);

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

      {/* Event Type / Booking Status Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <select
          className="admin-form-input"
          value={eventTypeFilter}
          onChange={(e) => setEventTypeFilter(e.target.value)}
          style={{ maxWidth: 200 }}
        >
          <option value="all">All Events</option>
          <option value="hard_ticket">Hard Ticket</option>
          <option value="private">Private</option>
          <option value="non_ticketed">Non-Ticketed</option>
        </select>
        <select
          className="admin-form-input"
          value={bookingStatusFilter}
          onChange={(e) => setBookingStatusFilter(e.target.value)}
          style={{ maxWidth: 200 }}
        >
          <option value="all">All Statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="hold">Hold</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {pastCount > 0 && (
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            className="admin-header-btn admin-header-btn-outline"
            style={{ whiteSpace: "nowrap" }}
          >
            {showPast ? "Hide past events" : `Show past events (${pastCount})`}
          </button>
        )}
      </div>

      {loading && (
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading events…</p>
      )}

      {!loading && visibleEvents.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>
          {pastCount > 0 && !showPast
            ? "No active or upcoming events. Use “Show past events” to see the archive."
            : "No events found. Click “+ Create Event” to add one."}
        </p>
      )}

      {!loading && visibleEvents.length > 0 && (
        <div className="admin-events-list">
          {visibleEvents.map((ev) => {
            const eventType = (ev as Record<string, unknown>).event_type as string || "hard_ticket";
            const bookingStatus = (ev as Record<string, unknown>).booking_status as string || "confirmed";
            const statusColor = BOOKING_STATUS_COLORS[bookingStatus] || BOOKING_STATUS_COLORS.confirmed;
            const closedOutAt = (ev as Record<string, unknown>).closed_out_at as string | null | undefined;
            const isClosedOut = !!closedOutAt;

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
                    <h3 className="admin-event-name">
                      {ev.title}
                      {isEventToday(ev.date) && (
                        <span style={{
                          marginLeft: 8, fontSize: 9, padding: "1px 6px", borderRadius: 3,
                          background: "rgba(208,194,144,0.18)", color: "#d0c290",
                          fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase",
                          verticalAlign: "middle",
                        }}>
                          Tonight
                        </span>
                      )}
                    </h3>
                    <span className="admin-event-meta">
                      {ev.venue} · {formatDate(ev.date)}
                    </span>
                    <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: 9, padding: "1px 6px", borderRadius: 3,
                        background: "rgba(255,255,255,0.06)",
                        color: "rgba(255,255,255,0.5)",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        lineHeight: "1.4",
                      }}>
                        {EVENT_TYPE_LABELS[eventType] || eventType}
                      </span>
                      <span style={{
                        fontSize: 9, padding: "1px 6px", borderRadius: 3,
                        background: statusColor + "18",
                        color: statusColor,
                        fontWeight: 600,
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        lineHeight: "1.4",
                      }}>
                        {bookingStatus}
                      </span>
                      <span className={`admin-event-status status-${ev.status || "published"}`}>
                        {ev.status || "published"}
                      </span>
                      {isClosedOut && (
                        <span style={{
                          fontSize: 9, padding: "1px 6px", borderRadius: 3,
                          background: "rgba(239,68,68,0.18)",
                          color: "#f87171",
                          fontWeight: 700,
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          lineHeight: "1.4",
                        }}>
                          Closed Out
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="admin-event-actions">
                  {eventType !== 'private' && (
                    <span className="admin-event-price">
                      ${ev.price?.toFixed(2)}
                    </span>
                  )}
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
