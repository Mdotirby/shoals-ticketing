"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useVenue } from "@/app/components/VenueContext";

const GOLD = "#ffffff";

type PrivateEvent = {
  id: string;
  title: string;
  venue: string;
  date: string;
  booking_status: string;
  contact_name: string;
  contact_email: string;
  event_type: string;
};

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    confirmed: "#22c55e", hold: "#f59e0b", cancelled: "#ef4444",
  };
  const bg = colors[status] ?? "#6b7280";
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, textTransform: "uppercase",
      background: `${bg}22`, color: bg, border: `1px solid ${bg}44`,
    }}>
      {status}
    </span>
  );
}

function safeFormatDate(d: string) {
  if (!d) return "—";
  return new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export default function PrivateEventsListPage() {
  const [events, setEvents] = useState<PrivateEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/events");
        if (res.ok) {
          const data = await res.json();
          // Filter to only private events
          const privateEvents = (data.events || data || []).filter(
            (e: PrivateEvent) => e.event_type === "private"
          );
          setEvents(privateEvents);
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ color: GOLD, margin: 0, fontSize: "1.5rem" }}>Private Events</h1>
        <Link
          href="/admin/events/new"
          style={{
            background: GOLD, color: "#0b0d1d", border: "none", borderRadius: 8,
            padding: "10px 20px", fontWeight: 700, fontSize: 14, textDecoration: "none",
          }}
        >
          + New Event
        </Link>
      </div>

      {loading && <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading...</p>}

      {!loading && events.length === 0 && (
        <div style={{
          textAlign: "center", padding: "60px 20px",
          background: "rgba(255,255,255,0.02)", borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 15, marginBottom: 12 }}>
            No private events yet.
          </p>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            Create a new event and set its type to &quot;Private&quot; to get started.
          </p>
        </div>
      )}

      {events.map((event) => (
        <Link
          key={event.id}
          href={`/admin/private-events/${event.id}`}
          style={{ textDecoration: "none" }}
        >
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: 10,
            padding: "16px 20px",
            marginBottom: 12,
            cursor: "pointer",
            transition: "border-color 0.2s",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>{event.title}</span>
                {event.contact_name && (
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginLeft: 12 }}>
                    {event.contact_name}
                  </span>
                )}
              </div>
              {statusBadge(event.booking_status || "confirmed")}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              <span>{safeFormatDate(event.date)}</span>
              <span>{event.venue}</span>
              {event.contact_email && <span>{event.contact_email}</span>}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
