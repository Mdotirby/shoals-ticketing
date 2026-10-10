"use client";

/**
 * Day of show — eventhub.dc.html ?tab=dayof. The room in real time once
 * doors open: who is in against the room, scan velocity, revenue tonight,
 * scans by tier and the feed of check-ins and sales. Replaces
 * /admin/live/[eventId]; the box office POS and the scanner stay their own
 * screens, one click away.
 *
 * Reads /api/admin/live-pulse — the same source the old live page used —
 * every 15 seconds on show night. Before the night it says so and points at
 * the POS and scanner; after it, it shows the night as it was scanned.
 * Gates aren't recorded per scan, so the feed names the tier instead; bar,
 * merch and parking are entered on the settlement, not tracked live.
 */

import { useEffect, useState } from "react";
import { fmtUSD } from "@/app/components/admin/ui";
import { eventDayISO, formatDoorsTime, isEventPast, isEventToday, localTodayISO } from "@/lib/dates";
import { useHub } from "../HubContext";
import { useEventOrders } from "../useEventData";
import { HubActions } from "../HubShell";
import { HubEmpty, HubLoading } from "../ui";

type Pulse = {
  capacity: { total: number; sold: number; scanned: number };
  revenue: { total: number; today: number };
  sales: { today: number; total: number };
  doorSales?: { orders: number; tickets: number; amount: number };
  scanning: { velocity: number; buckets?: { start: string; scans: number }[] };
  tiers: { id: string; name: string; sold: number; scanned?: number }[];
  recentScans: { id: string; customerName: string; scannedAt: string; tierName: string }[];
  recentOrders: { id: string; customerName: string; amount: number; quantity: number; createdAt: string }[];
  lastUpdated: string;
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function DayOf() {
  const hub = useHub();
  const { id, event, guests, capacity } = hub;
  const { data: orders } = useEventOrders(id);
  const [data, setData] = useState<Pulse | null>(null);
  const [error, setError] = useState(false);

  const tonight = !!event && isEventToday(event.date);
  const played = !!event && isEventPast(event.date);

  useEffect(() => {
    if (!event || (!tonight && !played)) return;
    let live = true;
    const load = () =>
      fetch(`/api/admin/live-pulse?event_id=${id}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => live && (setData(d), setError(false)))
        .catch(() => live && setError(true));
    load();
    const t = tonight ? setInterval(load, 15000) : null;
    return () => { live = false; if (t) clearInterval(t); };
  }, [id, event, tonight, played]);

  if (!event) return null;
  const doors = formatDoorsTime(event.date, event.doors_time);
  const day = new Date(event.date.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const actions = (
    <HubActions>
      <a className="hub-btn" href="/admin/scan">Open scanner</a>
      <a className="hub-btn hub-btn--primary" href="/boxoffice">Open box office POS</a>
    </HubActions>
  );

  if (!tonight && !played) {
    return (
      <>
        {actions}
        <HubEmpty
          title="Not show night yet"
          body={`The live view starts when doors open${doors ? ` at ${doors}` : ""} on ${day}. The box office and scanner are ready now.`}
          ctas={[{ label: "Open box office POS", href: "/boxoffice" }, { label: "Open scanner", href: "/admin/scan" }]}
        />
      </>
    );
  }
  if (error && !data) return <>{actions}<HubEmpty title="Couldn't load the night" body="The live figures didn't come back. Try again in a moment." /></>;
  if (!data) return <>{actions}<HubLoading label="Day of show" /></>;

  const guestsIn = guests.filter((g) => g.checked_in_at).reduce((t, g) => t + (Number(g.quantity) || 0), 0);
  const guestsAll = guests.reduce((t, g) => t + (Number(g.quantity) || 0), 0);
  const inside = data.capacity.scanned + guestsIn;
  const room = capacity.room ?? capacity.sellable ?? data.capacity.total;
  const pct = room > 0 ? Math.round((inside / room) * 100) : 0;
  const expected = data.capacity.sold + guestsAll;
  const toCome = Math.max(0, expected - inside);
  // The show's own day in venue time — "tonight" for a played show is that day, not today.
  const showDay = eventDayISO(event.date);
  const onShowDay = (orders ?? []).filter((o) => o.status === "paid" && localTodayISO(new Date(o.created_at)) === showDay);
  const door = onShowDay.filter((o) => ["box_office", "terminal", "cash"].includes(o.source || ""));
  const sum = (list: typeof onShowDay) => list.reduce((t, o) => t + (Number(o.total_amount) || 0), 0);
  const qty = (list: typeof onShowDay) => list.reduce((t, o) => t + (Number(o.quantity) || 1), 0);
  const buckets = data.scanning.buckets ?? [];
  const peak = buckets.reduce((m, b) => (b.scans > m.scans ? b : m), { start: "", scans: 0 });
  const bmax = Math.max(1, peak.scans);

  const feed = [
    ...data.recentScans.map((s) => ({ t: s.scannedAt, what: `${s.tierName} · ${s.customerName || "ticket"} · valid`, where: "Scanned", tone: "good" })),
    ...data.recentOrders.filter((o) => o.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10) || played).map((o) => ({
      t: o.createdAt, what: `${o.quantity}× · ${o.customerName || "Guest"} · ${fmtUSD(Number(o.amount) || 0)}`, where: "Sold", tone: "blue",
    })),
    ...guests.filter((g) => g.checked_in_at).map((g) => ({ t: String(g.checked_in_at), what: `Guest list · ${g.first_name} ${g.last_name}${g.quantity > 1 ? ` +${g.quantity - 1}` : ""}`, where: "Guest list", tone: "purp" })),
  ].sort((a, b) => b.t.localeCompare(a.t)).slice(0, 16);

  return (
    <>
      {actions}
      <div className="hub-dayof">
        <div className={`hub-live-strip${tonight ? " is-live" : ""}`}>
          <span className="hub-live-dot" />
          <div className="hub-live-label">
            {tonight ? `Live${doors ? ` · doors ${doors}` : ""} · ${data.capacity.scanned.toLocaleString()} scanned` : `Played ${day} · the night as it was scanned`}
          </div>
          <span className="hub-spacer" />
          <div className="hub-card-note">{tonight ? `Updated ${clock(data.lastUpdated)} · refreshes every 15 s` : "Final"}</div>
        </div>

        <div className="hub-dayof-grid">
          <section className="hub-card hub-card--glow">
            <div className="hub-eyebrow">In the room</div>
            <div className="hub-inv-big">
              <div className="hub-dayof-big">{inside.toLocaleString()}</div>
              <div className="hub-inv-sub">of {expected.toLocaleString()} with tickets · {expected ? Math.round((inside / expected) * 100) : 0}% · {tonight ? `${toCome.toLocaleString()} still to arrive` : `${toCome.toLocaleString()} never arrived`}</div>
            </div>
            <div className="hub-roombar">
              <div style={{ width: `${Math.min(100, pct)}%` }} />
              <span style={{ left: "92%" }} />
            </div>
            <div className="hub-roombar-scale"><span>0 · {pct}% of the room</span><span className="is-warn">92% alert</span><span>{room.toLocaleString()} room</span></div>
          </section>

          <section className="hub-card hub-card--glow">
            <div className="hub-card-line">
              <div className="hub-eyebrow">Scan velocity</div>
              <span className="hub-spacer" />
              <div className="hub-dayof-rate">
                {tonight ? `${data.scanning.velocity} a minute now` : `${data.capacity.scanned.toLocaleString()} scans`}{peak.scans ? ` · peak ${peak.scans} at ${clock(peak.start)}` : ""}
              </div>
            </div>
            {buckets.length ? (
              <>
                <div className="hub-scanbars">
                  {buckets.map((b, i) => (
                    <div key={b.start} className={i === buckets.length - 1 && tonight ? "is-now" : ""} style={{ height: `${Math.max(2, Math.round((b.scans / bmax) * 100))}%` }} title={`${clock(b.start)} · ${b.scans}`} />
                  ))}
                </div>
                <div className="hub-roombar-scale"><span>{clock(buckets[0].start)}</span><span>{clock(buckets[buckets.length - 1].start)}</span></div>
              </>
            ) : (
              <div className="hub-pace-none">No scans yet.</div>
            )}
          </section>

          <section className="hub-card hub-card--glow">
            <div className="hub-eyebrow">Revenue {tonight ? "tonight" : "on the night"}</div>
            <div className="hub-rev">
              <div className="hub-dayof-rev"><div><b>Door tickets</b><span>{qty(door)} sold on the day · box office, terminal and cash</span></div><strong>{fmtUSD(sum(door))}</strong></div>
              <div className="hub-dayof-rev"><div><b>All ticket sales on the day</b><span>{qty(onShowDay)} tickets, every channel</span></div><strong>{fmtUSD(sum(onShowDay))}</strong></div>
              <div className="hub-dayof-rev"><div><b>Ticket sales, all time</b><span>{data.capacity.sold.toLocaleString()} tickets</span></div><strong>{fmtUSD(data.revenue.total)}</strong></div>
              <div className="hub-dayof-rev is-dim"><div><b>Bar, merch, parking</b><span>Entered on the settlement — not tracked live</span></div><strong>—</strong></div>
            </div>
          </section>

          <section className="hub-card hub-card--glow">
            <div className="hub-eyebrow">Scanned by tier</div>
            <div className="hub-attr">
              {data.tiers.map((t) => (
                <div key={t.id}>
                  <div className="hub-attr-line"><div className="hub-attr-name">{t.name}</div><div className="hub-attr-rev">{(t.scanned ?? 0).toLocaleString()} / {t.sold.toLocaleString()}</div></div>
                  <div className="hub-attr-bar hub-attr-bar--thick"><div style={{ width: `${t.sold ? Math.round(((t.scanned ?? 0) / t.sold) * 100) : 0}%` }} /></div>
                </div>
              ))}
              {guestsAll > 0 && (
                <div>
                  <div className="hub-attr-line"><div className="hub-attr-name">Guest list</div><div className="hub-attr-rev">{guestsIn} / {guestsAll}</div></div>
                  <div className="hub-attr-bar hub-attr-bar--thick"><div style={{ width: `${Math.round((guestsIn / guestsAll) * 100)}%` }} /></div>
                </div>
              )}
            </div>
          </section>

          <section className="hub-card hub-card--glow hub-dayof-feed">
            <div className="hub-eyebrow">Recent check-ins and sales</div>
            <div className="hub-feed">
              {feed.length === 0 && <div className="hub-alert-none">Nothing yet.</div>}
              {feed.map((f, i) => (
                <div key={i} className="hub-feed-row">
                  <div className="hub-feed-t">{clock(f.t)}</div>
                  <span className={`hub-tl-dot is-${f.tone}`} />
                  <div className="hub-feed-what">{f.what}</div>
                  <div className="hub-feed-where">{f.where}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
