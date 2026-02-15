"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Event } from "@/lib/types/event";
import { getCookie } from "@/lib/cookies";

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const venueId = getCookie("venue-id");
    const params = new URLSearchParams({ all: "1" });
    if (venueId) params.set("venue_id", venueId);

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
  }, []);

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
        <Link href="/admin/events/new" className="admin-header-btn">
          + Create Event
        </Link>
      </div>

      {loading && (
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading events…</p>
      )}

      {!loading && events.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>
          No events yet. Click &quot;+ Create Event&quot; to add one.
        </p>
      )}

      {!loading && events.length > 0 && (
        <div className="admin-events-list">
          {events.map((ev) => (
            <div key={ev.id} className="admin-event-card">
              <div className="admin-event-info">
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
                  <span className={`admin-event-status status-${ev.status || "published"}`}>
                    {ev.status || "published"}
                  </span>
                </div>
              </div>
              <div className="admin-event-actions">
                <span className="admin-event-price">
                  ${ev.price?.toFixed(2)}
                </span>
                <Link
                  href={`/admin/events/${ev.id}/edit`}
                  className="admin-sponsor-edit-btn"
                >
                  Edit
                </Link>
                <button
                  className="admin-sponsor-delete-btn"
                  onClick={() => handleDelete(ev.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
