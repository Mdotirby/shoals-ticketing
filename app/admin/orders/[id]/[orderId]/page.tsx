"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────────────

type OrderDetail = {
  id: string;
  event_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  quantity: number;
  total_amount: number;
  status: string;
  stripe_payment_intent_id?: string;
  stripe_checkout_session_id?: string;
  delivery_method?: string;
  created_at: string;
  events: {
    id: string;
    title: string;
    date: string;
    venue: string;
    venue_id?: string;
  };
};

type Ticket = {
  id: string;
  qr_code: string;
  qr_data_url: string | null;
  ticket_type_id: string | null;
  customer_name: string;
  customer_email: string;
  is_scanned: boolean;
  scanned_at: string | null;
  created_at: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `$${Number(n).toFixed(2)}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    paid: { bg: "rgba(34,197,94,0.12)", color: "#22c55e" },
    refunded: { bg: "rgba(251,191,36,0.12)", color: "#fbbf24" },
    cancelled: { bg: "rgba(239,68,68,0.12)", color: "#ef4444" },
    pending: { bg: "rgba(148,163,184,0.12)", color: "#94a3b8" },
  };
  const c = colors[status] ?? colors.pending;
  return (
    <span style={{
      display: "inline-block", padding: "3px 12px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, textTransform: "uppercase",
      background: c.bg, color: c.color, border: `1px solid ${c.color}44`,
    }}>
      {status}
    </span>
  );
}

// ── Scan badge ────────────────────────────────────────────────────────────────

function ScanBadge({ scanned, scannedAt }: { scanned: boolean; scannedAt: string | null }) {
  if (scanned) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
        background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)",
      }}>
        ✓ Scanned{scannedAt ? ` · ${new Date(scannedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}
      </span>
    );
  }
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700,
      background: "rgba(148,163,184,0.1)", color: "rgba(148,163,184,0.8)", border: "1px solid rgba(148,163,184,0.2)",
    }}>
      Not Scanned
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OrderDetailPage() {
  const { id: eventId, orderId } = useParams() as { id: string; orderId: string };

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit customer state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Resend email state
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`);
      if (!res.ok) throw new Error("Failed to load order");
      const data = await res.json();
      setOrder(data.order);
      setTickets(data.tickets ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  // Populate edit form when order loads
  useEffect(() => {
    if (order) {
      setEditName(order.customer_name ?? "");
      setEditEmail(order.customer_email ?? "");
    }
  }, [order]);

  // ── Save customer info ──────────────────────────────────────────────────────
  async function handleSaveCustomer() {
    if (!editEmail || !editName) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/customer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_name: editName, customer_email: editEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSaveMsg({ type: "success", text: "Customer info updated on order and all tickets." });
      setEditing(false);
      await load(); // refresh to show updated values
    } catch (e) {
      setSaveMsg({ type: "error", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  // ── Resend email ────────────────────────────────────────────────────────────
  async function handleResendEmail() {
    setResending(true);
    setResendMsg(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/resend-email`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Resend failed");
      setResendMsg({
        type: "success",
        text: `Ticket email sent to ${data.sentTo} (${data.ticketCount} ticket${data.ticketCount !== 1 ? "s" : ""})`,
      });
    } catch (e) {
      setResendMsg({ type: "error", text: e instanceof Error ? e.message : "Failed to send email" });
    } finally {
      setResending(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="admin-page-wrapper">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>Loading order…</div>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="admin-page-wrapper">
        <div style={{
          padding: 20, borderRadius: 10,
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
          color: "#ef4444", fontSize: 14,
        }}>
          {error ?? "Order not found."}
        </div>
        <Link href={`/admin/orders/${eventId}`} style={{ display: "inline-block", marginTop: 16, color: "rgba(208,194,144,0.7)", fontSize: 13 }}>
          ← Back to event orders
        </Link>
      </div>
    );
  }

  const scannedCount = tickets.filter((t) => t.is_scanned).length;

  return (
    <div className="admin-page-wrapper">

      {/* ── Header ── */}
      <div className="admin-page-header">
        <div>
          <Link
            href={`/admin/orders/${eventId}`}
            style={{ fontSize: 12, color: "rgba(208,194,144,0.6)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 8 }}
          >
            ← {order.events.title}
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 className="admin-page-title" style={{ margin: 0 }}>
              Order #{shortId(order.id)}
            </h1>
            <StatusBadge status={order.status} />
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
            {fmtDate(order.created_at)}
          </div>
        </div>

        {/* Resend email button in header */}
        <div className="admin-page-header-actions">
          <button
            onClick={handleResendEmail}
            disabled={resending || tickets.length === 0}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "10px 20px", borderRadius: 8, fontWeight: 700, fontSize: 13,
              background: resending ? "rgba(208,194,144,0.1)" : "rgba(208,194,144,0.15)",
              border: "1px solid rgba(208,194,144,0.3)",
              color: tickets.length === 0 ? "rgba(208,194,144,0.35)" : "#d0c290",
              cursor: resending || tickets.length === 0 ? "not-allowed" : "pointer",
              transition: "all 0.15s",
            }}
          >
            {resending ? "Sending…" : "📧 Resend Ticket Email"}
          </button>
        </div>
      </div>

      {/* Resend result banner */}
      {resendMsg && (
        <div style={{
          marginBottom: 16, padding: "12px 16px", borderRadius: 8, fontSize: 13,
          background: resendMsg.type === "success" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${resendMsg.type === "success" ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
          color: resendMsg.type === "success" ? "#22c55e" : "#ef4444",
        }}>
          {resendMsg.type === "success" ? "✓ " : "✕ "}{resendMsg.text}
        </div>
      )}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>

        {/* ── Customer Info Card ── */}
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12, padding: "20px 24px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#d0c290", textTransform: "uppercase", letterSpacing: 1 }}>
              Customer Info
            </h2>
            {!editing && (
              <button
                onClick={() => { setEditing(true); setSaveMsg(null); }}
                style={{
                  padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: "rgba(208,194,144,0.1)", border: "1px solid rgba(208,194,144,0.25)",
                  color: "#d0c290", cursor: "pointer",
                }}
              >
                ✏️ Edit
              </button>
            )}
          </div>

          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                Full Name
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="admin-form-input"
                  placeholder="Customer full name"
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                Email Address
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="admin-form-input"
                  placeholder="customer@email.com"
                />
              </label>
              {saveMsg && (
                <div style={{
                  padding: "8px 12px", borderRadius: 6, fontSize: 12,
                  background: saveMsg.type === "success" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                  border: `1px solid ${saveMsg.type === "success" ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
                  color: saveMsg.type === "success" ? "#22c55e" : "#ef4444",
                }}>
                  {saveMsg.text}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  onClick={handleSaveCustomer}
                  disabled={saving}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 8, fontWeight: 700, fontSize: 13,
                    background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)",
                    color: "#22c55e", cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
                <button
                  onClick={() => { setEditing(false); setSaveMsg(null); setEditName(order.customer_name); setEditEmail(order.customer_email); }}
                  style={{
                    padding: "8px 16px", borderRadius: 8, fontWeight: 600, fontSize: 13,
                    background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.4)", cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Row label="Name" value={order.customer_name || "—"} />
              <Row label="Email" value={order.customer_email || "—"} />
              {order.customer_phone && <Row label="Phone" value={order.customer_phone} />}
            </div>
          )}
        </div>

        {/* ── Order Summary Card ── */}
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12, padding: "20px 24px",
        }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#d0c290", textTransform: "uppercase", letterSpacing: 1 }}>
            Order Summary
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Row label="Event" value={order.events.title} />
            <Row label="Date" value={fmtDate(order.events.date)} />
            <Row label="Venue" value={order.events.venue} />
            <Row label="Tickets" value={`${order.quantity ?? tickets.length} ticket${(order.quantity ?? tickets.length) !== 1 ? "s" : ""}`} />
            <Row label="Total" value={fmt(order.total_amount)} highlight />
            {order.delivery_method && <Row label="Delivery" value={order.delivery_method} />}
            {order.stripe_payment_intent_id && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Payment</span>
                <a
                  href={`https://dashboard.stripe.com/payments/${order.stripe_payment_intent_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: "#818cf8", fontFamily: "monospace" }}
                >
                  {order.stripe_payment_intent_id.slice(0, 20)}… ↗
                </a>
              </div>
            )}
            <Row label="Order ID" value={order.id.slice(0, 8).toUpperCase()} mono />
          </div>
        </div>
      </div>

      {/* ── Tickets Card ── */}
      <div style={{
        marginTop: 16,
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12, padding: "20px 24px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#d0c290", textTransform: "uppercase", letterSpacing: 1 }}>
            Tickets ({tickets.length})
          </h2>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            {scannedCount} of {tickets.length} scanned
          </span>
        </div>

        {tickets.length === 0 ? (
          <div style={{
            padding: "32px 20px", textAlign: "center",
            background: "rgba(239,68,68,0.05)", borderRadius: 10,
            border: "1px solid rgba(239,68,68,0.15)",
          }}>
            <p style={{ color: "rgba(239,68,68,0.8)", fontSize: 14, margin: "0 0 8px" }}>
              No tickets found for this order.
            </p>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, margin: 0 }}>
              If tickets were accidentally deleted, use the Supabase SQL editor to re-insert them, then resend the email from this page.
            </p>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 16,
          }}>
            {tickets.map((ticket, i) => (
              <div
                key={ticket.id}
                style={{
                  background: ticket.is_scanned
                    ? "rgba(34,197,94,0.04)"
                    : "rgba(255,255,255,0.02)",
                  border: `1px solid ${ticket.is_scanned ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.07)"}`,
                  borderRadius: 10,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", alignSelf: "flex-start" }}>
                  Ticket {i + 1} of {tickets.length}
                </div>

                {/* QR Code image */}
                {ticket.qr_data_url ? (
                  <img
                    src={ticket.qr_data_url}
                    alt={`QR code for ticket ${i + 1}`}
                    style={{ width: 140, height: 140, borderRadius: 8, background: "#fff", padding: 4 }}
                  />
                ) : (
                  <div style={{
                    width: 140, height: 140, borderRadius: 8,
                    background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.1)",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                    <span style={{ fontSize: 24 }}>🎟️</span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
                      QR auto-generates<br />on resend
                    </span>
                  </div>
                )}

                <ScanBadge scanned={ticket.is_scanned} scannedAt={ticket.scanned_at} />

                {/* Link to the buyer-facing ticket page */}
                <a
                  href={`https://venuecore.live/tickets/${ticket.qr_code}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 11, color: "rgba(208,194,144,0.6)", textDecoration: "none",
                    fontFamily: "monospace", wordBreak: "break-all", textAlign: "center",
                  }}
                >
                  {ticket.qr_code.slice(0, 8)}… ↗
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Save message (below cards for visibility) ── */}
      {saveMsg && !editing && (
        <div style={{
          marginTop: 12, padding: "12px 16px", borderRadius: 8, fontSize: 13,
          background: saveMsg.type === "success" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${saveMsg.type === "success" ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
          color: saveMsg.type === "success" ? "#22c55e" : "#ef4444",
        }}>
          {saveMsg.type === "success" ? "✓ " : "✕ "}{saveMsg.text}
        </div>
      )}
    </div>
  );
}

// ── Shared row component ──────────────────────────────────────────────────────

function Row({ label, value, highlight, mono }: { label: string; value: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{label}</span>
      <span style={{
        fontSize: 13,
        color: highlight ? "#d0c290" : "#fff",
        fontWeight: highlight ? 700 : 400,
        fontFamily: mono ? "monospace" : undefined,
      }}>
        {value}
      </span>
    </div>
  );
}
