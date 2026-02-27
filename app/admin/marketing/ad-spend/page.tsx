"use client";

import { useEffect, useState } from "react";
import { getCookie } from "@/lib/cookies";
import Link from "next/link";

type AdCampaign = {
  id: string;
  platform: string;
  campaign_name: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  start_date: string | null;
  end_date: string | null;
  event_id: string | null;
  events?: { title: string; date: string } | null;
  notes: string | null;
};

type EventOption = { id: string; title: string; date: string };

const platformLabels: Record<string, string> = {
  meta: "Meta (Facebook/IG)",
  google: "Google Ads",
  tiktok: "TikTok Ads",
  snapchat: "Snapchat",
  spotify: "Spotify Ads",
  other: "Other",
};

export default function AdSpendPage() {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    event_id: "",
    platform: "meta",
    campaign_name: "",
    spend: "",
    impressions: "",
    clicks: "",
    start_date: "",
    end_date: "",
    notes: "",
  });

  const role = getCookie("user-role");
  if (role !== "owner") {
    return <div className="admin-form-page"><h1 className="admin-page-title">Access Denied</h1></div>;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    Promise.all([
      fetch("/api/marketing/ad-spend").then((r) => r.json()),
      fetch("/api/events?all=1").then((r) => r.json()),
    ]).then(([adData, evData]) => {
      if (Array.isArray(adData)) setCampaigns(adData);
      if (Array.isArray(evData)) setEvents(evData.map((e: EventOption) => ({ id: e.id, title: e.title, date: e.date })));
    }).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/marketing/ad-spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: form.event_id || null,
          platform: form.platform,
          campaign_name: form.campaign_name || null,
          spend: parseFloat(form.spend) || 0,
          impressions: parseInt(form.impressions) || 0,
          clicks: parseInt(form.clicks) || 0,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          notes: form.notes || null,
        }),
      });
      if (res.ok) {
        const newCamp = await res.json();
        setCampaigns([newCamp, ...campaigns]);
        setShowForm(false);
        setForm({ event_id: "", platform: "meta", campaign_name: "", spend: "", impressions: "", clicks: "", start_date: "", end_date: "", notes: "" });
      }
    } finally {
      setSaving(false);
    }
  };

  // Aggregate stats
  const totalSpend = campaigns.reduce((s, c) => s + Number(c.spend), 0);
  const totalImpressions = campaigns.reduce((s, c) => s + (c.impressions || 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + (c.clicks || 0), 0);
  const avgCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0";
  const avgCPC = totalClicks > 0 ? (totalSpend / totalClicks).toFixed(2) : "0";

  return (
    <div className="admin-form-page">
      <Link href="/admin/marketing" style={{ color: "rgba(208,194,144,0.7)", textDecoration: "none", fontSize: 13 }}>← Marketing Hub</Link>
      <h1 className="admin-page-title" style={{ marginTop: 8 }}>Digital Ad Spend / ROAS</h1>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard label="Total Spend" value={`$${totalSpend.toFixed(2)}`} />
        <StatCard label="Impressions" value={totalImpressions.toLocaleString()} />
        <StatCard label="Clicks" value={totalClicks.toLocaleString()} />
        <StatCard label="Avg CTR" value={`${avgCTR}%`} />
        <StatCard label="Avg CPC" value={`$${avgCPC}`} />
        <StatCard label="Campaigns" value={campaigns.length.toString()} />
      </div>

      {/* Add button */}
      <button
        onClick={() => setShowForm(!showForm)}
        className="admin-form-submit"
        style={{ marginBottom: 16, padding: "10px 20px", fontSize: 13 }}
      >
        {showForm ? "Cancel" : "+ Add Ad Campaign"}
      </button>

      {/* Form */}
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
                <option value="">— All / General —</option>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title} ({new Date(ev.date).toLocaleDateString()})</option>)}
              </select>
            </label>
            <label className="admin-form-label">
              Campaign Name
              <input type="text" className="admin-form-input" value={form.campaign_name} onChange={(e) => setForm({ ...form, campaign_name: e.target.value })} placeholder="e.g. Summer Show Promo" />
            </label>
            <label className="admin-form-label">
              Spend ($) *
              <input type="number" className="admin-form-input" value={form.spend} onChange={(e) => setForm({ ...form, spend: e.target.value })} step="0.01" min="0" required />
            </label>
            <label className="admin-form-label">
              Impressions
              <input type="number" className="admin-form-input" value={form.impressions} onChange={(e) => setForm({ ...form, impressions: e.target.value })} min="0" />
            </label>
            <label className="admin-form-label">
              Clicks
              <input type="number" className="admin-form-input" value={form.clicks} onChange={(e) => setForm({ ...form, clicks: e.target.value })} min="0" />
            </label>
            <label className="admin-form-label">
              Start Date
              <input type="date" className="admin-form-input" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </label>
            <label className="admin-form-label">
              End Date
              <input type="date" className="admin-form-input" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </label>
          </div>
          <label className="admin-form-label" style={{ marginTop: 8 }}>
            Notes
            <textarea className="admin-form-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </label>
          <button type="submit" className="admin-form-submit" disabled={saving} style={{ marginTop: 12 }}>
            {saving ? "Saving..." : "Save Campaign"}
          </button>
        </form>
      )}

      {/* Table */}
      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading campaigns...</p>
      ) : campaigns.length === 0 ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>No ad campaigns tracked yet. Add your first one above.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Platform</th>
                <th style={thStyle}>Campaign</th>
                <th style={thStyle}>Event</th>
                <th style={thStyle}>Spend</th>
                <th style={thStyle}>Impressions</th>
                <th style={thStyle}>Clicks</th>
                <th style={thStyle}>CTR</th>
                <th style={thStyle}>Dates</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : "—";
                return (
                  <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "rgba(208,194,144,0.1)", color: "rgba(208,194,144,0.8)" }}>
                        {platformLabels[c.platform] || c.platform}
                      </span>
                    </td>
                    <td style={tdStyle}>{c.campaign_name || "—"}</td>
                    <td style={tdStyle}>{c.events?.title || "General"}</td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: "#d0c290" }}>${Number(c.spend).toFixed(2)}</td>
                    <td style={tdStyle}>{(c.impressions || 0).toLocaleString()}</td>
                    <td style={tdStyle}>{(c.clicks || 0).toLocaleString()}</td>
                    <td style={tdStyle}>{ctr}%</td>
                    <td style={{ ...tdStyle, fontSize: 11 }}>
                      {c.start_date ? new Date(c.start_date).toLocaleDateString() : "—"} → {c.end_date ? new Date(c.end_date).toLocaleDateString() : "—"}
                    </td>
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
