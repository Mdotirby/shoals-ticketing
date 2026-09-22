"use client";

/**
 * Show list — the second tab of Calendar & shows, built to
 * handoff/screens/calendar.dc.html (calListView): one card, a six-column
 * table — Show, Date, Class, State, Sold, Gross — rows that open the show's
 * workspace, and "+ Create a show" at the foot.
 *
 * Holds are in the list by default, as the design says: a held date is a
 * booking decision, not a draft. Sold and Gross come from
 * /api/admin/events/sales (paid tickets, ledger gross) — the Command Center's
 * figures.
 *
 * Kept from the old list, which the mockup doesn't show: the type / status
 * filters (collapsed behind "Filter") and past shows (behind a toggle at the
 * foot). The per-row delete is gone from here; a show is deleted from its
 * editor, the rental page or the calendar drawer.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Event } from "@/lib/types/event";
import { getCookie } from "@/lib/cookies";
import { compareEventsForDisplay, isEventPast, isEventToday } from "@/lib/dates";
import { Button, Card, Eyebrow, fmtUSD } from "@/app/components/admin/ui";

const CLASS_LABEL: Record<string, string> = {
  hard_ticket: "Hard ticket",
  ticketed: "Hard ticket",
  non_ticketed: "Non-ticketed",
  private: "Private rental",
  co_promote: "Co-promote",
  rental_box_office: "Rental box office",
};
const TICKETED = ["hard_ticket", "ticketed", "co_promote", "rental_box_office"];

type Sales = Record<string, { sold: number; capacity: number; gross: number }>;
type Tone = "good" | "warn" | "bad" | "dim" | "plain";

function stateOf(ev: Event & Record<string, unknown>, s: { sold: number; capacity: number } | undefined): { label: string; tone: Tone } {
  const booking = String(ev.booking_status || "confirmed");
  const type = String(ev.event_type || "hard_ticket");
  if (booking === "cancelled") return { label: "Cancelled", tone: "bad" };
  if (booking === "hold") return { label: ev.hold_level ? `${String(ev.hold_level)} hold` : "Hold", tone: "warn" };
  if (isEventPast(ev.date)) return { label: ev.closed_out_at ? "Closed out" : "Played", tone: "dim" };
  if (isEventToday(ev.date)) return { label: "Tonight", tone: "good" };
  if (!TICKETED.includes(type)) return { label: "Confirmed", tone: type === "private" ? "plain" : "dim" };
  if (ev.status === "draft") return { label: "Draft", tone: "dim" };
  if (s && s.capacity > 0 && s.sold >= s.capacity) return { label: "Sold out", tone: "good" };
  if (s && s.capacity > 0 && s.sold / s.capacity >= 0.9) return { label: "Nearly sold out", tone: "good" };
  return { label: "On sale", tone: "plain" };
}

export default function AdminEventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [bookingStatusFilter, setBookingStatusFilter] = useState("all");
  const [showPast, setShowPast] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [sales, setSales] = useState<Sales>({});

  useEffect(() => {
    const venueId = getCookie("venue-id");
    const params = new URLSearchParams({ all: "1" });
    if (venueId) params.set("venue_id", venueId);
    if (eventTypeFilter !== "all") params.set("event_type", eventTypeFilter);
    if (bookingStatusFilter !== "all") params.set("booking_status", bookingStatusFilter);

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

  // `all=1` also returns past shows, date-ascending — which buried tonight's
  // show under every dead one. Today first, then upcoming, past behind a toggle.
  const pastCount = events.filter((ev) => isEventPast(ev.date)).length;
  const visible = useMemo(
    () => (showPast ? events : events.filter((ev) => !isEventPast(ev.date))).slice().sort(compareEventsForDisplay),
    [events, showPast],
  );

  useEffect(() => {
    const ids = visible.map((e) => e.id).slice(0, 300);
    if (!ids.length) return;
    let live = true;
    fetch(`/api/admin/events/sales?ids=${ids.join(",")}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => live && setSales((prev) => ({ ...prev, ...(d || {}) })))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [visible]);

  const open = (ev: Event & Record<string, unknown>) =>
    router.push(ev.event_type === "private" ? `/admin/private-events/${ev.id}` : `/admin/events/${ev.id}`);

  return (
    <Card className="shl">
      <div className="shl-head">
        <Eyebrow>{showPast ? "All shows — including past" : "All shows — upcoming"}</Eyebrow>
        <span className="filter-spacer" />
        <span className="shl-hint">click a row to open its workspace</span>
        <button type="button" className="shl-filter-btn" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
          Filter {showFilters ? "▾" : "▸"}
        </button>
      </div>

      {showFilters && (
        <div className="shl-filters">
          <select value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)} aria-label="Class">
            <option value="all">Every class</option>
            <option value="hard_ticket">Hard ticket</option>
            <option value="private">Private rental</option>
            <option value="non_ticketed">Non-ticketed</option>
          </select>
          <select value={bookingStatusFilter} onChange={(e) => setBookingStatusFilter(e.target.value)} aria-label="State">
            <option value="all">Every state</option>
            <option value="confirmed">Confirmed</option>
            <option value="hold">Hold</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      )}

      <div className="shl-table" role="table">
        <div className="shl-row shl-row--head" role="row">
          <div>Show</div>
          <div>Date</div>
          <div>Class</div>
          <div>State</div>
          <div className="shl-num">Sold</div>
          <div className="shl-num">Gross</div>
        </div>

        {loading && <div className="shl-empty">Loading shows…</div>}
        {!loading && visible.length === 0 && (
          <div className="shl-empty">
            {pastCount > 0 && !showPast ? "Nothing upcoming — past shows are behind the toggle below." : "No shows match."}
          </div>
        )}

        {!loading &&
          visible.map((raw) => {
            const ev = raw as Event & Record<string, unknown>;
            const s = sales[ev.id];
            const type = String(ev.event_type || "hard_ticket");
            const st = stateOf(ev, s);
            const ticketed = TICKETED.includes(type);
            const date = new Date(String(ev.date).length === 10 ? `${ev.date}T12:00:00` : ev.date);
            return (
              <div
                key={ev.id}
                role="row"
                tabIndex={0}
                className="shl-row"
                onClick={() => open(ev)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") open(ev);
                }}
              >
                <div className="shl-name">{ev.title}</div>
                <div className="shl-date">{date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
                <div className="shl-class">{CLASS_LABEL[type] || type}</div>
                <div className={`shl-state shl-tone-${st.tone}`}>{st.label}</div>
                <div className="shl-num">{ticketed && s && s.capacity > 0 ? `${s.sold.toLocaleString()} / ${s.capacity.toLocaleString()}` : "—"}</div>
                <div className="shl-num shl-gross">{s && s.gross > 0 ? fmtUSD(s.gross, { cents: false }) : "—"}</div>
              </div>
            );
          })}
      </div>

      <div className="shl-foot">
        <Link href="/admin/events/new" className="btn btn-outline">+ Create a show</Link>
        {pastCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowPast((v) => !v)}>
            {showPast ? "Hide past shows" : `Show past shows (${pastCount})`}
          </Button>
        )}
        <span className="filter-spacer" />
        <span className="shl-hint">Holds show in the list too — a held date is a booking decision, not a draft</span>
      </div>
    </Card>
  );
}
