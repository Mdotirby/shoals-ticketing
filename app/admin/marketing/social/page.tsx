"use client";

import { useEffect, useState } from "react";
import { getCookie } from "@/lib/cookies";
import Link from "next/link";

type SocialMetric = {
  id: string;
  platform: string;
  hashtag: string | null;
  impressions: number;
  engagements: number;
  shares: number;
  mentions: number;
  recorded_date: string;
  event_id: string | null;
  events?: { title: string; date: string } | null;
  notes: string | null;
};

type EventOption = { id: string; title: string; date: string };

const platformLabels: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  twitter: "X (Twitter)",
  facebook: "Facebook",
  youtube: "YouTube",
  other: "Other",
};

export default function SocialPage() {
  const [metrics, setMetrics] = useState<SocialMetric[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    event_id: "", platform: "instagram", hashtag: "",
    impressions: "", engagements: "", shares: "", mentions: "",
    recorded_date: new Date().toISOString().split("T")[0], notes: "",
  });

  const role = getCookie("user-role");
  if (role !== "owner") {
    return <div className="admin-form-page"><h1 className="admin-page-title">Access Denied</h1></div>;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    Promise.all([
      fetch("/api/marketing/social").then((r) => r.json()),
      fetch("/api/events?all=1").then((r) => r.json()),
    ]).then(([sData, evData]) => {
      if (Array.isArray(sData)) setMetrics(sData);
      if (Array.isArray(evData)) setEvents(evData.map((e: EventOption) => ({ id: e.id, title: e.title, date: e.date })));
    }).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/marketing/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: form.event_id || null,
          platform: form.platform,
          hashtag: form.hashtag || null,
          impressions: parseInt(form.impressions) || 0,
          engagements: parseInt(form.engagements) || 0,
          shares: parseInt(form.shares) || 0,
          mentions: parseInt(form.mentions) || 0,
          recorded_date: form.recorded_date,
          notes: form.notes || null,
        }),
      });
      if (res.ok) {
        const newMetric = await res.json();
        setMetrics([newMetric, ...metrics]);
        setShowForm(false);
        setForm({ event_id: "", platform: "instagram", hashtag: "", impressions: "", engagements: "", shares: "", mentions: "", recorded_date: new Date().toISOString().split("T")[0], notes: "" });
      }
    } finally { setSaving(false); }
  };

  const totalImpressions = metrics.reduce((s, m) => s + (m.impressions || 0), 0);
  const totalEngagements = metrics.reduce((s, m) => s + (m.engagements || 0), 0);
  const totalShares = metrics.reduce((s, m) => s + (m.shares || 0), 0);
  const avgEngRate = totalImpressions > 0 ? ((totalEngagements / totalImpressions) * 100).toFixed(2) : "0";

  return (
    <div className="admin-form-page">
      <Link href="/admin/marketing" style={{ color: "rgba(208,194,144,0.7)", textDecoration: "none", fontSize: 13 }}>← Marketing Hub</Link>
      <h1 className="admin-page-title" style={{ marginTop: 8 }}>Social Performance</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard label="Total Impressions" value={totalImpressions.toLocaleString()} />
        <StatCard label="Total Engagements" value={totalEngagements.toLocaleString()} />
        <StatCard label="Total Shares" value={totalShares.toLocaleString()} />
        <StatCard label="Avg Engagement Rate" value={`${avgEngRate}%`} />
        <StatCard label="Entries" value={metrics.length.toString()} />
      </div>

      <button onClick={() => setShowForm(!showForm)} className="admin-form-submit" style={{ marginBottom: 16, padding: "10px 20px", fontSize: 13 }}>
        {showForm ? "Cancel" : "+ Add Social Metrics"}
      </button>

      {showForm && (
        <form onSubmit={handleSubmit} className="admin-form" style={{ marginBottom: 24 }}>
          <div className="admin-form-grid">
            <label className="admin-form-label">
              Platform *
              <select className="admin-form-input" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
                {Object.entries(platformLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="admin-form-label">
              Event
              <select className="admin-form-input" value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value })}>
                <option value="">— General —</option>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title} ({new Date(ev.date).toLocaleDateString()})</option>)}
              </select>
            </label>
            <label className="admin-form-label">
              Hashtag
              <input type="text" className="admin-form-input" value={form.hashtag} onChange={(e) => setForm({ ...form, hashtag: e.target.value })} placeholder="#YourHashtag" />
            </label>
            <label className="admin-form-label">
              Impressions
              <input type="number" className="admin-form-input" value={form.impressions} onChange={(e) => setForm({ ...form, impressions: e.target.value })} min="0" />
            </label>
            <label className="admin-form-label">
              Engagements
              <input type="number" className="admin-form-input" value={form.engagements} onChange={(e) => setForm({ ...form, engagements: e.target.value })} min="0" />
            </label>
            <label className="admin-form-label">
              Shares
              <input type="number" className="admin-form-input" value={form.shares} onChange={(e) => setForm({ ...form, shares: e.target.value })} min="0" />
            </label>
            <label className="admin-form-label">
              Mentions
              <input type="number" className="admin-form-input" value={form.mentions} onChange={(e) => setForm({ ...form, mentions: e.target.value })} min="0" />
            </label>
            <label className="admin-form-label">
              Date
              <input type="date" className="admin-form-input" value={form.recorded_date} onChange={(e) => setForm({ ...form, recorded_date: e.target.value })} />
            </label>
          </div>
          <button type="submit" className="admin-form-submit" disabled={saving} style={{ marginTop: 12 }}>
            {saving ? "Saving..." : "Save Metrics"}
          </button>
        </form>
      )}

      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading social data...</p>
      ) : metrics.length === 0 ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>No social metrics tracked yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Platform</th>
                <th style={thStyle}>Hashtag</th>
                <th style={thStyle}>Event</th>
                <th style={thStyle}>Impressions</th>
                <th style={thStyle}>Engagements</th>
                <th style={thStyle}>Shares</th>
                <th style={thStyle}>Eng. Rate</th>
                <th style={thStyle}>Date</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => {
                const engRate = m.impressions > 0 ? ((m.engagements / m.impressions) * 100).toFixed(2) : "—";
                return (
                  <tr key={m.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "rgba(208,194,144,0.1)", color: "rgba(208,194,144,0.8)" }}>
                        {platformLabels[m.platform] || m.platform}
                      </span>
                    </td>
                    <td style={tdStyle}>{m.hashtag || "—"}</td>
                    <td style={tdStyle}>{m.events?.title || "General"}</td>
                    <td style={tdStyle}>{(m.impressions || 0).toLocaleString()}</td>
                    <td style={tdStyle}>{(m.engagements || 0).toLocaleString()}</td>
                    <td style={tdStyle}>{(m.shares || 0).toLocaleString()}</td>
                    <td style={tdStyle}>{engRate}%</td>
                    <td style={tdStyle}>{m.recorded_date ? new Date(m.recorded_date).toLocaleDateString() : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "16px 14px" }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#d0c290" }}>{value}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{label}</div>
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid rgba(255,255,255,0.1)" };
const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "rgba(255,255,255,0.7)" };
