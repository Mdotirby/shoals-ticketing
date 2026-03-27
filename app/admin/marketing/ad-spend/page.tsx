"use client";

import { useEffect, useState, useCallback } from "react";
import { getCookie } from "@/lib/cookies";
import Link from "next/link";

type MetaSyncStatus = {
  configured: boolean;
  last_sync: string | null;
  campaign_count: number;
  instructions?: string;
};

type AdCampaign = {
  id: string;
  platform: string;
  campaign_name: string | null;
  meta_campaign_id?: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  reach?: number;
  purchases?: number;
  roas?: number;
  start_date: string | null;
  end_date: string | null;
  event_id: string | null;
  events?: { title: string; date: string } | null;
  notes: string | null;
  updated_at?: string;
};

export default function AdSpendPage() {
  const [syncStatus, setSyncStatus] = useState<MetaSyncStatus | null>(null);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableError, setTableError] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    event_id: "", platform: "meta", campaign_name: "", spend: "",
    impressions: "", clicks: "", start_date: "", end_date: "", notes: "",
  });

  const role = getCookie("user-role");
  if (role !== "owner") {
    return <div className="admin-form-page"><h1 className="admin-page-title">Access Denied</h1></div>;
  }

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, adRes] = await Promise.all([
        fetch("/api/marketing/meta-sync").then((r) => r.json()),
        fetch("/api/marketing/ad-spend").then((r) => r.json()),
      ]);
      setSyncStatus(statusRes);
      if (Array.isArray(adRes)) {
        setCampaigns(adRes);
      } else if (adRes?.error?.includes("does not exist") || adRes?.error?.includes("42P01")) {
        setTableError(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/marketing/meta-sync", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setError(data.error + (data.details ? `: ${data.details}` : ""));
      } else {
        // Refresh campaign data
        const adRes = await fetch("/api/marketing/ad-spend").then((r) => r.json());
        if (Array.isArray(adRes)) setCampaigns(adRes);
        setSyncStatus((prev) => prev ? { ...prev, last_sync: data.synced_at, campaign_count: data.campaigns_synced } : prev);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/marketing/ad-spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: form.platform,
          campaign_name: form.campaign_name || null,
          event_id: form.event_id || null,
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
        setShowManualForm(false);
        setForm({ event_id: "", platform: "meta", campaign_name: "", spend: "", impressions: "", clicks: "", start_date: "", end_date: "", notes: "" });
      }
    } finally { setSaving(false); }
  };

  // Aggregates
  const totalSpend = campaigns.reduce((s, c) => s + Number(c.spend || 0), 0);
  const totalImpressions = campaigns.reduce((s, c) => s + (c.impressions || 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + (c.clicks || 0), 0);
  const totalReach = campaigns.reduce((s, c) => s + (c.reach || 0), 0);
  const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgROAS = campaigns.filter((c) => c.roas && c.roas > 0).length > 0
    ? campaigns.reduce((s, c) => s + (c.roas || 0), 0) / campaigns.filter((c) => c.roas && c.roas > 0).length
    : 0;

  // Daily spend bars (group by date from campaigns)
  const spendByDate: Record<string, number> = {};
  for (const c of campaigns) {
    const date = c.start_date || c.updated_at?.split("T")[0] || "unknown";
    spendByDate[date] = (spendByDate[date] || 0) + Number(c.spend || 0);
  }
  const spendEntries = Object.entries(spendByDate).sort(([a], [b]) => a.localeCompare(b)).slice(-30);
  const maxSpend = Math.max(...spendEntries.map(([, v]) => v), 1);

  const platformLabels: Record<string, string> = {
    meta: "Meta (FB/IG)", google: "Google Ads", tiktok: "TikTok Ads",
    snapchat: "Snapchat", spotify: "Spotify Ads", other: "Other",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#111", padding: "24px 20px", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      <Link href="/admin/marketing" style={{ color: "rgba(96,165,250,0.7)", textDecoration: "none", fontSize: 13 }}>← Marketing Hub</Link>
      <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 700, marginTop: 8, marginBottom: 4 }}>Digital Ad Spend / ROAS</h1>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 24 }}>
        Campaign performance from Meta Ads and manual entries
      </p>

      {/* Sync Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <button
          onClick={handleSync}
          disabled={syncing || !syncStatus?.configured}
          style={{
            background: syncing ? "rgba(96,165,250,0.2)" : "#2563eb",
            color: "#fff",
            border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600,
            cursor: syncing ? "not-allowed" : "pointer",
          }}
        >
          {syncing ? "Syncing..." : "\uD83D\uDD04 Sync from Meta"}
        </button>
        <button
          onClick={() => setShowManualForm(!showManualForm)}
          style={{
            background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 20px",
            fontSize: 13, cursor: "pointer",
          }}
        >
          {showManualForm ? "Cancel" : "+ Add Manual"}
        </button>
        {syncStatus?.last_sync && (
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
            Last sync: {new Date(syncStatus.last_sync).toLocaleString()}
          </span>
        )}
      </div>

      {/* Not configured */}
      {syncStatus && !syncStatus.configured && (
        <div style={{ background: "rgba(255,180,50,0.08)", border: "1px solid rgba(255,180,50,0.2)", borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <div style={{ color: "#ffb432", fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Meta Ads Not Connected</div>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: 0 }}>
            Set <code style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>META_SYSTEM_TOKEN</code> and{" "}
            <code style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>META_AD_ACCOUNT_ID</code> in Vercel env vars to enable auto-sync.
          </p>
        </div>
      )}

      {/* Table doesn't exist */}
      {tableError && (
        <div style={{ background: "rgba(255,180,50,0.08)", border: "1px solid rgba(255,180,50,0.2)", borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <div style={{ color: "#ffb432", fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Migration Required</div>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: 0 }}>
            The <code style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>ad_campaigns</code> table doesn&apos;t exist yet. Run the marketing migration to create it.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)", borderRadius: 10, padding: 16, marginBottom: 24 }}>
          <p style={{ color: "#ff5050", fontSize: 13, margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Manual Form */}
      {showManualForm && (
        <form onSubmit={handleManualSubmit} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            <label style={labelStyle}>
              Platform *
              <select style={inputStyle} value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
                {Object.entries(platformLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Campaign Name
              <input type="text" style={inputStyle} value={form.campaign_name} onChange={(e) => setForm({ ...form, campaign_name: e.target.value })} placeholder="e.g. Summer Show Promo" />
            </label>
            <label style={labelStyle}>
              Spend ($) *
              <input type="number" style={inputStyle} value={form.spend} onChange={(e) => setForm({ ...form, spend: e.target.value })} step="0.01" min="0" required />
            </label>
            <label style={labelStyle}>
              Impressions
              <input type="number" style={inputStyle} value={form.impressions} onChange={(e) => setForm({ ...form, impressions: e.target.value })} min="0" />
            </label>
            <label style={labelStyle}>
              Clicks
              <input type="number" style={inputStyle} value={form.clicks} onChange={(e) => setForm({ ...form, clicks: e.target.value })} min="0" />
            </label>
            <label style={labelStyle}>
              Start Date
              <input type="date" style={inputStyle} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </label>
            <label style={labelStyle}>
              End Date
              <input type="date" style={inputStyle} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </label>
          </div>
          <button type="submit" disabled={saving} style={{
            marginTop: 12, background: "#2563eb", color: "#fff",
            border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}>
            {saving ? "Saving..." : "Save Campaign"}
          </button>
        </form>
      )}

      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading campaigns...</p>
      ) : (
        <>
          {/* Overview Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12, marginBottom: 32 }}>
            <StatCard label="Total Spend" value={`$${totalSpend.toFixed(2)}`} />
            <StatCard label="Total Impressions" value={totalImpressions.toLocaleString()} />
            <StatCard label="Total Reach" value={totalReach.toLocaleString()} />
            <StatCard label="Avg CPC" value={`$${avgCPC.toFixed(2)}`} />
            <StatCard label="Avg CTR" value={`${avgCTR.toFixed(2)}%`} />
            <StatCard label="ROAS" value={avgROAS > 0 ? `${avgROAS.toFixed(2)}x` : "—"} />
          </div>

          {/* Spend Over Time Chart */}
          {spendEntries.length > 1 && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Spend Over Time</h2>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120, padding: "0 4px" }}>
                {spendEntries.map(([date, spend], i) => {
                  const pct = (spend / maxSpend) * 100;
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ fontSize: 9, color: "rgba(96,165,250,0.7)", marginBottom: 2 }}>
                        ${spend.toFixed(0)}
                      </div>
                      <div
                        style={{
                          width: "100%", maxWidth: 28, height: `${Math.max(pct, 3)}%`,
                          background: "rgba(96,165,250,0.5)", borderRadius: "4px 4px 0 0", minHeight: 3,
                        }}
                        title={`${date}: $${spend.toFixed(2)}`}
                      />
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 4, transform: "rotate(-45deg)" }}>
                        {date.slice(5)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Campaigns Table */}
          {campaigns.length > 0 ? (
            <div>
              <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Campaigns</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Campaign</th>
                      <th style={thStyle}>Platform</th>
                      <th style={thStyle}>Event</th>
                      <th style={thStyle}>Spend</th>
                      <th style={thStyle}>Impressions</th>
                      <th style={thStyle}>Clicks</th>
                      <th style={thStyle}>CPC</th>
                      <th style={thStyle}>CTR</th>
                      <th style={thStyle}>ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => {
                      const cpc = c.clicks > 0 ? (Number(c.spend) / c.clicks) : 0;
                      const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100) : 0;
                      return (
                        <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                          <td style={{ ...tdStyle, fontWeight: 500, color: "rgba(255,255,255,0.85)", maxWidth: 200 }}>
                            {c.campaign_name || "Untitled Campaign"}
                          </td>
                          <td style={tdStyle}>
                            <span style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 6,
                              background: c.platform === "meta" ? "rgba(66,103,178,0.12)" : "rgba(96,165,250,0.1)",
                              color: c.platform === "meta" ? "#4267b2" : "rgba(96,165,250,0.8)",
                            }}>
                              {platformLabels[c.platform] || c.platform}
                            </span>
                          </td>
                          <td style={tdStyle}>{c.events?.title || (c.event_id ? "Linked" : "General")}</td>
                          <td style={{ ...tdStyle, fontWeight: 600, color: "#60a5fa" }}>${Number(c.spend).toFixed(2)}</td>
                          <td style={tdStyle}>{(c.impressions || 0).toLocaleString()}</td>
                          <td style={tdStyle}>{(c.clicks || 0).toLocaleString()}</td>
                          <td style={tdStyle}>${cpc.toFixed(2)}</td>
                          <td style={tdStyle}>{ctr.toFixed(2)}%</td>
                          <td style={tdStyle}>
                            {c.roas && c.roas > 0 ? (
                              <span style={{ color: c.roas >= 1 ? "#4ade80" : "#ff5050" }}>{c.roas.toFixed(2)}x</span>
                            ) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : !tableError && (
            <p style={{ color: "rgba(255,255,255,0.4)", textAlign: "center", padding: 40 }}>
              No ad campaigns yet. Click &quot;Sync from Meta&quot; to pull campaign data, or add campaigns manually.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "16px 14px" }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#60a5fa" }}>{value}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{label}</div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 500 };
const inputStyle: React.CSSProperties = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "8px 10px", color: "#fff", fontSize: 13 };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid rgba(255,255,255,0.1)" };
const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "rgba(255,255,255,0.7)" };
