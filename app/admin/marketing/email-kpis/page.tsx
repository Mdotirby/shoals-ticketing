"use client";

import { useEffect, useState } from "react";
import { getCookie } from "@/lib/cookies";
import Link from "next/link";

type EmailKPIData = {
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  total_bounced: number;
  open_rate: string;
  click_rate: string;
  bounce_rate: string;
  campaigns: CampaignStat[];
};

type CampaignStat = {
  id: string;
  name: string;
  sent_at: string | null;
  total_recipients: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
};

export default function EmailKPIsPage() {
  const [data, setData] = useState<EmailKPIData | null>(null);
  const [loading, setLoading] = useState(true);

  const role = getCookie("user-role");
  if (role !== "owner") {
    return <div className="admin-form-page"><h1 className="admin-page-title">Access Denied</h1></div>;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    fetch("/api/marketing/email-kpis")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {
        // If table doesn't exist yet, show empty state
        setData({
          total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0, total_bounced: 0,
          open_rate: "0", click_rate: "0", bounce_rate: "0", campaigns: [],
        });
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="admin-form-page">
      <Link href="/admin/marketing" style={{ color: "rgba(96,165,250,0.7)", textDecoration: "none", fontSize: 13 }}>← Marketing Hub</Link>
      <h1 className="admin-page-title" style={{ marginTop: 8 }}>Email KPIs</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>
        Track open rates, click-through rates, and bounce rates across all email campaigns.
      </p>

      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading email data...</p>
      ) : !data ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>No data available.</p>
      ) : (
        <>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
            <StatCard label="Total Sent" value={data.total_sent.toLocaleString()} />
            <StatCard label="Delivered" value={data.total_delivered.toLocaleString()} />
            <StatCard label="Open Rate" value={`${data.open_rate}%`} benchmark="Industry avg: ~20%" good={parseFloat(data.open_rate) >= 20} />
            <StatCard label="Click-Through Rate" value={`${data.click_rate}%`} benchmark="Industry avg: ~2.5%" good={parseFloat(data.click_rate) >= 2.5} />
            <StatCard label="Bounce Rate" value={`${data.bounce_rate}%`} benchmark="Keep under 2%" good={parseFloat(data.bounce_rate) < 2} />
            <StatCard label="Campaigns" value={data.campaigns.length.toString()} />
          </div>

          {/* Visual bar */}
          {data.total_sent > 0 && (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <h3 style={{ color: "#60a5fa", fontSize: 14, margin: "0 0 16px", fontWeight: 600 }}>Email Funnel</h3>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { label: "Sent", value: data.total_sent, color: "rgba(255,255,255,0.2)" },
                  { label: "Delivered", value: data.total_delivered, color: "rgba(100,149,237,0.4)" },
                  { label: "Opened", value: data.total_opened, color: "rgba(80,200,120,0.4)" },
                  { label: "Clicked", value: data.total_clicked, color: "rgba(96,165,250,0.5)" },
                ].map((step) => {
                  const pct = data.total_sent > 0 ? (step.value / data.total_sent) * 100 : 0;
                  return (
                    <div key={step.label} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ height: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                        <div style={{ width: "80%", height: `${Math.max(pct, 5)}%`, background: step.color, borderRadius: "4px 4px 0 0" }} />
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginTop: 8 }}>{step.value.toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{step.label}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{pct.toFixed(1)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Campaign table */}
          {data.campaigns.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <h3 style={{ color: "#60a5fa", fontSize: 14, margin: "0 0 12px", fontWeight: 600 }}>Campaign Breakdown</h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Campaign</th>
                    <th style={thStyle}>Sent</th>
                    <th style={thStyle}>Recipients</th>
                    <th style={thStyle}>Opened</th>
                    <th style={thStyle}>Clicked</th>
                    <th style={thStyle}>Open Rate</th>
                    <th style={thStyle}>CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((c) => {
                    const openRate = c.delivered > 0 ? ((c.opened / c.delivered) * 100).toFixed(1) : "0";
                    const ctr = c.delivered > 0 ? ((c.clicked / c.delivered) * 100).toFixed(1) : "0";
                    return (
                      <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={tdStyle}>{c.name}</td>
                        <td style={tdStyle}>{c.sent_at ? new Date(c.sent_at).toLocaleDateString() : "—"}</td>
                        <td style={tdStyle}>{c.total_recipients}</td>
                        <td style={tdStyle}>{c.opened}</td>
                        <td style={tdStyle}>{c.clicked}</td>
                        <td style={tdStyle}>{openRate}%</td>
                        <td style={tdStyle}>{ctr}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 24, textAlign: "center" }}>
              <p style={{ color: "rgba(255,255,255,0.4)", margin: 0 }}>
                No campaigns sent yet. Email KPIs will populate once you start sending campaigns from the Venue Marketing page.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, benchmark, good }: { label: string; value: string; benchmark?: string; good?: boolean }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "16px 14px" }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#60a5fa" }}>{value}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{label}</div>
      {benchmark && (
        <div style={{ fontSize: 10, color: good ? "rgba(80,200,120,0.7)" : "rgba(255,180,80,0.7)", marginTop: 4 }}>
          {good ? "✓" : "⚠"} {benchmark}
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid rgba(255,255,255,0.1)" };
const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "rgba(255,255,255,0.7)" };
