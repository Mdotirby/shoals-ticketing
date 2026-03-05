"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getCookie } from "@/lib/cookies";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import Link from "next/link";

type CalendarEvent = {
  id: string;
  title: string;
  venue: string;
  date: string;
  end_time: string | null;
  price: number;
  status: string;
  event_type: string | null;
  booking_status: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  calendar_color: string | null;
  image_url: string | null;
  venue_id: string | null;
};

type EventForm = {
  title: string;
  date: string;
  time: string;
  end_time: string;
  venue: string;
  event_type: string;
  booking_status: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  contact_company: string;
  billing_address: string;
  tax_exempt: boolean;
  notes: string;
  calendar_color: string;
  status: string;
  description: string;
};

// Booking status colors (primary color coding for calendar)
const BOOKING_STATUS_COLORS: Record<string, string> = {
  confirmed: "rgba(80,200,120,0.9)",   // green
  hold: "rgba(255,200,50,0.9)",        // yellow
  cancelled: "rgba(255,80,80,0.9)",    // red
};

const BOOKING_STATUS_BG: Record<string, string> = {
  confirmed: "rgba(80,200,120,0.12)",
  hold: "rgba(255,200,50,0.12)",
  cancelled: "rgba(255,80,80,0.12)",
};

// Event type indicator (secondary - shown as small badge)
const EVENT_TYPE_COLORS: Record<string, string> = {
  hard_ticket: "rgba(208,194,144,0.85)",
  ticketed: "rgba(208,194,144,0.85)",    // legacy support
  non_ticketed: "rgba(100,149,237,0.85)",
  private: "rgba(180,100,200,0.85)",
};

const EVENT_TYPE_BG: Record<string, string> = {
  hard_ticket: "rgba(208,194,144,0.15)",
  ticketed: "rgba(208,194,144,0.15)",
  non_ticketed: "rgba(100,149,237,0.15)",
  private: "rgba(180,100,200,0.15)",
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Safely parse a date string into a local-time Date object.
 * Handles both "YYYY-MM-DD" (date-only) and full ISO timestamps.
 * Avoids the timezone pitfall where `new Date("2026-03-15")` is parsed as UTC midnight.
 */
function safeDate(d: string): Date {
  if (!d) return new Date();
  // Date-only string: add noon to avoid UTC-midnight timezone shift
  if (d.length === 10 && d[4] === "-") {
    return new Date(d + "T12:00:00");
  }
  // Full timestamp: strip timezone offset so it's treated as local time
  return new Date(d.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, ""));
}

/** Extract a YYYY-MM-DD key from a date string using local-time-safe parsing */
function dateKey(d: string): string {
  const dt = safeDate(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);
  return isMobile;
}

function emptyForm(dateStr?: string): EventForm {
  return {
    title: "",
    date: dateStr || new Date().toISOString().split("T")[0],
    time: "19:00",
    end_time: "",
    venue: "",
    event_type: "non_ticketed",
    booking_status: "confirmed",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    contact_company: "",
    billing_address: "",
    tax_exempt: false,
    notes: "",
    calendar_color: "",
    status: "published",
    description: "",
  };
}

