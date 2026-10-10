"use client";

/**
 * Events — built to handoff/screens/eventslist.dc.html.
 *
 * Every show for the venue in one list: search, a date range, status and
 * venue filters, then a row per show with its sold / capacity bar, ledger
 * gross and days out. Every row opens the show's event hub; the quick
 * actions open it on Details, open the storefront page, or duplicate the
 * show as a draft.
 *
 * Replaces the Show list tab of Calendar & shows. Private rentals stay on
 * Rental quotes — they are not shows that sell tickets — and still appear on
 * the month calendar.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCookie } from "@/lib/cookies";
import { eventDayISO, isEventPast, localTodayISO, safeDate } from "@/lib/dates";
import { useAdminNav } from "@/app/components/admin/AdminNavContext";

type Row = {
  id: string;
  title: string;
  subtitle?: string | null;
  venue: string;
  date: string;
  status: string | null;
  event_type: string | null;
  booking_status: string | null;
  closed_out_at?: string | null;
};
type Sales = Record<string, { sold: number; capacity: number; gross: number; settled?: boolean }>;
type StatusKey = "draft" | "onsale" | "soldout" | "past" | "settled" | "cancelled";

const STATUS: Record<StatusKey, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "warn" },
  onsale: { label: "On sale", tone: "good" },
  soldout: { label: "Sold out", tone: "bad" },
  past: { label: "Past", tone: "dim" },
  settled: { label: "Settled", tone: "blue" },
  // Not a filter chip — the mockup has five — but a cancelled show must never
  // read "On sale". It still shows under All and in search.
  cancelled: { label: "Cancelled", tone: "bad" },
};
const CHIPS: StatusKey[] = ["draft", "onsale", "soldout", "past", "settled"];

const CLASS_LABEL: Record<string, string> = {
  hard_ticket: "Hard ticket",
  ticketed: "Hard ticket",
  non_ticketed: "Non-ticketed",
  co_promote: "Co-promote",
  rental_box_office: "Rental box office",
};

const EDITOR_ROLES = ["owner", "super_admin", "venue_admin", "full_admin"];

function daysOut(date: string) {
  const a = new Date(localTodayISO() + "T12:00:00").getTime();
  const b = new Date(eventDayISO(date) + "T12:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

function statusOf(e: Row, s: Sales[string] | undefined): StatusKey {
  if (e.booking_status === "cancelled" || e.status === "cancelled") return "cancelled";
  if (s?.settled) return "settled";
  if (isEventPast(e.date)) return "past";
  if (e.status === "draft" || e.booking_status === "hold") return "draft";
  if (s && s.capacity > 0 && s.sold >= s.capacity) return "soldout";
  return "onsale";
}

const RANGES = ["upcoming", "next30", "month", "past", "all"] as const;
type Range = (typeof RANGES)[number];

export default function EventsListPage() {
  const router = useRouter();
  const { role } = useAdminNav();
  const [events, setEvents] = useState<Row[] | null>(null);
  const [sales, setSales] = useState<Sales>({});
  const [q, setQ] = useState("");
  const [range, setRange] = useState<Range>("upcoming");
  const [statuses, setStatuses] = useState<StatusKey[]>([]);
  const [venues, setVenues] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  // Phones: status and venue chips fold behind a button so the list is first.
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({ all: "1" });
    const venueId = getCookie("venue-id");
    if (venueId) params.set("venue_id", venueId);
    fetch(`/api/events?${params}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setEvents(Array.isArray(d) ? d.filter((e: Row) => e.event_type !== "private") : []))
      .catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    if (!events?.length) return;
    let live = true;
    const ids = events.map((e) => e.id);
    // The sales endpoint takes 300 ids a call.
    for (let i = 0; i < ids.length; i += 300) {
      fetch(`/api/admin/events/sales?ids=${ids.slice(i, i + 300).join(",")}`)
        .then((r) => (r.ok ? r.json() : {}))
        .then((d) => live && setSales((prev) => ({ ...prev, ...(d || {}) })))
        .catch(() => {});
    }
    return () => { live = false; };
  }, [events]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  };

  const now = new Date();
  const monthName = now.toLocaleDateString("en-US", { month: "long" });
  const monthKey = localTodayISO().slice(0, 7);
  const all = useMemo(() => events ?? [], [events]);

  const inRange = (e: Row) => {
    const d = daysOut(e.date);
    switch (range) {
      case "all": return true;
      case "upcoming": return d >= 0;
      case "next30": return d >= 0 && d <= 30;
      case "month": return eventDayISO(e.date).slice(0, 7) === monthKey;
      case "past": return d < 0;
    }
  };

  const ql = q.trim().toLowerCase();
  const base = all.filter((e) =>
    inRange(e)
    && (!venues.length || venues.includes(e.venue))
    && (!ql || `${e.title} ${e.subtitle ?? ""} ${e.venue} ${CLASS_LABEL[e.event_type || ""] ?? ""}`.toLowerCase().includes(ql)),
  );
  const rows = base
    .filter((e) => !statuses.length || statuses.includes(statusOf(e, sales[e.id])))
    .sort((a, b) => (range === "past" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));

  const venueList = useMemo(() => [...new Set(all.map((e) => e.venue).filter(Boolean))].sort(), [all]);
  const filtered = !!(q || statuses.length || venues.length || range !== "upcoming");
  const up = all.filter((e) => daysOut(e.date) >= 0);
  const upSold = up.reduce((t, e) => t + (sales[e.id]?.sold ?? 0), 0);
  const upGross = up.reduce((t, e) => t + (sales[e.id]?.gross ?? 0), 0);
  const none = events !== null && all.length === 0;

  const toggle = <T,>(list: T[], v: T, set: (x: T[]) => void) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const clear = () => { setQ(""); setRange("upcoming"); setStatuses([]); setVenues([]); };

  const duplicate = async (e: Row) => {
    setBusy(e.id);
    try {
      const r = await fetch(`/api/events/${e.id}/duplicate`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not duplicate");
      flash(`${e.title} duplicated as a draft.`);
      router.push(`/admin/events/${d.id}?tab=details`);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not duplicate.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="evl">
      <header className="evl-head">
        <div className="evl-head-text">
          <h1 className="evl-title">Events</h1>
          <div className="evl-sub">
            {events === null ? "Loading shows…" : none ? "No shows yet"
              : `${up.length} upcoming · ${upSold.toLocaleString()} tickets sold · $${Math.round(upGross).toLocaleString()} gross`}
          </div>
        </div>
        {EDITOR_ROLES.includes(role) && <Link href="/admin/events/new" className="hub-btn hub-btn--primary">+ New event</Link>}
      </header>

      <div className="evl-body">
        <div className="evl-filters">
          <div className="evl-filter-row">
            <input
              value={q}
              onChange={(ev) => setQ(ev.target.value)}
              placeholder="Search shows, artists or venues"
              className="hub-input evl-search"
            />
            <button type="button" className={`evl-filter-toggle${filtersOpen ? " is-on" : ""}`} onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}>
              Filters{statuses.length + venues.length ? ` · ${statuses.length + venues.length}` : ""}
            </button>
            <div className="evl-seg" role="tablist" aria-label="Date range">
              {RANGES.map((r) => (
                <button key={r} type="button" role="tab" aria-selected={range === r} className={`evl-seg-btn${range === r ? " is-on" : ""}`} onClick={() => setRange(r)}>
                  {{ upcoming: "Upcoming", next30: "Next 30 days", month: monthName, past: "Past", all: "All dates" }[r]}
                </button>
              ))}
            </div>
          </div>
          <div className={`evl-filter-row evl-filter-row--chips${filtersOpen ? " is-open" : ""}`}>
            <div className="evl-chips">
              <span className="evl-chips-label">Status</span>
              {CHIPS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`evl-chip${statuses.includes(k) ? " is-on" : ""}`}
                  onClick={() => toggle(statuses, k, setStatuses)}
                  aria-pressed={statuses.includes(k)}
                >
                  <span className={`evl-dot is-${STATUS[k].tone}`} />
                  {STATUS[k].label}
                  <span className="evl-chip-n">{base.filter((e) => statusOf(e, sales[e.id]) === k).length}</span>
                </button>
              ))}
            </div>
            {venueList.length > 1 && (
              <div className="evl-chips">
                <span className="evl-chips-label">Venue</span>
                {venueList.map((v) => (
                  <button key={v} type="button" className={`evl-chip${venues.includes(v) ? " is-on" : ""}`} onClick={() => toggle(venues, v, setVenues)} aria-pressed={venues.includes(v)}>
                    {v}
                  </button>
                ))}
              </div>
            )}
            <span className="hub-spacer" />
            {filtered && <button type="button" className="evl-clear" onClick={clear}>Clear filters</button>}
          </div>
        </div>

        {events === null ? (
          <div className="evl-loading">Loading shows…</div>
        ) : rows.length > 0 ? (
          <div className="evl-table-card">
            <div className="evl-scroll">
              <div className="evl-table">
                <div className="evl-tr evl-tr--head">
                  <div>Date</div><div>Show</div><div>Venue</div><div>Status</div><div>Sold / cap</div>
                  <div className="evl-num">Gross</div><div className="evl-num">Days out</div><div />
                </div>
                {rows.map((e) => {
                  const s = sales[e.id];
                  const st = statusOf(e, s);
                  const d = daysOut(e.date);
                  const cap = s?.capacity ?? 0;
                  const sold = s?.sold ?? 0;
                  const pct = cap > 0 ? Math.round((sold / cap) * 100) : 0;
                  const hub = `/admin/events/${e.id}`;
                  const day = safeDate(e.date);
                  const meta = [
                    CLASS_LABEL[e.event_type || ""] ?? null,
                    e.booking_status === "hold" ? "Hold" : null,
                                    e.subtitle || null,
                  ].filter(Boolean).join(" · ");
                  return (
                    <div key={e.id} className="evl-tr">
                      <Link href={hub} className="evl-date">
                        <span className="evl-dow">{day.toLocaleDateString("en-US", { weekday: "short" })}</span>
                        <span className="evl-day">{day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      </Link>
                      <Link href={hub} className="evl-show">
                        <span className="evl-name">{e.title}</span>
                        {meta && <span className="evl-meta">{meta}</span>}
                      </Link>
                      <div className="evl-venue">{e.venue}</div>
                      <div><span className={`evl-status is-${STATUS[st].tone}`}><span className="evl-dot" />{STATUS[st].label}</span></div>
                      <div>
                        <div className="evl-sold">
                          <b>{s ? sold.toLocaleString() : "…"}</b>
                          <span className="evl-cap">/ {s ? cap.toLocaleString() : "…"}</span>
                          <span className="hub-spacer" />
                          <span className="evl-pct">{cap > 0 ? `${pct}%` : ""}</span>
                        </div>
                        <div className="evl-bar">
                          <div className={st === "soldout" ? "is-bad" : pct >= 75 ? "is-good" : ""} style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                      </div>
                      <div className="evl-num evl-gross">{s ? (s.gross ? `$${Math.round(s.gross).toLocaleString()}` : "—") : "…"}</div>
                      <div className={`evl-num evl-days${d >= 0 && d <= 2 ? " is-warn" : d < 0 ? " is-dim" : ""}`}>
                        {d === 0 ? "Tonight" : d === 1 ? "Tomorrow" : d > 0 ? `${d} days` : `${Math.abs(d)} days ago`}
                      </div>
                      <div className="evl-actions">
                        <Link href={hub} className="evl-act" title="Open">↗</Link>
                        <Link href={`${hub}?tab=details`} className="evl-act" title="Edit details">✎</Link>
                        <a href={`/events/${e.id}`} target="_blank" rel="noreferrer" className="evl-act" title="View storefront">◳</a>
                        {EDITOR_ROLES.includes(role) && (
                          <button type="button" className="evl-act" title="Duplicate" disabled={busy === e.id} onClick={() => duplicate(e)}>
                            {busy === e.id ? "…" : "⧉"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="evl-foot">
              <span>{rows.length} of {all.length} shows</span>
              <span className="hub-spacer" />
              <span>Open ↗ · Edit details ✎ · Storefront ◳ · Duplicate ⧉</span>
            </div>
          </div>
        ) : (
          <div className="hub-empty">
            <div className="hub-empty-title">{none ? "No shows yet" : "No shows match"}</div>
            <div className="hub-empty-body">
              {none
                ? "Create your first show to start selling. You can set up tickets, the deal and marketing from its event hub."
                : `Nothing fits these filters${q ? ` and "${q}"` : ""}. Try a wider date range or clear the status and venue filters.`}
            </div>
            <div className="hub-empty-ctas">
              {filtered && <button type="button" className="hub-btn" onClick={clear}>Clear filters</button>}
              {EDITOR_ROLES.includes(role) && <Link href="/admin/events/new" className="hub-btn hub-btn--primary">+ New event</Link>}
            </div>
          </div>
        )}
      </div>

      {toast && <div className="hub-toast" role="status">{toast}</div>}
    </div>
  );
}
