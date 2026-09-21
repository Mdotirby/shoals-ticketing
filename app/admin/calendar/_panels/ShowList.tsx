"use client";

/**
 * Events list — rebuilt on the shared primitives
 * (app/components/admin/ui.tsx) against design/liquid-glass/admin_events.png
 * and admin_events_mobile.png.
 *
 * Restyle only: the filter params (including the exclude_holds default), the
 * past/upcoming split, the today-first sort and the delete confirmation are
 * unchanged. The booking-status dot keeps its three colours — they carry
 * meaning (confirmed / hold / cancelled) rather than decoration.
 */

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
import {
  Button,
  Card,
  EmptyState,
  ListRow,
  PageHeader,
  Spacer,
  StatusBadge,
  Tag,
  Toolbar,
  fmtUSD,
} from "@/app/components/admin/ui";

const EVENT_TYPE_LABELS: Record<string, string> = {
  hard_ticket: "Hard Ticket",
  ticketed: "Hard Ticket",
  non_ticketed: "Non-Ticketed",
  private: "Private",
};

const BOOKING_STATUS_COLORS: Record<string, string> = {
  confirmed: "var(--lg-good)",
  hold: "#ffc832",
  cancelled: "var(--lg-bad)",
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
    <>
      <PageHeader
        title="Events"
        actions={
          <>
            <Link href="/admin/calendar" className="btn btn-outline btn-sm">
              Calendar View
            </Link>
            <Link href="/admin/events/new" className="btn btn-primary btn-sm">
              + Create Event
            </Link>
          </>
        }
      />

      <Toolbar>
        <select value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)}>
          <option value="all">All Events</option>
          <option value="hard_ticket">Hard Ticket</option>
          <option value="private">Private</option>
          <option value="non_ticketed">Non-Ticketed</option>
        </select>
        <select value={bookingStatusFilter} onChange={(e) => setBookingStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="hold">Hold</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <Spacer />
        {pastCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => setShowPast((v) => !v)}>
            {showPast ? "Hide past events" : `Show past events (${pastCount})`}
          </Button>
        )}
      </Toolbar>

      {loading && <p className="ui-intro">Loading events…</p>}

      {!loading && visibleEvents.length === 0 && (
        <Card>
          <EmptyState
            title={pastCount > 0 && !showPast ? "No active or upcoming events" : "No events found"}
            description={
              pastCount > 0 && !showPast
                ? "Use “Show past events” to see the archive."
                : "Click “+ Create Event” to add one."
            }
          />
        </Card>
      )}

      {!loading && visibleEvents.length > 0 && (
        <Card flush>
          {visibleEvents.map((ev) => {
            const eventType = ((ev as Record<string, unknown>).event_type as string) || "hard_ticket";
            const bookingStatus =
              ((ev as Record<string, unknown>).booking_status as string) || "confirmed";
            const statusColor = BOOKING_STATUS_COLORS[bookingStatus] || BOOKING_STATUS_COLORS.confirmed;
            const isClosedOut = !!((ev as Record<string, unknown>).closed_out_at as string | null);
            const isPrivate = eventType === "private";

            return (
              <ListRow
                key={ev.id}
                thumbUrl={ev.image_url || undefined}
                title={
                  <>
                    {ev.title}
                    {isEventToday(ev.date) && <StatusBadge variant="live">Tonight</StatusBadge>}
                  </>
                }
                meta={`${ev.venue} · ${formatDate(ev.date)}`}
                badges={
                  <>
                    <Tag>{EVENT_TYPE_LABELS[eventType] || eventType}</Tag>
                    <span className="ui-rowstat" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: statusColor,
                          display: "inline-block",
                        }}
                      />
                      {bookingStatus}
                    </span>
                    <StatusBadge variant={ev.status === "draft" ? "draft" : "live"}>
                      {ev.status || "published"}
                    </StatusBadge>
                    {isClosedOut && <StatusBadge variant="bad">Closed Out</StatusBadge>}
                  </>
                }
                price={isPrivate ? "—" : fmtUSD(ev.price)}
                actions={
                  <>
                    <Link
                      href={isPrivate ? `/admin/private-events/${ev.id}` : `/admin/events/${ev.id}/edit`}
                      className="btn btn-outline btn-sm"
                    >
                      {isPrivate ? "Manage" : "Edit"}
                    </Link>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(ev.id)}>
                      Delete
                    </Button>
                  </>
                }
              />
            );
          })}
        </Card>
      )}
    </>
  );
}
