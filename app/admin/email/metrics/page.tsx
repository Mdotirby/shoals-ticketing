"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";

type Row = {
  id: string;
  name: string;
  status: string;
  sent_at: string | null;
  performance_tier: string | null;
  ee_campaign_metrics: {
    delivered: number; open_rate: number | null; click_rate: number | null;
    conversion_rate: number | null; revenue: number; revenue_per_email: number | null;
  }[] | null;
};

const tierColor: Record<string, string> = {
  high_performer: "rgba(80,200,120,0.9)",
  low_engagement: "rgba(255,186,100,0.9)",
  low_conversion: "rgba(255,140,100,0.9)",
  normal: "rgba(255,255,255,0.6)",
};

export default function EmailMetricsPage() {
  const venueId = getCookie("venue-id") || "";
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = venueId ? `?venue_id=${venueId}` : "";
    fetch(`/api/email-engine/campaigns${q}`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setRows(d); })
      .finally(() => setLoading(false));
  }, [venueId]);

  const sent = rows.filter((r) => r.status === "sent");

  const pct = (n: number | null) => n === null ? "—" : `${(n * 100).toFixed(2)}%`;

  const agg = sent.reduce(
    (a, r) => {
      const m = r.ee_campaign_metrics?.[0];
      if (!m) return a;
      a.delivered += m.delivered || 0;
      a.revenue += Number(m.revenue) || 0;
      a.sumOpen += Number(m.open_rate ?? 0);
      a.sumClick += Number(m.click_rate ?? 0);
      a.sumConv += Number(m.conversion_rate ?? 0);
      a.n++;
      return a;
    },
    { delivered: 0, revenue: 0, sumOpen: 0, sumClick: 0, sumConv: 0, n: 0 },
  );

  return (
    <div className="admin-form-page">
      <Link href="/admin/email" style={{ color: "rgba(208,194,144,0.7)", textDecoration: "none", fontSize: 13 }}>← Email Engine</Link>
      <h1 className="admin-page-title" style={{ marginTop: 8 }}>Performance</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>
        Aggregate across sent campaigns. Open / click / conversion rates attributed via UTM campaigns.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 20 }}>
        <Stat label="Sent campaigns" value={sent.length} />
        <Stat label="Total delivered" value={agg.delivered} />
        <Stat label="Avg open rate" value={agg.n > 0 ? `${(agg.sumOpen / agg.n * 100).toFixed(2)}%` : "—"} />
        <Stat label="Avg click rate" value={agg.n > 0 ? `${(agg.sumClick / agg.n * 100).toFixed(2)}%` : "—"} />
        <Stat label="Avg conv. rate" value={agg.n > 0 ? `${(agg.sumConv / agg.n * 100).toFixed(2)}%` : "—"} />
        <Stat label="Attributed revenue" value={`$${agg.revenue.toFixed(2)}`} />
      </div>

      {loading ? <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading…</p> : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontSize: 11, letterSpacing: 0.5, textAlign: "left" }}>
              <th style={{ padding: "8px 8px" }}>Campaign</th>
              <th style={{ padding: "8px 8px" }}>Tier</th>
              <th style={{ padding: "8px 8px", textAlign: "right" }}>Delivered</th>
              <th style={{ padding: "8px 8px", textAlign: "right" }}>Open</th>
              <th style={{ padding: "8px 8px", textAlign: "right" }}>Click</th>
              <th style={{ padding: "8px 8px", textAlign: "right" }}>Conv</th>
              <th style={{ padding: "8px 8px", textAlign: "right" }}>Revenue</th>
              <th style={{ padding: "8px 8px", textAlign: "right" }}>RPE</th>
            </tr>
          </thead>
          <tbody>
            {sent.map((r) => {
              const m = r.ee_campaign_metrics?.[0];
              return (
                <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)" }}>
                  <td style={{ padding: "10px 8px" }}>
                    <Link href={`/admin/email/campaigns/${r.id}`} style={{ color: "#d0c290", textDecoration: "none" }}>{r.name}</Link>
                    {r.sent_at && <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{new Date(r.sent_at).toLocaleDateString()}</div>}
                  </td>
                  <td style={{ padding: "10px 8px", color: r.performance_tier ? tierColor[r.performance_tier] ?? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)" }}>
                    {r.performance_tier ?? "—"}
                  </td>
                  <td style={{ padding: "10px 8px", textAlign: "right" }}>{m?.delivered ?? 0}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right" }}>{pct(m?.open_rate ?? null)}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right" }}>{pct(m?.click_rate ?? null)}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right" }}>{pct(m?.conversion_rate ?? null)}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right" }}>${Number(m?.revenue ?? 0).toFixed(2)}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right" }}>
                    {m?.revenue_per_email ? `$${Number(m.revenue_per_email).toFixed(3)}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 14px" }}>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: "#d0c290", fontSize: 18, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}
