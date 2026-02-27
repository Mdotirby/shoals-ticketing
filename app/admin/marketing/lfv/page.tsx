"use client";

import { useEffect, useState } from "react";
import { getCookie } from "@/lib/cookies";
import Link from "next/link";

type Customer = {
  email: string;
  name: string;
  total_spend: number;
  order_count: number;
  events_attended: number;
  first_order: string;
  last_order: string;
  segment: string;
};

type LFVData = {
  customers: Customer[];
  totalCustomers: number;
  avgLFV: number;
  segments: { one_timer: number; repeat: number; loyalist: number; whale: number };
};

const segmentColors: Record<string, { bg: string; text: string; label: string }> = {
  whale: { bg: "rgba(208,194,144,0.15)", text: "#d0c290", label: "Whale" },
  loyalist: { bg: "rgba(80,200,120,0.1)", text: "rgba(80,200,120,0.8)", label: "Loyalist" },
  repeat: { bg: "rgba(100,149,237,0.1)", text: "rgba(100,149,237,0.8)", label: "Repeat" },
  one_timer: { bg: "rgba(255,255,255,0.05)", text: "rgba(255,255,255,0.4)", label: "One-Timer" },
};

export default function LFVPage() {
  const [data, setData] = useState<LFVData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const role = getCookie("user-role");
  if (role !== "owner") {
    return <div className="admin-form-page"><h1 className="admin-page-title">Access Denied</h1></div>;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    fetch("/api/marketing/lfv")
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  const filtered = data?.customers.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.email.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.segment.includes(q);
  }) ?? [];

  return (
    <div className="admin-form-page">
      <Link href="/admin/marketing" style={{ color: "rgba(208,194,144,0.7)", textDecoration: "none", fontSize: 13 }}>← Marketing Hub</Link>
      <h1 className="admin-page-title" style={{ marginTop: 8 }}>Lifetime Fan Value</h1>

      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading fan data...</p>
      ) : !data ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>No data available.</p>
      ) : (
        <>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
            <StatCard label="Total Fans" value={data.totalCustomers.toString()} />
            <StatCard label="Average LFV" value={`$${data.avgLFV.toFixed(2)}`} />
            <StatCard label="Whales" value={data.segments.whale.toString()} sub="4+ events" />
            <StatCard label="Loyalists" value={data.segments.loyalist.toString()} sub="2-3 events" />
            <StatCard label="Repeat" value={data.segments.repeat.toString()} sub="2+ orders" />
            <StatCard label="One-Timers" value={data.segments.one_timer.toString()} />
          </div>

          {/* Segment bar */}
          {data.totalCustomers > 0 && (
            <div style={{ display: "flex", height: 28, borderRadius: 8, overflow: "hidden", marginBottom: 24 }}>
              {(["whale", "loyalist", "repeat", "one_timer"] as const).map((seg) => {
                const pct = (data.segments[seg] / data.totalCustomers) * 100;
                if (pct === 0) return null;
                return (
                  <div key={seg} title={`${segmentColors[seg].label}: ${data.segments[seg]} (${pct.toFixed(1)}%)`} style={{
                    width: `${pct}%`,
                    background: segmentColors[seg].bg,
                    borderRight: "1px solid rgba(0,0,0,0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 600,
                    color: segmentColors[seg].text,
                  }}>
                    {pct > 8 ? segmentColors[seg].label : ""}
                  </div>
                );
              })}
            </div>
          )}

          {/* Search */}
          <input
            type="text"
            className="admin-form-input"
            placeholder="Search by name, email, or segment..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 400, marginBottom: 16 }}
          />

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Total Spend</th>
                  <th style={thStyle}>Orders</th>
                  <th style={thStyle}>Events</th>
                  <th style={thStyle}>Segment</th>
                  <th style={thStyle}>Last Order</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((c, i) => {
                  const seg = segmentColors[c.segment] || segmentColors.one_timer;
                  return (
                    <tr key={c.email} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <td style={tdStyle}>{i + 1}</td>
                      <td style={tdStyle}>{c.name || "—"}</td>
                      <td style={tdStyle}>{c.email}</td>
                      <td style={{ ...tdStyle, fontWeight: 600, color: "#d0c290" }}>${c.total_spend.toFixed(2)}</td>
                      <td style={tdStyle}>{c.order_count}</td>
                      <td style={tdStyle}>{c.events_attended}</td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: seg.bg, color: seg.text }}>{seg.label}</span>
                      </td>
                      <td style={tdStyle}>{new Date(c.last_order).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length > 100 && (
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 8 }}>Showing top 100 of {filtered.length}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "16px 14px" }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#d0c290" }}>{value}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid rgba(255,255,255,0.1)" };
const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "rgba(255,255,255,0.7)" };
