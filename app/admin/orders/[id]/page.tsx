"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PDFPreviewModal from "@/app/components/admin/PDFPreviewModal";

type Order = {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  quantity: number;
  total_amount: number;
  created_at: string;
  source?: string | null;
  promo_code_id?: string | null;
  promo_codes?: {
    code: string;
    discount_type: "fixed" | "percentage";
    discount_value: string | number;
  } | null;
};

type ViewStats = {
  total_views: number;
  unique_views: number;
  purchase_views: number;
  views_without_purchase: number;
  conversion_rate: string;
};

type EventInfo = {
  title: string;
  venue: string;
  date: string;
};

function SourceBadge({ source }: { source: string | null }) {
  const src = (source || "online").toLowerCase();
  const palette: Record<string, { bg: string; color: string; border: string; label: string }> = {
    online:        { bg: "rgba(59,130,246,0.1)",  color: "#60a5fa", border: "rgba(59,130,246,0.3)", label: "Online" },
    box_office:    { bg: "rgba(251,191,36,0.1)",  color: "#fbbf24", border: "rgba(251,191,36,0.3)", label: "Box Office" },
    inline_checkout:{bg: "rgba(59,130,246,0.1)",  color: "#60a5fa", border: "rgba(59,130,246,0.3)", label: "Online" },
    comp:          { bg: "rgba(34,197,94,0.12)",  color: "#22c55e", border: "rgba(34,197,94,0.35)", label: "Comp" },
  };
  const p = palette[src] ?? palette.online;
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 6,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
      background: p.bg, color: p.color, border: `1px solid ${p.border}`,
      whiteSpace: "nowrap",
    }}>
      {p.label}
    </span>
  );
}

