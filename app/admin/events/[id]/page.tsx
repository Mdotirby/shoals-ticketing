"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  StatusBadge,
  Tag,
  EmptyState,
} from "@/app/components/admin/liquid-glass-admin";

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
};

type Venue = { id: string; name: string; capacity: number | null };

type Tier = {
  id: string;
  tier_name: string;
  price: number;
  capacity: number;
  quantity_sold: number;
};

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

type Guest = { id: string; first_name: string; last_name: string; quantity: number };

type Order = {
  id: string;
  customer_name: string | null;
  total_amount: number | null;
  quantity: number | null;
  created_at: string;
  status: string;
};

const TABS: { key: string; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "inventory", label: "Inventory & Holds" },
  { key: "orders", label: "Orders" },
  { key: "settlement", label: "Settlement" },
  { key: "marketing", label: "Marketing" },
  { key: "guestlist", label: "Guest List" },
  { key: "access", label: "Access" },
];

function formatCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function daysOut(dateStr: string) {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (diff < 0) return "Past";
  if (diff === 0) return "Today";
  return `${diff}`;
}

/* ---------------------------------------------------------------
   Page
--------------------------------------------------------------- */
export default function EventWorkspacePage() {
  const params = useParams();
  const id = params.id as string;

  const [tab, setTab] = useState("overview");
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [grossRevenue, setGrossRevenue] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadHolds = useCallback(() => {
    fetch(`/api/events/${id}/holds`).then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setHolds(d);
    }).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      const [eventRes, tiersRes] = await Promise.all([
        fetch(`/api/events/${id}`).then((r) => r.json()),
        fetch(`/api/events/${id}/ticket-types`).then((r) => r.json()),
      ]);
      if (cancelled) return;
      setEvent(eventRes);
      setTiers(Array.isArray(tiersRes) ? tiersRes : []);

      // Venue (capacity) — venues list is small, filter client-side.
      if (eventRes?.venue_id) {
        fetch("/api/venues").then((r) => r.json()).then((venues) => {
          if (cancelled || !Array.isArray(venues)) return;
          const v = venues.find((x: Venue) => x.id === eventRes.venue_id);
          if (v) setVenue(v);
          // Contracts live under the venue, filtered client-side by event.
          fetch(`/api/contracts?venue_id=${eventRes.venue_id}`).then((r) => r.json()).then((c) => {
            if (!cancelled && Array.isArray(c)) {
              setContracts(c.filter((row: Contract) => row.event_id === id));
            }
          }).catch(() => {});
        }).catch(() => {});
      }

      // Guest list
      fetch(`/api/artists/guests?event_id=${id}`).then((r) => r.json()).then((g) => {
        if (!cancelled && Array.isArray(g)) setGuests(g);
      }).catch(() => {});

      // Gross revenue — paid orders for this event
      fetch(`/api/admin/dashboard?event_ids=${id}`).then((r) => r.json()).then((d) => {
        if (!cancelled && typeof d?.totalRevenue === "number") setGrossRevenue(d.totalRevenue);
      }).catch(() => {});

      setLoading(false);
    }

    load();
    loadHolds();
    return () => { cancelled = true; };
  }, [id, loadHolds]);

  // Orders tab — lazy-loaded on first visit
  useEffect(() => {
    if (tab !== "orders" || !id || orders.length > 0) return;
    import("@/lib/supabase-browser").then(({ getSupabaseBrowser }) => {
      const supabase = getSupabaseBrowser();
      supabase
        .from("orders")
        .select("id, customer_name, total_amount, quantity, created_at, status")
        .eq("event_id", id)
        .order("created_at", { ascending: false })
        .limit(50)
        .then((res: { data: Order[] | null }) => {
          if (Array.isArray(res.data)) setOrders(res.data);
        });
    });
  }, [tab, id, orders.length]);

  if (loading || !event) {
    return (
      <div className="admin-form-page">
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading event…</p>
      </div>
    );
  }

  const totalCapacity = venue?.capacity ?? tiers.reduce((s, t) => s + (t.capacity || 0), 0);
  const totalSold = tiers.reduce((s, t) => s + (t.quantity_sold || 0), 0);
  const eventStatus = event.status || "published";

  return (
    <div className="admin-form-page ev-workspace">
      {/* ── Header strip ── */}
      <div className="ev-header">
        <div
          className="ev-header-thumb"
          style={event.image_url ? { backgroundImage: `url(${event.image_url})` } : undefined}
        />
        <div className="ev-header-info">
          <div className="ev-header-title-row">
            <h1 className="ev-header-title">{event.title}</h1>
            <StatusBadge variant={eventStatus === "published" ? "live" : "draft"}>
              {eventStatus}
            </StatusBadge>
          </div>
          <p className="ev-header-meta">
            {event.venue} · {new Date(event.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
            {event.start_time && ` · ${event.start_time}`}
          </p>
        </div>
        <div className="ev-header-stats">
          <div className="ev-header-stat">
            <span className="ev-header-stat-value">{totalSold}/{totalCapacity || "—"}</span>
            <span className="ev-header-stat-label">Sold</span>
          </div>
          <div className="ev-header-stat">
            <span className="ev-header-stat-value">{formatCurrency(grossRevenue)}</span>
            <span className="ev-header-stat-label">Gross</span>
          </div>
          <div className="ev-header-stat">
            <span className="ev-header-stat-value">{daysOut(event.date)}</span>
            <span className="ev-header-stat-label">Days Out</span>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab event={event} eventId={id} tiers={tiers} contracts={contracts} guests={guests} />
      )}
      {tab === "inventory" && (
        <InventoryHoldsTab eventId={id} tiers={tiers} holds={holds} onHoldsChanged={loadHolds} />
      )}
      {tab === "orders" && <OrdersTab orders={orders} />}
      {tab === "settlement" && <SettlementTab eventId={id} />}
      {tab === "marketing" && <MarketingTab eventId={id} />}
      {tab === "guestlist" && <GuestListTab guests={guests} eventId={id} />}
      {tab === "access" && <AccessTab />}
    </div>
  );
}

