"use client";

import { useEffect, useState } from "react";
import { getCookie } from "@/lib/cookies";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type EventData = {
  id: string;
  title: string;
  venue: string;
  date: string;
  status: string;
  tickets_sold: number;
  tickets_scanned: number;
};

type Analytics = {
  total_views: number;
  unique_views: number;
  total_tickets_sold: number;
  total_checked_in: number;
  conversion_rate: string;
  email_stats: { sent: number; opened: number; clicked: number; open_rate: string; click_rate: string };
  top_zips: { zip: string; count: number }[];
};

export default function PartnerDashboardPage() {
  const [events, setEvents] = useState<EventData[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [partnerId, setPartnerId] = useState<string | null>(null);

  const role = getCookie("user-role");

  useEffect(() => {
    async function loadPartnerData() {
      // Get current user ID
      const supabase = getSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) { setLoading(false); return; }
      setPartnerId(userId);

      try {
        const [evRes, anRes] = await Promise.all([
          fetch(`/api/partner/events?partner_id=${userId}`).then((r) => r.json()),
          fetch(`/api/partner/analytics?partner_id=${userId}`).then((r) => r.json()),
        ]);

        if (Array.isArray(evRes)) setEvents(evRes);
        if (anRes && !anRes.error) setAnalytics(anRes);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    loadPartnerData();
  }, []);

  if (role && role !== "partner" && role !== "owner") {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Access Denied</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>This dashboard is only available to partners.</p>
      </div>
    );
  }

  const maxZipCount = analytics?.top_zips?.length ? Math.max(...analytics.top_zips.map((z) => z.count)) : 0;

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Partner Dashboard</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 24 }}>
        Your hub for event performance, engagement data, and marketing insights.
        {partnerId && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginLeft: 8 }}>ID: {partnerId.slice(0, 8)}...</span>}
      </p>

      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading partner data...</p>
      ) : (
        <>
          {/* KPI Stats */}
          {analytics && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
              <StatCard label="Page Views" value={analytics.total_views.toLocaleString()} />
              <StatCard label="Unique Visitors" value={analytics.unique_views.toLocaleString()} />
              <StatCard label="Tickets Sold" value={analytics.total_tickets_sold.toLocaleString()} />
              <StatCard label="Checked In" value={analytics.total_checked_in.toLocaleString()} />
              <StatCard label="Conversion Rate" value={`${analytics.conversion_rate}%`} />
              <StatCard label="Assigned Events" value={events.length.toString()} />
            </div>
          )}

          {/* Email Performance */}
          {analytics && analytics.email_stats.sent > 0 && (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <h3 style={{ color: "#ffffff", fontSize: 14, margin: "0 0 12px", fontWeight: 600 }}>Email Performance</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12 }}>
                <MiniStat label="Emails Sent" value={analytics.email_stats.sent.toString()} />
                <MiniStat label="Opened" value={analytics.email_stats.opened.toString()} />
                <MiniStat label="Clicked" value={analytics.email_stats.clicked.toString()} />
                <MiniStat label="Open Rate" value={`${analytics.email_stats.open_rate}%`} />
                <MiniStat label="Click Rate" value={`${analytics.email_stats.click_rate}%`} />
              </div>
            </div>
          )}

          {/* Location Heatmap */}
          {analytics && analytics.top_zips.length > 0 && (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <h3 style={{ color: "#ffffff", fontSize: 14, margin: "0 0 12px", fontWeight: 600 }}>Ticket Buyer Locations</h3>
              {analytics.top_zips.map((z) => {
                const pct = maxZipCount > 0 ? (z.count / maxZipCount) * 100 : 0;
                return (
                  <div key={z.zip} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ width: 70, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)", fontFamily: "monospace" }}>{z.zip}</span>
                    <div style={{ flex: 1, height: 18, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(pct, 2)}%`, height: "100%", background: `rgba(255,255,255,${0.3 + (pct / 100) * 0.5})`, borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", minWidth: 30, textAlign: "right" }}>{z.count}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Event List */}
          <h3 style={{ color: "#ffffff", fontSize: 14, margin: "0 0 12px", fontWeight: 600 }}>Assigned Events</h3>
          {events.length === 0 ? (
            <p style={{ color: "rgba(255,255,255,0.4)" }}>No events assigned to your partner account yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {events.map((ev) => {
                const dropRate = ev.tickets_sold > 0 ? ((ev.tickets_scanned / ev.tickets_sold) * 100).toFixed(0) : "0";
                return (
                  <div key={ev.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "16px 20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <h4 style={{ color: "#fff", fontSize: 15, margin: "0 0 4px", fontWeight: 600 }}>{ev.title}</h4>
                        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: 0 }}>
                          {ev.venue} · {new Date(ev.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: "#ffffff" }}>{ev.tickets_sold}</div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>Sold</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(80,200,120,0.8)" }}>{ev.tickets_scanned}</div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>Check-ins</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>{dropRate}%</div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>Drop Rate</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "16px 14px" }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#ffffff" }}>{value}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{label}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{value}</div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{label}</div>
    </div>
  );
}
