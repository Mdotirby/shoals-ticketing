"use client";

/**
 * Summary — eventhub.dc.html ?tab=summary. Where the show stands: sales
 * pace by week, what needs attention, the build checklist and where sales
 * come from. Replaces the workspace Overview tab and the Event Sales
 * headline numbers.
 *
 * Every figure is the show's own: pace is paid, non-comp tickets by week
 * (Monday-start, venue time); attribution is those orders grouped by their
 * tracking link. Alerts are only raised from things the system records —
 * nothing here is estimated.
 */

import { useMemo, useState } from "react";
import { eventDayISO, formatDoorsTime, formatEventTime, isEventPast, localTodayISO } from "@/lib/dates";
import { fmtUSD } from "@/app/components/admin/ui";
import { useHub } from "../HubContext";
import { isPaidSale, useEventContracts, useEventLinks, useEventOrders } from "../useEventData";
import { HubEmpty, HubLoading } from "../ui";
import type { HubTab } from "../config";

const DAY = 86400000;
const usd = (n: number) => fmtUSD(n, { cents: false });

/** Monday 00:00 (venue-local wall clock) of the week holding `iso`. */
function weekStart(iso: string) {
  const d = new Date(iso.slice(0, 10) + "T12:00:00");
  const back = (d.getDay() + 6) % 7;
  return new Date(d.getTime() - back * DAY).toISOString().slice(0, 10);
}

/** An order's day in venue time — created_at is a real UTC instant. */
function orderDay(createdAt: string) {
  return localTodayISO(new Date(createdAt));
}

function shortDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Summary({ go }: { go: (t: HubTab) => void }) {
  const hub = useHub();
  const { id, event, tiers, guests, offer, settlement, sold, capacity, breakEven } = hub;
  const { data: orders } = useEventOrders(id);
  const { data: links } = useEventLinks(id);
  const { data: contracts } = useEventContracts(id, event?.venue_id ?? null);
  const [today] = useState(() => localTodayISO());

  const pace = useMemo(() => {
    if (!orders || !event) return null;
    const paid = orders.filter(isPaidSale);
    if (!paid.length) return { bars: [], total: 0 };
    const byWeek = new Map<string, number>();
    for (const o of paid) {
      const wk = weekStart(orderDay(o.created_at));
      byWeek.set(wk, (byWeek.get(wk) ?? 0) + (Number(o.quantity) || 1));
    }
    const first = [...byWeek.keys()].sort()[0];
    const thisWeek = weekStart(today);
    const showWeek = weekStart(eventDayISO(event.date));
    const last = isEventPast(event.date) ? showWeek : thisWeek;
    const weeks: string[] = [];
    for (let w = first; w <= last; w = new Date(new Date(w + "T12:00:00").getTime() + 7 * DAY).toISOString().slice(0, 10)) weeks.push(w);
    const onSaleWeek = event.on_sale_at ? weekStart(localTodayISO(new Date(String(event.on_sale_at)))) : null;
    const shown = weeks.slice(-8);
    const bars = shown.map((w) => {
      const partial = w === thisWeek && !isEventPast(event.date);
      const tag = partial ? null : onSaleWeek && w === onSaleWeek ? "On-sale" : onSaleWeek && w < onSaleWeek ? "Presale" : null;
      return { week: w, n: byWeek.get(w) ?? 0, partial, label: partial ? "This week" : tag ? `${shortDate(w)} · ${tag}` : shortDate(w) };
    });
    return { bars, total: paid.reduce((t, o) => t + (Number(o.quantity) || 1), 0) };
  }, [orders, event, today]);

  if (!event) return null;
  if (orders === null) return <HubLoading label="Summary" />;

  const days = Math.round((new Date(eventDayISO(event.date) + "T12:00:00").getTime() - new Date(today + "T12:00:00").getTime()) / DAY);
  const played = days < 0;
  const pct = capacity.sellable > 0 ? Math.round((sold / capacity.sellable) * 100) : 0;

  if (!tiers.length && !orders.length) {
    return (
      <HubEmpty
        title="Nothing to summarise yet"
        body="This show has no tickets on sale and no orders. Once it has prices and an on-sale date, the pace chart, checklist and alerts fill in from the first sale."
        ctas={[{ label: "Set up tickets", onClick: () => go("tickets") }]}
      />
    );
  }

  /* ── Pace ── */
  const bars = pace?.bars ?? [];
  const max = Math.max(1, ...bars.map((b) => b.n));
  const full = bars.filter((b) => !b.partial);
  const lastFull = full.length ? full[full.length - 1].n : null;
  let paceNote = "";
  if (!bars.length) paceNote = "No paid sales yet.";
  else if (full.length >= 4) {
    const open = full.slice(0, 2).reduce((t, b) => t + b.n, 0);
    const rest = full.slice(2).map((b) => b.n);
    paceNote = `The first two weeks sold ${open.toLocaleString()} of ${pace!.total.toLocaleString()}. Since then it has held at ${Math.min(...rest)} to ${Math.max(...rest)} a week.`;
  } else {
    paceNote = `${pace!.total.toLocaleString()} sold since the first sale on ${shortDate(bars[0].week)}.`;
  }
  if (bars.some((b) => b.partial)) {
    paceNote += ` This week is partial (through ${new Date(today + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}).`;
  }

  /* ── Alerts — only what the system records ── */
  type Alert = { tone: "warn" | "blue" | "dim" | "good" | "bad"; text: string; sub: string; to?: HubTab };
  const alerts: Alert[] = [];
  if (!played && capacity.sellable > 0) {
    const toGo = breakEven === null ? null : Math.max(0, breakEven - sold);
    const left = Math.max(0, capacity.sellable - sold);
    const perDay = days > 0 ? Math.ceil((toGo ?? left) / days) : null;
    const last = lastFull === null ? "" : ` Last week sold ${lastFull}.`;
    alerts.push({
      tone: toGo === 0 || left === 0 ? "good" : "warn",
      text: `${pct}% sold, ${days === 0 ? "tonight" : `${days} day${days === 1 ? "" : "s"} out`}`,
      sub: toGo === null
        ? `${left.toLocaleString()} tickets left to sell.${last}${perDay && left ? ` Selling out needs about ${perDay} a day.` : ""}`
        : toGo > 0
          ? `${toGo.toLocaleString()} more tickets to break even (${breakEven!.toLocaleString()}).${last}${perDay ? ` The pace needs about ${perDay} a day.` : ""}`
          : "Past break even.",
      to: "marketing",
    });
  }
  if (!tiers.length) alerts.push({ tone: "warn", text: "No ticket tiers", sub: "Nothing can be sold until the show has at least one tier with a price and a quantity.", to: "tickets" });
  if (!played && (event.status || "published") !== "published") alerts.push({ tone: "warn", text: "Not on the storefront", sub: "The show is a draft. Publish it from the header when tickets and details are ready." });
  if (!event.image_url) alerts.push({ tone: "warn", text: "No event artwork", sub: "The storefront, the hero carousel and every email show a blank where the artwork goes.", to: "details" });
  if (!played && !event.email_flyer_url) alerts.push({ tone: "blue", text: "Email flyer missing", sub: "Reminder emails fall back to the hero artwork without it.", to: "details" });
  if (offer === null) alerts.push({ tone: "dim", text: "No offer linked", sub: "Break even, the deal and the settlement split all read from the linked offer.", to: "deal" });
  if (played && settlement === null) alerts.push({ tone: "warn", text: "Settlement not started", sub: "The show has played. Start the settlement from the ticket manifest and the expenses logged against it.", to: "settlement" });
  if (played && settlement && settlement.status !== "finalized") alerts.push({ tone: "warn", text: "Settlement still a draft", sub: "Finalize it once the expenses are in and both sides have signed.", to: "settlement" });

  /* ── Checklist ── */
  const artistQty = guests.filter((g) => g.artist_id).reduce((t, g) => t + (Number(g.quantity) || 0), 0);
  const houseQty = guests.filter((g) => !g.artist_id).reduce((t, g) => t + (Number(g.quantity) || 0), 0);
  const contract = contracts?.[0];
  const dealType = String(offer?.deal_type || "").toUpperCase();
  const dealLine = !offer ? "No offer linked"
    : dealType === "FLAT" ? `${usd(Number(offer.guarantee) || 0)} flat`
    : offer.guarantee && offer.backend_percentage ? `${usd(Number(offer.guarantee))} vs ${offer.backend_percentage}% of net`
    : offer.backend_percentage ? `${offer.backend_percentage}% of net`
    : offer.guarantee ? usd(Number(offer.guarantee)) : "Terms not set";
  const dayAfter = shortDate(new Date(new Date(eventDayISO(event.date) + "T12:00:00").getTime() + DAY).toISOString().slice(0, 10));
  const doors = formatDoorsTime(event.date, event.doors_time);
  const show = formatEventTime(event.date);
  const checklist: Array<{ label: string; value: string; done: boolean; to: HubTab }> = [
    { label: "Pricing", value: tiers.length ? `${tiers.length} tier${tiers.length === 1 ? "" : "s"} · ${tiers.reduce((t, x) => t + (x.capacity || 0), 0).toLocaleString()} tickets` : "No tiers yet", done: tiers.length > 0, to: "tickets" },
    { label: "Guest list", value: guests.length ? `${artistQty} artist · ${houseQty} house` : "No one on the list yet", done: guests.length > 0, to: "guests" },
    {
      label: "Contract",
      value: !contract ? "No contract on file"
        : contract.status === "signed" ? `Countersigned${contract.signed_at ? ` ${shortDate(contract.signed_at.slice(0, 10))}` : ""}`
        : contract.status === "sent" ? "Sent, awaiting signature" : "Draft, not sent yet",
      done: contract?.status === "signed",
      to: "deal",
    },
    { label: "Deal", value: dealLine, done: !!offer && dealLine !== "Terms not set", to: "deal" },
    { label: "Offer", value: offer ? `v${offer.version ?? 1} · ${offer.status === "accepted" ? "accepted" : offer.status || "draft"}` : "Not linked", done: !!offer && offer.status === "accepted", to: "deal" },
    { label: "Agent", value: [offer?.agent_name, offer?.agency].filter(Boolean).join(" · ") || event.booking_agent || "Not set", done: !!(offer?.agent_name || event.booking_agent), to: "deal" },
    {
      label: "Settlement",
      value: settlement === undefined ? "…" : settlement ? (settlement.status === "finalized" ? "Finalized" : "Draft, open") : played ? "Not started" : `Not started · opens ${dayAfter}`,
      done: settlement?.status === "finalized",
      to: "settlement",
    },
    { label: "Doors / show", value: [doors && `Doors ${doors}`, show && `Show ${show}`].filter(Boolean).join(" · ") || "Not set", done: !!(doors && show), to: "details" },
  ];
  const doneN = checklist.filter((c) => c.done).length;

  /* ── Attribution ── */
  const linkName = new Map((links ?? []).map((l) => [l.slug, l.label || l.slug]));
  const attrMap = new Map<string, { name: string; orders: number; rev: number }>();
  for (const o of orders.filter(isPaidSale)) {
    const key = o.tracking_link_slug || "";
    const row = attrMap.get(key) ?? { name: key ? linkName.get(key) ?? key : "Direct / no link", orders: 0, rev: 0 };
    row.orders += 1;
    row.rev += Number(o.total_amount) || 0;
    attrMap.set(key, row);
  }
  const attr = [...attrMap.values()].sort((a, b) => b.rev - a.rev).slice(0, 5);
  const attrMax = Math.max(1, ...attr.map((a) => a.rev));

  return (
    <div className="hub-sum">
      <section className="hub-card hub-card--glow">
        <div className="hub-card-line">
          <div className="hub-eyebrow">Sales pace by week</div>
          <span className="hub-spacer" />
          <div className="hub-card-note">
            {sold.toLocaleString()} sold{capacity.sellable > 0 ? ` · ${pct}% of ${capacity.sellable.toLocaleString()}` : ""}
          </div>
        </div>
        {bars.length > 0 ? (
          <>
            <div className="hub-pace">
              {bars.map((b) => (
                <div key={b.week} className="hub-pace-col">
                  <div className={`hub-pace-n${b.partial ? " is-partial" : ""}`}>{b.n}</div>
                  <div className={`hub-pace-bar${b.partial ? " is-partial" : ""}`} style={{ height: `${Math.round((b.n / max) * 130)}px` }} />
                </div>
              ))}
            </div>
            <div className="hub-pace-labels">
              {bars.map((b) => <div key={b.week}>{b.label}</div>)}
            </div>
          </>
        ) : (
          <div className="hub-pace-none">No paid sales yet.</div>
        )}
        {bars.length > 0 && <div className="hub-card-foot">{paceNote}</div>}
      </section>

      <section className="hub-card hub-card--glow">
        <div className="hub-eyebrow">Alerts</div>
        <div className="hub-alerts">
          {alerts.length === 0 && <div className="hub-alert-none">Nothing needs attention.</div>}
          {alerts.map((a) => (
            <button
              key={a.text}
              type="button"
              className={`hub-alert${a.to ? "" : " is-static"}`}
              onClick={a.to ? () => go(a.to!) : undefined}
              disabled={!a.to}
            >
              <span className={`hub-alert-dot is-${a.tone}`} />
              <span className="hub-alert-text">
                <span className="hub-alert-title">{a.text}</span>
                <span className="hub-alert-sub">{a.sub}</span>
              </span>
              {a.to && <span className="hub-arrow">→</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="hub-card hub-card--glow">
        <div className="hub-card-line">
          <div className="hub-eyebrow">Build checklist</div>
          <span className="hub-spacer" />
          <div className="hub-card-note">{doneN} of {checklist.length} done</div>
        </div>
        <div className="hub-check">
          {checklist.map((c) => (
            <button key={c.label} type="button" className="hub-check-row" onClick={() => go(c.to)}>
              <span className={`hub-check-mark${c.done ? " is-done" : ""}`}>{c.done ? "✓" : "!"}</span>
              <span className="hub-check-label">{c.label}</span>
              <span className={`hub-check-value${c.done ? "" : " is-warn"}`}>{c.value}</span>
              <span className="hub-arrow">→</span>
            </button>
          ))}
        </div>
      </section>

      <section className="hub-card hub-card--glow">
        <div className="hub-card-line">
          <div className="hub-eyebrow">Attribution · top 5</div>
          <span className="hub-spacer" />
          <button type="button" className="hub-card-link" onClick={() => go("marketing")}>All links →</button>
        </div>
        <div className="hub-attr">
          {attr.length === 0 && <div className="hub-alert-none">No paid orders yet.</div>}
          {attr.map((a) => (
            <div key={a.name}>
              <div className="hub-attr-line">
                <div className="hub-attr-name">{a.name}</div>
                <div className="hub-attr-orders">{a.orders} order{a.orders === 1 ? "" : "s"}</div>
                <div className="hub-attr-rev">{usd(a.rev)}</div>
              </div>
              <div className="hub-attr-bar"><div style={{ width: `${Math.round((a.rev / attrMax) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
