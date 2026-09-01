"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { formatPhoneNumber } from "@/lib/formatPhone";
import { getCookie } from "@/lib/cookies";
import { useVenue } from "@/app/components/VenueContext";

// ── Types ─────────────────────────────────────────────────────────────────────

type CalendarEvent = {
  id: string;
  title: string;
  venue: string;
  date: string;
  end_time: string | null;
  event_type: string | null;
  booking_status: string | null;
  hold_level: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  calendar_color: string | null;
  venue_id: string | null;
  status: string;
};

type TabKey =
  | "details" | "sales" | "offers" | "settlement"
  | "contracts" | "client" | "quote" | "invoices" | "attachments";

type Props = {
  event: CalendarEvent;
  onClose: () => void;
  onUpdate: () => void;
};

// ── Style constants ────────────────────────────────────────────────────────────

const GOLD = "#ffffff";
const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: 10, padding: "16px 20px", marginBottom: 12,
};
const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 16,
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700,
  color: "rgba(255,255,255,0.4)", textTransform: "uppercase",
  letterSpacing: "0.5px", marginBottom: 3,
};
const btnGold: React.CSSProperties = {
  background: GOLD, color: "#0b0d1d", border: "none", borderRadius: 7,
  padding: "9px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13,
};
const btnOutline: React.CSSProperties = {
  background: "transparent", color: GOLD, border: `1px solid ${GOLD}`,
  borderRadius: 7, padding: "9px 18px", fontWeight: 600,
  cursor: "pointer", fontSize: 13,
};
const btnDanger: React.CSSProperties = {
  background: "transparent", color: "#ef4444",
  border: "1px solid rgba(239,68,68,0.3)", borderRadius: 7,
  padding: "7px 14px", fontWeight: 600, cursor: "pointer", fontSize: 12,
};

function fmt(n: number) {
  return Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}
function statusBadge(status: string, colors?: Record<string, string>) {
  const defaults: Record<string, string> = {
    confirmed: "#22c55e", hold: "#f59e0b", cancelled: "#ef4444",
    draft: "#6b7280", sent: "#3b82f6", signed: "#22c55e", void: "#6b7280",
    active: "#22c55e", finalized: "#22c55e", paid: "#22c55e", overdue: "#ef4444",
  };
  const c = (colors ?? defaults)[status] ?? "#6b7280";
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, textTransform: "uppercase",
      background: `${c}22`, color: c, border: `1px solid ${c}44`,
    }}>
      {status}
    </span>
  );
}

// ── Tab definitions ────────────────────────────────────────────────────────────

function getTabsForEvent(ev: CalendarEvent): { key: TabKey; label: string }[] {
  const type = ev.event_type || "";
  const isTicketed = ["hard_ticket", "ticketed", "co_promote", "rental_box_office"].includes(type);
  const isPrivate = type === "private";

  if (isTicketed) {
    return [
      { key: "details",    label: "Details"     },
      { key: "sales",      label: "Ticket Sales" },
      { key: "offers",     label: "Offers"       },
      { key: "settlement", label: "Settlement"   },
      { key: "contracts",  label: "Contracts"    },
    ];
  }
  if (isPrivate) {
    return [
      { key: "details",     label: "Details"     },
      { key: "client",      label: "Client"      },
      { key: "quote",       label: "Quote"       },
      { key: "invoices",    label: "Invoices"    },
      { key: "attachments", label: "Attachments" },
    ];
  }
  return [{ key: "details", label: "Details" }];
}

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN PANEL
// ═════════════════════════════════════════════════════════════════════════════