/* ---------------------------------------------------------------
   Overview tab
--------------------------------------------------------------- */
function OverviewTab({
  event, eventId, tiers, contracts, guests,
}: {
  event: EventRecord; eventId: string; tiers: Tier[]; contracts: Contract[]; guests: Guest[];
}) {
  const contract = contracts[0];
  const checklist = [
    {
      label: "Pricing & Ticket Types",
      done: tiers.length > 0,
      detail: tiers.length > 0 ? tiers.map((t) => t.tier_name).join(", ") : "No ticket tiers yet",
    },
    {
      label: "Guest List Setup",
      done: guests.length > 0,
      detail: guests.length > 0 ? `${guests.length} on the list` : "No guest list entries yet",
    },
    {
      label: "Artist Contract",
      done: contract?.status === "signed",
      detail: !contract
        ? "No contract on file"
        : contract.status === "signed"
          ? "Signed"
          : contract.status === "sent"
            ? "Sent — awaiting signature"
            : "Draft — not sent yet",
    },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div className="ev-overview-grid">
      <div className="card">
        <div className="card-head">
          <h3>Event Build Checklist</h3>
          <span className="count">{doneCount} of {checklist.length} complete</span>
        </div>
        <p className="card-sub">The same steps every show needs, in order.</p>
        <div className="ev-checklist">
          {checklist.map((c) => (
            <div key={c.label} className="ev-checklist-row">
              <div className={`ev-checklist-icon ${c.done ? "ev-checklist-icon-done" : ""}`}>
                {c.done ? "✓" : "!"}
              </div>
              <div>
                <div className="ev-checklist-label">{c.label}</div>
                <div className="ev-checklist-detail">{c.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ev-overview-side">
        <div className="card">
          <div className="card-head"><h3>At a Glance</h3></div>
          <div className="ev-glance-list">
            <div className="ev-glance-row">
              <span>Doors</span>
              <span>{event.doors_time || "—"}</span>
            </div>
            <div className="ev-glance-row">
              <span>Age Restriction</span>
              <span>{event.age_restriction || "—"}</span>
            </div>
            <div className="ev-glance-row">
              <span>Talent Buyer</span>
              <span>{event.talent_buyer || "—"}</span>
            </div>
            <div className="ev-glance-row">
              <span>Booking Agent</span>
              <span>{event.booking_agent || "—"}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Quick Actions</h3></div>
          <div className="ev-quick-actions-col">
            <Link href={`/events/${eventId}`} target="_blank" className="btn btn-outline">View Live Page</Link>
            <Link href={`/admin/events/${eventId}/edit`} className="btn btn-outline">Edit Details</Link>
            <Link href={`/admin/events/${eventId}/ads`} className="btn btn-outline">Marketing & Ads</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   Inventory & Holds tab
--------------------------------------------------------------- */
function InventoryHoldsTab({
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
    if (h.hold_type === "house_comp") {
      compByTier[h.ticket_tier_id] = (compByTier[h.ticket_tier_id] || 0) + h.quantity;
    } else {
      heldByTier[h.ticket_tier_id] = (heldByTier[h.ticket_tier_id] || 0) + h.quantity;
    }
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
    <>
      <div className="card">
        <div className="card-head">
          <h3>Ticket Types &amp; Inventory</h3>
          <Link href={`/admin/events/${eventId}/edit`} className="btn btn-primary btn-sm">Manage Ticket Types</Link>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="dtable">
            <thead>
              <tr>
                <th>Tier</th><th>Price</th><th>Total</th><th>Sold</th><th>Held</th><th>Comp</th><th>Available</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => {
                const held = heldByTier[t.id] || 0;
                const comp = compByTier[t.id] || 0;
                const available = Math.max(0, (t.capacity || 0) - (t.quantity_sold || 0) - held - comp);
                return (
                  <tr key={t.id}>
                    <td className="name">{t.tier_name}</td>
                    <td className="dim">{t.price > 0 ? formatCurrency(t.price) : "Comp"}</td>
                    <td>{t.capacity}</td>
                    <td>{t.quantity_sold}</td>
                    <td>{held || "—"}</td>
                    <td>{comp || "—"}</td>
                    <td>{available}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {tiers.length === 0 && <EmptyState title="No ticket types yet" description="Add tiers from the Edit page." />}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Holds</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowForm((s) => !s)}>
            + New Hold
          </button>
        </div>
        <p className="card-sub">
          Seats and tables set aside before they go on public sale. Manual bookkeeping — this does not
          change what buyers see as available at checkout yet.
        </p>

        {showForm && (
          <div className="ev-hold-form">
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
                <option value="artist">Artist Hold</option>
                <option value="promoter">Promoter Hold</option>
                <option value="house_comp">House Comp</option>
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
            <button type="button" className="btn btn-primary" disabled={saving} onClick={submitHold}>
              {saving ? "Saving…" : "Create Hold"}
            </button>
          </div>
        )}

        {holds.length === 0 ? (
          <EmptyState title="No active holds" description="Holds you create will show up here." />
        ) : (
          <div className="ev-holds-list">
            {holds.map((h) => (
              <div key={h.id} className="ev-hold-row">
                <Tag>{h.hold_type === "house_comp" ? "House Comp" : h.hold_type === "artist" ? "Artist Hold" : h.hold_type === "promoter" ? "Promoter Hold" : "Hold"}</Tag>
                <div className="ev-hold-body">
                  <div className="ev-hold-title">{h.quantity} {h.ticket_tiers?.tier_name || "tickets"}</div>
                  <div className="ev-hold-meta">{h.owner_label}{h.release_note ? ` · ${h.release_note}` : ""}</div>
                </div>
                <div className="ev-hold-qty">{h.quantity}</div>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => releaseHold(h.id)}>Release</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------
   Orders tab
--------------------------------------------------------------- */
function OrdersTab({ orders }: { orders: Order[] }) {
  return (
    <div className="card">
      <div className="card-head"><h3>Orders</h3></div>
      {orders.length === 0 ? (
        <EmptyState title="No orders yet" description="Orders for this event will show up here as they come in." />
      ) : (
        orders.map((o) => (
          <div key={o.id} className="order-row">
            <div className="avatar">{(o.customer_name || "?")[0].toUpperCase()}</div>
            <div className="info">
              <div className="t">{o.customer_name || "Guest"}</div>
              <div className="v">{o.quantity} ticket{o.quantity !== 1 ? "s" : ""} · {new Date(o.created_at).toLocaleDateString()}</div>
            </div>
            <div className="right">
              <div className="amt">{formatCurrency(o.total_amount || 0)}</div>
              <div className="v">{o.status}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   Settlement / Marketing / Guest List / Access tabs — thin panels
   that point at the existing dedicated pages for each concern rather
   than duplicating them here.
--------------------------------------------------------------- */
function SettlementTab({ eventId }: { eventId: string }) {
  return (
    <div className="card">
      <div className="card-head"><h3>Settlement</h3></div>
      <p className="card-sub">Settlements are created and finalized from the Settlements page.</p>
      <Link href={`/admin/settlements?event_id=${eventId}`} className="btn btn-outline">Open Settlements →</Link>
    </div>
  );
}

function MarketingTab({ eventId }: { eventId: string }) {
  return (
    <div className="card">
      <div className="card-head"><h3>Marketing</h3></div>
      <p className="card-sub">Ad campaigns, pixels, and Spotify embeds for this event live on the Marketing & Ads page.</p>
      <Link href={`/admin/events/${eventId}/ads`} className="btn btn-outline">Open Marketing &amp; Ads →</Link>
    </div>
  );
}

function GuestListTab({ guests, eventId }: { guests: Guest[]; eventId: string }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>Guest List</h3>
        <Link href={`/admin/guest-lists?event_id=${eventId}`} className="btn btn-primary btn-sm">Open Guest Lists →</Link>
      </div>
      {guests.length === 0 ? (
        <EmptyState title="No guest list entries yet" />
      ) : (
        <ul className="ev-guest-list">
          {guests.map((g) => (
            <li key={g.id}>{g.first_name} {g.last_name} <span className="dim">× {g.quantity}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AccessTab() {
  return (
    <div className="card">
      <div className="card-head"><h3>Access</h3></div>
      <p className="card-sub">
        Per-event access controls aren&apos;t available yet. Role permissions are managed sitewide
        under Settings → Permissions.
      </p>
      <Link href="/admin/settings/permissions" className="btn btn-outline">Open Permissions →</Link>
    </div>
  );
}
