"use client";

/**
 * The old event workspace's tabs, kept running inside the hub while each
 * section is rebuilt to eventhub.dc.html. A section moves out of this file
 * when its rebuild lands; when the file is empty it goes.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { resolveCapacity, capacityLabel } from "@/lib/capacity";
import { breakEvenShare } from "@/lib/offers/walkout";
import { useHub } from "./HubContext";
import { Button, Card, Eyebrow, Kpi, KpiRow, fmtUSD } from "@/app/components/admin/ui";

/* ---------------------------------------------------------------
   Types
--------------------------------------------------------------- */
type EventRecord = {
  id: string;
  title: string;
  venue: string;
  venue_id: string | null;
  date: string;
  start_time: string | null;
  image_url: string | null;
  status: string | null;
  doors_time: string | null;
  age_restriction: string | null;
  talent_buyer: string | null;
  booking_agent: string | null;
  event_type?: string | null;
  booking_status?: string | null;
};

type Tier = { id: string; tier_name: string; price: number; capacity: number; quantity_sold: number };

type Hold = {
  id: string;
  ticket_tier_id: string | null;
  ticket_tiers: { tier_name: string } | null;
  quantity: number;
  hold_type: "artist" | "promoter" | "house_comp" | "other";
  owner_label: string;
  reason: string | null;
  release_note: string | null;
};

type Contract = { id: string; event_id: string | null; status: string; contract_type?: string };

type Guest = { id: string; first_name: string; last_name: string; quantity: number; artist_id?: string | null; checked_in_at?: string | null };

type Order = {
  id: string;
  customer_name: string | null;
  total_amount: number | null;
  quantity: number | null;
  created_at: string;
  status: string;
  source: string | null;
  tracking_link_slug: string | null;
};

type Offer = {
  id: string;
  status: string | null;
  version: number | null;
  guarantee: number | null;
  backend_percentage: number | string | null;
  deal_type: string | null;
  agent_name: string | null;
  agency: string | null;
  net_potential: number | null;
  total_fixed: number | null;
  total_variable: number | null;
  ticket_scaling: { comps?: number | null; kills?: number | null; sellable_cap?: number | null }[] | null;
  artist_comps: number | null;
  marketing_comps: number | null;
};

type Revenue = {
  grossRevenue: number;
  ticketRevenue: number;
  serviceFeesGross: number;
  taxCollected: number;
  processingFees: number;
  netToVenue: number;
  refundTotal?: number;
};

type Link2 = { slug: string; label: string | null; source: string | null };

const usd = (n: number) => fmtUSD(n, { cents: false });



