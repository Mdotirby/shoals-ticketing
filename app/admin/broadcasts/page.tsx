"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SendTable, { type SendRow } from "./SendTable";

function formatPercent(n: number | null) {
  return n === null ? "—" : `${Math.round(n * 100)}%`;
}

export default function BroadcastsDashboardPage() {
  const [sends, setSends] = useState<SendRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/broadcasts/history?limit=5")
      .then((r) => r.json())
      .then((data) => setSends(data.sends ?? []))
      .finally(() => setLoading(false));
  }, []);

  const thisMonth = sends.filter((s) => {
    const d = new Date(s.sentAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const avgOpenRate = thisMonth.length
    ? thisMonth.reduce((sum, s) => sum + (s.openRate ?? 0), 0) / thisMonth.length
    : null;
  const totalRevenue = thisMonth.reduce((sum, s) => sum + s.revenue, 0);

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Broadcasts</h1>
        <div className="admin-page-header-actions">
          <Link href="/admin/broadcasts/transactional" className="admin-header-btn admin-header-btn-outline">
            Transactional Emails
          </Link>
          <Link href="/admin/broadcasts/audience" className="admin-header-btn admin-header-btn-outline">
            Sync Audience
          </Link>
          <Link href="/admin/broadcasts/new" className="admin-header-btn">
            + New Broadcast
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
        <SummaryTile label="Sends this month" value={String(thisMonth.length)} />
        <SummaryTile label="Avg. open rate" value={formatPercent(avgOpenRate)} />
        <SummaryTile label="Revenue attributed" value={`$${totalRevenue.toFixed(2)}`} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: 0 }}>Recent Sends</h2>
        <Link href="/admin/broadcasts/history" style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.7)", textDecoration: "none" }}>
          View full history →
        </Link>
      </div>

      {loading && <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>}
      {!loading && sends.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>No broadcasts sent yet.</p>
      )}
      {!loading && sends.length > 0 && <SendTable sends={sends} />}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 10, padding: "16px 18px",
    }}>
      <p style={{ margin: "0 0 6px", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.4)" }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#fff" }}>{value}</p>
    </div>
  );
}
