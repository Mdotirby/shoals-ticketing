"use client";

/**
 * Calendar — the Month tab of Calendar & shows, rebuilt on the shared
 * primitives against handoff/screens/calendar.dc.html.
 *
 * Restyle only: the month fetch, the multi-day spread, the quick-hold and
 * new-show payloads, the private-rental redirect and the delete confirmation
 * are the old page's, line for line. What changed is the room it sits in —
 * the design's month card with its legend, glass chips that read show /
 * rental / hold by fill rather than by colour, and a right rail.
 *
 * The rail carries only what the calendar's own rows can prove. The design's
 * "revenue per available night" and "$ of unbooked room" figures need a gross
 * and a half-house floor this endpoint doesn't return, so they are left out
 * rather than estimated; the drag-to-reorder hold ranking is left out because
 * nothing stores a rank beyond H1–H3.
 */

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { formatPhoneNumber } from "@/lib/formatPhone";
import { getCookie } from "@/lib/cookies";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import {
  Button,
  Card,
  CalendarGrid,
  Eyebrow,
  Field,
  FieldRow,
  Meter,
  Modal,
  Segmented,
  cx,
} from "@/app/components/admin/ui";
import EventPanel from "../EventPanel";

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

/** How a row reads on the grid. Status wins over class: a cancelled rental is cancelled. */
type Kind = "show" | "rental" | "hold" | "cancelled";

const TICKETED = ["hard_ticket", "ticketed", "co_promote", "rental_box_office"];

const CLASS_LABEL: Record<string, string> = {
  hard_ticket: "Hard ticket",
  ticketed: "Hard ticket",
  non_ticketed: "Non-ticketed",
  private: "Private rental",
  co_promote: "Co-promote",
  rental_box_office: "Rental box office",
};

