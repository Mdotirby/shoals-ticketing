"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Order = {
  id: string;
  customer_name: string;
  customer_email: string;
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
    Promise.all([
      fetch(`/api/events/${id}`).then((r) => r.json()),
      fetch(`/api/orders?event_id=${id}`).then((r) => r.json()),
      fetch(`/api/events/${id}/views`).then((r) => r.json()),
    ])
      .then(([eventData, ordersData, viewsData]) => {
        if (!eventData.error) setEvent(eventData);
        if (Array.isArray(ordersData)) setOrders(ordersData);
        if (viewsData && !viewsData.error) setViewStats(viewsData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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
        <Link href="/admin/orders" className="admin-sponsor-edit-btn">← Back to Sales</Link>
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
      {viewStats && (
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
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
