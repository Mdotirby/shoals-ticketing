"use client";

/**
 * Tonight — the Pulse tab, built to handoff/screens/dayof.dc.html: one
 * screen for show night. The hero (doors state, "Tonight — show", Open box
 * office POS), four KPIs, then Gates & devices, Live feed and the guest list
 * with tap-to-check-in.
 *
 * Tonight's show is the one dated today; with none, the next one on the
 * books, labelled as such, and any show can be picked. Figures:
 *
 *   Scanned in / Tickets out / Door take   /api/box-office/tonight
 *   Live feed      door sales from the same endpoint, ticket scans
 *                  (tickets.scanned_at) and guest check-ins, merged by time
 *   Guest list     /api/artists/guests — check-in is the box office's PATCH
 *
 * Duplicate scans and per-gate / per-device health aren't recorded (a ticket
 * stores when it was scanned, not where or on what), so those slots say so.
 * The full pulse analytics for a show stay at /admin/live/[eventId].
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";
import { isEventToday } from "@/lib/dates";
import { useAdminNav } from "@/app/components/admin/AdminNavContext";
import { visibleNav } from "@/lib/admin/nav";
import { Card, Eyebrow, Kpi, KpiRow, fmtUSD } from "@/app/components/admin/ui";

type EventOption = { id: string; title: string; venue: string; date: string; doors_time?: string | null; start_time?: string | null };
type Tonight = {
  cash: { orders: number; amount: number; tickets: number };
  card: { orders: number; amount: number; tickets: number };
  comp: { orders: number; tickets: number };
  online: { orders: number; amount: number; tickets: number };
  doorTotal: number;
  doorTickets: number;
  scannedIn: number;
  ticketsIssued: number;
  recent: { id: string; name: string; amount: number; quantity: number; tender: string; at: string }[];
};
type Guest = { id: string; first_name: string; last_name: string; quantity: number; artist_id?: string | null; checked_in_at?: string | null; notes?: string | null };

// Today's entries by time; older ones (a feed before show night) by date.
const clock = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const TENDER: Record<string, string> = { online: "Online sale", card: "Card sale on the reader", terminal: "Card sale on the reader", cash: "Cash sale", comp: "Comp issued" };

export default function LivePulsePickerPage() {
  const { role, perms } = useAdminNav();
  const canSell = visibleNav(role, perms).some((g) => g.pages.some((p) => p.id === "boxoffice"));

  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventId, setEventId] = useState("");
  const [tonight, setTonight] = useState<Tonight | null>(null);
  const [tonightState, setTonightState] = useState<"loading" | "ok" | "denied" | "error">("loading");
  const [guests, setGuests] = useState<Guest[]>([]);
  const [scans, setScans] = useState<{ at: string; name: string | null }[]>([]);
  const [busyGuest, setBusyGuest] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Upcoming shows (since yesterday), date order — the old picker's list.
  useEffect(() => {
    const venueId = getCookie("venue-id");
    fetch(`/api/events${venueId ? `?venue_id=${venueId}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        const upcoming = data
          .filter((e: EventOption) => new Date(e.date) >= new Date(Date.now() - 24 * 60 * 60 * 1000))
          .sort((a: EventOption, b: EventOption) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setEvents(upcoming);
        const pick = upcoming.find((e: EventOption) => isEventToday(e.date)) ?? upcoming[0];
        if (pick) setEventId(pick.id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const load = useCallback(async (id: string) => {
    setTonightState("loading");
    const [t, g] = await Promise.all([
      fetch(`/api/box-office/tonight?event_id=${id}`).catch(() => null),
      fetch(`/api/artists/guests?event_id=${id}`).catch(() => null),
    ]);
    if (!t) setTonightState("error");
    else if (t.status === 401 || t.status === 403) setTonightState("denied");
    else if (!t.ok) setTonightState("error");
    else {
      setTonight(await t.json());
      setTonightState("ok");
    }
    if (g && g.ok) {
      const d = await g.json();
      setGuests(Array.isArray(d) ? d : []);
    }
    try {
      const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
      const { data } = await getSupabaseBrowser()
        .from("tickets")
        .select("scanned_at, customer_name")
        .eq("event_id", id)
        .not("scanned_at", "is", null)
        .order("scanned_at", { ascending: false })
        .limit(12);
      setScans(((data ?? []) as { scanned_at: string; customer_name: string | null }[]).map((r) => ({ at: r.scanned_at, name: r.customer_name })));
    } catch {
      setScans([]);
    }
  }, []);

  useEffect(() => {
    if (!eventId) return;
    let live = true;
    const run = () => live && load(eventId);
    run();
    // Show night moves; refresh every 30 seconds.
    const t = setInterval(run, 30000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [eventId, load]);

  const event = events.find((e) => e.id === eventId) ?? null;
  const isTonight = event ? isEventToday(event.date) : false;

  const feed = useMemo(() => {
    const rows: Array<{ at: string; what: string; tone: "good" | "plain" | "dim" }> = [];
    for (const r of tonight?.recent ?? []) {
      rows.push({
        at: r.at,
        what: `${TENDER[r.tender] || "Sale"} — ${r.quantity} × · ${fmtUSD(r.amount)}${r.name ? ` · ${r.name.replace(/\s+/g, " ")}` : ""}`,
        tone: "plain",
      });
    }
    for (const s of scans) rows.push({ at: s.at, what: `Scanned in${s.name ? ` — ${s.name}` : ""}`, tone: "dim" });
    for (const g of guests) {
      if (g.checked_in_at) rows.push({ at: g.checked_in_at, what: `Guest list — ${g.first_name} ${g.last_name}${g.quantity > 1 ? ` party of ${g.quantity}` : ""} checked in`, tone: "good" });
    }
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  }, [tonight, scans, guests]);

  const toggleGuest = async (g: Guest) => {
    const next = !g.checked_in_at;
    setBusyGuest(g.id);
    setError("");
    const before = guests;
    setGuests((gs) => gs.map((x) => (x.id === g.id ? { ...x, checked_in_at: next ? new Date().toISOString() : null } : x)));
    try {
      const res = await fetch("/api/artists/guests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: g.id, checked_in: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setGuests(before);
        setError(d.error || "Could not update the guest list.");
      }
    } catch {
      setGuests(before);
      setError("Could not update the guest list.");
    } finally {
      setBusyGuest(null);
    }
  };

  if (loading) return <div className="dof-state">Loading tonight…</div>;
  if (!event) return <Card><div className="dof-state">No upcoming shows on the books.</div></Card>;

  const seatsIn = guests.filter((g) => g.checked_in_at).reduce((t, g) => t + (g.quantity || 0), 0);
  const seatsAll = guests.reduce((t, g) => t + (g.quantity || 0), 0);
  const issued = tonight?.ticketsIssued ?? 0;
  const lastScan = scans[0]?.at ?? null;
  const doors = event.doors_time || null;

  return (
    <div className="dof">
      {/* ── Hero ── */}
      <div className="dof-hero">
        <div className="dof-hero-text">
          <div className={`dof-state-line${isTonight ? " is-live" : ""}`}>
            <span className="dof-dot" />
            <span>
              {isTonight
                ? [doors ? `Doors ${doors}` : "Show night", lastScan ? `last scan ${clock(lastScan)}` : "no scans yet"].join(" · ")
                : `Next show · ${new Date(event.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`}
            </span>
          </div>
          <div className="dof-title">
            {isTonight ? "Tonight" : "Next up"} — {event.title}
          </div>
          <p className="dof-brief">
            Live pulse, the door and the guest list are one screen, because on show night nobody navigates. Selling is next
            door at the box office POS; this page watches and checks people in.
          </p>
          <div className="dof-hero-sub">
            <select className="dof-pick" value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Show">
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} — {isEventToday(e.date) ? "Tonight" : new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </option>
              ))}
            </select>
            <Link href={`/admin/live/${event.id}`} className="dof-link">Full pulse analytics →</Link>
          </div>
        </div>
        {canSell && (
          <Link href="/boxoffice" className="btn btn-primary dof-pos">Open box office POS</Link>
        )}
      </div>

      {/* ── KPIs ── */}
      <KpiRow>
        <Kpi
          label="Scanned in"
          value={tonightState === "ok" ? (tonight?.scannedIn ?? 0).toLocaleString() : tonightState === "denied" ? "Hidden" : "…"}
          sub={tonightState === "ok" && issued > 0 ? `${Math.round(((tonight?.scannedIn ?? 0) / issued) * 100)}% of tickets out` : "of tickets out"}
        />
        <Kpi
          label="Tickets out"
          value={tonightState === "ok" ? issued.toLocaleString() : tonightState === "denied" ? "Hidden" : "…"}
          sub={tonightState === "ok" && tonight ? `${tonight.online.tickets.toLocaleString()} online · ${tonight.doorTickets.toLocaleString()} at the door` : " "}
        />
        <Kpi
          label="Door take"
          value={tonightState === "ok" ? fmtUSD(tonight?.doorTotal ?? 0, { cents: false }) : tonightState === "denied" ? "Hidden" : "…"}
          tone={tonightState === "ok" && (tonight?.doorTotal ?? 0) > 0 ? "good" : "neutral"}
          sub={tonightState === "ok" && tonight ? `${tonight.card.orders} card, ${tonight.cash.orders} cash` : " "}
        />
        <Kpi label="Duplicates blocked" value="—" sub="Not tracked yet — rejected scans aren't logged" />
      </KpiRow>

      {tonightState === "denied" && <div className="dof-banner">Your role can&apos;t see door figures; the guest list still works.</div>}
      {error && <div className="dof-banner dof-banner--bad">{error}</div>}

      {/* ── Gates, feed, guests ── */}
      <div className="dof-cols">
        <Card>
          <Eyebrow>Gates &amp; devices</Eyebrow>
          <div className="dof-untracked">
            <b>Not tracked yet</b>
            <span>A ticket records when it was scanned, not at which gate or on which device, so there&apos;s no per-gate health to show.</span>
          </div>
          <div className="dof-gate">
            <span className={`dof-gate-dot${lastScan ? " is-on" : ""}`} />
            <span className="dof-gate-body">
              <b>All scanners</b>
              <i>{lastScan ? `last scan ${clock(lastScan)}` : "no scans yet for this show"}</i>
            </span>
            <span className="dof-gate-n">{tonightState === "ok" ? (tonight?.scannedIn ?? 0).toLocaleString() : "—"}</span>
          </div>
          <Link href="/admin/scan" className="dof-link" style={{ display: "inline-block", marginTop: 12 }}>Open the scanner →</Link>
        </Card>

        <Card>
          <Eyebrow>Live feed</Eyebrow>
          {feed.length === 0 ? (
            <div className="dof-empty">Nothing yet — door sales, scans and check-ins land here as they happen.</div>
          ) : (
            <div className="dof-feed">
              {feed.map((f, i) => (
                <div key={`${f.at}-${i}`} className="dof-feed-row">
                  <span className="dof-feed-when">{clock(f.at)}</span>
                  <span className={`dof-feed-what dof-tone-${f.tone}`}>{f.what}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="dof-card-head">
            <Eyebrow>Guest list — tap to check in</Eyebrow>
            <span className="filter-spacer" />
            <span className="dof-count">{seatsIn} of {seatsAll} in</span>
          </div>
          {guests.length === 0 ? (
            <div className="dof-empty">No one on the list for this show. Add guests on the Guest check-in tab.</div>
          ) : (
            <div className="dof-guests">
              {guests.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`dof-guest${g.checked_in_at ? " is-in" : ""}`}
                  onClick={() => toggleGuest(g)}
                  disabled={busyGuest === g.id}
                >
                  <span className="dof-guest-body">
                    <b>{g.first_name} {g.last_name}</b>
                    <i>{g.artist_id ? "Artist" : "House"} · {g.quantity} {g.quantity === 1 ? "seat" : "seats"}</i>
                  </span>
                  <span className="dof-guest-state">{g.checked_in_at ? "Checked in" : "Not arrived"}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