export default function EventPanel({ event, onClose, onUpdate }: Props) {
  const router = useRouter();
  const { venueSlug } = useVenue();
  const [activeTab, setActiveTab] = useState<TabKey>("details");
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const tabs = getTabsForEvent(event);

  // Slide in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Reset to first tab when event changes
  useEffect(() => {
    setActiveTab("details");
    setVisible(true);
  }, [event.id]);

  // Close with slide-out animation
  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 280);
  };

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const BOOKING_COLORS: Record<string, string> = {
    confirmed: "rgba(80,200,120,0.9)", hold: "rgba(255,200,50,0.9)", cancelled: "rgba(255,80,80,0.9)",
  };
  const statusColor = BOOKING_COLORS[event.booking_status || "confirmed"] || BOOKING_COLORS.confirmed;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: "fixed", inset: 0, zIndex: 8998,
          background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)",
          opacity: visible ? 1 : 0, transition: "opacity 0.28s ease",
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 8999,
          width: "min(600px, 100vw)",
          background: "var(--vc-bg-deep)",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          display: "flex", flexDirection: "column",
          transform: visible ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.28s cubic-bezier(0.22,1,0.36,1)",
          boxShadow: "-8px 0 40px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "18px 20px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
              <h2 style={{ color: GOLD, margin: "0 0 6px", fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>
                {event.title}
              </h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {statusBadge(event.booking_status || "confirmed")}
                {event.hold_level && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(255,200,50,0.15)", color: "rgba(255,200,50,0.9)", border: "1px solid rgba(255,200,50,0.3)" }}>
                    {event.hold_level}
                  </span>
                )}
                <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                  {fmtDate(event.date)}{event.venue ? ` · ${event.venue}` : ""}
                </span>
              </div>
            </div>
            <button onClick={handleClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4, flexShrink: 0 }}>
              ×
            </button>
          </div>

          {/* Status bar */}
          <div style={{ height: 3, background: statusColor, borderRadius: 2, marginTop: 12 }} />
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", overflowX: "auto", flexShrink: 0 }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: "10px 18px", border: "none", background: "none", cursor: "pointer",
                color: activeTab === t.key ? GOLD : "rgba(255,255,255,0.4)",
                borderBottom: activeTab === t.key ? `2px solid ${GOLD}` : "2px solid transparent",
                fontWeight: activeTab === t.key ? 700 : 500, fontSize: 13, whiteSpace: "nowrap",
                transition: "color 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {activeTab === "details"    && <DetailsTab    event={event} onUpdate={onUpdate} onClose={handleClose} />}
          {activeTab === "sales"      && <TicketSalesTab eventId={event.id} event={event} />}
          {activeTab === "offers"     && <OffersTab     eventId={event.id} event={event} venueSlug={venueSlug} onUpdate={onUpdate} />}
          {activeTab === "settlement" && <SettlementTab  eventId={event.id} event={event} venueSlug={venueSlug} />}
          {activeTab === "contracts"  && <ContractsTab   eventId={event.id} venueSlug={venueSlug} />}
          {activeTab === "client"     && <ClientTab      event={event} onUpdate={onUpdate} />}
          {activeTab === "quote"      && <QuoteTab       event={event} venueSlug={venueSlug} onUpdate={onUpdate} />}
          {activeTab === "invoices"   && <InvoicesTab    event={event} venueSlug={venueSlug} />}
          {activeTab === "attachments"&& <AttachmentsTab eventId={event.id} />}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {event.event_type === "private" ? (
            <a href={`/admin/private-events/${event.id}`} style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textDecoration: "none" }}>
              Full Rental Hub →
            </a>
          ) : event.event_type && event.event_type !== "non_ticketed" ? (
            <a href={`/admin/events/${event.id}/edit`} style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textDecoration: "none" }}>
              Full Event Editor →
            </a>
          ) : null}
        </div>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: DETAILS
// ═════════════════════════════════════════════════════════════════════════════

