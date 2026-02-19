"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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

export default function EventSalesDetailPage() {
  const { id } = useParams() as { id: string };
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [viewStats, setViewStats] = useState<ViewStats | null>(null);
  const [loading, setLoading] = useState(true);

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
      } catch {
        // ignore fetch errors
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  const totalRevenue = orders.reduce((s, o) => s + (o.total_amount || 0), 0);
  const totalTickets = orders.reduce((s, o) => s + (o.quantity || 1), 0);

  if (loading) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Event Sales</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>
      </div>
    );
  }

  const [showPreview, setShowPreview] = useState(false);

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
    doc.text(`${event.venue}  ·  ${new Date(event.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, 14, 19);

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

    const dateStr = new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).replace(/,/g, "").replace(/\s+/g, "_");
    doc.save(`${event.title.replace(/[^a-z0-9]/gi, "_")}-${dateStr}-Orders_Report.pdf`);
  };

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">{event?.title || "Event Sales"}</h1>
          {event && (
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, margin: "4px 0 0" }}>
              {event.venue} · {new Date(event.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {orders.length > 0 && (
            <button className="admin-header-btn" onClick={() => setShowPreview(true)}>
              🖨 Print Orders Report
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
                  <th>Date</th>
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
                      {new Date(o.created_at).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                        hour: "numeric", minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid rgba(208,194,144,0.2)" }}>
                  <td colSpan={3} style={{ fontWeight: 700, color: "#d0c290" }}>Gross Receipts</td>
                  <td style={{ fontWeight: 700, color: "#d0c290" }}>{totalTickets}</td>
                  <td style={{ fontWeight: 700, color: "#d0c290" }}>${totalRevenue.toFixed(2)}</td>
                  <td />
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
    </div>
  );
}