export default function CalendarPage() {
  const router = useRouter();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  // Venue info
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venueName, setVenueName] = useState("");

  const isMobile = useIsMobile();
  const role = getCookie("user-role");

  // Load venue info
  useEffect(() => {
    async function loadVenue() {
      const supabase = getSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) return;

      const { data: adminRecord } = await supabase
        .from("admin_users")
        .select("venue_id")
        .eq("id", authData.user.id)
        .single();

      if (adminRecord?.venue_id) {
        setVenueId(adminRecord.venue_id);
        const { data: venue } = await supabase
          .from("venues")
          .select("name")
          .eq("id", adminRecord.venue_id)
          .single();
        if (venue) setVenueName(venue.name);
      }
    }
    loadVenue();
  }, []);

  // Fetch events for current month
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ month: currentMonth });
    if (venueId) params.set("venue_id", venueId);

    try {
      const res = await fetch(`/api/calendar?${params}`);
      const data = await res.json();
      if (Array.isArray(data)) setEvents(data);
    } catch (err) {
      console.error("Failed to fetch calendar events:", err);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, venueId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Calendar grid computation
  const calendarDays = useMemo(() => {
    const [year, mon] = currentMonth.split("-").map(Number);
    const firstDay = new Date(year, mon - 1, 1);
    const lastDay = new Date(year, mon, 0);

    const startDayOfWeek = firstDay.getDay(); // 0=Sun
    const daysInMonth = lastDay.getDate();

    const days: { date: Date; inMonth: boolean }[] = [];

    // Previous month padding
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, mon - 1, -i);
      days.push({ date: d, inMonth: false });
    }

    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, mon - 1, i), inMonth: true });
    }

    // Next month padding (fill to 6 rows)
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, mon, i), inMonth: false });
    }

    return days;
  }, [currentMonth]);

  // Group events by date string — uses safe date parsing to avoid timezone bugs
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach((e) => {
      const key = dateKey(e.date);
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [events]);

  // Navigation
  const prevMonth = () => {
    const [y, m] = currentMonth.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const nextMonth = () => {
    const [y, m] = currentMonth.split("-").map(Number);
    const d = new Date(y, m, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const goToToday = () => {
    const now = new Date();
    setCurrentMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  };

  // Month label
  const monthLabel = useMemo(() => {
    const [y, m] = currentMonth.split("-").map(Number);
    return new Date(y, m - 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  }, [currentMonth]);

  // Open modal for new event
  const openNewEvent = (dateStr?: string) => {
    setEditingEvent(null);
    setForm(emptyForm(dateStr));
    setShowModal(true);
  };

  // Open modal for editing
  const openEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    const eventDate = safeDate(event.date);
    setForm({
      title: event.title,
      date: `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, "0")}-${String(eventDate.getDate()).padStart(2, "0")}`,
      time: eventDate.toTimeString().slice(0, 5),
      end_time: event.end_time ? safeDate(event.end_time).toTimeString().slice(0, 5) : "",
      venue: event.venue || "",
      event_type: event.event_type || "hard_ticket",
      booking_status: event.booking_status || "confirmed",
      contact_name: event.contact_name || "",
      contact_phone: event.contact_phone || "",
      contact_email: event.contact_email || "",
      contact_company: "",
      billing_address: "",
      tax_exempt: false,
      notes: event.notes || "",
      calendar_color: event.calendar_color || "",
      status: event.status || "published",
      description: "",
    });
    setShowModal(true);
  };

  // Save event
  const handleSave = async () => {
    if (!form.title.trim() || !form.date) return;
    setSaving(true);

    const dateTime = `${form.date}T${form.time || "00:00"}:00`;
    const endTime = form.end_time ? `${form.date}T${form.end_time}:00` : null;

    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      date: dateTime,
      end_time: endTime,
      venue: form.venue || venueName,
      event_type: form.event_type,
      booking_status: form.booking_status,
      contact_name: form.contact_name || null,
      contact_phone: form.contact_phone || null,
      contact_email: form.contact_email || null,
      client_company: form.contact_company || null,
      client_billing_address: form.billing_address || null,
      tax_exempt: form.tax_exempt || false,
      notes: form.notes || null,
      calendar_color: form.calendar_color || null,
      status: form.status,
      description: form.description || null,
      venue_id: venueId,
    };

    try {
      if (editingEvent) {
        payload.id = editingEvent.id;
        await fetch("/api/calendar", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        const res = await fetch("/api/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        // Redirect to management hub for private events
        if (form.event_type === "private" && res.ok) {
          const created = await res.json().catch(() => null);
          if (created?.id) {
            setShowModal(false);
            router.push(`/admin/private-events/${created.id}`);
            return;
          }
        }
      }
      setShowModal(false);
      fetchEvents();
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  // Delete event
  const handleDelete = async () => {
    if (!editingEvent) return;
    if (!confirm(`Delete "${editingEvent.title}"?`)) return;

    try {
      await fetch(`/api/calendar?id=${editingEvent.id}`, { method: "DELETE" });
      setShowModal(false);
      fetchEvents();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  /** Get the display color for an event based on booking_status (primary) */
  const getEventColor = (ev: CalendarEvent) => {
    if (ev.calendar_color) return ev.calendar_color;
    const bs = ev.booking_status || "confirmed";
    return BOOKING_STATUS_COLORS[bs] || BOOKING_STATUS_COLORS.confirmed;
  };

  const getEventBg = (ev: CalendarEvent) => {
    if (ev.calendar_color) return ev.calendar_color.replace("0.85", "0.12").replace("0.9", "0.12");
    const bs = ev.booking_status || "confirmed";
    return BOOKING_STATUS_BG[bs] || BOOKING_STATUS_BG.confirmed;
  };

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  if (role && !["owner", "venue_admin", "full_admin"].includes(role)) {
    return <div className="admin-form-page"><h1 className="admin-page-title">Access Denied</h1></div>;
  }

  return (
    <div className="admin-form-page" style={{ maxWidth: "100%" }}>
      <h1 className="admin-page-title" style={isMobile ? { fontSize: 20, marginBottom: 4 } : undefined}>Calendar</h1>
      {!isMobile && (
        <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>
          {venueName ? `${venueName} — ` : ""}Manage your venue events, holds, and private bookings.
        </p>
      )}

      {/* Legend — Booking Status */}
      <div style={{ display: "flex", gap: isMobile ? 10 : 16, marginBottom: isMobile ? 10 : 16, flexWrap: "wrap" }}>
        {[
          { label: "Confirmed", status: "confirmed" },
          { label: "Hold", status: "hold" },
          { label: "Cancelled", status: "cancelled" },
        ].map((l) => (
          <div key={l.status} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: isMobile ? 10 : 12, color: "rgba(255,255,255,0.5)" }}>
            <div style={{ width: isMobile ? 8 : 12, height: isMobile ? 8 : 12, borderRadius: 3, background: BOOKING_STATUS_COLORS[l.status] }} />
            {l.label}
          </div>
        ))}
        <div style={{ width: 1, background: "rgba(255,255,255,0.1)", margin: "0 4px" }} />
        {[
          { label: "Hard Ticket", type: "hard_ticket" },
          { label: "Non-Ticketed", type: "non_ticketed" },
          { label: "Private", type: "private" },
        ].map((l) => (
          <div key={l.type} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: isMobile ? 10 : 12, color: "rgba(255,255,255,0.35)" }}>
            <div style={{ width: isMobile ? 6 : 8, height: isMobile ? 6 : 8, borderRadius: "50%", background: EVENT_TYPE_COLORS[l.type] }} />
            {l.label}
          </div>
        ))}
      </div>

      {/* Month Navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 12, marginBottom: isMobile ? 10 : 16, flexWrap: "wrap" }}>
        <button onClick={prevMonth} style={{ ...navBtnStyle, padding: isMobile ? "6px 10px" : "8px 16px", fontSize: isMobile ? 14 : 16 }}>&larr;</button>
        <h2 style={{ color: "#d0c290", fontSize: isMobile ? 16 : 20, fontWeight: 700, margin: 0, flex: isMobile ? 1 : undefined, minWidth: isMobile ? 0 : 200, textAlign: "center" }}>
          {monthLabel}
        </h2>
        <button onClick={nextMonth} style={{ ...navBtnStyle, padding: isMobile ? "6px 10px" : "8px 16px", fontSize: isMobile ? 14 : 16 }}>&rarr;</button>
        <button onClick={goToToday} style={{ ...navBtnStyle, fontSize: isMobile ? 10 : 12, padding: isMobile ? "4px 10px" : "6px 14px" }}>Today</button>
        {!isMobile && <div style={{ flex: 1 }} />}
        {!isMobile && (
          <>
            <Link href="/admin/events" style={{ padding: "8px 16px", fontSize: 12, color: "rgba(255,255,255,0.5)", textDecoration: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, display: "inline-flex", alignItems: "center" }}>
              Events List
            </Link>
            <Link href="/admin/events/new" style={{ padding: "8px 16px", fontSize: 12, color: "#d0c290", textDecoration: "none", border: "1px solid rgba(208,194,144,0.2)", borderRadius: 8, background: "rgba(208,194,144,0.08)", display: "inline-flex", alignItems: "center" }}>
              + Hard Ticket Event
            </Link>
          </>
        )}
        <button
          onClick={() => openNewEvent()}
          className="admin-form-submit"
          style={{ padding: isMobile ? "8px 14px" : "10px 20px", fontSize: isMobile ? 11 : 13 }}
        >
          + Add
        </button>
      </div>

      {/* Calendar Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        overflow: "hidden",
      }}>
        {/* Day headers */}
        {(isMobile ? DAYS_SHORT : DAYS).map((d, idx) => (
          <div key={idx} style={{
            padding: isMobile ? "6px 2px" : "10px 8px",
            textAlign: "center",
            fontSize: isMobile ? 10 : 11,
            fontWeight: 600,
            color: "rgba(255,255,255,0.4)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            background: "rgba(255,255,255,0.03)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}>
            {d}
          </div>
        ))}

        {/* Calendar cells */}
        {calendarDays.map((day, i) => {
          const key = `${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, "0")}-${String(day.date.getDate()).padStart(2, "0")}`;
          const dayEvents = eventsByDate[key] || [];
          const isToday = key === todayStr;

          return (
            <div
              key={i}
              onClick={() => {
                if (isMobile && dayEvents.length > 0) {
                  openEditEvent(dayEvents[0]);
                } else {
                  openNewEvent(key);
                }
              }}
              style={{
                minHeight: isMobile ? 48 : 100,
                padding: isMobile ? "3px 2px" : "4px 6px",
                background: isToday
                  ? "rgba(208,194,144,0.06)"
                  : day.inMonth
                  ? "rgba(255,255,255,0.01)"
                  : "rgba(0,0,0,0.15)",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                borderRight: "1px solid rgba(255,255,255,0.04)",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.background = "rgba(208,194,144,0.08)"; }}
              onMouseLeave={(e) => {
                if (!isMobile) e.currentTarget.style.background = isToday
                  ? "rgba(208,194,144,0.06)"
                  : day.inMonth ? "rgba(255,255,255,0.01)" : "rgba(0,0,0,0.15)";
              }}
            >
              {/* Date number */}
              <div style={{
                fontSize: isMobile ? 11 : 12,
                fontWeight: isToday ? 700 : day.inMonth ? 500 : 400,
                color: isToday
                  ? "#d0c290"
                  : day.inMonth
                  ? "rgba(255,255,255,0.6)"
                  : "rgba(255,255,255,0.2)",
                marginBottom: isMobile ? 2 : 4,
                textAlign: isMobile ? "center" : "left",
              }}>
                {day.date.getDate()}
              </div>

              {/* Events on this day */}
              {isMobile ? (
                /* Mobile: show colored dots based on booking_status */
                dayEvents.length > 0 && (
                  <div style={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
                    {dayEvents.slice(0, 4).map((ev) => {
                      const color = getEventColor(ev);
                      return (
                        <div
                          key={ev.id}
                          style={{
                            width: 6, height: 6, borderRadius: "50%",
                            background: color,
                          }}
                        />
                      );
                    })}
                    {dayEvents.length > 4 && (
                      <span style={{ fontSize: 7, color: "rgba(255,255,255,0.3)", lineHeight: "6px" }}>+</span>
                    )}
                  </div>
                )
              ) : (
                /* Desktop: show event labels with booking_status color + event type indicator */
                <>
                  {dayEvents.slice(0, 3).map((ev) => {
                    const color = getEventColor(ev);
                    const bg = getEventBg(ev);
                    const type = ev.event_type || "hard_ticket";
                    const typeColor = EVENT_TYPE_COLORS[type] || EVENT_TYPE_COLORS.hard_ticket;
                    return (
                      <div
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditEvent(ev);
                        }}
                        title={`${ev.title} (${ev.booking_status || "confirmed"})${ev.notes ? ` — ${ev.notes}` : ""}`}
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          marginBottom: 2,
                          borderRadius: 4,
                          background: bg,
                          color,
                          borderLeft: `3px solid ${color}`,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          cursor: "pointer",
                          fontWeight: 500,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <span style={{
                          width: 5, height: 5, borderRadius: "50%",
                          background: typeColor, flexShrink: 0,
                        }} />
                        {ev.title}
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", paddingLeft: 4 }}>
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {loading && (
        <p style={{ color: "rgba(255,255,255,0.4)", textAlign: "center", marginTop: 16 }}>Loading events...</p>
      )}

      {/* ── Event Modal ── */}
      {showModal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "center",
            padding: isMobile ? 0 : 20,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0f1128",
              borderRadius: isMobile ? 0 : 16,
              border: isMobile ? "none" : "1px solid rgba(255,255,255,0.1)",
              padding: isMobile ? "20px 16px" : 28,
              width: "100%",
              maxWidth: isMobile ? "100%" : 540,
              height: isMobile ? "100%" : "auto",
              maxHeight: isMobile ? "100%" : "90vh",
              overflowY: "auto",
            }}
          >
            <h2 style={{ color: "#d0c290", fontSize: 18, margin: "0 0 20px", fontWeight: 700 }}>
              {editingEvent ? "Edit Event" : "New Calendar Event"}
            </h2>

            {/* Title */}
            <label style={labelStyle}>Event Title *</label>
            <input
              className="admin-form-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Private Party, Band Night, Staff Meeting"
              style={{ width: "100%", marginBottom: 14 }}
            />

            {/* Event Type */}
            <label style={labelStyle}>Event Type</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {[
                { value: "non_ticketed", label: "Non-Ticketed" },
                { value: "private", label: "Private" },
                { value: "hard_ticket", label: "Hard Ticket" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, event_type: opt.value })}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1px solid ${form.event_type === opt.value ? (EVENT_TYPE_COLORS[opt.value] || "#d0c290") : "rgba(255,255,255,0.1)"}`,
                    background: form.event_type === opt.value ? (EVENT_TYPE_BG[opt.value] || "rgba(208,194,144,0.15)") : "transparent",
                    color: form.event_type === opt.value ? (EVENT_TYPE_COLORS[opt.value] || "#d0c290") : "rgba(255,255,255,0.5)",
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

            {/* Booking Status */}
            <label style={labelStyle}>Booking Status</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {[
                { value: "confirmed", label: "Confirmed" },
                { value: "hold", label: "Hold" },
                ...(editingEvent ? [{ value: "cancelled", label: "Cancelled" }] : []),
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, booking_status: opt.value })}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1px solid ${form.booking_status === opt.value ? BOOKING_STATUS_COLORS[opt.value] : "rgba(255,255,255,0.1)"}`,
                    background: form.booking_status === opt.value ? BOOKING_STATUS_BG[opt.value] : "transparent",
                    color: form.booking_status === opt.value ? BOOKING_STATUS_COLORS[opt.value] : "rgba(255,255,255,0.5)",
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

            {/* Date & Times */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Date *</label>
                <input
                  type="date"
                  className="admin-form-input"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label style={labelStyle}>Start Time</label>
                <input
                  type="time"
                  className="admin-form-input"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label style={labelStyle}>End Time</label>
                <input
                  type="time"
                  className="admin-form-input"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            {/* Venue */}
            <label style={labelStyle}>Location / Room</label>
            <input
              className="admin-form-input"
              value={form.venue}
              onChange={(e) => setForm({ ...form, venue: e.target.value })}
              placeholder={venueName || "e.g. Main Stage, VIP Room"}
              style={{ width: "100%", marginBottom: 14 }}
            />

            {/* Contact Fields (shown for private events) */}
            {form.event_type === "private" && (
              <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: "rgba(180,100,200,0.06)", border: "1px solid rgba(180,100,200,0.15)" }}>
                <label style={{ ...labelStyle, color: "rgba(180,100,200,0.7)" }}>Client Information</label>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginTop: 6 }}>
                  <div>
                    <label style={{ ...labelStyle, fontSize: 10 }}>Contact Name</label>
                    <input
                      className="admin-form-input"
                      value={form.contact_name}
                      onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                      placeholder="Client name"
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: 10 }}>Company</label>
                    <input
                      className="admin-form-input"
                      value={form.contact_company}
                      onChange={(e) => setForm({ ...form, contact_company: e.target.value })}
                      placeholder="Company name"
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: 10 }}>Email</label>
                    <input
                      className="admin-form-input"
                      type="email"
                      value={form.contact_email}
                      onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                      placeholder="client@example.com"
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: 10 }}>Phone</label>
                    <input
                      className="admin-form-input"
                      value={form.contact_phone}
                      onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                      placeholder="(555) 123-4567"
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div style={isMobile ? {} : { gridColumn: "span 2" }}>
                    <label style={{ ...labelStyle, fontSize: 10 }}>Billing Address</label>
                    <input
                      className="admin-form-input"
                      value={form.billing_address}
                      onChange={(e) => setForm({ ...form, billing_address: e.target.value })}
                      placeholder="123 Main St, City, State 12345"
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div style={isMobile ? {} : { gridColumn: "span 2" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                      <input
                        type="checkbox"
                        checked={form.tax_exempt}
                        onChange={(e) => setForm({ ...form, tax_exempt: e.target.checked })}
                        style={{ accentColor: "rgba(180,100,200,0.7)" }}
                      />
                      Tax Exempt
                    </label>
                  </div>
                </div>
                <p style={{ marginTop: 8, fontSize: 10, color: "rgba(180,100,200,0.5)" }}>
                  <a
                    href={`/admin/events/new?date=${form.date}&type=private`}
                    style={{ color: "rgba(180,100,200,0.7)", textDecoration: "underline" }}
                    onClick={(e) => { e.preventDefault(); setShowModal(false); router.push(`/admin/events/new?date=${form.date}&type=private`); }}
                  >
                    Need more fields? Use the full event form →
                  </a>
                </p>
              </div>
            )}

            {/* Notes */}
            <label style={labelStyle}>Internal Notes</label>
            <textarea
              className="admin-form-input"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Internal notes (not shown publicly)"
              rows={3}
              style={{ width: "100%", marginBottom: 14, resize: "vertical" }}
            />

            {/* Description */}
            <label style={labelStyle}>Description</label>
            <textarea
              className="admin-form-input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Public description (optional)"
              rows={2}
              style={{ width: "100%", marginBottom: 14, resize: "vertical" }}
            />

            {/* Color */}
            <label style={labelStyle}>Custom Calendar Color (optional — overrides status color)</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {["", "#50c878", "#ffc832", "#ff6b6b", "#d0c290", "#6495ed", "#b464c8", "#ffa500"].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, calendar_color: c })}
                  style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: c || "rgba(255,255,255,0.1)",
                    border: form.calendar_color === c ? "2px solid #fff" : "2px solid transparent",
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  {c === "" && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "rgba(255,255,255,0.4)" }}>×</span>}
                </button>
              ))}
            </div>

            {/* Status */}
            <label style={labelStyle}>Visibility</label>
            <select
              className="admin-form-input"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              style={{ width: "100%", marginBottom: 20 }}
            >
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, flexWrap: isMobile ? "wrap" : "nowrap" }}>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim()}
                className="admin-form-submit"
                style={{ flex: 1, padding: "12px 20px" }}
              >
                {saving ? "Saving..." : editingEvent ? "Update Event" : "Create Event"}
              </button>
              {editingEvent && (
                <button
                  onClick={handleDelete}
                  style={{
                    padding: "12px 20px",
                    background: "rgba(255,80,80,0.1)",
                    color: "rgba(255,80,80,0.8)",
                    border: "1px solid rgba(255,80,80,0.2)",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Delete
                </button>
              )}
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: "12px 20px",
                  background: "rgba(255,255,255,0.05)",
                  color: "rgba(255,255,255,0.5)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Cancel
              </button>
            </div>

            {/* Link to full event editor / management hub */}
            {editingEvent && (
              <p style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                {editingEvent.event_type === "private" ? (
                  <a href={`/admin/private-events/${editingEvent.id}`} style={{ color: "rgba(180,100,200,0.6)", textDecoration: "underline" }}>
                    Open Private Event Management Hub →
                  </a>
                ) : (
                  <a href={`/admin/events/${editingEvent.id}/edit`} style={{ color: "rgba(208,194,144,0.6)", textDecoration: "underline" }}>
                    Open full event editor →
                  </a>
                )}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  color: "rgba(255,255,255,0.6)",
  cursor: "pointer",
  fontSize: 16,
  fontWeight: 600,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "rgba(255,255,255,0.4)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  marginBottom: 4,
};