const HOLD_RANK: Record<string, string> = { H1: "Highest", H2: "Medium", H3: "Lowest" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const COLOR_CHOICES = ["", "#8fd6a8", "#e8d48a", "#ff8caa", "#ffffff", "#8fa0ff", "#c9a0e8", "#f0b27a"];

function kindOf(ev: CalendarEvent): Kind {
  if (ev.booking_status === "cancelled") return "cancelled";
  if (ev.booking_status === "hold") return "hold";
  if (ev.event_type === "private") return "rental";
  return "show";
}

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

function keyOf(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Extract a YYYY-MM-DD key from a date string using local-time-safe parsing */
function dateKey(d: string): string {
  return keyOf(safeDate(d));
}

function timeLabel(d: string): string {
  const dt = safeDate(d);
  if (dt.getHours() === 0 && dt.getMinutes() === 0) return "";
  if (dt.getHours() === 12 && dt.getMinutes() === 0 && d.length > 10 && d.includes("T12:00:00")) return "";
  return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "");
}

/** The chip's quiet second line: hold rank, rental, or class + time. */
function chipMeta(ev: CalendarEvent): string {
  const k = kindOf(ev);
  const t = timeLabel(ev.date);
  if (k === "cancelled") return "Cancelled";
  if (k === "hold") return [ev.hold_level ? `${ev.hold_level} hold` : "Hold", CLASS_LABEL[ev.event_type || ""]].filter(Boolean).join(" · ");
  if (k === "rental") return ["Rental", t].filter(Boolean).join(" · ");
  return [CLASS_LABEL[ev.event_type || ""] || "Show", t].filter(Boolean).join(" · ");
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

  // Event panel — opens when clicking an existing event chip
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

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Venue info
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venueName, setVenueName] = useState("");

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

  // On a phone the month strip scrolls; keep the selected month in view.
  const monthsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = monthsRef.current;
    const on = strip?.querySelector<HTMLElement>(".cal-month.active");
    if (strip && on) strip.scrollLeft = on.offsetLeft - strip.clientWidth / 2 + on.offsetWidth / 2;
  }, [currentMonth]);

  // Calendar grid computation — whole weeks, padded from the months either side
  const calendarDays = useMemo(() => {
    const [year, mon] = currentMonth.split("-").map(Number);
    const firstDay = new Date(year, mon - 1, 1);
    const lastDay = new Date(year, mon, 0);

    const startDayOfWeek = firstDay.getDay(); // 0=Sun
    const daysInMonth = lastDay.getDate();

    const days: { date: Date; inMonth: boolean }[] = [];

    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({ date: new Date(year, mon - 1, -i), inMonth: false });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, mon - 1, i), inMonth: true });
    }
    // Pad to the end of the last week — only as many rows as the month needs.
    const remaining = (7 - (days.length % 7)) % 7;
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
      if (!map[key].find((x) => x.id === ev.id)) map[key].push(ev);
    };

    events.forEach((e) => {
      const startKey = dateKey(e.date);
      const endKey = e.end_time ? dateKey(e.end_time) : null;

      if (endKey && endKey !== startKey) {
        const cursor = safeDate(e.date);
        cursor.setHours(12, 0, 0, 0);
        const endD = safeDate(e.end_time!);
        endD.setHours(12, 0, 0, 0);
        while (cursor <= endD) {
          addToDay(keyOf(cursor), e);
          cursor.setDate(cursor.getDate() + 1);
        }
      } else {
        addToDay(startKey, e);
      }
    });

    return map;
  }, [events]);

  // Navigation
  const shiftMonth = (delta: number) => {
    const [y, m] = currentMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
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

  const monthLabel = useMemo(() => {
    const [y, m] = currentMonth.split("-").map(Number);
    return new Date(y, m - 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  }, [currentMonth]);

  const today = new Date();
  const todayStr = keyOf(today);

  /**
   * The rail. Every figure is a count of this month's rows — nights are
   * distinct dates, so a two-day hold counts two nights and two shows on one
   * night count one. Cancelled rows book nothing.
   */
  const rail = useMemo(() => {
    const inMonth = Object.keys(eventsByDate).filter((k) => k.startsWith(currentMonth));
    const [y, m] = currentMonth.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();

    const live = (k: string) => (eventsByDate[k] || []).filter((e) => kindOf(e) !== "cancelled");
    const booked = inMonth.filter((k) => live(k).some((e) => kindOf(e) !== "hold"));
    const heldOnly = inMonth.filter((k) => {
      const l = live(k);
      return l.length > 0 && l.every((e) => kindOf(e) === "hold");
    });

    const monthRows = events.filter((e) => dateKey(e.date).startsWith(currentMonth));
    const confirmed = monthRows.filter((e) => kindOf(e) === "show" || kindOf(e) === "rental");
    const ticketed = confirmed.filter((e) => TICKETED.includes(e.event_type || "")).length;
    const rentals = confirmed.filter((e) => kindOf(e) === "rental").length;

    // Dark nights still ahead: in this month, today or later, nothing live on them.
    let darkAhead = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const k = `${currentMonth}-${String(d).padStart(2, "0")}`;
      if (k >= todayStr && live(k).length === 0) darkAhead++;
    }

    const holds = monthRows
      .filter((e) => kindOf(e) === "hold")
      .sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)) || (a.hold_level || "H9").localeCompare(b.hold_level || "H9"));

    return { daysInMonth, booked: booked.length, heldOnly: heldOnly.length, ticketed, rentals, darkAhead, holds };
  }, [eventsByDate, events, currentMonth, todayStr]);

  const agenda = useMemo(
    () =>
      events
        .filter((e) => e.date && dateKey(e.date).startsWith(currentMonth))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [events, currentMonth],
  );

  // Open modal for new event
  const openNewEvent = (dateStr?: string) => {
    setEditingEvent(null);
    setForm(emptyForm(dateStr));
    setShowAdvanced(false);
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

  if (role && !["owner", "venue_admin", "full_admin"].includes(role)) {
    return <div className="admin-form-page"><h1 className="admin-page-title">Access Denied</h1></div>;
  }

  const year = parseInt(currentMonth.split("-")[0]);

  return (
    <div className="calm">
      {/* ── Month navigation ── */}
      <div className="calm-toolbar">
        <div className="calm-nav">
          <button type="button" className="cal-nav" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
          <h2>{monthLabel}</h2>
          <button type="button" className="cal-nav" onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
          <Button variant="ghost" size="sm" onClick={goToToday}>Today</Button>
        </div>
        <span className="filter-spacer" />
        <Button onClick={() => openQuickHold()}>+ Quick hold</Button>
        <Button variant="primary" onClick={() => openNewEvent()}>+ New show</Button>
      </div>

      <div className="calm-months" ref={monthsRef}>
        <button type="button" className="cal-nav calm-yr" onClick={() => navigateYear(-1)} aria-label="Previous year">‹</button>
        <span className="calm-year">{year}</span>
        <button type="button" className="cal-nav calm-yr" onClick={() => navigateYear(1)} aria-label="Next year">›</button>
        {MONTHS.map((m, i) => {
          const val = `${year}-${String(i + 1).padStart(2, "0")}`;
          const isNow = today.getFullYear() === year && today.getMonth() === i;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setCurrentMonth(val)}
              className={cx("cal-month", currentMonth === val && "active", isNow && "calm-month-now")}
            >
              {m}
            </button>
          );
        })}
      </div>

      <div className="calm-layout">
        {/* ── The month ── */}
        <Card className="calm-card">
          <div className="calm-card-head">
            <div className="calm-card-title">{monthLabel}</div>
            <span className="filter-spacer" />
            <div className="calm-legend">
              <span><i className="calm-sw calm-sw--show" />Ticketed show</span>
              <span><i className="calm-sw calm-sw--rental" />Private rental</span>
              <span><i className="calm-sw calm-sw--hold" />Hold</span>
              <span><i className="calm-sw calm-sw--dark" />Dark</span>
            </div>
          </div>

          <div className="calm-grid-wrap">
            <CalendarGrid>
              {calendarDays.map((day, i) => {
                const key = keyOf(day.date);
                const dayEvents = eventsByDate[key] || [];
                return (
                  <div
                    key={i}
                    onClick={() => openNewEvent(key)}
                    className={cx(
                      "cal-cell calm-cell",
                      !day.inMonth && "dim",
                      key === todayStr && "today",
                      dayEvents.length > 0 && "calm-cell--busy",
                    )}
                  >
                    <div className="d">{day.date.getDate()}</div>
                    {dayEvents.slice(0, 3).map((ev) => {
                      const k = kindOf(ev);
                      const continued = dateKey(ev.date) !== key;
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setPanelEvent(ev); }}
                          title={`${ev.title}${ev.hold_level ? ` [${ev.hold_level}]` : ""} (${ev.booking_status || "confirmed"})${ev.notes ? ` — ${ev.notes}` : ""}`}
                          className={cx("calm-chip", `calm-chip--${k}`, continued && "calm-chip--cont")}
                          style={ev.calendar_color ? { borderLeftColor: ev.calendar_color } : undefined}
                        >
                          <span className="calm-chip-name">{continued ? `↳ ${ev.title}` : ev.title}</span>
                          {!continued && <span className="calm-chip-meta">{chipMeta(ev)}</span>}
                        </button>
                      );
                    })}
                    {dayEvents.length > 3 && <div className="calm-more">+{dayEvents.length - 3} more</div>}
                  </div>
                );
              })}
            </CalendarGrid>
          </div>

          {/* Phones get the month as an agenda — seven columns don't fit 375px. */}
          <div className="calm-agenda">
            {agenda.length === 0 ? (
              <div className="calm-empty">{loading ? "Loading…" : "Nothing booked this month"}</div>
            ) : (
              agenda.map((ev) => {
                const d = safeDate(ev.date);
                const k = kindOf(ev);
                return (
                  <button key={ev.id} type="button" className="calm-agenda-row" onClick={() => setPanelEvent(ev)}>
                    <div className="calm-agenda-date">
                      <span>{d.toLocaleDateString("en-US", { weekday: "short" })}</span>
                      <b>{d.getDate()}</b>
                    </div>
                    <div className={cx("calm-agenda-body", `calm-chip--${k}`)}>
                      <div className="calm-agenda-title">{ev.title}</div>
                      <div className="calm-agenda-meta">{chipMeta(ev)}{ev.venue ? ` · ${ev.venue}` : ""}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {loading && agenda.length > 0 && <div className="calm-loading">Refreshing…</div>}
        </Card>

        {/* ── Rail ── */}
        <div className="calm-rail">
          <Card>
            <Eyebrow>Holds — {monthLabel.split(" ")[0]}</Eyebrow>
            <div className="calm-rail-sub">Earliest date first, then H1 before H2 before H3</div>
            {rail.holds.length === 0 ? (
              <div className="calm-rail-empty">No holds on the books this month.</div>
            ) : (
              <div className="calm-holds">
                {rail.holds.map((h) => (
                  <button key={h.id} type="button" className="calm-hold" onClick={() => setPanelEvent(h)}>
                    <span className={cx("calm-hold-rank", h.hold_level === "H1" && "calm-hold-rank--top")}>
                      {h.hold_level ? h.hold_level.slice(1) : "–"}
                    </span>
                    <span className="calm-hold-body">
                      <span className="calm-hold-name">{h.title}</span>
                      <span className="calm-hold-meta">
                        {safeDate(h.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        {CLASS_LABEL[h.event_type || ""] ? ` · ${CLASS_LABEL[h.event_type || ""]}` : ""}
                      </span>
                    </span>
                    <span className="calm-hold-state">{h.hold_level ? HOLD_RANK[h.hold_level] : "Held"}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <Eyebrow>Utilization</Eyebrow>
            <div className="calm-util">
              <div>
                <div className="calm-util-line"><span>Nights booked</span><b>{rail.booked} of {rail.daysInMonth}</b></div>
                <Meter percent={(rail.booked / rail.daysInMonth) * 100} />
              </div>
              <div>
                <div className="calm-util-line"><span>Ticketed vs. rental</span><b>{rail.ticketed} / {rail.rentals}</b></div>
                <Meter percent={rail.ticketed + rail.rentals ? (rail.ticketed / (rail.ticketed + rail.rentals)) * 100 : 0} />
              </div>
              <div>
                <div className="calm-util-line"><span>Held but unconfirmed</span><b>{rail.heldOnly} {rail.heldOnly === 1 ? "date" : "dates"}</b></div>
                <Meter percent={(rail.heldOnly / rail.daysInMonth) * 100} tone="info" />
              </div>
            </div>
            <div className="calm-note">
              {rail.darkAhead === 0
                ? "No dark nights left this month."
                : `${rail.darkAhead} dark ${rail.darkAhead === 1 ? "night" : "nights"} still open this month.`}
            </div>
          </Card>
        </div>
      </div>

      {/* ── Event panel ── */}
      {panelEvent && (
        <EventPanel
          event={panelEvent}
          onClose={() => setPanelEvent(null)}
          onUpdate={fetchEvents}
        />
      )}

      {/* ── Quick hold ── */}
      {showHoldModal && (
        <Modal
          title="Quick hold"
          sub="Blocks the date without a full event. You can promote it later."
          onClose={() => setShowHoldModal(false)}
          width={440}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowHoldModal(false)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={handleSaveHold}
                disabled={holdSaving || !holdForm.title.trim() || !holdForm.date}
              >
                {holdSaving ? "Saving…" : "Save hold"}
              </Button>
            </>
          }
        >
          <Field label="Hold priority">
            <Segmented
              options={[
                { value: "H1", label: "H1 · highest" },
                { value: "H2", label: "H2 · medium" },
                { value: "H3", label: "H3 · lowest" },
              ]}
              value={holdForm.hold_level}
              onChange={(v) => setHoldForm({ ...holdForm, hold_level: v })}
            />
          </Field>
          <Field label="Hold name *">
            <input
              value={holdForm.title}
              onChange={(e) => setHoldForm({ ...holdForm, title: e.target.value })}
              placeholder="e.g. Smith Wedding, Band Inquiry, Corporate Event"
              autoFocus
            />
          </Field>
          <Field label="Type">
            <Segmented
              options={[
                { value: "private", label: "Rental / private" },
                { value: "hard_ticket", label: "Hard ticket" },
              ]}
              value={holdForm.event_type}
              onChange={(v) => setHoldForm({ ...holdForm, event_type: v })}
            />
          </Field>
          <FieldRow>
            <Field label="Start date *">
              <input
                type="date"
                value={holdForm.date}
                onChange={(e) => setHoldForm({ ...holdForm, date: e.target.value })}
              />
            </Field>
            <Field label="End date" hint="Optional — for a multi-day hold">
              <input
                type="date"
                value={holdForm.end_date}
                min={holdForm.date || undefined}
                onChange={(e) => setHoldForm({ ...holdForm, end_date: e.target.value })}
              />
            </Field>
          </FieldRow>
        </Modal>
      )}

      {/* ── New / edit show ── */}
      {showModal && (
        <Modal
          title={editingEvent ? (editingEvent.booking_status === "hold" ? "Edit hold" : "Edit show") : "New show"}
          onClose={() => setShowModal(false)}
          width={560}
          footer={
            <>
              {editingEvent && (
                <Button variant="danger" onClick={handleDelete}>
                  {editingEvent.booking_status === "hold" ? "Delete hold" : "Delete show"}
                </Button>
              )}
              <span className="filter-spacer" />
              <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving || !form.title.trim()}>
                {saving ? "Saving…" : editingEvent ? "Save changes" : "Create show"}
              </Button>
            </>
          }
        >
          <Field label="Show name *">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Private Party, Band Night, Staff Meeting"
            />
          </Field>

          <Field label="Show type">
            <Segmented
              options={[
                { value: "non_ticketed", label: "Non-ticketed" },
                { value: "private", label: "Private" },
                { value: "hard_ticket", label: "Hard ticket" },
              ]}
              value={form.event_type}
              onChange={(v) => setForm({ ...form, event_type: v })}
            />
          </Field>

          <Field label="Status">
            <Segmented
              options={[
                { value: "confirmed", label: "Confirmed" },
                { value: "hold", label: "Hold" },
                ...(editingEvent ? [{ value: "cancelled", label: "Cancelled" }] : []),
              ]}
              value={form.booking_status}
              onChange={(v) => setForm({ ...form, booking_status: v })}
            />
          </Field>

          {form.booking_status === "hold" && (
            <Field label="Hold priority">
              <Segmented
                options={[
                  { value: "H1", label: "H1 · highest" },
                  { value: "H2", label: "H2 · medium" },
                  { value: "H3", label: "H3 · lowest" },
                ]}
                value={form.hold_level}
                onChange={(v) => setForm({ ...form, hold_level: form.hold_level === v ? "" : v })}
              />
            </Field>
          )}

          <FieldRow cols={3}>
            <Field label="Date *">
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="Start time">
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </Field>
            <Field label="End time">
              <input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </Field>
          </FieldRow>

          <Field label="Location / room">
            <input
              value={form.venue}
              onChange={(e) => setForm({ ...form, venue: e.target.value })}
              placeholder={venueName || "e.g. Main Stage, VIP Room"}
            />
          </Field>

          {form.event_type === "private" && (
            <div className="calm-client">
              <Eyebrow>Client</Eyebrow>
              <FieldRow>
                <Field label="Contact name">
                  <input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} placeholder="Client name" />
                </Field>
                <Field label="Company">
                  <input value={form.contact_company} onChange={(e) => setForm({ ...form, contact_company: e.target.value })} placeholder="Company name" />
                </Field>
                <Field label="Email">
                  <input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} placeholder="client@example.com" />
                </Field>
                <Field label="Phone">
                  <input
                    value={form.contact_phone}
                    onChange={(e) => setForm({ ...form, contact_phone: formatPhoneNumber(e.target.value) })}
                    placeholder="(555) 123-4567"
                  />
                </Field>
              </FieldRow>
              <Field label="Billing address">
                <input value={form.billing_address} onChange={(e) => setForm({ ...form, billing_address: e.target.value })} placeholder="123 Main St, City, State 12345" />
              </Field>
              <label className="calm-check">
                <input type="checkbox" checked={form.tax_exempt} onChange={(e) => setForm({ ...form, tax_exempt: e.target.checked })} />
                Tax exempt
              </label>
              <a
                className="calm-link"
                href={`/admin/events/new?date=${form.date}&type=private`}
                onClick={(e) => { e.preventDefault(); setShowModal(false); router.push(`/admin/events/new?date=${form.date}&type=private`); }}
              >
                Need more fields? Use the full event form →
              </a>
            </div>
          )}

          <Field label="Internal notes">
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Internal notes (not shown publicly)" rows={3} />
          </Field>

          <Field label="Description">
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Public description (optional)" rows={2} />
          </Field>

          <button type="button" className="calm-adv" onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced}>
            {showAdvanced ? "▾" : "▸"} Advanced
          </button>

          {showAdvanced && (
            <>
              <Field label="Chip colour" hint="Overrides the edge of this show's chip on the month">
                <div className="calm-swatches">
                  {COLOR_CHOICES.map((c) => (
                    <button
                      key={c || "none"}
                      type="button"
                      aria-label={c ? `Colour ${c}` : "No colour"}
                      onClick={() => setForm({ ...form, calendar_color: c })}
                      className={cx("calm-swatch", form.calendar_color === c && "is-on", !c && "calm-swatch--none")}
                      style={c ? { background: c } : undefined}
                    >
                      {!c && "×"}
                    </button>
                  ))}
                </div>
              </Field>

              {TICKETED.includes(form.event_type) && (
                <Field label="Visibility">
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>
                </Field>
              )}
            </>
          )}

          {editingEvent && (
            <a
              className="calm-link"
              href={editingEvent.event_type === "private" ? `/admin/private-events/${editingEvent.id}` : `/admin/events/${editingEvent.id}/edit`}
            >
              {editingEvent.event_type === "private" ? "Manage rental →" : "View full details →"}
            </a>
          )}
        </Modal>
      )}
    </div>
  );
}
