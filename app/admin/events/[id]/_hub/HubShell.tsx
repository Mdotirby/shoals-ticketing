"use client";

/**
 * The event hub's frame — eventhub.dc.html's header, KPI strip, grouped
 * sub-nav and section head, around whichever section `?tab=` names.
 *
 * Everything here is the same on every section: the breadcrumb and show
 * switcher, the state line and the doors · show line, publish, the four
 * KPIs, the sub-nav with its badges and unsaved dots, the save bar and the
 * leave confirm. Sections render only their own body.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDoorsTime, formatEventTime, isEventPast, isEventToday, safeDate, localTodayISO, eventDayISO } from "@/lib/dates";
import { fmtUSD } from "@/app/components/admin/ui";
import { getCookie } from "@/lib/cookies";
import { useHub } from "./HubContext";
import { HubModal } from "./ui";
import {
  HUB_GROUPS, HUB_GROUP_OF, HUB_LABEL, HUB_SUB, canOpen, deniedCopy, firstTabFor, OWNER_ROLES, type HubTab,
} from "./config";

const AGE_LABEL: Record<string, string> = { all_ages: "All ages", "18+": "18+", "21+": "21+" };

/** Whole days from venue-local today to the show's day; negative once played. */
function daysOut(date: string) {
  const a = new Date(localTodayISO() + "T12:00:00").getTime();
  const b = new Date(eventDayISO(date) + "T12:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

function dateLong(date: string) {
  return safeDate(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/* ── Section head actions: a section portals its buttons into the head ── */

let actionSlot: HTMLElement | null = null;
const slotListeners = new Set<() => void>();

export function HubActions({ children }: { children: React.ReactNode }) {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    slotListeners.add(fn);
    return () => { slotListeners.delete(fn); };
  }, []);
  return actionSlot ? createPortal(children, actionSlot) : null;
}

/* ── Shell ── */

type SwitchRow = { id: string; title: string; date: string; venue: string; status: string | null; event_type?: string | null };

export default function HubShell({
  tab,
  setTab,
  children,
}: {
  tab: HubTab;
  setTab: (t: HubTab) => void;
  children: React.ReactNode;
}) {
  const hub = useHub();
  const { event, role, sold, capacity, breakEven, revenue, settlement, guests, promoActive, dirty, toastMsg } = hub;
  const router = useRouter();

  const [menu, setMenu] = useState<null | "switch">(null);
  const [switchQ, setSwitchQ] = useState("");
  const [switchRows, setSwitchRows] = useState<SwitchRow[] | null>(null);
  const [picker, setPicker] = useState(false);
  const [pending, setPending] = useState<HubTab | null>(null);
  const [publishing, setPublishing] = useState(false);
  const headRef = useRef<HTMLElement | null>(null);
  const [headH, setHeadH] = useState(200);

  const setSlot = useCallback((el: HTMLDivElement | null) => {
    actionSlot = el;
    slotListeners.forEach((fn) => fn());
  }, []);

  // The sub-nav sticks under the header, whatever height the header wraps to.
  useEffect(() => {
    const el = headRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setHeadH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [event]);

  // A role that can't open this section lands on the first one it can.
  useEffect(() => {
    if (role && !canOpen(role, tab) && firstTabFor(role) !== tab) setTab(firstTabFor(role));
  }, [role, tab, setTab]);

  // ⌘K opens the switcher, Escape closes whatever is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMenu((m) => (m === "switch" ? null : "switch"));
        setSwitchQ("");
      } else if (e.key === "Escape") {
        setMenu(null);
        setPicker(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Unsaved edits survive nothing — the browser asks before leaving the page.
  const anyDirty = Object.values(dirty).some((d) => d && d.count > 0);
  useEffect(() => {
    if (!anyDirty) return;
    const onLeave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [anyDirty]);

  // The switcher's list loads the first time it opens.
  useEffect(() => {
    if (menu !== "switch" || switchRows) return;
    const params = new URLSearchParams({ all: "1" });
    const venueId = getCookie("venue-id");
    if (venueId) params.set("venue_id", venueId);
    fetch(`/api/events?${params}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSwitchRows(Array.isArray(d) ? d.filter((e: SwitchRow) => e.event_type !== "private") : []))
      .catch(() => setSwitchRows([]));
  }, [menu, switchRows]);

  const ask = (t: HubTab) => {
    setPicker(false);
    if (t === tab) return;
    if (dirty[tab]?.count) { setPending(t); return; }
    setTab(t);
    window.scrollTo(0, 0);
  };

  const switchList = useMemo(() => {
    const q = switchQ.trim().toLowerCase();
    const rows = (switchRows ?? [])
      .filter((e) => !q || `${e.title} ${e.venue} ${dateLong(e.date)}`.toLowerCase().includes(q))
      .sort((a, b) => {
        // Upcoming soonest-first, then past most-recent-first.
        const pa = isEventPast(a.date), pb = isEventPast(b.date);
        if (pa !== pb) return pa ? 1 : -1;
        return pa ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
      });
    return rows.slice(0, 40);
  }, [switchRows, switchQ]);

  if (hub.notFound) {
    return (
      <div className="hub hub-missing">
        <div className="hub-empty">
          <div className="hub-empty-title">Show not found</div>
          <div className="hub-empty-body">It may have been deleted, or it belongs to another venue.</div>
          <div className="hub-empty-ctas"><Link href="/admin/calendar?tab=list" className="hub-btn hub-btn--primary">Back to events</Link></div>
        </div>
      </div>
    );
  }

  if (!event) return <div className="hub hub-booting">Loading show…</div>;

  const isOwner = OWNER_ROLES.includes(role);
  const published = (event.status || "published") === "published";
  const cancelled = event.status === "cancelled";
  const postponed = event.status === "postponed";
  const days = daysOut(event.date);
  const soldOut = capacity.sellable > 0 && sold >= capacity.sellable;

  const stateLine = cancelled ? "Cancelled · refunds processing"
    : postponed ? "Postponed · new date TBD"
    : !published ? "Unpublished · hidden from the storefront"
    : days < 0 ? "Played"
    : isEventToday(event.date) ? "Tonight"
    : soldOut ? `Sold out · ${days} ${days === 1 ? "day" : "days"} out`
    : `On sale · ${days} ${days === 1 ? "day" : "days"} out`;
  const stateTone = cancelled ? "bad" : postponed || !published ? "warn" : days < 0 ? "dim" : "good";

  const doors = formatDoorsTime(event.date, event.doors_time);
  const show = formatEventTime(event.date);
  const times = [doors && `Doors ${doors}`, show && `Show ${show}`].filter(Boolean).join(" · ");
  const age = AGE_LABEL[event.age_restriction || ""] ?? event.age_restriction;

  const pct = capacity.sellable > 0 ? Math.round((sold / capacity.sellable) * 100) : 0;
  const grossOk = revenue.state === "ok" && revenue.data;
  const toGo = breakEven === null ? null : Math.max(0, breakEven - sold);
  const kpis = [
    { label: "Sold / capacity", value: `${sold.toLocaleString()} / ${capacity.sellable.toLocaleString()}`, sub: `${pct}%`, tone: "", bar: Math.min(100, pct) },
    {
      label: "Gross",
      value: grossOk ? fmtUSD(revenue.data!.ticketRevenue, { cents: false }) : "—",
      sub: revenue.state === "denied" ? "not for your role" : revenue.state === "loading" ? "loading…" : revenue.state === "error" ? "couldn't load" : "face value, net of refunds",
      tone: "",
    },
    {
      label: "To break even",
      value: toGo === null ? "—" : toGo > 0 ? `${toGo.toLocaleString()} tickets` : "Cleared",
      sub: breakEven === null ? (hub.offer === null ? "no linked offer" : "not tracked yet") : `break even at ${breakEven.toLocaleString()}`,
      tone: toGo === null ? "" : toGo > 0 ? "warn" : "good",
    },
    {
      label: days < 0 ? "Days since" : "Days out",
      value: days === 0 ? "Tonight" : String(Math.abs(days)),
      sub: dateLong(event.date).replace(/, \d{4}$/, ""),
      tone: "",
    },
  ];

  const guestsIn = guests.filter((g) => g.checked_in_at).reduce((t, g) => t + (Number(g.quantity) || 0), 0);
  const guestsAll = guests.reduce((t, g) => t + (Number(g.quantity) || 0), 0);
  const badge: Partial<Record<HubTab, string>> = {
    promotions: promoActive ? String(promoActive) : "",
    orders: sold ? sold.toLocaleString() : "",
    guests: guestsAll ? `${guestsIn}/${guestsAll}` : "",
    dayof: safeDate(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    settlement: settlement ? (settlement.status === "finalized" ? "Final" : "Draft") : "",
  };

  const allowed = canOpen(role, tab);
  const denied = deniedCopy(role, tab);
  const cur = dirty[tab];

  const togglePublish = async () => {
    const next = published ? "draft" : "published";
    if (next === "draft" && !confirm(
      `Unpublish "${event.title}"?\n\nThe listing comes off the storefront immediately. ` +
      `Orders, tickets and scans are untouched and sold tickets stay valid.`,
    )) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error("failed");
      hub.setEvent((e) => ({ ...e, status: next }));
      hub.toast(next === "draft"
        ? "Unpublished. The show is hidden from the storefront; existing tickets stay valid."
        : "Published. The show is live on the storefront.");
    } catch {
      hub.toast("Could not change visibility. Try again.");
    } finally {
      setPublishing(false);
    }
  };

  const save = async () => {
    if (!cur) return;
    const n = cur.count;
    const ok = await cur.save();
    if (ok) hub.toast(`Saved. ${n} change${n > 1 ? "s" : ""} ${n > 1 ? "are" : "is"} live.`);
  };

  const navItems = (inPicker: boolean) =>
    HUB_GROUPS.map((g) => (
      <div key={g.label} className="hub-nav-group">
        <div className="hub-nav-label">{g.label}</div>
        {g.items.map((id) => {
          const label = HUB_LABEL[id];
          const ok = canOpen(role, id);
          const ds = dirty[id]?.count ?? 0;
          const b = !ok ? "No access" : ds ? `● ${ds}` : badge[id] ?? "";
          return (
            <button
              key={id}
              type="button"
              className={`hub-nav-item${id === tab ? " is-on" : ""}${ok ? "" : " is-off"}${inPicker ? " hub-nav-item--picker" : ""}`}
              onClick={() => ask(id)}
              aria-current={id === tab ? "page" : undefined}
            >
              {!inPicker && <span className="hub-nav-dot" />}
              <span className="hub-nav-name">{label}</span>
              <span className={`hub-nav-badge${ds ? " is-dirty" : ""}`}>{b}</span>
            </button>
          );
        })}
      </div>
    ));

  return (
    <div className="hub" style={{ ["--hub-head-h" as string]: `${headH}px` }}>
      <header ref={headRef} className="hub-head">
        <div className="hub-crumbs">
          <Link href="/admin/calendar?tab=list" className="hub-crumb">Events</Link>
          <span className="hub-crumb-sep">›</span>
          <span className="hub-crumb">{event.title}</span>
          <span className="hub-crumb-sep">›</span>
          <span className="hub-crumb is-on">{HUB_LABEL[tab]}</span>
          <span className="hub-spacer" />
          <div className="hub-pop-anchor">
            <button type="button" className="hub-switch" onClick={() => { setMenu(menu === "switch" ? null : "switch"); setSwitchQ(""); }}>
              Switch show <span className="hub-kbd">⌘K</span>
            </button>
            {menu === "switch" && (
              <>
                <div className="hub-pop-scrim" onClick={() => setMenu(null)} />
                <div className="hub-pop hub-pop--switch">
                  <input
                    autoFocus
                    value={switchQ}
                    onChange={(e) => setSwitchQ(e.target.value)}
                    placeholder="Type a show, date or venue"
                    className="hub-input"
                  />
                  <div className="hub-switch-list">
                    {switchRows === null && <div className="hub-switch-none">Loading shows…</div>}
                    {switchList.map((e) => {
                      const past = isEventPast(e.date);
                      const st = e.status === "draft" ? "Draft" : e.status === "cancelled" ? "Cancelled" : past ? "Past" : "On sale";
                      return (
                        <button
                          key={e.id}
                          type="button"
                          className={`hub-switch-row${e.id === event.id ? " is-on" : ""}`}
                          onClick={() => {
                            setMenu(null);
                            if (e.id === event.id) { hub.toast("You are on this show."); return; }
                            if (anyDirty && !confirm("You have unsaved changes on this show. Leave without saving?")) return;
                            router.push(`/admin/events/${e.id}${tab === "summary" ? "" : `?tab=${tab}`}`);
                          }}
                        >
                          <span className={`hub-dot hub-dot--${e.status === "draft" ? "warn" : past ? "dim" : "good"}`} />
                          <span className="hub-switch-text">
                            <span className="hub-switch-name">{e.title}</span>
                            <span className="hub-switch-meta">{safeDate(e.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {e.venue}</span>
                          </span>
                          <span className="hub-switch-status">{st}</span>
                        </button>
                      );
                    })}
                    {switchRows !== null && switchList.length === 0 && (
                      <div className="hub-switch-none">No show matches &ldquo;{switchQ}&rdquo;.</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="hub-titlebar">
          <div className="hub-title-text">
            <div className={`hub-state hub-state--${stateTone}`}>
              <span className="hub-state-dot" />
              <span>{stateLine}</span>
            </div>
            <h1 className="hub-title">{event.title}</h1>
            <div className="hub-meta">
              <span className="hub-meta-date">{dateLong(event.date)}</span>
              {times && <><span className="hub-meta-sep">·</span><span>{times}</span></>}
              {event.venue && <><span className="hub-meta-sep">·</span><span>{event.venue}</span></>}
              {age && <span className="hub-meta-age">{age}</span>}
            </div>
          </div>
          <div className="hub-head-actions">
            {isOwner && (
              <button
                type="button"
                className={`hub-btn${published ? "" : " hub-btn--primary"}`}
                onClick={togglePublish}
                disabled={publishing}
              >
                {publishing ? "Working…" : published ? "Unpublish" : "Publish"}
              </button>
            )}
            <a href={`/events/${event.id}`} target="_blank" rel="noreferrer" className="hub-btn">View on storefront ↗</a>
          </div>
        </div>

        {role !== "artist" && (
          <div className="hub-kpis">
            {kpis.map((k) => (
              <div key={k.label} className="hub-kpi">
                <div className="hub-kpi-label">{k.label}</div>
                <div className="hub-kpi-line">
                  <div className={`hub-kpi-value${k.tone ? ` is-${k.tone}` : ""}`}>{k.value}</div>
                  <div className="hub-kpi-sub">{k.sub}</div>
                </div>
                {k.bar !== undefined && <div className="hub-kpi-bar"><div style={{ width: `${k.bar}%` }} /></div>}
              </div>
            ))}
          </div>
        )}
      </header>

      <div className="hub-body">
        <nav className="hub-nav" aria-label="Show sections">{navItems(false)}</nav>

        <div className="hub-main">
          <div className="hub-picker">
            <button type="button" className="hub-picker-btn" onClick={() => setPicker(!picker)} aria-expanded={picker}>
              <span className="hub-picker-group">{HUB_GROUP_OF[tab]}</span>
              <span className="hub-picker-name">{HUB_LABEL[tab]}</span>
              <span className="hub-picker-caret">▾</span>
            </button>
            {picker && <div className="hub-pop hub-pop--picker">{navItems(true)}</div>}
          </div>

          <div className="hub-sec-head">
            <div className="hub-sec-text">
              <h2 className="hub-sec-title">{HUB_LABEL[tab]}</h2>
              <div className="hub-sec-sub">{HUB_SUB[tab]}</div>
            </div>
            <div ref={setSlot} className="hub-sec-actions" />
          </div>

          {allowed ? children : (
            <div className="hub-denied">
              <div className="hub-denied-icon">⊘</div>
              <div className="hub-empty-title">{denied.title}</div>
              <div className="hub-empty-body">{denied.body}</div>
              <button type="button" className="hub-btn" onClick={() => setTab(firstTabFor(role))}>
                Go to {HUB_LABEL[firstTabFor(role)]}
              </button>
            </div>
          )}

          {allowed && cur && cur.count > 0 && (
            <div className="hub-savebar">
              <span className="hub-savebar-dot" />
              <div className="hub-savebar-text">
                <div className="hub-savebar-count">{cur.count} unsaved change{cur.count > 1 ? "s" : ""} in {HUB_LABEL[tab]}</div>
                <div className="hub-savebar-note">A live show saves on your word. Nothing here autosaves.</div>
              </div>
              <button type="button" className="hub-btn" onClick={() => cur.discard()}>Discard</button>
              <button type="button" className="hub-btn hub-btn--primary" onClick={save}>Save changes</button>
            </div>
          )}
        </div>
      </div>

      {pending && (
        <HubModal eyebrow="Unsaved changes" title={`Leave ${HUB_LABEL[tab]}?`} onClose={() => setPending(null)}>
          <div className="hub-modal-body">
            You have {cur?.count ?? 0} unsaved change{(cur?.count ?? 0) > 1 ? "s" : ""} in {HUB_LABEL[tab]}. Nothing on a live show saves until you say so.
          </div>
          <div className="hub-modal-actions">
            <button type="button" className="hub-btn hub-btn--quiet" onClick={() => setPending(null)}>Stay</button>
            <button type="button" className="hub-btn" onClick={() => { cur?.discard(); const t = pending; setPending(null); setTab(t); }}>Discard and go</button>
            <button
              type="button"
              className="hub-btn hub-btn--primary"
              onClick={async () => {
                const t = pending;
                const ok = cur ? await cur.save() : true;
                setPending(null);
                if (ok) setTab(t);
              }}
            >
              Save and go
            </button>
          </div>
        </HubModal>
      )}

      {toastMsg && <div className="hub-toast" role="status">{toastMsg}</div>}
    </div>
  );
}
