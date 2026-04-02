"use client";

import { useEffect, useState, useCallback } from "react";
import { getCookie } from "@/lib/cookies";
import Link from "next/link";

type SyncStatus = {
  configured: boolean;
  token_status?: "valid" | "expired" | "invalid" | "unknown";
  token_error?: string | null;
  pages?: string[];
  ig_connected?: boolean;
  last_sync: string | null;
  metric_count: number;
  instructions?: string;
};

type SyncResult = {
  success?: boolean;
  error?: string;
  details?: string;
  facebook?: {
    impressions: number;
    engaged_users: number;
    new_fans: number;
    page_views: number;
    post_engagements: number;
  };
  instagram?: {
    reach: number;
    impressions: number;
    accounts_engaged: number;
    follower_count: number;
  };
  posts?: Array<{
    id: string;
    message: string;
    created_time: string;
    likes: number;
    comments: number;
    shares: number;
  }>;
  synced_at?: string;
  diagnostics?: Record<string, string>;
};

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

export default function SocialPage() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [metrics, setMetrics] = useState<SocialMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = getCookie("user-role");
  if (role !== "owner") {
    return <div className="admin-form-page"><h1 className="admin-page-title">Access Denied</h1></div>;
  }

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, metricsRes] = await Promise.all([
        fetch("/api/marketing/social-sync").then((r) => r.json()),
        fetch("/api/marketing/social").then((r) => r.json()),
      ]);
      setSyncStatus(statusRes);
      if (Array.isArray(metricsRes)) setMetrics(metricsRes);

      // Auto-sync on page load if configured and last sync was >5 min ago
      if (statusRes.configured && statusRes.token_status === "valid") {
        const lastSync = statusRes.last_sync ? new Date(statusRes.last_sync).getTime() : 0;
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        if (lastSync < fiveMinAgo) {
          setSyncing(true);
          try {
            const syncRes = await fetch("/api/marketing/social-sync", { method: "POST" });
            const syncData = await syncRes.json();
            if (!syncData.error) {
              setSyncResult(syncData);
              const freshMetrics = await fetch("/api/marketing/social").then((r) => r.json());
              if (Array.isArray(freshMetrics)) setMetrics(freshMetrics);
              setSyncStatus((prev) => prev ? { ...prev, last_sync: syncData.synced_at } : prev);
            } else {
              setError(syncData.error + (syncData.details ? `: ${syncData.details}` : ""));
            }
          } catch {
            // Auto-sync failure is non-critical — stored data still shows
          } finally {
            setSyncing(false);
          }
        }
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
      const res = await fetch("/api/marketing/social-sync", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setError(data.error + (data.details ? `: ${data.details}` : ""));
      } else {
        setSyncResult(data);
        // Refresh stored data
        const metricsRes = await fetch("/api/marketing/social").then((r) => r.json());
        if (Array.isArray(metricsRes)) setMetrics(metricsRes);
        setSyncStatus((prev) => prev ? { ...prev, last_sync: data.synced_at } : prev);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  // Build fallback summaries from the most recently stored DB metrics per platform
  // (so the cards show data on page load even before a manual sync is clicked)
  const storedFbRow = metrics.find((m) => m.platform === "facebook" && m.impressions > 0);
  const storedIgRow = metrics.find((m) => m.platform === "instagram");

  const storedFb = storedFbRow ? {
    impressions: storedFbRow.impressions || 0,
    post_engagements: storedFbRow.engagements || 0,
    engaged_users: 0,
    new_fans: storedFbRow.mentions || 0,
    // page_views is embedded in notes as "Page views: N"
    page_views: (() => {
      const match = storedFbRow.notes?.match(/Page views:\s*(\d+)/i);
      return match ? parseInt(match[1], 10) : 0;
    })(),
  } : null;

  const storedIg = storedIgRow ? {
    reach: storedIgRow.impressions || 0,   // reach stored in impressions column
    impressions: 0,
    accounts_engaged: storedIgRow.engagements || 0,
    follower_count: storedIgRow.mentions || 0,
  } : null;

  // Live sync result takes priority; fall back to stored DB data
  const fb = syncResult?.facebook || storedFb;
  const ig = syncResult?.instagram || storedIg;
  const posts = syncResult?.posts || [];

  const totalReach = (fb?.impressions || 0) + (ig?.reach || 0);
  const totalEngagement = (fb?.post_engagements || 0) + (ig?.accounts_engaged || 0);
  const totalFollowers = (fb?.new_fans || 0) + (ig?.follower_count || 0);
  const totalPageViews = fb?.page_views || 0;

  // Fallback totals from all stored rows (still used for chart bars)
  const storedImpressions = metrics.reduce((s, m) => s + (m.impressions || 0), 0);
  const storedEngagements = metrics.reduce((s, m) => s + (m.engagements || 0), 0);

  // Daily reach bars from FB insights (last 7 stored metrics)
  const recentMetrics = metrics.slice(0, 14);
  const maxImp = Math.max(...recentMetrics.map((m) => m.impressions || 0), 1);

  return (
    <div style={{ minHeight: "100vh", background: "transparent", padding: "24px 20px", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      <Link href="/admin/marketing" style={{ color: "rgba(96,165,250,0.7)", textDecoration: "none", fontSize: 13 }}>← Marketing Hub</Link>
      <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 700, marginTop: 8, marginBottom: 4 }}>Social Performance</h1>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 24 }}>
        Meta social insights — Facebook & Instagram
      </p>

      {/* Sync Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <button
          onClick={handleSync}
          disabled={syncing || !syncStatus?.configured}
          style={{
            background: syncing ? "rgba(96,165,250,0.2)" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 600,
            cursor: syncing ? "not-allowed" : "pointer",
          }}
        >
          {syncing ? "Syncing..." : "\uD83D\uDD04 Sync Now"}
        </button>
        {syncStatus?.last_sync && (
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
            Last sync: {new Date(syncStatus.last_sync).toLocaleString()}
          </span>
        )}
      </div>

      {/* Not configured message */}
      {syncStatus && !syncStatus.configured && (
        <div style={{ background: "rgba(255,180,50,0.08)", border: "1px solid rgba(255,180,50,0.2)", borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <div style={{ color: "#ffb432", fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Meta Not Connected</div>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: 0 }}>
            Connect your Meta account to see social insights. Set <code style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>META_SYSTEM_TOKEN</code> in Vercel env vars.
            Optionally set <code style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>META_PAGE_ID</code> and <code style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>META_IG_USER_ID</code>.
          </p>
        </div>
      )}

      {/* Token diagnostics */}
      {syncStatus && syncStatus.configured && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 16, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{
              display: "inline-block", width: 8, height: 8, borderRadius: "50%",
              background: syncStatus.token_status === "valid" ? "#22c55e" : syncStatus.token_status === "expired" ? "#ef4444" : "#f59e0b",
            }} />
            <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 600 }}>
              Token: {syncStatus.token_status === "valid" ? "Valid" : syncStatus.token_status === "expired" ? "Expired" : syncStatus.token_status === "invalid" ? "Invalid" : "Unknown"}
            </span>
          </div>
          {syncStatus.token_error && (
            <p style={{ color: "#ef4444", fontSize: 12, margin: "0 0 8px" }}>{syncStatus.token_error}</p>
          )}
          {syncStatus.pages && syncStatus.pages.length > 0 && (
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: "0 0 4px" }}>
              Pages: {syncStatus.pages.join(", ")}
            </p>
          )}
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: 0 }}>
            Instagram: {syncStatus.ig_connected ? "Connected" : "Not connected"}
            {!syncStatus.ig_connected && " — Link an IG Business Account to your FB Page"}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)", borderRadius: 10, padding: 16, marginBottom: 24 }}>
          <p style={{ color: "#ff5050", fontSize: 13, margin: 0 }}>{error}</p>
        </div>
      )}

      {/* API Diagnostics — shown after sync if there are errors */}
      {syncResult?.diagnostics && Object.keys(syncResult.diagnostics).length > 0 && (
        <div style={{ background: "rgba(255,180,50,0.08)", border: "1px solid rgba(255,180,50,0.2)", borderRadius: 10, padding: 16, marginBottom: 24 }}>
          <div style={{ color: "#ffb432", fontWeight: 600, fontSize: 14, marginBottom: 8 }}>⚠️ Meta API Permission Issues Detected</div>
          {Object.entries(syncResult.diagnostics).map(([key, msg]) => (
            <p key={key} style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, margin: "4px 0" }}>
              <strong style={{ color: "rgba(255,255,255,0.8)" }}>{key}:</strong> {msg}
            </p>
          ))}
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 8, marginBottom: 0 }}>
            Fix: In Meta Business Manager → System Users → select your system user → Add Assets → assign your Facebook Page with <strong>read_insights</strong> + <strong>pages_read_engagement</strong> + <strong>instagram_manage_insights</strong> permissions.
          </p>
        </div>
      )}

      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading social data...</p>
      ) : (
        <>
          {/* Overview Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 32 }}>
            <StatCard label="Total Reach (30d)" value={totalReach > 0 ? totalReach.toLocaleString() : storedImpressions.toLocaleString()} />
            <StatCard label="Engagement (30d)" value={totalEngagement > 0 ? totalEngagement.toLocaleString() : storedEngagements.toLocaleString()} />
            <StatCard label="Followers / New Fans" value={totalFollowers.toLocaleString()} />
            <StatCard label="Page Views (30d)" value={totalPageViews.toLocaleString()} />
          </div>

          {/* Facebook Section */}
          {fb && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
                <span style={{ marginRight: 8 }}></span>Facebook
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
                <MiniCard label="Impressions" value={fb.impressions.toLocaleString()} />
                <MiniCard label="Post Engagements" value={fb.post_engagements.toLocaleString()} />
                <MiniCard label="Engaged Users" value={fb.engaged_users.toLocaleString()} />
                <MiniCard label="New Fans" value={fb.new_fans.toLocaleString()} />
                <MiniCard label="Page Views" value={fb.page_views.toLocaleString()} />
              </div>
            </div>
          )}

          {/* Instagram Section */}
          {ig && (ig.reach > 0 || ig.impressions > 0) && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
                <span style={{ marginRight: 8 }}></span>Instagram
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
                <MiniCard label="Reach" value={ig.reach.toLocaleString()} />
                <MiniCard label="Impressions" value={ig.impressions.toLocaleString()} />
                <MiniCard label="Engaged Accounts" value={ig.accounts_engaged.toLocaleString()} />
                <MiniCard label="Followers" value={ig.follower_count.toLocaleString()} />
              </div>
            </div>
          )}

          {/* Daily Reach Chart (CSS bars) */}
          {recentMetrics.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Daily Impressions</h2>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120, padding: "0 4px" }}>
                {recentMetrics.reverse().map((m, i) => {
                  const pct = maxImp > 0 ? ((m.impressions || 0) / maxImp) * 100 : 0;
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div
                        style={{
                          width: "100%",
                          maxWidth: 32,
                          height: `${Math.max(pct, 2)}%`,
                          background: m.platform === "instagram" ? "rgba(225,48,108,0.6)" : "rgba(66,103,178,0.6)",
                          borderRadius: "4px 4px 0 0",
                          minHeight: 2,
                        }}
                        title={`${m.recorded_date}: ${(m.impressions || 0).toLocaleString()}`}
                      />
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginTop: 4, transform: "rotate(-45deg)", transformOrigin: "center" }}>
                        {m.recorded_date?.slice(5) || ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent Posts Table */}
          {posts.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Recent Posts</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Post</th>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Likes</th>
                      <th style={thStyle}>Comments</th>
                      <th style={thStyle}>Shares</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map((p) => (
                      <tr key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ ...tdStyle, maxWidth: 300 }}>
                          {p.message ? (p.message.length > 80 ? p.message.slice(0, 80) + "…" : p.message) : "(no text)"}
                        </td>
                        <td style={tdStyle}>{p.created_time ? new Date(p.created_time).toLocaleDateString() : "—"}</td>
                        <td style={tdStyle}>{p.likes.toLocaleString()}</td>
                        <td style={tdStyle}>{p.comments.toLocaleString()}</td>
                        <td style={tdStyle}>{p.shares.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Stored Metrics Table */}
          {metrics.length > 0 && (
            <div>
              <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Stored Metrics History</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Platform</th>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Impressions</th>
                      <th style={thStyle}>Engagements</th>
                      <th style={thStyle}>Shares</th>
                      <th style={thStyle}>Eng. Rate</th>
                      <th style={thStyle}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.slice(0, 50).map((m) => {
                      const engRate = m.impressions > 0 ? ((m.engagements / m.impressions) * 100).toFixed(2) : "—";
                      return (
                        <tr key={m.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                          <td style={tdStyle}>
                            <span style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 6,
                              background: m.platform === "instagram" ? "rgba(225,48,108,0.12)" : "rgba(66,103,178,0.12)",
                              color: m.platform === "instagram" ? "#e1306c" : "#4267b2",
                            }}>
                              {m.platform}
                            </span>
                          </td>
                          <td style={tdStyle}>{m.recorded_date ? new Date(m.recorded_date).toLocaleDateString() : "—"}</td>
                          <td style={tdStyle}>{(m.impressions || 0).toLocaleString()}</td>
                          <td style={tdStyle}>{(m.engagements || 0).toLocaleString()}</td>
                          <td style={tdStyle}>{(m.shares || 0).toLocaleString()}</td>
                          <td style={tdStyle}>{engRate}%</td>
                          <td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.notes || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!syncResult && metrics.length === 0 && (
            <p style={{ color: "rgba(255,255,255,0.4)", textAlign: "center", padding: 40 }}>
              No social data yet. Click &quot;Sync Now&quot; to pull insights from Meta, or add metrics manually via the API.
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

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "12px 10px" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{label}</div>
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid rgba(255,255,255,0.1)" };
const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "rgba(255,255,255,0.7)" };