export default function EventSalesDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [viewStats, setViewStats] = useState<ViewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  // ── Settlement: existing-or-create ────────────────────────────────────────
  const [settlementId, setSettlementId] = useState<string | null>(null);
  const [settlementStatus, setSettlementStatus] = useState<"draft" | "finalized" | null>(null);
  const [creatingSettlement, setCreatingSettlement] = useState(false);

  const handleSettlementClick = async () => {
    if (settlementId) {
      router.push(`/admin/settlements/${settlementId}`);
      return;
    }
    setCreatingSettlement(true);
    try {
      const res = await fetch("/api/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create settlement");
      router.push(`/admin/settlements/${data.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create settlement";
      alert(msg);
    } finally {
      setCreatingSettlement(false);
    }
  };

  // ── "Issue Comp Tickets" modal state ───────────────────────────────────────
  const [compOpen, setCompOpen] = useState(false);
  const [compName, setCompName] = useState("");
  const [compEmail, setCompEmail] = useState("");
  const [compPhone, setCompPhone] = useState("");
  const [compQty, setCompQty] = useState("1");
  const [compNote, setCompNote] = useState("");
  const [compSaving, setCompSaving] = useState(false);
  const [compError, setCompError] = useState<string | null>(null);
  const [compSuccess, setCompSuccess] = useState<string | null>(null);

  const resetCompForm = () => {
    setCompName(""); setCompEmail(""); setCompPhone(""); setCompQty("1");
    setCompNote(""); setCompError(null); setCompSuccess(null);
  };

  const submitComp = async () => {
    setCompError(null);
    setCompSuccess(null);
    if (!compName.trim()) { setCompError("Name is required."); return; }
    if (!compEmail.trim() || !compEmail.includes("@")) { setCompError("Valid email is required."); return; }
    const qty = Math.max(1, Math.min(50, parseInt(compQty, 10) || 1));
    setCompSaving(true);
    try {
      const res = await fetch("/api/admin/comps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: id,
          buyer_name: compName.trim(),
          buyer_email: compEmail.trim(),
          buyer_phone: compPhone.trim() || undefined,
          quantity: qty,
          note: compNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to issue comp tickets");
      setCompSuccess(`${qty} comp ticket${qty > 1 ? "s" : ""} issued & emailed to ${compEmail.trim()}.`);
      // Refresh the orders list so the new comp shows up immediately
      const refreshed = await fetch(`/api/orders?event_id=${id}`).then((r) => r.json());
      if (Array.isArray(refreshed)) setOrders(refreshed);
      // Clear the form but keep the modal open so the user sees the success msg
      setCompName(""); setCompEmail(""); setCompPhone(""); setCompQty("1"); setCompNote("");
    } catch (err: unknown) {
      setCompError(err instanceof Error ? err.message : "Failed to issue comp tickets");
    } finally {
      setCompSaving(false);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        const [eventData, ordersData] = await Promise.all([
          fetch(`/api/events/${id}`).then((r) => r.json()),
          fetch(`/api/orders?event_id=${id}`).then((r) => r.json()),
        ]);
        if (eventData && !eventData.error) setEvent(eventData);
        if (Array.isArray(ordersData)) setOrders(ordersData);

        // Fetch view stats separately — may fail for events with no views
        try {
          const viewsRes = await fetch(`/api/events/${id}/views`);
          if (viewsRes.ok) {
            const viewsData = await viewsRes.json();
            if (viewsData && !viewsData.error) setViewStats(viewsData);
          }
        } catch {
          // views endpoint failed — leave viewStats as null
        }

        // Check whether a settlement already exists for this event so the
        // header button can read "Open Settlement" vs. "Create Settlement".
        try {
          const setRes = await fetch(`/api/settlements?event_id=${id}`);
          if (setRes.ok) {
            const setData = await setRes.json();
            if (Array.isArray(setData) && setData.length > 0) {
              setSettlementId(setData[0].id);
              setSettlementStatus(setData[0].status ?? "draft");
            }
          }
        } catch {
          // settlements endpoint failed — leave button as "Create Settlement"
        }
      } catch {
        // ignore fetch errors
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  const totalRevenue = orders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
  const totalTickets = orders.reduce((s, o) => s + (Number(o.quantity) || 1), 0);

  if (loading) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Event Sales</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>
      </div>
    );
  }

  const exportOrdersPDF = async () => {
    if (!event) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
    const gold: [number, number, number] = [208, 194, 144];
    const dark: [number, number, number] = [11, 13, 29];
    const W = 215.9;

    doc.setFillColor(...dark);
    doc.rect(0, 0, W, 279, "F");

    // Header
    doc.setFillColor(...gold);
    doc.rect(0, 0, W, 22, "F");
    doc.setTextColor(...dark);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`${event.title} — Orders Report`, 14, 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`${event.venue}  ·  ${((d: string) => (d && d.length === 10 && d[4] === "-") ? new Date(d + "T12:00:00") : new Date(d.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, "")))(event.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, 14, 19);

    // Table header
    let y = 34;
    doc.setTextColor(...gold);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Name", 14, y);
    doc.text("Email", 60, y);
    doc.text("Phone", 120, y);
    doc.text("Qty", 160, y);
    doc.text("Total", 175, y);
    y += 2;
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.3);
    doc.line(14, y, 200, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    orders.forEach((o, i) => {
      if (y > 255) { doc.addPage(); doc.setFillColor(...dark); doc.rect(0, 0, W, 279, "F"); y = 20; }
      doc.setTextColor(255, 255, 255);
      doc.text((o.customer_name || "—").slice(0, 25), 14, y);
      doc.setFontSize(7);
      doc.text((o.customer_email || "—").slice(0, 35), 60, y);
      doc.setFontSize(9);
      doc.text(o.customer_phone || "—", 120, y);
      doc.text(String(o.quantity || 1), 160, y);
      doc.setTextColor(...gold);
      doc.text(`$${(o.total_amount || 0).toFixed(2)}`, 175, y);
      y += 6;
    });

    // Footer totals
    y += 4;
    doc.setDrawColor(...gold);
    doc.line(14, y, 200, y);
    y += 6;
    doc.setTextColor(...gold);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Orders: ${orders.length}`, 14, y);
    doc.text(`Tickets Sold: ${totalTickets}`, 80, y);
    doc.text(`Gross Receipts: $${totalRevenue.toFixed(2)}`, 140, y);

    const dateStr = ((d: string) => (d && d.length === 10 && d[4] === "-") ? new Date(d + "T12:00:00") : new Date(d.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, "")))(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).replace(/,/g, "").replace(/\s+/g, "_");
    doc.save(`${event.title.replace(/[^a-z0-9]/gi, "_")}-${dateStr}-Orders_Report.pdf`);
  };

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">{event?.title || "Event Sales"}</h1>
          {event && (
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, margin: "4px 0 0" }}>
              {event.venue} · {((d: string) => (d && d.length === 10 && d[4] === "-") ? new Date(d + "T12:00:00") : new Date(d.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, "")))(event.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}
        </div>
        <div className="admin-page-header-actions">
          <button
            className="admin-header-btn"
            style={{
              background: settlementId
                ? "rgba(208,194,144,0.12)"
                : "rgba(208,194,144,0.18)",
              borderColor: "rgba(208,194,144,0.45)",
              color: "#d0c290",
              fontWeight: 700,
            }}
            onClick={handleSettlementClick}
            disabled={creatingSettlement}
            title={
              settlementId
                ? settlementStatus === "finalized"
                  ? "View finalized settlement (read-only)"
                  : "Open this event's settlement (draft)"
                : "Create a new settlement for this event using actual order data"
            }
          >
            {creatingSettlement
              ? "Creating…"
              : settlementId
              ? settlementStatus === "finalized"
                ? "View Settlement (Finalized)"
                : "Open Settlement (Draft)"
              : "+ Create Settlement"}
          </button>
          <button
            className="admin-header-btn"
            style={{
              background: "rgba(34,197,94,0.1)",
              borderColor: "rgba(34,197,94,0.35)",
              color: "#4ade80",
            }}
            onClick={() => { resetCompForm(); setCompOpen(true); }}
          >
            + Issue Comp Tickets
          </button>
          {orders.length > 0 && (
            <button className="admin-header-btn" onClick={() => setShowPreview(true)}>
              Print Orders Report
            </button>
          )}
          <Link href="/admin/orders" className="admin-sponsor-edit-btn">← Back to Sales</Link>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="dash-kpi-grid">
        <div className="dash-kpi-card">
          <span className="dash-kpi-label">Total Orders</span>
          <span className="dash-kpi-value">{orders.length}</span>
        </div>
        <div className="dash-kpi-card">
          <span className="dash-kpi-label">Tickets Sold</span>
          <span className="dash-kpi-value">{totalTickets}</span>
        </div>
        <div className="dash-kpi-card">
          <span className="dash-kpi-label">Total Revenue</span>
          <span className="dash-kpi-value">${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="dash-kpi-card">
          <span className="dash-kpi-label">Avg. Order Value</span>
          <span className="dash-kpi-value">
            ${orders.length > 0 ? (totalRevenue / orders.length).toFixed(2) : "0.00"}
          </span>
        </div>
      </div>

      {/* ── Marketing Data ── */}
      {viewStats && typeof viewStats === "object" && typeof viewStats.total_views === "number" && (
        <div className="portal-card" style={{ marginTop: 20 }}>
          <h2 className="portal-card-title">Marketing Analytics</h2>
          <div className="dash-kpi-grid">
            <div className="dash-kpi-card">
              <span className="dash-kpi-label">Total Page Views</span>
              <span className="dash-kpi-value">{viewStats.total_views}</span>
            </div>
            <div className="dash-kpi-card">
              <span className="dash-kpi-label">Unique Visitors</span>
              <span className="dash-kpi-value">{viewStats.unique_views}</span>
            </div>
            <div className="dash-kpi-card">
              <span className="dash-kpi-label">Views → Purchase</span>
              <span className="dash-kpi-value">{viewStats.purchase_views}</span>
            </div>
            <div className="dash-kpi-card">
              <span className="dash-kpi-label">Views w/o Purchase</span>
              <span className="dash-kpi-value">{viewStats.views_without_purchase}</span>
            </div>
            <div className="dash-kpi-card">
              <span className="dash-kpi-label">Conversion Rate</span>
              <span className="dash-kpi-value">{viewStats.conversion_rate}%</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Orders Table ── */}
      <div style={{ marginTop: 20 }}>
        <h2 className="portal-card-title">Orders ({orders.length})</h2>
        {orders.length === 0 ? (
          <p style={{ color: "rgba(255,255,255,0.4)" }}>No orders yet for this event.</p>
        ) : (
          <div className="report-table-wrapper">
            <table className="dash-table report-table">
              <thead>
                <tr>
                  <th>Buyer</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Qty</th>
                  <th>Total</th>
                  <th>Promo</th>
                  <th>Source</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.customer_name || "—"}</td>
                    <td>{o.customer_email || "—"}</td>
                    <td>{o.customer_phone || "—"}</td>
                    <td>{o.quantity || 1}</td>
                    <td>${(o.total_amount || 0).toFixed(2)}</td>
                    <td>
                      {o.promo_codes?.code ? (
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 6,
                          fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
                          background: "rgba(168,85,247,0.12)",
                          border: "1px solid rgba(168,85,247,0.3)",
                          color: "#c084fc",
                        }}>
                          {o.promo_codes.code}
                          {o.promo_codes.discount_type === "percentage"
                            ? ` (${Number(o.promo_codes.discount_value)}%)`
                            : ` ($${Number(o.promo_codes.discount_value).toFixed(2)})`}
                        </span>
                      ) : (
                        <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>
                      )}
                    </td>
                    <td><SourceBadge source={o.source ?? null} /></td>
                    <td>
                      {new Date(o.created_at).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                        hour: "numeric", minute: "2-digit",
                      })}
                    </td>
                    <td>
                      <Link
                        href={`/admin/orders/${id}/${o.id}`}
                        style={{
                          display: "inline-block",
                          padding: "4px 12px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          background: "rgba(208,194,144,0.08)",
                          border: "1px solid rgba(208,194,144,0.2)",
                          color: "#d0c290",
                          textDecoration: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid rgba(208,194,144,0.2)" }}>
                  <td colSpan={3} style={{ fontWeight: 700, color: "#d0c290" }}>Gross Receipts</td>
                  <td style={{ fontWeight: 700, color: "#d0c290" }}>{totalTickets}</td>
                  <td style={{ fontWeight: 700, color: "#d0c290" }}>${totalRevenue.toFixed(2)}</td>
                  <td /><td /><td /><td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* PDF Preview Modal */}
      {showPreview && (
        <PDFPreviewModal
          title={`${event?.title || "Event"} — Orders Report`}
          rows={orders.map((o) => ({
            name: `${o.customer_name || "—"} · ${o.customer_email || "—"}`,
            quantity: o.quantity || 1,
          }))}
          onDownload={exportOrdersPDF}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* ── Issue Comp Tickets Modal ─────────────────────────────────────── */}
      {compOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !compSaving && setCompOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 480,
              background: "#131629",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 14,
              padding: 24,
            }}
          >
            <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: "#fff" }}>
              Issue Comp Tickets
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
              Generates a $0 order with QR tickets and emails them to the recipient —
              same flow as any paid checkout. Tracked as <strong style={{ color: "#4ade80" }}>source = comp</strong>.
            </p>

            {compError && (
              <div className="admin-form-error" style={{ marginBottom: 14 }}>{compError}</div>
            )}
            {compSuccess && (
              <div className="admin-form-success" style={{ marginBottom: 14 }}>{compSuccess}</div>
            )}

            <div style={{ display: "grid", gap: 12 }}>
              <label className="admin-form-label">
                Full Name
                <input
                  type="text"
                  className="admin-form-input"
                  value={compName}
                  onChange={(e) => setCompName(e.target.value)}
                  placeholder="Jane Doe"
                  disabled={compSaving}
                />
              </label>
              <label className="admin-form-label">
                Email
                <input
                  type="email"
                  className="admin-form-input"
                  value={compEmail}
                  onChange={(e) => setCompEmail(e.target.value)}
                  placeholder="jane@example.com"
                  disabled={compSaving}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <label className="admin-form-label">
                  Phone <span style={{ opacity: 0.5, fontSize: 11 }}>(optional)</span>
                  <input
                    type="tel"
                    className="admin-form-input"
                    value={compPhone}
                    onChange={(e) => setCompPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    disabled={compSaving}
                  />
                </label>
                <label className="admin-form-label">
                  Quantity
                  <input
                    type="number"
                    min="1"
                    max="50"
                    className="admin-form-input"
                    value={compQty}
                    onChange={(e) => setCompQty(e.target.value)}
                    disabled={compSaving}
                  />
                </label>
              </div>
              <label className="admin-form-label">
                Internal Note <span style={{ opacity: 0.5, fontSize: 11 }}>(optional)</span>
                <input
                  type="text"
                  className="admin-form-input"
                  value={compNote}
                  onChange={(e) => setCompNote(e.target.value)}
                  placeholder="e.g. Instagram giveaway winner"
                  disabled={compSaving}
                />
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
              <button
                type="button"
                className="admin-sponsor-edit-btn"
                onClick={() => setCompOpen(false)}
                disabled={compSaving}
              >
                Close
              </button>
              <button
                type="button"
                className="admin-form-submit"
                style={{
                  background: "rgba(34,197,94,0.15)",
                  borderColor: "rgba(34,197,94,0.4)",
                  color: "#4ade80",
                  opacity: compSaving ? 0.6 : 1,
                }}
                onClick={submitComp}
                disabled={compSaving}
              >
                {compSaving ? "Issuing…" : "Issue & Email Tickets"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