/* ---------------------------------------------------------------
   Overview
--------------------------------------------------------------- */
export function OverviewTab({
  event, eventId, tiers, contracts, guests, holds, orders, offer, settlement, grossRevenue, grossState, sold, capacity, days,
}: {
  event: EventRecord;
  eventId: string;
  tiers: Tier[];
  contracts: Contract[];
  guests: Guest[];
  holds: Hold[];
  orders: Order[] | null;
  offer: Offer | null;
  settlement: { id: string; status: string } | null | undefined;
  grossRevenue: number;
  grossState: "loading" | "ok" | "denied" | "error";
  sold: number;
  capacity: ReturnType<typeof resolveCapacity>;
  days: number;
}) {
  const sellable = capacity.sellable;
  const pct = sellable > 0 ? Math.round((sold / sellable) * 100) : 0;

  // To break even — the offer's own walkout, not a new formula.
  const breakEven = useMemo(() => {
    if (!offer || !offer.net_potential || sellable <= 0) return null;
    const share = breakEvenShare({
      netPotential: Number(offer.net_potential) || 0,
      totalFixed: Number(offer.total_fixed) || 0,
      totalVariable: Number(offer.total_variable) || 0,
      sellable,
      guarantee: Number(offer.guarantee) || 0,
      backendPct: Number(offer.backend_percentage) || 0,
      dealType: String(offer.deal_type || "FLAT"),
    });
    return share === null ? { tickets: null } : { tickets: Math.ceil(share * sellable) };
  }, [offer, sellable]);

  const guestQty = guests.reduce((t, g) => t + (Number(g.quantity) || 0), 0);
  const houseComps = holds.filter((h) => h.hold_type === "house_comp").reduce((t, h) => t + (h.quantity || 0), 0);

  // Pinned once per mount, so the week buckets are a pure function of orders.
  const [now] = useState(() => Date.now());

  // Sales since announce — paid, non-comp tickets by week from the first sale.
  const weeks = useMemo(() => {
    const paid = (orders ?? []).filter((o) => o.status === "paid" && o.source !== "comp");
    if (!paid.length) return [];
    const first = Math.min(...paid.map((o) => new Date(o.created_at).getTime()));
    const nowWk = Math.floor((now - first) / (7 * 86400000));
    const buckets = new Map<number, number>();
    for (const o of paid) {
      const w = Math.floor((new Date(o.created_at).getTime() - first) / (7 * 86400000));
      buckets.set(w, (buckets.get(w) ?? 0) + (Number(o.quantity) || 1));
    }
    const rows: Array<{ label: string; n: number }> = [];
    const lastWk = Math.max(nowWk, ...buckets.keys());
    const startWk = Math.max(0, lastWk - 7); // the last eight weeks, on-sale week kept
    if (startWk > 0) rows.push({ label: "On sale", n: buckets.get(0) ?? 0 });
    for (let w = startWk; w <= lastWk; w++) {
      rows.push({ label: w === 0 ? "On sale" : w === nowWk ? "This wk" : `Wk ${w + 1}`, n: buckets.get(w) ?? 0 });
    }
    return rows;
  }, [orders, now]);
  const weekMax = Math.max(1, ...weeks.map((w) => w.n));
  const left = Math.max(0, sellable - sold);

  const contract = contracts[0];
  const checklist = [
    { label: "Pricing & ticket types", done: tiers.length > 0, detail: tiers.length > 0 ? tiers.map((t) => t.tier_name).join(", ") : "No ticket tiers yet" },
    { label: "Guest list set up", done: guests.length > 0, detail: guests.length > 0 ? `${guests.length} on the list` : "No guest list entries yet" },
    {
      label: "Artist contract",
      done: contract?.status === "signed",
      detail: !contract ? "No contract on file" : contract.status === "signed" ? "Signed" : contract.status === "sent" ? "Sent — awaiting signature" : "Draft — not sent yet",
    },
  ];

  const facts: Array<{ label: string; value: string; href: string }> = [
    {
      label: "Deal",
      value: offer
        ? [offer.guarantee ? `${usd(Number(offer.guarantee))} guarantee` : null, offer.backend_percentage && String(offer.deal_type).toUpperCase() !== "FLAT" ? `${offer.backend_percentage}% backend` : String(offer.deal_type || "").toUpperCase() === "FLAT" ? "flat" : null].filter(Boolean).join(" · ") || "—"
        : "No offer linked",
      href: offer ? `/admin/offers/${offer.id}` : "/admin/offers",
    },
    {
      label: "Offer",
      value: offer ? `v${offer.version ?? 1} · ${offer.status === "accepted" ? "countersigned" : offer.status || "draft"}` : "—",
      href: offer ? (offer.status === "accepted" ? `/admin/offers/${offer.id}/edit` : `/admin/offers/${offer.id}`) : "/admin/offers",
    },
    {
      label: "Agent",
      value: [offer?.agent_name, offer?.agency].filter(Boolean).join(" · ") || event.booking_agent || "—",
      href: "/admin/agents",
    },
    {
      label: "Settlement",
      value: settlement === undefined ? "…" : settlement ? (settlement.status === "finalized" ? "Finalized" : "Draft — open") : days < 0 ? "Not started" : "Opens after the show",
      href: settlement ? `/admin/settlements/${settlement.id}` : `/admin/settlements?event_id=${eventId}`,
    },
    {
      label: "Doors / show",
      value: [event.doors_time, event.start_time, event.age_restriction].filter(Boolean).join(" · ") || "—",
      href: `/admin/events/${eventId}/edit`,
    },
  ];

  return (
    <div className="evw-stack">
      <KpiRow>
        <Kpi
          label="Gross — ledger"
          value={grossState === "ok" ? usd(grossRevenue) : grossState === "loading" ? "…" : grossState === "denied" ? "Hidden" : "Unavailable"}
          sub={grossState === "denied" ? "no settlement access" : "settlement_ledger, net of refunds"}
        />
        <Kpi label="Tickets out" value={sold.toLocaleString()} sub={sellable > 0 ? `${capacityLabel({ ...capacity, sold })} · ${pct}% of the room` : "no tiers on sale"} />
        <Kpi
          label="To break even"
          value={breakEven === null ? "—" : breakEven.tickets === null ? "Not at sellout" : Math.max(0, breakEven.tickets - sold) === 0 ? "Passed" : Math.max(0, breakEven.tickets - sold).toLocaleString()}
          tone={breakEven && breakEven.tickets !== null && sold >= breakEven.tickets ? "good" : breakEven && breakEven.tickets === null ? "bad" : "neutral"}
          sub={breakEven === null ? "no offer with a walkout linked" : breakEven.tickets === null ? "loses money even sold out" : `${breakEven.tickets.toLocaleString()} tickets per the offer's walkout`}
        />
        <Kpi label="Comps issued" value={(guestQty + houseComps).toLocaleString()} sub={`${guestQty} guest list · ${houseComps} house`} />
      </KpiRow>

      <div className="evw-pair">
        <Card>
          <Eyebrow>Sales since announce</Eyebrow>
          {orders === null ? (
            <div className="evw-empty">Loading…</div>
          ) : weeks.length === 0 ? (
            <div className="evw-empty">No paid sales yet.</div>
          ) : (
            <div className="evw-weeks">
              {weeks.map((w, i) => (
                <div key={`${w.label}-${i}`} className="evw-week">
                  <div className="evw-week-line">
                    <b>{w.label}</b>
                    <span>{w.n.toLocaleString()} {w.n === 1 ? "ticket" : "tickets"}</span>
                  </div>
                  <div className="ui-meter"><div className="ui-meter-fill" style={{ width: `${(w.n / weekMax) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
          {sellable > 0 && days >= 0 && (
            <div className="evw-callout">
              {left === 0
                ? "Every sellable ticket is out."
                : `${left.toLocaleString()} ${left === 1 ? "ticket" : "tickets"} left to sell in ${days === 0 ? "the day" : `${days} ${days === 1 ? "day" : "days"}`}.`}
            </div>
          )}
        </Card>

        <Card>
          <Eyebrow>The facts, and where they live</Eyebrow>
          <div className="evw-facts">
            {facts.map((f) => (
              <Link key={f.label} href={f.href} className="evw-fact">
                <span className="evw-fact-label">{f.label}</span>
                <span className="evw-fact-value">{f.value}</span>
                <span className="evw-fact-go">→</span>
              </Link>
            ))}
          </div>
          <div className="evw-note">Each row is a link, not a copy. Nothing on this page is the source of truth for anything — that is the point of a workspace.</div>
        </Card>
      </div>

      <details className="evw-more">
        <summary>
          <span className="ui-eyebrow">More</span>
          <span className="evw-more-sub">build checklist · live page · marketing &amp; ads</span>
        </summary>
        <div className="evw-more-body">
          <div className="evw-checklist">
            {checklist.map((c) => (
              <div key={c.label} className="evw-check">
                <span className={`evw-check-icon${c.done ? " is-done" : ""}`}>{c.done ? "✓" : "!"}</span>
                <span>
                  <b>{c.label}</b>
                  <i>{c.detail}</i>
                </span>
              </div>
            ))}
          </div>
          <div className="evw-more-links">
            <Button size="sm" href={`/events/${eventId}`}>View live page</Button>
            <Button size="sm" href={`/admin/events/${eventId}/ads`}>Marketing &amp; ads</Button>
          </div>
        </div>
      </details>
    </div>
  );
}

/* ---------------------------------------------------------------
   Inventory & holds
--------------------------------------------------------------- */
export function InventoryHoldsTab({
  eventId, tiers, holds, onHoldsChanged,
}: {
  eventId: string; tiers: Tier[]; holds: Hold[]; onHoldsChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    ticket_tier_id: tiers[0]?.id || "",
    quantity: 1,
    hold_type: "artist" as Hold["hold_type"],
    owner_label: "",
    reason: "",
    release_note: "",
  });

  const heldByTier: Record<string, number> = {};
  const compByTier: Record<string, number> = {};
  for (const h of holds) {
    if (!h.ticket_tier_id) continue;
    if (h.hold_type === "house_comp") compByTier[h.ticket_tier_id] = (compByTier[h.ticket_tier_id] || 0) + h.quantity;
    else heldByTier[h.ticket_tier_id] = (heldByTier[h.ticket_tier_id] || 0) + h.quantity;
  }

  const submitHold = async () => {
    if (!form.owner_label || !form.quantity) return;
    setSaving(true);
    const res = await fetch(`/api/events/${eventId}/holds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setShowForm(false);
      setForm({ ticket_tier_id: tiers[0]?.id || "", quantity: 1, hold_type: "artist", owner_label: "", reason: "", release_note: "" });
      onHoldsChanged();
    }
  };

  const releaseHold = async (holdId: string) => {
    await fetch(`/api/events/${eventId}/holds/${holdId}`, { method: "PATCH" });
    onHoldsChanged();
  };

  return (
    <Card>
      <div className="evw-card-head">
        <Eyebrow>Inventory &amp; holds</Eyebrow>
        <span className="filter-spacer" />
        <span className="evw-hint">held inventory is not sold and not available</span>
      </div>
      <div className="evw-table evw-inv">
        <div className="evw-tr evw-tr--head">
          <div>Tier</div><div className="evw-num">Sold</div><div className="evw-num">Held</div><div className="evw-num">Open</div><div className="evw-num">Cap</div>
        </div>
        {tiers.length === 0 && <div className="evw-empty">No ticket types yet — add tiers on the edit form.</div>}
        {tiers.map((t) => {
          const held = heldByTier[t.id] || 0;
          const comp = compByTier[t.id] || 0;
          const open = Math.max(0, (t.capacity || 0) - (t.quantity_sold || 0) - held - comp);
          return (
            <div key={t.id} className="evw-tr-wrap">
              <div className="evw-tr">
                <div className="evw-name">{t.tier_name}</div>
                <div className="evw-num">{(t.quantity_sold || 0).toLocaleString()}</div>
                <div className="evw-num">{held + comp ? (held + comp).toLocaleString() : "—"}</div>
                <div className="evw-num">{open.toLocaleString()}</div>
                <div className="evw-num">{(t.capacity || 0).toLocaleString()}</div>
              </div>
              <div className="evw-tr-note">
                {[t.price > 0 ? fmtUSD(t.price) : "Comp tier", held ? `${held} held` : null, comp ? `${comp} house comp` : null].filter(Boolean).join(" · ")}
              </div>
            </div>
          );
        })}
      </div>

      <div className="evw-foot">
        <Button href="/admin/seating">Open seating map</Button>
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? "Cancel" : "+ New hold"}</Button>
        <Button variant="ghost" size="sm" href={`/admin/events/${eventId}/edit`}>Manage ticket types</Button>
        <span className="filter-spacer" />
        <span className="evw-hint">Holds are bookkeeping — releasing one doesn&apos;t change what checkout offers yet</span>
      </div>

      {showForm && (
        <div className="evw-hold-form">
          <div className="field">
            <label>Ticket tier</label>
            <select value={form.ticket_tier_id} onChange={(e) => setForm({ ...form, ticket_tier_id: e.target.value })}>
              <option value="">— none —</option>
              {tiers.map((t) => <option key={t.id} value={t.id}>{t.tier_name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Quantity</label>
            <input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 1 })} />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={form.hold_type} onChange={(e) => setForm({ ...form, hold_type: e.target.value as Hold["hold_type"] })}>
              <option value="artist">Artist hold</option>
              <option value="promoter">Promoter hold</option>
              <option value="house_comp">House comp</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field">
            <label>Owner</label>
            <input placeholder="e.g. Cole Phillips team" value={form.owner_label} onChange={(e) => setForm({ ...form, owner_label: e.target.value })} />
          </div>
          <div className="field">
            <label>Release note</label>
            <input placeholder="e.g. releases day-of-show" value={form.release_note} onChange={(e) => setForm({ ...form, release_note: e.target.value })} />
          </div>
          <Button variant="primary" disabled={saving} onClick={submitHold}>{saving ? "Saving…" : "Create hold"}</Button>
        </div>
      )}

      {holds.length > 0 && (
        <div className="evw-holds">
          <div className="evw-sub">Active holds</div>
          {holds.map((h) => (
            <div key={h.id} className="evw-hold">
              <span className="evw-hold-kind">{h.hold_type === "house_comp" ? "House comp" : h.hold_type === "artist" ? "Artist" : h.hold_type === "promoter" ? "Promoter" : "Hold"}</span>
              <span className="evw-hold-body">
                <b>{h.quantity} × {h.ticket_tiers?.tier_name || "tickets"}</b>
                <i>{h.owner_label}{h.release_note ? ` · ${h.release_note}` : ""}</i>
              </span>
              <Button size="sm" onClick={() => releaseHold(h.id)}>Release</Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------
   Orders — the order book, filtered to this event
--------------------------------------------------------------- */
// orders.source as stored: inline_checkout and online are both web card sales;
// terminal is the box office reader; cash and comp are door orders.
const METHOD: Record<string, string> = { inline_checkout: "Card online", online: "Card online", terminal: "Card — reader", cash: "Cash", comp: "Comp" };

export function OrdersTab({ eventId, orders }: { eventId: string; orders: Order[] | null }) {
  return (
    <Card>
      <div className="evw-card-head">
        <Eyebrow>Orders — this event</Eyebrow>
        <span className="filter-spacer" />
        <Link href={`/admin/orders?event_id=${eventId}`} className="evw-link">Open the full order book →</Link>
      </div>
      <div className="evw-table evw-orders">
        <div className="evw-tr evw-tr--head">
          <div>Order</div><div>Buyer</div><div className="evw-num">Qty</div><div className="evw-num">Total</div><div>Method</div><div>State</div>
        </div>
        {orders === null && <div className="evw-empty">Loading…</div>}
        {orders && orders.length === 0 && <div className="evw-empty">No orders yet.</div>}
        {(orders ?? []).slice(0, 50).map((o) => (
          <div key={o.id} className="evw-tr">
            <div className="evw-mono">{o.id.slice(0, 8).toUpperCase()}</div>
            <div className="evw-name">{o.customer_name || "Guest"}</div>
            <div className="evw-num">{o.quantity ?? 1}</div>
            <div className="evw-num">{fmtUSD(Number(o.total_amount) || 0)}</div>
            <div className="evw-dim">{METHOD[String(o.source || "online")] || String(o.source).replace(/_/g, " ")}</div>
            <div className={`evw-state-cell evw-state-cell--${o.status}`}>{o.status}</div>
          </div>
        ))}
      </div>
      <div className="evw-note">
        This is the order book filtered to one event. Refunds are issued there — a refund is a money action and belongs where the money lives.
        {orders && orders.length > 50 ? ` Showing the latest 50 of ${orders.length}.` : ""}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------
   Settlement — provisional, from the ledger
--------------------------------------------------------------- */
export function SettlementTab({ eventId, settlement }: { eventId: string; settlement: { id: string; status: string } | null | undefined }) {
  const [rev, setRev] = useState<Revenue | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "denied" | "error">("loading");
  useEffect(() => {
    let live = true;
    fetch(`/api/events/${eventId}/revenue-summary`)
      .then(async (r) => {
        if (!live) return;
        if (r.status === 401 || r.status === 403) return setState("denied");
        if (!r.ok) return setState("error");
        setRev(await r.json());
        setState("ok");
      })
      .catch(() => live && setState("error"));
    return () => { live = false; };
  }, [eventId]);

  const rows: Array<{ label: string; value: string; total?: boolean }> = rev
    ? [
        { label: "Gross — ledger", value: fmtUSD(rev.grossRevenue) },
        { label: "Face value", value: fmtUSD(rev.ticketRevenue) },
        { label: "Service fees", value: fmtUSD(Number(rev.serviceFeesGross) || 0) },
        ...(rev.refundTotal ? [{ label: "Refunded (already netted)", value: fmtUSD(rev.refundTotal) }] : []),
        { label: "Tax collected", value: fmtUSD(rev.taxCollected) },
        { label: "Card processing", value: `(${fmtUSD(rev.processingFees)})` },
        { label: "Net to venue", value: fmtUSD(rev.netToVenue), total: true },
      ]
    : [];

  return (
    <div className="evw-pair">
      <Card>
        <Eyebrow>Provisional settlement</Eyebrow>
        {state === "loading" && <div className="evw-empty">Loading…</div>}
        {state === "denied" && <div className="evw-empty">Your role can&apos;t see settlement figures.</div>}
        {state === "error" && <div className="evw-empty">Couldn&apos;t load the ledger for this show.</div>}
        {state === "ok" && (
          <div className="evw-money">
            {rows.map((r) => (
              <div key={r.label} className={`evw-money-row${r.total ? " is-total" : ""}`}>
                <span>{r.label}</span>
                <b>{r.value}</b>
              </div>
            ))}
          </div>
        )}
        <div className="evw-foot">
          <Button variant="primary" href={settlement ? `/admin/settlements/${settlement.id}` : `/admin/settlements?event_id=${eventId}`}>
            {settlement ? (settlement.status === "finalized" ? "Open the finalized settlement" : "Open the settlement") : "Start the settlement"}
          </Button>
        </div>
      </Card>
      <Card>
        <Eyebrow>Why this number and the dashboard agree</Eyebrow>
        <p className="evw-prose">
          Gross here is summed from <b>settlement_ledger</b>, which nets refunds and carries real zeros for cash and comp rows.
          The dashboard reads the same source. A page that sums order totals instead drifts the moment a refund lands — which
          is why this tab shows the ledger&apos;s figure rather than doing its own math.
        </p>
        <div className="evw-callout">
          Until the show is settled this is provisional: the door hasn&apos;t closed, the drawer hasn&apos;t reconciled, and
          expenses are still arriving.
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------
   Marketing — attribution from the orders' tracking links
--------------------------------------------------------------- */
export function MarketingTab({ eventId, orders, links }: { eventId: string; orders: Order[] | null; links: Link2[] }) {
  const rows = useMemo(() => {
    const label = new Map(links.map((l) => [l.slug, l.label || l.slug]));
    const m = new Map<string, { name: string; orders: number; rev: number }>();
    for (const o of orders ?? []) {
      if (o.status !== "paid" || o.source === "comp") continue;
      const key = o.tracking_link_slug || "__direct";
      const name = o.tracking_link_slug ? label.get(o.tracking_link_slug) || o.tracking_link_slug : "Direct / untracked";
      const r = m.get(key) || { name, orders: 0, rev: 0 };
      r.orders += 1;
      r.rev += Number(o.total_amount) || 0;
      m.set(key, r);
    }
    for (const l of links) if (!m.has(l.slug)) m.set(l.slug, { name: l.label || l.slug, orders: 0, rev: 0 });
    return Array.from(m.values()).sort((a, b) => b.rev - a.rev);
  }, [orders, links]);

  return (
    <div className="evw-pair">
      <Card>
        <Eyebrow>Attribution — this event</Eyebrow>
        <div className="evw-table evw-attr">
          <div className="evw-tr evw-tr--head">
            <div>Source</div><div className="evw-num">Orders</div><div className="evw-num">Revenue</div>
          </div>
          {orders === null && <div className="evw-empty">Loading…</div>}
          {orders && rows.length === 0 && <div className="evw-empty">No paid orders or tracking links yet.</div>}
          {rows.map((r) => (
            <div key={r.name} className="evw-tr">
              <div className="evw-name">{r.name}</div>
              <div className="evw-num">{r.orders.toLocaleString()}</div>
              <div className="evw-num">{fmtUSD(r.rev, { cents: false })}</div>
            </div>
          ))}
        </div>
        <div className="evw-note">Revenue here is order totals by the tracking link each order arrived on.</div>
        <div className="evw-foot">
          <Link href={`/admin/events/${eventId}/edit?tab=promo`} className="evw-link">Manage links &amp; QR on the edit form →</Link>
        </div>
      </Card>
      <Card>
        <Eyebrow>Campaigns running for this show</Eyebrow>
        <div className="evw-empty">Not tracked yet — campaign spend isn&apos;t recorded against a show, so there&apos;s no ROAS to show.</div>
        <div className="evw-foot">
          <Button href="/admin/marketing">Open Marketing</Button>
          <Button variant="ghost" size="sm" href={`/admin/events/${eventId}/ads`}>Marketing &amp; ads for this show</Button>
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------
   Guest list & comps
--------------------------------------------------------------- */
export function GuestListTab({ guests }: { guests: Guest[] }) {
  const total = guests.reduce((t, g) => t + (Number(g.quantity) || 0), 0);
  const inCount = guests.filter((g) => g.checked_in_at).reduce((t, g) => t + (Number(g.quantity) || 0), 0);
  return (
    <Card>
      <div className="evw-card-head">
        <Eyebrow>Guest list &amp; comps — {total.toLocaleString()} {total === 1 ? "seat" : "seats"} on the list</Eyebrow>
        <span className="filter-spacer" />
        <span className="evw-hint">a comp is an order with real zeros, not a missing order</span>
      </div>
      <div className="evw-table evw-guests">
        <div className="evw-tr evw-tr--head">
          <div>Name</div><div>List</div><div className="evw-num">Qty</div><div>State</div>
        </div>
        {guests.length === 0 && <div className="evw-empty">No one on the list yet.</div>}
        {guests.map((g) => (
          <div key={g.id} className="evw-tr">
            <div className="evw-name">{g.first_name} {g.last_name}</div>
            <div className="evw-dim">{g.artist_id ? "Artist" : "House"}</div>
            <div className="evw-num">{g.quantity}</div>
            <div className={g.checked_in_at ? "evw-in" : "evw-dim"}>{g.checked_in_at ? "Checked in" : "Not in"}</div>
          </div>
        ))}
      </div>
      <div className="evw-foot">
        <Button href="/admin/live?tab=guests">+ Add guest</Button>
        <span className="filter-spacer" />
        <span className="evw-hint">{inCount ? `${inCount} checked in · ` : ""}Check-in happens at the door view, not here</span>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------
   Access — who can touch this event
--------------------------------------------------------------- */
export function AccessTab({ venueId }: { venueId: string | null }) {
  const [team, setTeam] = useState<Array<{ id: string; first_name: string | null; last_name: string | null; email: string; role: string; venue_id: string | null }> | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/admin/users")
      .then(async (r) => {
        if (!live) return;
        if (r.status === 401 || r.status === 403) { setDenied(true); setTeam([]); return; }
        const d = await r.json();
        setTeam(Array.isArray(d) ? d : []);
      })
      .catch(() => live && setTeam([]));
    return () => { live = false; };
  }, []);

  const staff = (team ?? []).filter((u) => !["artist", "agent", "partner"].includes(u.role) && (!venueId || !u.venue_id || u.venue_id === venueId));

  return (
    <Card>
      <div className="evw-card-head">
        <Eyebrow>Who can touch this event</Eyebrow>
        <span className="filter-spacer" />
        <Link href="/admin/settings/permissions" className="evw-link">Roles are defined in Access control →</Link>
      </div>
      {team === null && <div className="evw-empty">Loading…</div>}
      {denied && <div className="evw-empty">Only owners and venue admins can see the team.</div>}
      {team && !denied && staff.length === 0 && <div className="evw-empty">No staff on this venue.</div>}
      <div className="evw-access">
        {staff.map((u) => (
          <div key={u.id} className="evw-access-row">
            <span className="evw-access-who">
              <b>{[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}</b>
              <i>{u.venue_id ? "This venue" : "Every venue"}</i>
            </span>
            <span className="evw-access-role">{u.role.replace(/_/g, " ")}</span>
          </div>
        ))}
      </div>
      <div className="evw-note">
        Event-scoped access isn&apos;t built yet — everyone here reaches this show through their venue-wide role.
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------
   The hub's interim sections — the old tabs, fed from the hub
--------------------------------------------------------------- */
export function InterimSection({ tab }: { tab: string }) {
  const hub = useHub();
  const { id, event, tiers, holds, guests, offer, settlement, revenue, sold, capacity } = hub;
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [links, setLinks] = useState<Link2[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);

  useEffect(() => {
    let live = true;
    import("@/lib/supabase-browser").then(async ({ getSupabaseBrowser }) => {
      const supabase = getSupabaseBrowser();
      const [{ data: ords }, { data: tl }] = await Promise.all([
        supabase
          .from("orders")
          .select("id, customer_name, total_amount, quantity, created_at, status, source, tracking_link_slug")
          .eq("event_id", id)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase.from("trackable_links").select("slug, label, source").eq("event_id", id),
      ]);
      if (!live) return;
      setOrders(Array.isArray(ords) ? (ords as Order[]) : []);
      setLinks(Array.isArray(tl) ? (tl as Link2[]) : []);
    }).catch(() => live && setOrders([]));
    if (event?.venue_id) {
      fetch(`/api/contracts?venue_id=${event.venue_id}`).then((r) => r.json()).then((c) => {
        if (live && Array.isArray(c)) setContracts(c.filter((row: Contract) => row.event_id === id));
      }).catch(() => {});
    }
    return () => { live = false; };
  }, [id, event?.venue_id]);

  if (!event) return null;
  const grossState = revenue.state;
  const days = Math.ceil((new Date(event.date).getTime() - Date.now()) / 86400000);

  switch (tab) {
    case "summary":
      return (
        <OverviewTab
          event={event as unknown as EventRecord}
          eventId={id}
          tiers={tiers}
          contracts={contracts}
          guests={guests}
          holds={holds}
          orders={orders}
          offer={(offer ?? null) as Offer | null}
          settlement={settlement}
          grossRevenue={revenue.data?.grossRevenue ?? 0}
          grossState={grossState}
          sold={sold}
          capacity={capacity}
          days={days}
        />
      );
    case "inventory":
      return <InventoryHoldsTab eventId={id} tiers={tiers} holds={holds} onHoldsChanged={() => hub.reload(["holds"])} />;
    case "orders":
      return <OrdersTab eventId={id} orders={orders} />;
    case "settlement":
      return <SettlementTab eventId={id} settlement={settlement} />;
    case "marketing":
      return <MarketingTab eventId={id} orders={orders} links={links} />;
    case "guests":
      return <GuestListTab guests={guests} />;
    case "access":
      return <AccessTab venueId={event.venue_id} />;
    default:
      return null;
  }
}