function DetailsTab({ event, onUpdate, onClose }: { event: CalendarEvent; onUpdate: () => void; onClose: () => void }) {
  const [form, setForm] = useState({
    title: event.title || "",
    date: event.date ? event.date.slice(0, 10) : "",
    time: event.date && event.date.length > 10 ? new Date(event.date).toTimeString().slice(0, 5) : "",
    end_date: event.end_time ? event.end_time.slice(0, 10) : "",
    venue: event.venue || "",
    booking_status: event.booking_status || "confirmed",
    event_type: event.event_type || "hard_ticket",
    notes: event.notes || "",
    status: event.status || "published",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const dateTime = `${form.date}T${form.time || "12:00"}:00`;
    const endTime = form.end_date ? `${form.end_date}T12:00:00` : null;
    await fetch("/api/calendar", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: event.id, title: form.title, date: dateTime,
        end_time: endTime, venue: form.venue,
        booking_status: form.booking_status, event_type: form.event_type,
        notes: form.notes || null, status: form.status,
      }),
    });
    setSaving(false);
    onUpdate();
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${event.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    await fetch(`/api/calendar?id=${event.id}`, { method: "DELETE" });
    onClose();
    onUpdate();
  };

  const BOOKING_OPTS = [
    { value: "confirmed", label: "Confirmed" },
    { value: "hold",      label: "Hold"      },
    { value: "cancelled", label: "Cancelled" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Show Name</label>
        <input style={inp} value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
      </div>
      <div className="epanel-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div>
          <label style={lbl}>Date</label>
          <input style={inp} type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
        </div>
        <div>
          <label style={lbl}>Start Time</label>
          <input style={inp} type="time" value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} />
        </div>
        <div>
          <label style={lbl}>End Date (multi-day)</label>
          <input style={inp} type="date" value={form.end_date} min={form.date || undefined} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} />
        </div>
        <div>
          <label style={lbl}>Venue / Room</label>
          <input style={inp} value={form.venue} onChange={e => setForm(p => ({ ...p, venue: e.target.value }))} />
        </div>
      </div>

      <div className="epanel-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div>
          <label style={lbl}>Status</label>
          <div style={{ display: "flex", gap: 6 }}>
            {BOOKING_OPTS.map(o => (
              <button key={o.value} type="button" onClick={() => setForm(p => ({ ...p, booking_status: o.value }))}
                style={{ flex: 1, padding: "7px 6px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${form.booking_status === o.value ? "rgba(255, 255, 255, 0.6)" : "rgba(255,255,255,0.1)"}`,
                  background: form.booking_status === o.value ? "rgba(255, 255, 255, 0.12)" : "transparent",
                  color: form.booking_status === o.value ? GOLD : "rgba(255,255,255,0.45)",
                }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={lbl}>Visibility</label>
          <select style={inp} value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={lbl}>Internal Notes</label>
        <textarea style={{ ...inp, minHeight: 80, resize: "vertical" }} value={form.notes}
          onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          placeholder="Internal notes — not shown publicly" />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSave} disabled={saving} style={btnGold}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button onClick={handleDelete} disabled={deleting} style={btnDanger}>
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: TICKET SALES
// ═════════════════════════════════════════════════════════════════════════════

type OrderRow = { id: string; customer_name: string; customer_email: string; quantity: number; total_amount: number; created_at: string; source: string | null };

function TicketSalesTab({ eventId, event }: { eventId: string; event: CalendarEvent }) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [closingOut, setClosingOut] = useState(false);

  useEffect(() => {
    fetch(`/api/orders?event_id=${eventId}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setOrders(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [eventId]);

  const gross = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const totalTickets = orders.reduce((s, o) => s + Number(o.quantity || 0), 0);

  const handleCloseOut = async () => {
    if (!confirm("Close out this show? This locks it from further ticket sales.")) return;
    setClosingOut(true);
    await fetch(`/api/events/${eventId}/closeout`, { method: "POST" }).catch(() => {});
    setClosingOut(false);
  };

  if (loading) return <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading sales data…</p>;

  return (
    <div>
      {/* Summary */}
      <div className="epanel-grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Orders", value: orders.length },
          { label: "Tickets Sold", value: totalTickets },
          { label: "Gross Revenue", value: fmt(gross) },
        ].map(s => (
          <div key={s.label} style={{ ...card, textAlign: "center", padding: "14px 12px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: GOLD }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Order list */}
      {orders.length === 0 ? (
        <p style={{ color: "rgba(255,255,255,0.35)", textAlign: "center", padding: "32px 0" }}>No orders yet</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {orders.map(o => (
            <div key={o.id} style={{ ...card, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{o.customer_name}</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{o.customer_email}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: GOLD, fontWeight: 700, fontSize: 14 }}>{fmt(o.total_amount)}</div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{o.quantity} ticket{o.quantity !== 1 ? "s" : ""}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <a href={`/admin/orders/${eventId}`} style={{ ...btnGold, textDecoration: "none", fontSize: 12, padding: "8px 14px" }}>
          Full Sales Report →
        </a>
        <button onClick={handleCloseOut} disabled={closingOut} style={{ ...btnDanger, fontSize: 12 }}>
          {closingOut ? "Closing…" : "Close Out Show"}
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: OFFERS
// ═════════════════════════════════════════════════════════════════════════════

type OfferRow = { id: string; artist_name: string; guarantee: number; deal_type: string; status: string; event_date: string; gross_potential: number };

function OffersTab({ eventId, event, venueSlug, onUpdate }: { eventId: string; event: CalendarEvent; venueSlug: string; onUpdate: () => void }) {
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const venueId = getCookie("venue-id") || "";

  const load = useCallback(async () => {
    if (!venueId) { setLoading(false); return; }
    const res = await fetch(`/api/offers?venue_id=${venueId}`);
    if (res.ok) {
      const all = await res.json();
      // Match by event_id (direct FK) or by event_date
      const eventDateStr = event.date.slice(0, 10);
      const matched = Array.isArray(all) ? all.filter((o: OfferRow & { event_id?: string }) =>
        o.event_id === eventId ||
        (o.event_date && o.event_date.slice(0, 10) === eventDateStr)
      ) : [];
      setOffers(matched);
    }
    setLoading(false);
  }, [venueId, eventId, event.date]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (offerId: string, status: string) => {
    setUpdatingId(offerId);
    await fetch(`/api/offers/${offerId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setUpdatingId(null);
    load();
  };

  const downloadPDF = async (offer: OfferRow) => {
    const { exportOfferPDF } = await import("@/lib/pdf/offer-pdf").catch(() => ({ exportOfferPDF: null }));
    if (!exportOfferPDF) { window.open(`/admin/offers/${offer.id}`, "_blank"); return; }
    const full = await fetch(`/api/offers/${offer.id}`).then(r => r.json()).catch(() => null);
    if (full) await exportOfferPDF(full, null);
  };

  if (loading) return <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading offers…</p>;

  return (
    <div>
      {offers.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <p style={{ color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>No offer linked to this show yet</p>
          <a
            href={`/admin/offers/new?event_id=${eventId}&event_date=${event.date.slice(0, 10)}`}
            style={{ ...btnGold, textDecoration: "none", fontSize: 13 }}
          >
            + Create Offer
          </a>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {offers.map(o => (
            <div key={o.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{o.artist_name}</span>
                    {statusBadge(o.status)}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                    {o.deal_type} · Guarantee: {fmt(o.guarantee)} · Gross Potential: {fmt(o.gross_potential)}
                  </div>
                </div>
              </div>

              {/* Status actions */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {["draft","sent","accepted","declined"].map(s => (
                  <button key={s} onClick={() => updateStatus(o.id, s)} disabled={o.status === s || updatingId === o.id}
                    style={{ padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      border: `1px solid ${o.status === s ? GOLD : "rgba(255,255,255,0.15)"}`,
                      background: o.status === s ? "rgba(255, 255, 255, 0.12)" : "transparent",
                      color: o.status === s ? GOLD : "rgba(255,255,255,0.4)",
                    }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => downloadPDF(o)} style={{ ...btnGold, fontSize: 12, padding: "7px 13px" }}>
                  Offer PDF
                </button>
                <a href={`/admin/offers/${o.id}`} target="_blank" rel="noopener noreferrer"
                  style={{ ...btnOutline, textDecoration: "none", fontSize: 12, padding: "7px 13px" }}>
                  Full Editor →
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: SETTLEMENT
// ═════════════════════════════════════════════════════════════════════════════

type Settlement = {
  id: string; status: string; total_gross: number; net_receipts: number;
  artist_total: number; source: string; created_at: string;
};

function SettlementTab({ eventId, event, venueSlug }: { eventId: string; event: CalendarEvent; venueSlug: string }) {
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/settlements?event_id=${eventId}`);
    if (res.ok) {
      const data = await res.json();
      setSettlement(Array.isArray(data) && data.length > 0 ? data[0] : null);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const createSettlement = async () => {
    setCreating(true);
    const res = await fetch("/api/settlements", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId, venue_id: getCookie("venue-id") || null }),
    });
    if (res.ok) { const data = await res.json(); setSettlement(data); }
    setCreating(false);
  };

  if (loading) return <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading settlement…</p>;

  if (!settlement) {
    return (
      <div style={{ textAlign: "center", padding: "32px 0" }}>
        <p style={{ color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>No settlement yet</p>
        <button onClick={createSettlement} disabled={creating} style={btnGold}>
          {creating ? "Creating…" : "Create Settlement"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>Settlement</span>
            {statusBadge(settlement.status)}
          </div>
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
            {settlement.source === "external" ? "Manual" : "VenueCore"}
          </span>
        </div>
        {[
          { label: "Gross Revenue", value: fmt(settlement.total_gross) },
          { label: "Net Receipts", value: fmt(settlement.net_receipts) },
          { label: "Artist Payout", value: fmt(settlement.artist_total) },
        ].map(r => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{r.label}</span>
            <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{r.value}</span>
          </div>
        ))}
      </div>
      <a href={`/admin/settlements/${settlement.id}`} style={{ ...btnGold, textDecoration: "none", fontSize: 13 }}>
        {settlement.status === "finalized" ? "View Settlement" : "Open & Finalize"} →
      </a>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: CONTRACTS
// ═════════════════════════════════════════════════════════════════════════════

type ContractRow = { id: string; status: string; source: string; guarantee: number | null; deal_type: string | null; created_at: string; file_url: string | null };

function ContractsTab({ eventId, venueSlug }: { eventId: string; venueSlug: string }) {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const venueId = getCookie("venue-id") || "";
    fetch(`/api/contracts?event_id=${eventId}${venueId ? `&venue_id=${venueId}` : ""}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setContracts(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [eventId]);

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/contracts/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setContracts(prev => prev.map(c => c.id === id ? { ...c, status } : c));
  };

  if (loading) return <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading contracts…</p>;

  return (
    <div>
      {contracts.length === 0 ? (
        <p style={{ color: "rgba(255,255,255,0.35)", textAlign: "center", padding: "32px 0" }}>
          No contracts yet. Create one from the Offers tab.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {contracts.map(c => (
            <div key={c.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {statusBadge(c.status)}
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
                    {c.source === "uploaded" ? "Uploaded" : "Generated"} · {c.deal_type || "—"} · {fmt(c.guarantee || 0)}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["draft","sent","signed","void"].map(s => (
                  <button key={s} onClick={() => updateStatus(c.id, s)} disabled={c.status === s}
                    style={{ padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      border: `1px solid ${c.status === s ? GOLD : "rgba(255,255,255,0.15)"}`,
                      background: c.status === s ? "rgba(255, 255, 255, 0.12)" : "transparent",
                      color: c.status === s ? GOLD : "rgba(255,255,255,0.4)",
                    }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
                {c.file_url && (
                  <a href={c.file_url} target="_blank" rel="noopener noreferrer"
                    style={{ ...btnGold, fontSize: 11, padding: "5px 12px", textDecoration: "none" }}>
                    Download
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: CLIENT (private events)
// ═════════════════════════════════════════════════════════════════════════════

function ClientTab({ event, onUpdate }: { event: CalendarEvent; onUpdate: () => void }) {
  const [form, setForm] = useState({
    client_name: "", client_email: "", client_phone: "",
    client_company: "", client_billing_address: "", tax_exempt: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/events/${event.id}`)
      .then(r => r.json())
      .then(data => {
        setForm({
          client_name: data.client_name || data.contact_name || "",
          client_email: data.client_email || data.contact_email || "",
          client_phone: data.client_phone || data.contact_phone || "",
          client_company: data.client_company || "",
          client_billing_address: data.client_billing_address || "",
          tax_exempt: data.tax_exempt || false,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [event.id]);

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/events/${event.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    onUpdate();
  };

  if (loading) return <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading client info…</p>;

  const fields: { label: string; key: keyof typeof form; type?: string }[] = [
    { label: "Client Name",       key: "client_name" },
    { label: "Company",           key: "client_company" },
    { label: "Email",             key: "client_email", type: "email" },
    { label: "Phone",             key: "client_phone", type: "tel" },
    { label: "Billing Address",   key: "client_billing_address" },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        {fields.map(f => (
          <div key={f.key} style={f.key === "client_billing_address" ? { gridColumn: "span 2" } : {}}>
            <label style={lbl}>{f.label}</label>
            <input style={inp} type={f.type || "text"} value={String(form[f.key])}
              onChange={e => setForm(p => ({ ...p, [f.key]: f.key === "client_phone" ? formatPhoneNumber(e.target.value) : e.target.value }))} />
          </div>
        ))}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#fff", marginBottom: 16 }}>
        <input type="checkbox" checked={form.tax_exempt} onChange={e => setForm(p => ({ ...p, tax_exempt: e.target.checked }))} style={{ accentColor: GOLD }} />
        Tax Exempt
      </label>
      <button onClick={handleSave} disabled={saving} style={btnGold}>
        {saving ? "Saving…" : "Save Client Info"}
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: QUOTE (private events — inline builder)
// ═════════════════════════════════════════════════════════════════════════════

type QuoteLineItem = { category: string; description: string; quantity: number; unit_price: number; amount: number };
type QuoteRecord = {
  id: string; proposal_number: string; version: number; status: string;
  line_items: QuoteLineItem[]; subtotal: number; tax_rate: number; tax_amount: number; total: number;
  deposit_pct: number; deposit_amount: number; deposit_due: string; balance_due_date: string;
  cancellation_policy: string; valid_until: string; notes: string; terms: string; created_at: string;
  accepted_at: string | null;
};

const Q_CATS = ["Room Rental","A/V Production","Food & Beverage","Staffing","Setup & Teardown","Décor & Linens","Entertainment","Additional Fees","Custom"];

function QuoteTab({ event, venueSlug, onUpdate }: { event: CalendarEvent; venueSlug: string; onUpdate: () => void }) {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const venueName = getCookie("venue-name") || "";

  const [qForm, setQForm] = useState({
    line_items: [{ category: "Room Rental", description: "", quantity: 1, unit_price: 0, amount: 0 }] as QuoteLineItem[],
    notes: "", terms: "", valid_days: 14, deposit_pct: 25,
    deposit_due: "On Acceptance", balance_due_date: "30 Days Before Event",
    cancellation_policy: "", tax_exempt: false,
  });
  const [delivInput, setDelivInput] = useState("");
  const [deliverables, setDeliverables] = useState<string[]>([]);

  const TAX = qForm.tax_exempt ? 0 : 0.095;
  const subtotal = qForm.line_items.reduce((s, i) => s + i.amount, 0);
  const tax = Math.round(subtotal * TAX * 100) / 100;
  const total = subtotal + tax;
  const deposit = Math.round(total * (qForm.deposit_pct / 100) * 100) / 100;

  const load = useCallback(async () => {
    const res = await fetch(`/api/private-events/${event.id}/proposals`);
    if (res.ok) setQuotes(await res.json());
    setLoading(false);
  }, [event.id]);

  useEffect(() => { load(); }, [load]);

  const updateItem = (i: number, field: string, val: string | number) => {
    setQForm(p => ({
      ...p,
      line_items: p.line_items.map((item, idx) => {
        if (idx !== i) return item;
        const u = { ...item, [field]: val };
        if (field === "quantity" || field === "unit_price") u.amount = Math.round(Number(u.quantity) * Number(u.unit_price) * 100) / 100;
        return u;
      }),
    }));
  };

  const saveQuote = async () => {
    setSaving(true);
    const validUntil = new Date(); validUntil.setDate(validUntil.getDate() + qForm.valid_days);
    const payload = {
      line_items: qForm.line_items.filter(i => i.description),
      subtotal, tax_rate: TAX, tax_amount: tax, total,
      deposit_pct: qForm.deposit_pct, deposit_amount: deposit,
      deposit_due: qForm.deposit_due, balance_due_date: qForm.balance_due_date,
      cancellation_policy: qForm.cancellation_policy,
      notes: qForm.notes, terms: qForm.terms,
      valid_until: validUntil.toISOString().split("T")[0],
      client_name: "", client_email: "", client_phone: "", client_company: "",
      status: "draft",
    };
    if (editingId) {
      await fetch(`/api/private-events/${event.id}/proposals/${editingId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
    } else {
      await fetch(`/api/private-events/${event.id}/proposals`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
    }
    setSaving(false);
    setShowBuilder(false); setEditingId(null);
    load(); onUpdate();
  };

  const downloadPDF = async (q: QuoteRecord) => {
    setDownloadingId(q.id);
    const { exportProposalPDF } = await import("@/lib/pdf/proposal-pdf");
    await exportProposalPDF({
      proposal_number: q.proposal_number,
      date: new Date(q.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      valid_until: new Date(q.valid_until + "T12:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      event_name: event.title, event_date: fmtDate(event.date), event_venue: event.venue,
      client_name: "Client", line_items: (q.line_items || []).map(i => ({ description: `[${i.category}] ${i.description}`, amount: i.amount })),
      subtotal: q.subtotal, tax_rate: q.tax_rate, tax_amount: q.tax_amount, total: q.total,
      deposit_pct: q.deposit_pct, deposit_amount: q.deposit_amount,
      deposit_due: q.deposit_due, balance_due_date: q.balance_due_date,
      cancellation_policy: q.cancellation_policy, notes: q.notes, terms: q.terms,
      venue_name: venueName, venue_slug: venueSlug,
      venue_logo_url: decodeURIComponent(getCookie("venue-logo") || "") || null,
    });
    setDownloadingId(null);
  };

  const accept = async (q: QuoteRecord) => {
    if (!confirm(`Mark ${q.proposal_number} as accepted and confirm this booking?`)) return;
    setAcceptingId(q.id);
    await fetch(`/api/private-events/${event.id}/proposals/${q.id}/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accepted_by: "Admin" }) });
    setAcceptingId(null);
    load(); onUpdate();
  };

  const decline = async (q: QuoteRecord) => {
    if (!confirm(`Mark ${q.proposal_number} as declined?`)) return;
    await fetch(`/api/private-events/${event.id}/proposals/${q.id}/decline`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    load();
  };

  if (loading) return <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading quotes…</p>;

  if (showBuilder) return (
    <div>
      <button onClick={() => { setShowBuilder(false); setEditingId(null); }}
        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 13, padding: "0 0 12px" }}>
        ← Back to Quotes
      </button>

      {/* Line items */}
      <div style={{ ...card, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>Line Items</span>
          <button onClick={() => setQForm(p => ({ ...p, line_items: [...p.line_items, { category: "Room Rental", description: "", quantity: 1, unit_price: 0, amount: 0 }] }))}
            style={{ ...btnOutline, fontSize: 11, padding: "5px 12px" }}>+ Add</button>
        </div>
        {qForm.line_items.map((item, idx) => (
          <div key={idx} style={{ display: "grid", gridTemplateColumns: "120px 1fr 50px 80px 70px 24px", gap: 6, marginBottom: 6, alignItems: "center" }}>
            <select value={item.category} onChange={e => updateItem(idx, "category", e.target.value)} style={{ ...inp, padding: "6px 8px", fontSize: 16 }}>
              {Q_CATS.map(c => <option key={c}>{c}</option>)}
            </select>
            <input style={{ ...inp, fontSize: 16 }} value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} placeholder="Description" />
            <input style={{ ...inp, fontSize: 16, textAlign: "right" }} type="number" min="1" value={item.quantity} onChange={e => updateItem(idx, "quantity", parseFloat(e.target.value) || 1)} />
            <input style={{ ...inp, fontSize: 16, textAlign: "right" }} type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", parseFloat(e.target.value) || 0)} />
            <span style={{ color: "#fff", fontSize: 12, fontWeight: 600, textAlign: "right" }}>${item.amount.toFixed(2)}</span>
            <button onClick={() => setQForm(p => ({ ...p, line_items: p.line_items.filter((_, i) => i !== idx) }))}
              style={{ background: "none", border: "none", color: "rgba(255,80,80,0.6)", cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
        ))}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 8, paddingTop: 8, textAlign: "right" }}>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 2 }}>Subtotal: ${subtotal.toFixed(2)}</div>
          {!qForm.tax_exempt && <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 4 }}>Tax (9.5%): ${tax.toFixed(2)}</div>}
          <div style={{ color: GOLD, fontWeight: 800, fontSize: 16 }}>Total: ${total.toFixed(2)}</div>
        </div>
      </div>

      {/* Deposit terms */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div>
          <label style={lbl}>Deposit %</label>
          <input style={inp} type="number" min="0" max="100" value={qForm.deposit_pct}
            onChange={e => setQForm(p => ({ ...p, deposit_pct: parseFloat(e.target.value) || 0 }))} />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>= ${deposit.toFixed(2)}</span>
        </div>
        <div>
          <label style={lbl}>Deposit Due</label>
          <select style={inp} value={qForm.deposit_due} onChange={e => setQForm(p => ({ ...p, deposit_due: e.target.value }))}>
            {["On Acceptance","Within 7 Days","Within 14 Days","Within 30 Days"].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Balance Due</label>
          <select style={inp} value={qForm.balance_due_date} onChange={e => setQForm(p => ({ ...p, balance_due_date: e.target.value }))}>
            {["30 Days Before Event","14 Days Before Event","Day of Show"].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Valid For (days)</label>
          <input style={inp} type="number" min="1" value={qForm.valid_days}
            onChange={e => setQForm(p => ({ ...p, valid_days: parseInt(e.target.value) || 14 }))} />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Cancellation Policy</label>
        <textarea style={{ ...inp, minHeight: 70, resize: "vertical" }} value={qForm.cancellation_policy}
          onChange={e => setQForm(p => ({ ...p, cancellation_policy: e.target.value }))} />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={saveQuote} disabled={saving} style={btnGold}>{saving ? "Saving…" : "Save & Download PDF"}</button>
        <button onClick={() => { setShowBuilder(false); setEditingId(null); }}
          style={{ ...btnOutline, color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.15)" }}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ color: "#fff", fontWeight: 600 }}>Quotes & Estimates</span>
        <button onClick={() => { setEditingId(null); setQForm({ line_items: [{ category: "Room Rental", description: "", quantity: 1, unit_price: 0, amount: 0 }], notes: "", terms: "", valid_days: 14, deposit_pct: 25, deposit_due: "On Acceptance", balance_due_date: "30 Days Before Event", cancellation_policy: "", tax_exempt: false }); setShowBuilder(true); }} style={btnGold}>
          + New Quote
        </button>
      </div>
      {quotes.length === 0 ? (
        <p style={{ color: "rgba(255,255,255,0.35)", textAlign: "center", padding: "32px 0" }}>No quotes yet</p>
      ) : quotes.map(q => (
        <div key={q.id} style={{ ...card, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: GOLD, fontWeight: 700 }}>{q.proposal_number}</span>
              {statusBadge(q.status)}
            </div>
            <span style={{ color: GOLD, fontWeight: 800, fontSize: 16 }}>${q.total.toFixed(2)}</span>
          </div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 10 }}>
            Valid until {q.valid_until} · Deposit: {q.deposit_pct}% (${q.deposit_amount?.toFixed(2)})
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => downloadPDF(q)} disabled={downloadingId === q.id}
              style={{ ...btnGold, fontSize: 11, padding: "6px 12px" }}>
              {downloadingId === q.id ? "…" : "PDF"}
            </button>
            {q.status !== "accepted" && (
              <>
                <button onClick={() => accept(q)} disabled={acceptingId === q.id}
                  style={{ fontSize: 11, padding: "6px 12px", borderRadius: 6, fontWeight: 600, cursor: "pointer", background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" }}>
                  {acceptingId === q.id ? "…" : "✓ Accept"}
                </button>
                <button onClick={() => decline(q)}
                  style={{ ...btnDanger, fontSize: 11, padding: "6px 10px" }}>Decline</button>
              </>
            )}
            {q.status === "accepted" && (
              <span style={{ fontSize: 11, color: "#22c55e", padding: "6px 0" }}>✓ Confirmed</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: INVOICES
// ═════════════════════════════════════════════════════════════════════════════

type InvoiceRow = { id: string; invoice_number: string; total: number; amount_paid: number; balance_due: number; status: string; due_date: string; client_name: string };

function InvoicesTab({ event, venueSlug }: { event: CalendarEvent; venueSlug: string }) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/invoices?event_id=${event.id}`);
    if (res.ok) setInvoices(await res.json());
    setLoading(false);
  }, [event.id]);

  useEffect(() => { load(); }, [load]);

  const downloadPDF = async (inv: InvoiceRow) => {
    setGeneratingId(inv.id);
    const { exportInvoicePDF } = await import("@/lib/pdf/invoice-pdf");
    await exportInvoicePDF({
      invoice_number: inv.invoice_number,
      invoice_date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      due_date: new Date(inv.due_date + "T12:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      client_name: inv.client_name, client_email: undefined, client_phone: undefined,
      client_company: undefined, client_address: undefined,
      event_name: event.title, event_date: fmtDate(event.date),
      line_items: [], subtotal: inv.total, tax_rate: 0, tax_amount: 0, total: inv.total,
      amount_paid: inv.amount_paid, balance_due: inv.balance_due,
      payment_url: `${typeof window !== "undefined" ? window.location.origin : ""}/pay/${inv.id}`,
      venue_name: event.venue || "", venue_slug: venueSlug,
      venue_logo_url: decodeURIComponent(getCookie("venue-logo") || "") || null,
    });
    setGeneratingId(null);
  };

  if (loading) return <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading invoices…</p>;

  return (
    <div>
      {invoices.length === 0 ? (
        <p style={{ color: "rgba(255,255,255,0.35)", textAlign: "center", padding: "32px 0" }}>
          No invoices yet. Create one from the Quote tab after building a quote.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {invoices.map(inv => (
            <div key={inv.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: GOLD, fontWeight: 700, fontSize: 13 }}>{inv.invoice_number}</span>
                  {statusBadge(inv.status)}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{fmt(inv.total)}</div>
                  {inv.balance_due > 0 && <div style={{ color: "#ef4444", fontSize: 11 }}>Balance: {fmt(inv.balance_due)}</div>}
                  {inv.amount_paid > 0 && <div style={{ color: "#22c55e", fontSize: 11 }}>Paid: {fmt(inv.amount_paid)}</div>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => downloadPDF(inv)} disabled={generatingId === inv.id}
                  style={{ ...btnGold, fontSize: 11, padding: "6px 12px" }}>
                  {generatingId === inv.id ? "…" : "PDF"}
                </button>
                <a href={`/pay/${inv.id}`} target="_blank" rel="noopener noreferrer"
                  style={{ ...btnOutline, fontSize: 11, padding: "6px 12px", textDecoration: "none" }}>
                  Payment Link
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: ATTACHMENTS
// ═════════════════════════════════════════════════════════════════════════════

type Attachment = { id: string; file_name: string; file_url: string; file_type: string; created_at: string };

function AttachmentsTab({ eventId }: { eventId: string }) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/private-events/${eventId}/attachments`);
    if (res.ok) setFiles(await res.json());
    setLoading(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData(); fd.append("file", file);
    await fetch(`/api/private-events/${eventId}/attachments`, { method: "POST", body: fd });
    setUploading(false);
    load();
    if (inputRef.current) inputRef.current.value = "";
  };

  const deleteFile = async (id: string) => {
    if (!confirm("Delete this attachment?")) return;
    await fetch(`/api/private-events/${eventId}/attachments?id=${id}`, { method: "DELETE" });
    load();
  };

  if (loading) return <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading attachments…</p>;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <input ref={inputRef} type="file" id="attach-upload" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={handleUpload} style={{ display: "none" }} />
        <label htmlFor="attach-upload" style={{ ...btnGold, cursor: "pointer", display: "inline-block", fontSize: 13 }}>
          {uploading ? "Uploading…" : "+ Upload File"}
        </label>
        <span style={{ marginLeft: 10, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>PDF, DOC, JPG, PNG</span>
      </div>

      {files.length === 0 ? (
        <p style={{ color: "rgba(255,255,255,0.35)", textAlign: "center", padding: "24px 0" }}>No files attached yet</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {files.map(f => (
            <div key={f.id} style={{ ...card, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{f.file_name}</div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
                  {new Date(f.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <a href={f.file_url} target="_blank" rel="noopener noreferrer"
                  style={{ ...btnGold, fontSize: 11, padding: "6px 12px", textDecoration: "none" }}>
                  Download
                </a>
                <button onClick={() => deleteFile(f.id)} style={{ ...btnDanger, fontSize: 11, padding: "6px 10px" }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
