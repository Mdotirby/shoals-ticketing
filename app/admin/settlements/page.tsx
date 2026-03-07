"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";
import { formatEventDateShort } from "@/lib/dates";
import type { Settlement } from "@/lib/types/settlement";

type EventRow = {
  id: string;
  title: string;
  date: string;
  venue: string;
  venue_id?: string;
  status?: string;
};

const STATUS_COLORS: Record<string, string> = {
  none: "status-draft",
  draft: "status-draft",
  finalized: "status-published",
};

export default function AdminSettlementsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const venueId = getCookie("venue-id");
    const evtParams = venueId ? `?venue_id=${venueId}` : "";
    const setParams = venueId ? `?venue_id=${venueId}` : "";

    Promise.all([
      fetch(`/api/events${evtParams}`)
        .then((r) => r.json())
        .catch(() => []),
      fetch(`/api/settlements${setParams}`)
        .then((r) => r.json())
        .catch(() => []),
    ])
      .then(([evtData, setData]) => {
        if (Array.isArray(evtData)) setEvents(evtData);
        if (Array.isArray(setData)) setSettlements(setData);
      })
      .finally(() => setLoading(false));
  }, []);

  const settlementByEvent = new Map<string, Settlement>();
  settlements.forEach((s) => settlementByEvent.set(s.event_id, s));

  const handleCreate = async (eventId: string) => {
    const venueId = getCookie("venue-id");
    const res = await fetch("/api/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId, venue_id: venueId }),
    });
    if (res.ok) {
      const created = await res.json();
      setSettlements((prev) => [...prev, created]);
    }
  };

  // Compute ticket sold count from settlement ticket_audit if available
  const getTicketStats = (eventId: string) => {
    const s = settlementByEvent.get(eventId);
    if (!s || !s.ticket_audit || !Array.isArray(s.ticket_audit)) {
      return { sold: 0, comps: 0, capacity: 0 };
    }
    let sold = 0,
      comps = 0,
      capacity = 0;
    s.ticket_audit.forEach((row) => {
      sold += row.sold || 0;
      comps += row.comps || 0;
      capacity += row.capacity || 0;
    });
    return { sold, comps, capacity };
  };

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Settlements</h1>
      </div>

      {loading && (
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading events…</p>
      )}

      {!loading && events.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>
          No events found. Settlements are created from completed events.
        </p>
      )}

      {!loading && events.length > 0 && (
        <div className="admin-events-list">
          {events.map((evt) => {
            const settlement = settlementByEvent.get(evt.id);
            const status = settlement ? settlement.status : "none";
            const stats = getTicketStats(evt.id);

            return (
              <div key={evt.id} className="admin-event-card">
                <div className="admin-event-info">
                  <div>
                    <h3 className="admin-event-name">{evt.title}</h3>
                    <span className="admin-event-meta">
                      {evt.venue || "—"} · {evt.date ? formatEventDateShort(evt.date) : "No date"}
                    </span>
                    <span
                      className={`admin-event-status ${STATUS_COLORS[status] || "status-draft"}`}
                    >
                      {status === "none" ? "No Settlement" : status}
                    </span>
                    {settlement && (
                      <span
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.45)",
                          marginLeft: 12,
                        }}
                      >
                        {stats.sold} sold · {stats.comps} comps · {stats.capacity} cap
                      </span>
                    )}
                  </div>
                </div>
                <div className="admin-event-actions">
                  {settlement ? (
                    <Link
                      href={`/admin/settlements/${settlement.id}`}
                      className="admin-sponsor-edit-btn"
                    >
                      View Settlement
                    </Link>
                  ) : (
                    <button
                      className="admin-header-btn"
                      onClick={() => handleCreate(evt.id)}
                    >
                      + Create Settlement
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
