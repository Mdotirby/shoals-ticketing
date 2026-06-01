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
  source?: string | null;
  notes?: string | null;
  promo_code_id?: string | null;
  promo_codes?: {
    code: string;
    discount_type: "fixed" | "percentage";
    discount_value: string | number;
  } | null;
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

// ── Source badge (online / box_office / comp) ────────────────────────────────

function SourceBadge({ source }: { source: string | null }) {
  const src = (source || "online").toLowerCase();
  const palette: Record<string, { bg: string; color: string; border: string; label: string }> = {
    online:          { bg: "rgba(59,130,246,0.1)",  color: "#60a5fa", border: "rgba(59,130,246,0.3)", label: "Online" },
    box_office:      { bg: "rgba(251,191,36,0.1)",  color: "#fbbf24", border: "rgba(251,191,36,0.3)", label: "Box Office" },
    inline_checkout: { bg: "rgba(59,130,246,0.1)",  color: "#60a5fa", border: "rgba(59,130,246,0.3)", label: "Online" },
    comp:            { bg: "rgba(34,197,94,0.12)",  color: "#22c55e", border: "rgba(34,197,94,0.35)", label: "Comp" },
  };
  const p = palette[src] ?? palette.online;
  return (
    <span style={{
      display: "inline-block", padding: "3px 12px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, textTransform: "uppercase",
      background: p.bg, color: p.color, border: `1px solid ${p.border}`,
    }}>
      {p.label}
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
        Scanned{scannedAt ? ` · ${new Date(scannedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}
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

  // Repair seats state
  const [repairing, setRepairing] = useState(false);
  const [repairMsg, setRepairMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Reinstate as comp state
  const [reinstating, setReinstating] = useState(false);
  const [reinstateMsg, setReinstateMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Payment request state
  const [showPaymentRequest, setShowPaymentRequest] = useState(false);
  const [paymentNote, setPaymentNote] = useState("");
  const [sendingPaymentRequest, setSendingPaymentRequest] = useState(false);
  const [paymentRequestMsg, setPaymentRequestMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [paymentTiers, setPaymentTiers] = useState<{ id: string; tier_name: string; price: number }[]>([]);
  const [selectedTierId, setSelectedTierId] = useState("");
  const [paymentQty, setPaymentQty] = useState("1");
  const [feePreview, setFeePreview] = useState<{
    tier: { tier_name: string; price: number };
    breakdown: { ticketPriceCents: number; ticketingFeeCents: number; facilityFeeCents: number; taxCents: number; stripeFeeCents: number; totalCents: number; effectiveQuantity: number };
    fees: { taxRate: number; ticketingFee: number; facilityFee: number };
  } | null>(null);
  const [loadingFees, setLoadingFees] = useState(false);

  // Manual seat assignment state
  const [showManual, setShowManual] = useState(false);
  const [manualSection, setManualSection] = useState("");
  const [manualRow, setManualRow] = useState("");
  const [manualFrom, setManualFrom] = useState("");
  const [manualTo, setManualTo] = useState("");
  const [lookupResult, setLookupResult] = useState<{ section: { name: string }; seats: { id: string; seat_number: number; row_label: string; status: string; order_id: string | null }[] } | null>(null);
  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(new Set());
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [availableSections, setAvailableSections] = useState<string[]>([]);
  const [looking, setLooking] = useState(false);
  const [confirming, setConfirming] = useState(false);

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

  // ── Send payment request to customer ───────────────────────────────────────
  async function openPaymentRequest() {
    setShowPaymentRequest(true);
    setPaymentRequestMsg(null);
    setFeePreview(null);
    setSelectedTierId("");
    // Load tiers for this order's event
    const res = await fetch(`/api/admin/orders/${orderId}/fee-preview`);
    const data = await res.json();
    if (data.tiers) setPaymentTiers(data.tiers);
  }

  async function handleTierChange(tierId: string, qty: string) {
    setSelectedTierId(tierId);
    setPaymentQty(qty);
    if (!tierId) { setFeePreview(null); return; }
    setLoadingFees(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/fee-preview?tier_id=${tierId}&quantity=${qty || 1}`);
      const data = await res.json();
      if (data.breakdown) setFeePreview(data);
    } finally {
      setLoadingFees(false);
    }
  }

  async function handleSendPaymentRequest() {
    if (!feePreview) { setPaymentRequestMsg({ type: "error", text: "Select a ticket tier first." }); return; }
    const cents = feePreview.breakdown.totalCents;
    if (!cents || cents < 50) { setPaymentRequestMsg({ type: "error", text: "Invalid amount." }); return; }
    setSendingPaymentRequest(true);
    setPaymentRequestMsg(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/payment-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_cents: cents, note: paymentNote || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send payment request");
      const total = (cents / 100).toFixed(2);
      setPaymentRequestMsg({ type: "success", text: `Payment request for $${total} sent to ${data.sentTo}. Order will update to Paid automatically when they complete payment.` });
      setShowPaymentRequest(false);
      setFeePreview(null);
      setSelectedTierId("");
      setPaymentNote("");
    } catch (e) {
      setPaymentRequestMsg({ type: "error", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setSendingPaymentRequest(false);
    }
  }

  // ── Reinstate refunded order as comp ───────────────────────────────────────
  async function handleReinstateComp() {
    if (!confirm("Reinstate this order as a comp?\n\nThis will:\n• Set status → Paid (Comp)\n• Set total → $0\n• Keep all tickets and seat assignments valid\n• Add an internal note\n\nThe customer's QR codes already work — this just cleans up the record.")) return;
    setReinstating(true);
    setReinstateMsg(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reinstate_comp" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reinstate");
      setReinstateMsg({ type: "success", text: "Order reinstated as comp. Tickets are valid — use Resend Ticket Email to confirm with the customer." });
      await load();
    } catch (e) {
      setReinstateMsg({ type: "error", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setReinstating(false);
    }
  }

  // ── Repair seat assignments ─────────────────────────────────────────────────
  async function handleRepairSeats() {
    setRepairing(true);
    setRepairMsg(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/repair-seats`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        // If Stripe has no seat_ids, fall back to manual assignment
        if (data.error?.includes("No seat_ids") || data.error?.includes("no seat_ids") || data.error?.includes("manual")) {
          setShowManual(true);
          setRepairMsg({ type: "error", text: "Stripe has no seat record for this order. Use Manual Seat Assignment below." });
        } else {
          throw new Error(data.error ?? "Repair failed");
        }
        return;
      }
      setRepairMsg({
        type: "success",
        text: `Fixed — ${data.repairedSeats} seat${data.repairedSeats !== 1 ? "s" : ""} marked sold and linked to this order.`,
      });
      await load();
    } catch (e) {
      setRepairMsg({ type: "error", text: e instanceof Error ? e.message : "Repair failed" });
    } finally {
      setRepairing(false);
    }
  }

  // ── Manual seat lookup ──────────────────────────────────────────────────────
  async function handleLookupSeats() {
    setLooking(true);
    setLookupError(null);
    setLookupResult(null);
    setSelectedSeatIds(new Set());
    setAvailableSections([]);
    try {
      const params = new URLSearchParams({ section: manualSection, from: manualFrom, to: manualTo });
      const res = await fetch(`/api/admin/orders/${orderId}/lookup-seats?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setLookupError(data.error ?? "Lookup failed");
        if (data.availableSections) setAvailableSections(data.availableSections);
      } else {
        setLookupResult(data);
        // Auto-select all available seats (not already sold to someone else)
        const autoSelect = new Set<string>(
          data.seats
            .filter((s: { status: string; order_id: string | null }) => s.status !== "sold" || s.order_id === orderId)
            .map((s: { id: string }) => s.id)
        );
        setSelectedSeatIds(autoSelect);
      }
    } catch {
      setLookupError("Lookup failed");
    } finally {
      setLooking(false);
    }
  }

  function toggleSeat(id: string) {
    setSelectedSeatIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleManualAssign() {
    if (selectedSeatIds.size === 0) return;
    const seatIds = [...selectedSeatIds];
    setConfirming(true);
    setRepairMsg(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/repair-seats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualSeatIds: seatIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Assignment failed");
      setRepairMsg({ type: "success", text: `Fixed — ${data.repairedSeats} seat(s) assigned to this order.` });
      setShowManual(false);
      setLookupResult(null);
      setSelectedSeatIds(new Set());
      await load();
    } catch (e) {
      setRepairMsg({ type: "error", text: e instanceof Error ? e.message : "Assignment failed" });
    } finally {
      setConfirming(false);
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
            <SourceBadge source={order.source ?? null} />
            {order.promo_codes?.code && (
              <span style={{
                display: "inline-block", padding: "3px 12px", borderRadius: 20,
                fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
                background: "rgba(168,85,247,0.12)",
                border: "1px solid rgba(168,85,247,0.35)",
                color: "#c084fc",
              }}>
                PROMO: {order.promo_codes.code}
                {order.promo_codes.discount_type === "percentage"
                  ? ` (${Number(order.promo_codes.discount_value)}% off)`
                  : ` ($${Number(order.promo_codes.discount_value).toFixed(2)} off)`}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
            {fmtDate(order.created_at)}
          </div>
          {order.notes && (
            <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.5)", fontStyle: "italic" }}>
              Note: {order.notes}
            </div>
          )}
        </div>

        {/* Resend email button in header */}
        <div className="admin-page-header-actions">
          {order.status === "refunded" && (
            <>
              <button
                onClick={openPaymentRequest}
                title="Send customer a Stripe payment link for the correct amount. Their seats and tickets remain valid."
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "10px 20px", borderRadius: 8, fontWeight: 700, fontSize: 13,
                  background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.35)",
                  color: "#60a5fa", cursor: "pointer",
                }}
              >
                Request Correct Payment
              </button>
              <button
                onClick={handleReinstateComp}
                disabled={reinstating}
                title="Mark as comp — no charge. Use this if you're waiving the corrected amount."
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "10px 20px", borderRadius: 8, fontWeight: 700, fontSize: 13,
                  background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.35)",
                  color: "#22c55e", cursor: reinstating ? "not-allowed" : "pointer",
                }}
              >
                {reinstating ? "Reinstating…" : "Reinstate as Comp"}
              </button>
            </>
          )}
          <button
            onClick={handleRepairSeats}
            disabled={repairing}
            title="Looks up seat IDs from the Stripe session and marks them sold. Use when seats still show available after a completed purchase."
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "10px 20px", borderRadius: 8, fontWeight: 700, fontSize: 13,
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#f87171",
              cursor: repairing ? "not-allowed" : "pointer",
              transition: "all 0.15s",
            }}
          >
            {repairing ? "Repairing…" : "Repair Seat Assignments"}
          </button>
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
            {resending ? "Sending…" : "Resend Ticket Email"}
          </button>
        </div>
      </div>

      {/* Reinstate as comp result banner */}
      {reinstateMsg && (
        <div style={{
          marginBottom: 16, padding: "12px 16px", borderRadius: 8, fontSize: 13,
          background: reinstateMsg.type === "success" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${reinstateMsg.type === "success" ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
          color: reinstateMsg.type === "success" ? "#22c55e" : "#ef4444",
        }}>
          {reinstateMsg.text}
        </div>
      )}

      {/* Payment request result banner */}
      {paymentRequestMsg && (
        <div style={{
          marginBottom: 16, padding: "12px 16px", borderRadius: 8, fontSize: 13,
          background: paymentRequestMsg.type === "success" ? "rgba(59,130,246,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${paymentRequestMsg.type === "success" ? "rgba(59,130,246,0.25)" : "rgba(239,68,68,0.25)"}`,
          color: paymentRequestMsg.type === "success" ? "#60a5fa" : "#ef4444",
        }}>
          {paymentRequestMsg.text}
        </div>
      )}

      {/* Payment request form */}
      {showPaymentRequest && (
        <div style={{
          marginBottom: 16, padding: 20, borderRadius: 10,
          background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)",
        }}>
          <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#60a5fa", fontSize: 14 }}>Request Correct Payment</p>
          <p style={{ margin: "0 0 16px", fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
            Sends the customer a Stripe payment link. Their tickets and seats stay valid. Order updates to Paid automatically when they complete payment.
          </p>

          {/* Tier + quantity selectors */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "rgba(255,255,255,0.5)", flex: 2, minWidth: 180 }}>
              Ticket tier
              <select
                className="admin-form-input"
                value={selectedTierId}
                onChange={(e) => handleTierChange(e.target.value, paymentQty)}
              >
                <option value="">— Select a tier —</option>
                {paymentTiers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.tier_name} — ${t.price.toFixed(2)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "rgba(255,255,255,0.5)", flex: "0 0 90px" }}>
              Quantity
              <input
                type="number"
                min="1"
                max="50"
                className="admin-form-input"
                value={paymentQty}
                onChange={(e) => handleTierChange(selectedTierId, e.target.value)}
              />
            </label>
          </div>

          {/* Order summary */}
          {loadingFees && <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "0 0 12px" }}>Calculating…</p>}
          {feePreview && !loadingFees && (
            <div style={{
              background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10, padding: "14px 16px", marginBottom: 16,
            }}>
              <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>Order Summary</p>
              {(() => {
                const b = feePreview.breakdown;
                const f = feePreview.fees;
                const qty = b.effectiveQuantity;
                const rows: [string, number][] = [
                  [`${feePreview.tier.tier_name} × ${qty}`, b.ticketPriceCents * qty],
                  ...(b.ticketingFeeCents > 0 ? [[`Ticketing fee × ${qty}`, b.ticketingFeeCents * qty] as [string, number]] : []),
                  ...(b.facilityFeeCents > 0 ? [[`Facility fee × ${qty}`, b.facilityFeeCents * qty] as [string, number]] : []),
                  ...(b.taxCents > 0 ? [[`Sales tax (${(f.taxRate * 100).toFixed(1)}%) × ${qty}`, b.taxCents * qty] as [string, number]] : []),
                  [`Processing fee`, b.stripeFeeCents],
                ];
                return (
                  <>
                    {rows.map(([label, cents]) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 5 }}>
                        <span>{label}</span>
                        <span>${(cents / 100).toFixed(2)}</span>
                      </div>
                    ))}
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15, color: "#d0c290" }}>
                      <span>Total</span>
                      <span>${(b.totalCents / 100).toFixed(2)}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Optional message */}
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 14 }}>
            Message to customer <span style={{ opacity: 0.5 }}>(optional — default message explains the billing correction)</span>
            <input
              className="admin-form-input"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              placeholder="We had a billing error and refunded your payment. Please pay the correct amount below."
            />
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSendPaymentRequest}
              disabled={sendingPaymentRequest || !feePreview}
              style={{
                padding: "9px 22px", borderRadius: 8, fontWeight: 700, fontSize: 13,
                background: !feePreview ? "rgba(59,130,246,0.06)" : "rgba(59,130,246,0.15)",
                border: "1px solid rgba(59,130,246,0.4)",
                color: !feePreview ? "rgba(96,165,250,0.4)" : "#60a5fa",
                cursor: sendingPaymentRequest || !feePreview ? "not-allowed" : "pointer",
              }}
            >
              {sendingPaymentRequest
                ? "Sending…"
                : feePreview
                  ? `Send $${(feePreview.breakdown.totalCents / 100).toFixed(2)} Payment Request`
                  : "Send Payment Request"}
            </button>
            <button
              onClick={() => { setShowPaymentRequest(false); setFeePreview(null); setSelectedTierId(""); setPaymentNote(""); }}
              style={{ padding: "9px 14px", borderRadius: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Repair seats result banner */}
      {repairMsg && (
        <div style={{
          marginBottom: 16, padding: "12px 16px", borderRadius: 8, fontSize: 13,
          background: repairMsg.type === "success" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${repairMsg.type === "success" ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
          color: repairMsg.type === "success" ? "#22c55e" : "#ef4444",
        }}>
          {repairMsg.text}
        </div>
      )}

      {/* Manual seat assignment panel */}
      {showManual && (
        <div style={{
          marginBottom: 16, padding: 20, borderRadius: 10,
          background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)",
        }}>
          <p style={{ margin: "0 0 12px", fontWeight: 700, color: "#fbbf24", fontSize: 14 }}>
            Manual Seat Assignment
          </p>

          {/* Search filters */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "rgba(255,255,255,0.5)", flex: 2, minWidth: 140 }}>
              Section name
              <input className="admin-form-input" value={manualSection} onChange={(e) => setManualSection(e.target.value)} placeholder="e.g. Section 1" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "rgba(255,255,255,0.5)", flex: 1, minWidth: 80 }}>
              Row <span style={{ opacity: 0.5 }}>(optional)</span>
              <input className="admin-form-input" value={manualRow} onChange={(e) => setManualRow(e.target.value)} placeholder="A" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "rgba(255,255,255,0.5)", flex: 1, minWidth: 70 }}>
              Seat from
              <input type="number" className="admin-form-input" value={manualFrom} onChange={(e) => setManualFrom(e.target.value)} placeholder="7" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "rgba(255,255,255,0.5)", flex: 1, minWidth: 70 }}>
              Seat to
              <input type="number" className="admin-form-input" value={manualTo} onChange={(e) => setManualTo(e.target.value)} placeholder="14" />
            </label>
            <button
              onClick={handleLookupSeats}
              disabled={looking || !manualSection || !manualFrom || !manualTo}
              style={{
                alignSelf: "flex-end", padding: "8px 16px", borderRadius: 8,
                background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)",
                color: "#fbbf24", fontWeight: 700, fontSize: 13,
                cursor: looking ? "wait" : "pointer", whiteSpace: "nowrap",
              }}
            >
              {looking ? "Looking up…" : "Look Up Seats"}
            </button>
          </div>

          {lookupError && (
            <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>
              {lookupError}
              {availableSections.length > 0 && (
                <div style={{ marginTop: 4, color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
                  Available sections: {availableSections.join(", ")}
                </div>
              )}
            </div>
          )}

          {lookupResult && (() => {
            // Filter by row if specified
            const filtered = manualRow.trim()
              ? lookupResult.seats.filter((s) => s.row_label?.toLowerCase() === manualRow.trim().toLowerCase())
              : lookupResult.seats;
            const rows = [...new Set(lookupResult.seats.map((s) => s.row_label).filter(Boolean))].sort();

            return (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: 0 }}>
                    Showing <strong style={{ color: "#fff" }}>{filtered.length}</strong> seats
                    {rows.length > 1 && !manualRow && (
                      <span style={{ color: "rgba(255,255,255,0.35)", marginLeft: 8, fontSize: 12 }}>
                        ({rows.length} rows: {rows.join(", ")} — type a row letter above to filter)
                      </span>
                    )}
                    {" · "}<span style={{ color: "#fbbf24" }}>{selectedSeatIds.size} selected</span>
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setSelectedSeatIds(new Set(filtered.filter(s => s.status !== "sold" || s.order_id === orderId).map(s => s.id)))}
                      style={{ fontSize: 11, background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, color: "rgba(255,255,255,0.45)", cursor: "pointer", padding: "2px 8px" }}>
                      Select all
                    </button>
                    <button onClick={() => setSelectedSeatIds(new Set())}
                      style={{ fontSize: 11, background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, color: "rgba(255,255,255,0.45)", cursor: "pointer", padding: "2px 8px" }}>
                      Deselect all
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14, maxHeight: 220, overflowY: "auto" }}>
                  {filtered.map((s) => {
                    const isMine = s.order_id === orderId;
                    const isSoldElsewhere = s.status === "sold" && !isMine;
                    const isSelected = selectedSeatIds.has(s.id);
                    return (
                      <button
                        key={s.id}
                        disabled={isSoldElsewhere}
                        onClick={() => !isSoldElsewhere && toggleSeat(s.id)}
                        style={{
                          padding: "4px 10px", borderRadius: 6, fontSize: 12, cursor: isSoldElsewhere ? "not-allowed" : "pointer",
                          background: isSoldElsewhere ? "rgba(239,68,68,0.08)" : isSelected ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.05)",
                          border: `2px solid ${isSoldElsewhere ? "rgba(239,68,68,0.25)" : isSelected ? "rgba(34,197,94,0.6)" : "rgba(255,255,255,0.1)"}`,
                          color: isSoldElsewhere ? "#f87171" : isSelected ? "#22c55e" : "rgba(255,255,255,0.55)",
                          fontWeight: isSelected ? 700 : 400,
                          transition: "all 0.1s",
                        }}
                      >
                        {s.row_label ? `${s.row_label} · ` : ""}Seat {s.seat_number}
                        {isSoldElsewhere ? " — sold" : isMine ? " — this order" : ""}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleManualAssign}
                    disabled={confirming || selectedSeatIds.size === 0}
                    style={{
                      padding: "9px 22px", borderRadius: 8,
                      background: selectedSeatIds.size === 0 ? "rgba(34,197,94,0.06)" : "rgba(34,197,94,0.15)",
                      border: "1px solid rgba(34,197,94,0.4)",
                      color: selectedSeatIds.size === 0 ? "rgba(34,197,94,0.35)" : "#22c55e",
                      fontWeight: 700, fontSize: 13,
                      cursor: confirming || selectedSeatIds.size === 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    {confirming ? "Assigning…" : `Assign ${selectedSeatIds.size} Selected Seat${selectedSeatIds.size !== 1 ? "s" : ""} to This Order`}
                  </button>
                  <button
                    onClick={() => { setLookupResult(null); setLookupError(null); setSelectedSeatIds(new Set()); }}
                    style={{ padding: "9px 14px", borderRadius: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            );
          })()}

          <button
            onClick={() => { setShowManual(false); setLookupResult(null); setLookupError(null); setSelectedSeatIds(new Set()); }}
            style={{ marginTop: 12, background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 12, cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Resend result banner */}
      {resendMsg && (
        <div style={{
          marginBottom: 16, padding: "12px 16px", borderRadius: 8, fontSize: 13,
          background: resendMsg.type === "success" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${resendMsg.type === "success" ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
          color: resendMsg.type === "success" ? "#22c55e" : "#ef4444",
        }}>
          {resendMsg.text}
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
                Edit
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
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
                      QR auto-generates<br />on resend
                    </span>
                  </div>
                )}

                <ScanBadge scanned={ticket.is_scanned} scannedAt={ticket.scanned_at} />

                {/* Link to the buyer-facing ticket page */}
                <a
                  href={`${typeof window !== "undefined" ? window.location.origin : ""}/tickets/${ticket.qr_code}`}
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
          {saveMsg.text}
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
