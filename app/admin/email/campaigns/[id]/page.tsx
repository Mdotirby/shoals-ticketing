"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

type DetailResponse = {
  campaign: {
    id: string;
    name: string;
    subject: string;
    preview_text: string | null;
    status: string;
    performance_tier: string | null;
    scheduled_at: string | null;
    sent_at: string | null;
    total_recipients: number;
    total_sent: number;
    total_failed: number;
    ee_segments?: { name: string; last_count: number | null } | null;
    events?: { title: string; date: string } | null;
  };
  message: { content_html: string; content_text: string | null } | null;
  metrics: {
    delivered: number; opens: number; unique_opens: number; clicks: number; unique_clicks: number;
    conversions: number; revenue: number; bounces: number; complaints: number; unsubscribes: number;
    open_rate: number | null; click_rate: number | null; click_to_open: number | null;
    conversion_rate: number | null; revenue_per_email: number | null;
  } | null;
};

type Flag = {
  id: string;
  kind: string;
  severity: "info" | "warn" | "critical";
  details: Record<string, unknown>;
  suggestions: string[];
};

export default function CampaignDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const [data, setData] = useState<DetailResponse | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);

  useEffect(() => {
    fetch(`/api/email-engine/campaigns/${id}`).then((r) => r.json()).then(setData);
    fetch(`/api/email-engine/campaigns/${id}/metrics`).then((r) => r.json()).then((j) => {
      if (j.flags) setFlags(j.flags);
    });
    fetch(`/api/email-engine/campaigns/${id}/preview`).then((r) => r.json()).then((p) => {
      if (p.html) setPreview({ subject: p.subject, html: p.html });
    });
  }, [id]);

  const refreshMetrics = async () => {
    const res = await fetch(`/api/email-engine/campaigns/${id}/metrics`, { method: "POST" });
    const j = await res.json();
    setData((prev) => prev ? { ...prev, metrics: j.metrics ?? prev.metrics } : prev);
  };

  if (!data) {
    return <div className="admin-form-page"><p style={{ color: "rgba(255,255,255,0.4)" }}>Loading…</p></div>;
  }

  const c = data.campaign;
  const m = data.metrics;
  const pct = (n: number | null | undefined) => n === null || n === undefined ? "—" : `${(n * 100).toFixed(2)}%`;

  return (
    <div className="admin-form-page">
      <Link href="/admin/email/campaigns" style={{ color: "rgba(208,194,144,0.7)", textDecoration: "none", fontSize: 13 }}>← Campaigns</Link>
      <h1 className="admin-page-title" style={{ marginTop: 8 }}>{c.name}</h1>
      <p style={{ color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>{c.subject}</p>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 20 }}>
        Status <span style={{ color: "#d0c290", fontWeight: 600, textTransform: "uppercase" }}>{c.status}</span>
        {c.ee_segments?.name && <> · Segment: {c.ee_segments.name}</>}
        {c.sent_at && <> · Sent {new Date(c.sent_at).toLocaleString()}</>}
        {c.scheduled_at && !c.sent_at && <> · Scheduled {new Date(c.scheduled_at).toLocaleString()}</>}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 20 }}>
        <Stat label="Recipients" value={c.total_recipients} />
        <Stat label="Delivered" value={m?.delivered ?? 0} />
        <Stat label="Open rate" value={pct(m?.open_rate)} />
        <Stat label="Click rate" value={pct(m?.click_rate)} />
        <Stat label="Conversions" value={m?.conversions ?? 0} />
        <Stat label="Revenue" value={`$${Number(m?.revenue ?? 0).toFixed(2)}`} />
        <Stat label="RPE" value={m?.revenue_per_email ? `$${Number(m.revenue_per_email).toFixed(3)}` : "—"} />
        <Stat label="Bounces" value={m?.bounces ?? 0} />
      </div>

      <button onClick={refreshMetrics} style={{ padding: "6px 12px", fontSize: 12, background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, cursor: "pointer", marginBottom: 20 }}>
        Recompute metrics
      </button>

      {flags.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ color: "#fff", fontSize: 14, marginBottom: 8 }}>Optimization recommendations</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {flags.map((f) => (
              <div key={f.id} style={{
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${f.severity === "critical" ? "rgba(255,100,100,0.35)" : f.severity === "warn" ? "rgba(255,186,100,0.35)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 8, padding: "10px 14px"
              }}>
                <div style={{ color: "#d0c290", fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>
                  {f.kind.replace(/_/g, " ")} <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 400, marginLeft: 6 }}>{f.severity}</span>
                </div>
                <ul style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, margin: "6px 0 0 18px", padding: 0 }}>
                  {f.suggestions.map((s) => <li key={s}>{s}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {preview && (
        <>
          <h3 style={{ color: "#fff", fontSize: 14, marginBottom: 8 }}>Rendered preview</h3>
          <div style={{ background: "#fff", borderRadius: 8, padding: 0, border: "1px solid rgba(255,255,255,0.1)" }}>
            <iframe title="preview" srcDoc={preview.html} style={{ width: "100%", height: 540, border: 0, borderRadius: 8, background: "#fff" }} />
          </div>
        </>
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
