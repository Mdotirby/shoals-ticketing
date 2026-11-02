"use client";

/**
 * Ticket Scanner page: pick the show, then scan. The scanner itself is shared
 * with the box office (app/components/scan/TicketScanner.tsx).
 */

import { useEffect, useState } from "react";
import { PageHeader } from "@/app/components/admin/ui";
import TicketScanner from "@/app/components/scan/TicketScanner";
import { isEventToday } from "@/lib/dates";

type EventOption = {
  id: string;
  title: string;
  date: string;
  venue: string;
};

export default function AdminScanPage() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");

  // Load upcoming events on mount
  useEffect(() => {
    fetch("/api/admin/scan/events")
      .then((r) => r.json())
      .then((data: EventOption[]) => {
        setEvents(data ?? []);
        // Venue-local today — a UTC date string stopped matching tonight's show
        // at 7 PM CDT, exactly when door staff need it selected.
        const todayEvent = (data ?? []).find((e) => isEventToday(e.date));
        if (todayEvent) setSelectedEventId(todayEvent.id);
        else if (data.length > 0) setSelectedEventId(data[0].id);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="admin-form-page" style={{ position: "relative", minHeight: "100vh" }}>
      <PageHeader
        title="Ticket Scanner"
        actions={
          events.length > 0 ? (
            <select
              className="scan-event-select"
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} — {ev.date}
                </option>
              ))}
            </select>
          ) : null
        }
      />
      <TicketScanner eventId={selectedEventId} />
    </div>
  );
}
