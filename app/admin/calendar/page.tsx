"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatPhoneNumber } from "@/lib/formatPhone";
import { getCookie } from "@/lib/cookies";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import EventPanel from "./EventPanel";

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
  hold_level: string | null;
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
  hold_level: string;
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

type HoldForm = {
  title: string;
  date: string;
  end_date: string;
  event_type: string;
  hold_level: string;
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
  ticketed: "rgba(208,194,144,0.85)",       // legacy support
  non_ticketed: "rgba(100,149,237,0.85)",
  private: "rgba(180,100,200,0.85)",
  co_promote: "rgba(255,140,0,0.85)",
  rental_box_office: "rgba(80,200,220,0.85)",
};

const HOLD_LEVEL_COLORS: Record<string, string> = {
  H1: "rgba(255,90,70,1)",
  H2: "rgba(255,160,40,1)",
  H3: "rgba(255,200,50,1)",
};

const EVENT_TYPE_BG: Record<string, string> = {
  hard_ticket: "rgba(208,194,144,0.15)",
  ticketed: "rgba(208,194,144,0.15)",
  non_ticketed: "rgba(100,149,237,0.15)",
  private: "rgba(180,100,200,0.15)",
  co_promote: "rgba(255,140,0,0.15)",
  rental_box_office: "rgba(80,200,220,0.15)",
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
    hold_level: "",
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

function emptyHoldForm(dateStr?: string): HoldForm {
  return {
    title: "",
    date: dateStr || new Date().toISOString().split("T")[0],
    end_date: "",
    event_type: "private",
    hold_level: "H1",
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

  // Event panel — opens when clicking an existing event pill
  const [panelEvent, setPanelEvent] = useState<CalendarEvent | null>(null);

  // Modal state — used only for creating NEW events
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  // Quick Hold modal state
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [holdForm, setHoldForm] = useState<HoldForm>(emptyHoldForm());
  const [holdSaving, setHoldSaving] = useState(false);

  // UI toggle state
  const [showLegend, setShowLegend] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  // Group events by date — multi-day events are added to every day they span
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};

    const addToDay = (key: string, ev: CalendarEvent) => {
      if (!map[key]) map[key] = [];
      if (!map[key].find(x => x.id === ev.id)) map[key].push(ev);
    };

    events.forEach((e) => {
      const startKey = dateKey(e.date);
      const endKey = e.end_time ? dateKey(e.end_time) : null;

      if (endKey && endKey !== startKey) {
        // Multi-day: walk day by day from start to end
        const cursor = safeDate(e.date);
        cursor.setHours(12, 0, 0, 0);
        const endD = safeDate(e.end_time!);
        endD.setHours(12, 0, 0, 0);
        while (cursor <= endD) {
          const k = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
          addToDay(k, e);
          cursor.setDate(cursor.getDate() + 1);
        }
      } else {
        addToDay(startKey, e);
      }
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

  const navigateYear = (dir: 1 | -1) => {
    const [y, m] = currentMonth.split("-").map(Number);
    setCurrentMonth(`${y + dir}-${String(m).padStart(2, "0")}`);
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
      hold_level: event.hold_level || "",
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

    const isPrivateEvent = form.event_type === "private";
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      date: dateTime,
      end_time: endTime,
      venue: form.venue || venueName,
      event_type: form.event_type,
      booking_status: form.booking_status,
      hold_level: form.booking_status === "hold" ? (form.hold_level || null) : null,
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
      // Private events: set start_time/end_time as TEXT and null out pricing
      start_time: isPrivateEvent ? (form.time || null) : null,
      ...(isPrivateEvent ? { price: null, ticketing_fee: null, venue_rebate: null } : {}),
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

  // Open quick hold modal
  const openQuickHold = (dateStr?: string) => {
    setHoldForm(emptyHoldForm(dateStr));
    setShowHoldModal(true);
  };

  // Save quick hold
  const handleSaveHold = async () => {
    if (!holdForm.title.trim() || !holdForm.date) return;
    setHoldSaving(true);

    const payload = {
      title: holdForm.title.trim(),
      date: `${holdForm.date}T12:00:00`,
      end_time: holdForm.end_date && holdForm.end_date > holdForm.date
        ? `${holdForm.end_date}T12:00:00`
        : null,
      venue: venueName || "",
      event_type: holdForm.event_type,
      booking_status: "hold",
      hold_level: holdForm.hold_level || null,
      notes: null,
      calendar_color: null,
      status: "published",
      venue_id: venueId,
    };

    try {
      await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setShowHoldModal(false);
      fetchEvents();
    } catch (err) {
      console.error("Hold save failed:", err);
    } finally {
      setHoldSaving(false);
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

  // Determines where in a multi-day span a given day falls
  const getSpanPosition = (ev: CalendarEvent, dayKey: string): "single" | "start" | "middle" | "end" => {
    if (!ev.end_time) return "single";
    const startKey = dateKey(ev.date);
    const endKey = dateKey(ev.end_time);
    if (startKey === endKey) return "single";
    if (dayKey === startKey) return "start";
    if (dayKey === endKey) return "end";
    return "middle";
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
          {venueName ? `${venueName} — ` : ""}Manage your shows, holds, and private bookings.
        </p>
      )}

      {/* Legend — collapsible */}
      <div style={{ marginBottom: isMobile ? 10 : 16, position: "relative" }}>
        <button
          onClick={() => setShowLegend((v) => !v)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 11, color: "rgba(255,255,255,0.4)", background: "none",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6,
            padding: "4px 10px", cursor: "pointer",
            transition: "color 0.15s, border-color 0.15s",
          }}
        >
          <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {["confirmed","hold","cancelled"].map((s) => (
              <span key={s} style={{ width: 7, height: 7, borderRadius: 2, background: BOOKING_STATUS_COLORS[s], display: "inline-block" }} />
            ))}
          </span>
          Legend
          <span style={{ opacity: 0.5, fontSize: 9, transform: showLegend ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
        </button>

        {showLegend && (
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 100,
            background: "#0f1128", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10, padding: "14px 16px",
            display: "flex", flexDirection: "column", gap: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            minWidth: 260,
          }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Status</div>
              <div style={{ display: "flex", gap: 12 }}>
                {[{ label: "Confirmed", status: "confirmed" },{ label: "Hold", status: "hold" },{ label: "Cancelled", status: "cancelled" }].map((l) => (
                  <div key={l.status} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: BOOKING_STATUS_COLORS[l.status] }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Hold Priority</div>
              <div style={{ display: "flex", gap: 12 }}>
                {[{ label: "H1 — Highest", level: "H1" },{ label: "H2 — Medium", level: "H2" },{ label: "H3 — Lowest", level: "H3" }].map((l) => (
                  <div key={l.level} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                    <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, fontWeight: 700, background: HOLD_LEVEL_COLORS[l.level]?.replace(",1)",",0.15)"), color: HOLD_LEVEL_COLORS[l.level], border: `1px solid ${HOLD_LEVEL_COLORS[l.level]?.replace(",1)",",0.3)")}` }}>{l.level}</span>
                    {l.label.replace(`${l.level} — `, "")}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Show Type</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
                {[
                  { label: "Hard Ticket", type: "hard_ticket" },
                  { label: "Internal", type: "non_ticketed" },
                  { label: "Private Rental", type: "private" },
                  { label: "Co-Promote", type: "co_promote" },
                  { label: "Rental / Box Office", type: "rental_box_office" },
                ].map((l) => (
                  <div key={l.type} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: EVENT_TYPE_COLORS[l.type] }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
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
        <button
          onClick={() => openQuickHold()}
          style={{
            padding: isMobile ? "8px 14px" : "10px 20px",
            fontSize: isMobile ? 11 : 13,
            background: "rgba(255,200,50,0.1)",
            border: "1px solid rgba(255,200,50,0.3)",
            borderRadius: 8,
            color: "rgba(255,200,50,0.9)",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          + Quick Hold
        </button>
        <button
          onClick={() => openNewEvent()}
          className="admin-form-submit"
          style={{ padding: isMobile ? "8px 14px" : "10px 20px", fontSize: isMobile ? 11 : 13 }}
        >
          + New Show
        </button>
      </div>

      {/* Year / Month Quick-Select Strip */}
      {(() => {
        const year = parseInt(currentMonth.split("-")[0]);
        const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        return (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            marginBottom: isMobile ? 10 : 14,
            overflowX: "auto", paddingBottom: 2,
          }}>
            {/* Year prev */}
            <button
              onClick={() => navigateYear(-1)}
              style={{ ...navBtnStyle, padding: "3px 9px", fontSize: 13, flexShrink: 0, lineHeight: 1.2 }}
            >‹</button>
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.35)", flexShrink: 0, minWidth: 34, textAlign: "center" }}>
              {year}
            </span>
            <button
              onClick={() => navigateYear(1)}
              style={{ ...navBtnStyle, padding: "3px 9px", fontSize: 13, flexShrink: 0, lineHeight: 1.2 }}
            >›</button>

            {/* Month pills */}
            {MONTHS.map((m, i) => {
              const monthNum = String(i + 1).padStart(2, "0");
              const isActive = currentMonth === `${year}-${monthNum}`;
              const isToday = (() => {
                const now = new Date();
                return now.getFullYear() === year && now.getMonth() === i;
              })();
              return (
                <button
                  key={m}
                  onClick={() => setCurrentMonth(`${year}-${monthNum}`)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: isActive ? 700 : 500,
                    border: `1px solid ${isActive ? "#d0c290" : isToday ? "rgba(208,194,144,0.25)" : "rgba(255,255,255,0.1)"}`,
                    background: isActive ? "rgba(208,194,144,0.15)" : "transparent",
                    color: isActive ? "#d0c290" : isToday ? "rgba(208,194,144,0.5)" : "rgba(255,255,255,0.35)",
                    cursor: "pointer",
                    flexShrink: 0,
                    transition: "all 0.15s",
                  }}
                >
                  {m}
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Calendar: Mobile List View / Desktop Grid */}
      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
          {(() => {
            const monthEvents = events
              .filter(e => e.date && dateKey(e.date).startsWith(currentMonth))
              .sort((a, b) => (dateKey(a.date)).localeCompare(dateKey(b.date)));

            if (monthEvents.length === 0) {
              return (
                <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
                  No events this month
                </div>
              );
            }

            return monthEvents.map((ev) => {
              const d = safeDate(ev.date);
              const dayNum = d.getDate();
              const dayName = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
              const monthName = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();

              const typeColor = EVENT_TYPE_COLORS[ev.event_type || ""] || "#888";
              const statusColor = BOOKING_STATUS_COLORS[ev.booking_status || ""] || "#888";

              return (
                <div
                  key={ev.id}
                  onClick={() => setPanelEvent(ev)}
                  style={{
                    display: "flex",
                    gap: 14,
                    padding: "14px 12px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                >
                  {/* Date column */}
                  <div style={{ width: 52, flexShrink: 0, textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1 }}>
                      {monthName}
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: "#d0c290", lineHeight: 1.1 }}>
                      {dayNum}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>
                      {dayName}
                    </div>
                  </div>

                  {/* Event info column */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ev.title}
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>
                      {ev.venue || "No venue"}
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {/* Event type badge */}
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: 10, padding: "1px 7px", borderRadius: 3,
                        background: typeColor.replace(/[\d.]+\)$/, "0.15)"), color: typeColor, fontWeight: 600,
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: typeColor }} />
                        {(ev.event_type || "event").replace("_", " ")}
                      </span>
                      {/* Booking status badge */}
                      <span style={{
                        fontSize: 10, padding: "1px 7px", borderRadius: 3,
                        background: statusColor.replace(/[\d.]+\)$/, "0.15)"), color: statusColor, fontWeight: 600,
                      }}>
                        {ev.booking_status || "—"}
                      </span>
                      {/* Hold level badge */}
                      {ev.hold_level && (
                        <span style={{
                          fontSize: 10, padding: "1px 6px", borderRadius: 3, fontWeight: 800,
                          background: HOLD_LEVEL_COLORS[ev.hold_level]?.replace(",1)", ",0.15)"),
                          color: HOLD_LEVEL_COLORS[ev.hold_level],
                          border: `1px solid ${HOLD_LEVEL_COLORS[ev.hold_level]?.replace(",1)", ",0.3)")}`,
                        }}>
                          {ev.hold_level}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          overflow: "hidden",
        }}>
          {/* Day headers */}
          {DAYS.map((d, idx) => (
            <div key={idx} style={{
              padding: "10px 8px",
              textAlign: "center",
              fontSize: 11,
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
                onClick={() => openNewEvent(key)}
                style={{
                  minHeight: 100,
                  padding: "4px 6px",
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
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(208,194,144,0.08)"; }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isToday
                    ? "rgba(208,194,144,0.06)"
                    : day.inMonth ? "rgba(255,255,255,0.01)" : "rgba(0,0,0,0.15)";
                }}
              >
                {/* Date number */}
                <div style={{
                  fontSize: 12,
                  fontWeight: isToday ? 700 : day.inMonth ? 500 : 400,
                  color: isToday
                    ? "#d0c290"
                    : day.inMonth
                    ? "rgba(255,255,255,0.6)"
                    : "rgba(255,255,255,0.2)",
                  marginBottom: 4,
                  textAlign: "left",
                }}>
                  {day.date.getDate()}
                </div>

                {/* Desktop: event pills with multi-day span support */}
                {dayEvents.slice(0, 3).map((ev) => {
                  const color = getEventColor(ev);
                  const bg = getEventBg(ev);
                  const type = ev.event_type || "hard_ticket";
                  const typeColor = EVENT_TYPE_COLORS[type] || EVENT_TYPE_COLORS.hard_ticket;
                  const isHold = ev.booking_status === "hold";
                  const holdLevel = ev.hold_level;
                  const pos = getSpanPosition(ev, key);
                  const isSpan = pos !== "single";

                  // Cell has padding: "4px 6px" — negative margins cancel it to bleed to edge
                  const spanStyle: React.CSSProperties = isSpan ? {
                    borderRadius:
                      pos === "start" ? "4px 0 0 4px" :
                      pos === "end"   ? "0 4px 4px 0" : 0,
                    marginLeft:  (pos === "middle" || pos === "end") ? -6 : 0,
                    marginRight: (pos === "start" || pos === "middle") ? -6 : 0,
                    borderLeft:  (pos === "start") ? `3px ${isHold ? "dashed" : "solid"} ${color}` : "none",
                    paddingLeft: (pos === "middle" || pos === "end") ? 4 : 6,
                  } : {
                    borderRadius: 4,
                    borderLeft: `3px ${isHold ? "dashed" : "solid"} ${color}`,
                    paddingLeft: 6,
                  };

                  return (
                    <div
                      key={ev.id}
                      onClick={(e) => { e.stopPropagation(); setPanelEvent(ev); }}
                      title={`${ev.title}${holdLevel ? ` [${holdLevel}]` : ""} (${ev.booking_status || "confirmed"})${ev.notes ? ` — ${ev.notes}` : ""}`}
                      style={{
                        fontSize: 10,
                        height: 18,
                        paddingRight: 4,
                        marginBottom: 2,
                        background: bg,
                        color,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: pos === "start" || pos === "single" ? "ellipsis" : "clip",
                        cursor: "pointer",
                        fontWeight: 500,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        boxSizing: "border-box",
                        ...spanStyle,
                      }}
                    >
                      {/* Show badge + title only on start or single-day events */}
                      {(pos === "single" || pos === "start") && (
                        <>
                          {holdLevel ? (
                            <span style={{
                              fontSize: 8, padding: "0px 3px", borderRadius: 2, fontWeight: 800,
                              background: HOLD_LEVEL_COLORS[holdLevel]?.replace(",1)", ",0.2)"),
                              color: HOLD_LEVEL_COLORS[holdLevel],
                              flexShrink: 0, lineHeight: "14px",
                            }}>{holdLevel}</span>
                          ) : (
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: typeColor, flexShrink: 0 }} />
                          )}
                          {ev.title}
                        </>
                      )}
                    </div>
                  );
                })}
                {dayEvents.length > 3 && (
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", paddingLeft: 4 }}>
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {loading && (
        <p style={{ color: "rgba(255,255,255,0.4)", textAlign: "center", marginTop: 16 }}>Loading events...</p>
      )}

      {/* ── Event Panel ── */}
      {panelEvent && (
        <EventPanel
          event={panelEvent}
          onClose={() => setPanelEvent(null)}
          onUpdate={fetchEvents}
        />
      )}

      {/* ── Quick Hold Modal ── */}
      {showHoldModal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setShowHoldModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0f1128",
              borderRadius: 16,
              border: "1px solid rgba(255,200,50,0.2)",
              padding: 28,
              width: "100%",
              maxWidth: 400,
            }}
          >
            <h2 style={{ color: "rgba(255,200,50,0.9)", fontSize: 18, margin: "0 0 6px", fontWeight: 700 }}>
              Quick Hold
            </h2>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, margin: "0 0 20px" }}>
              Blocks the date without a full event. You can promote it later.
            </p>

            {/* Hold Priority */}
            <label style={labelStyle}>Hold Priority</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {["H1", "H2", "H3"].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setHoldForm({ ...holdForm, hold_level: level })}
                  style={{
                    flex: 1,
                    padding: "10px 8px",
                    borderRadius: 8,
                    border: `1px solid ${holdForm.hold_level === level ? HOLD_LEVEL_COLORS[level] : "rgba(255,255,255,0.1)"}`,
                    background: holdForm.hold_level === level ? HOLD_LEVEL_COLORS[level].replace(",1)", ",0.15)") : "transparent",
                    color: holdForm.hold_level === level ? HOLD_LEVEL_COLORS[level] : "rgba(255,255,255,0.4)",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {level}
                  <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2, opacity: 0.7 }}>
                    {level === "H1" ? "Highest" : level === "H2" ? "Medium" : "Lowest"}
                  </div>
                </button>
              ))}
            </div>

            {/* Hold Name */}
            <label style={labelStyle}>Hold Name *</label>
            <input
              className="admin-form-input"
              value={holdForm.title}
              onChange={(e) => setHoldForm({ ...holdForm, title: e.target.value })}
              placeholder="e.g. Smith Wedding, Band Inquiry, Corporate Event"
              style={{ width: "100%", marginBottom: 14 }}
              autoFocus
            />

            {/* Event Type */}
            <label style={labelStyle}>Type</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {[
                { value: "private", label: "Rental / Private" },
                { value: "hard_ticket", label: "Hard Ticket" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setHoldForm({ ...holdForm, event_type: opt.value })}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1px solid ${holdForm.event_type === opt.value ? (EVENT_TYPE_COLORS[opt.value] || "#d0c290") : "rgba(255,255,255,0.1)"}`,
                    background: holdForm.event_type === opt.value ? (EVENT_TYPE_BG[opt.value] || "rgba(208,194,144,0.15)") : "transparent",
                    color: holdForm.event_type === opt.value ? (EVENT_TYPE_COLORS[opt.value] || "#d0c290") : "rgba(255,255,255,0.4)",
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

            {/* Dates */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              <div>
                <label style={labelStyle}>Start Date *</label>
                <input
                  type="date"
                  className="admin-form-input"
                  value={holdForm.date}
                  onChange={(e) => setHoldForm({ ...holdForm, date: e.target.value })}
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label style={labelStyle}>End Date <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
                <input
                  type="date"
                  className="admin-form-input"
                  value={holdForm.end_date}
                  min={holdForm.date || undefined}
                  onChange={(e) => setHoldForm({ ...holdForm, end_date: e.target.value })}
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={handleSaveHold}
                disabled={holdSaving || !holdForm.title.trim() || !holdForm.date}
                style={{
                  flex: 1,
                  padding: "12px 20px",
                  background: "rgba(255,200,50,0.15)",
                  border: "1px solid rgba(255,200,50,0.4)",
                  borderRadius: 8,
                  color: "rgba(255,200,50,0.95)",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: holdSaving || !holdForm.title.trim() || !holdForm.date ? "not-allowed" : "pointer",
                  opacity: holdSaving || !holdForm.title.trim() || !holdForm.date ? 0.5 : 1,
                }}
              >
                {holdSaving ? "Saving..." : "Save Hold"}
              </button>
              <button
                onClick={() => setShowHoldModal(false)}
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
          </div>
        </div>
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
              {editingEvent
                ? (editingEvent.booking_status === "hold" ? "Edit Hold" : "Edit Show")
                : "New Show"}
            </h2>

            {/* Title */}
            <label style={labelStyle}>Show Name *</label>
            <input
              className="admin-form-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Private Party, Band Night, Staff Meeting"
              style={{ width: "100%", marginBottom: 14 }}
            />

            {/* Show Type */}
            <label style={labelStyle}>Show Type</label>
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

            {/* Status */}
            <label style={labelStyle}>Status</label>
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

            {/* Hold Level — shown only when booking_status is "hold" */}
            {form.booking_status === "hold" && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Hold Priority</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["H1", "H2", "H3"].map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setForm({ ...form, hold_level: form.hold_level === level ? "" : level })}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: `1px solid ${form.hold_level === level ? HOLD_LEVEL_COLORS[level] : "rgba(255,255,255,0.1)"}`,
                        background: form.hold_level === level ? HOLD_LEVEL_COLORS[level].replace(",1)", ",0.15)") : "transparent",
                        color: form.hold_level === level ? HOLD_LEVEL_COLORS[level] : "rgba(255,255,255,0.4)",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {level} {level === "H1" ? "— Highest" : level === "H2" ? "— Medium" : "— Lowest"}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                      onChange={(e) => setForm({ ...form, contact_phone: formatPhoneNumber(e.target.value) })}
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

            {/* Advanced — color override + visibility (collapsed by default) */}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 11, color: "rgba(255,255,255,0.3)",
                background: "none", border: "none", cursor: "pointer",
                padding: "0 0 14px", marginTop: -4,
              }}
            >
              <span style={{ transform: showAdvanced ? "rotate(90deg)" : "none", transition: "transform 0.15s", display: "inline-block" }}>▶</span>
              Advanced
            </button>

            {showAdvanced && (
              <>
                <label style={labelStyle}>Custom Color (overrides status color)</label>
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  {["", "#50c878", "#ffc832", "#ff6b6b", "#d0c290", "#6495ed", "#b464c8", "#ffa500"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, calendar_color: c })}
                      style={{
                        width: 28, height: 28, borderRadius: "50%",
                        background: c || "rgba(255,255,255,0.1)",
                        border: form.calendar_color === c ? "2px solid #fff" : "2px solid transparent",
                        cursor: "pointer", position: "relative",
                      }}
                    >
                      {c === "" && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "rgba(255,255,255,0.4)" }}>×</span>}
                    </button>
                  ))}
                </div>

                {/* Visibility — only relevant for public ticketed shows */}
                {["hard_ticket", "ticketed", "co_promote", "rental_box_office"].includes(form.event_type) && (
                  <>
                    <label style={labelStyle}>Visibility</label>
                    <select
                      className="admin-form-input"
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      style={{ width: "100%", marginBottom: 14 }}
                    >
                      <option value="published">Published</option>
                      <option value="draft">Draft</option>
                    </select>
                  </>
                )}
              </>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, flexWrap: isMobile ? "wrap" : "nowrap", marginTop: 6 }}>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim()}
                className="admin-form-submit"
                style={{ flex: 1, padding: "12px 20px" }}
              >
                {saving ? "Saving..." : editingEvent ? "Save Changes" : "Create Show"}
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
                  {editingEvent.booking_status === "hold" ? "Delete Hold" : "Delete Show"}
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
                    Manage Rental →
                  </a>
                ) : (
                  <a href={`/admin/events/${editingEvent.id}/edit`} style={{ color: "rgba(208,194,144,0.6)", textDecoration: "underline" }}>
                    View Full Details →
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
