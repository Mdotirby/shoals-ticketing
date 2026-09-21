"use client";

/**
 * Live Show Pulse picker — rebuilt on the shared primitives
 * (app/components/admin/ui.tsx) against design/liquid-glass/admin_live_list.png
 * and admin_live_list_mobile.png.
 *
 * Restyle only: the event fetch, the "upcoming since yesterday" filter and the
 * date sort are unchanged. The mockup's card grid is the shared Grid + Card,
 * which drops to two columns at 900px and one at 680px.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";
import { formatEventDateShort } from "@/lib/dates";
import { Card, EmptyState, Grid, PageHeader, StatusBadge } from "@/app/components/admin/ui";

type EventOption = {
  id: string;
  title: string;
  venue: string;
  date: string;
  image_url: string | null;
};

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
    <>
      <PageHeader
        title="Live Show Pulse"
        sub="Select an event to view real-time show day analytics."
      />

      {loading && <p className="ui-intro">Loading events…</p>}

      {!loading && events.length === 0 && (
        <Card>
          <EmptyState title="No upcoming events" description="Create an event first." />
        </Card>
      )}

      {!loading && events.length > 0 && (
        <Grid cols={3}>
          {events.map((event) => {
            const isToday = new Date(event.date).toDateString() === new Date().toDateString();
            return (
              <Link
                key={event.id}
                href={`/admin/live/${event.id}`}
                className="card"
                style={{ textDecoration: "none", color: "inherit", display: "block" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{event.title}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.44)", marginTop: 5 }}>
                      {event.venue} · {formatEventDateShort(event.date)}
                    </div>
                  </div>
                  {isToday && <StatusBadge variant="live">Today</StatusBadge>}
                </div>
                <div
                  style={{
                    marginTop: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 650,
                    color: "#fff",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    <polyline points="17 6 23 6 23 12" />
                  </svg>
                  View Live Pulse
                </div>
              </Link>
            );
          })}
        </Grid>
      )}
    </>
  );
}
