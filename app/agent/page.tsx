"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import Link from "next/link";

type TierSales = { sold: number; revenue: number };
type EventData = {
  id: string;
  title: string;
  date: string;
  venue: string;
  image_url?: string;
  status?: string;
  sales: {
    total_sold: number;
    total_revenue: number;
    by_tier: Record<string, TierSales>;
  };
  analytics: {
    views: number;
    conversion_rate: string;
  };
};

type AgentProfile = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  agency_name: string;
  avatar_url?: string;
};

export default function AgentPortalPage() {
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"dashboard" | "reports">("dashboard");

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) {
        setError("Please log in to access the agent portal.");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/agents/portal");
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || "Failed to load portal");
        }
        const data = await res.json();
        setAgent(data.agent);
        setEvents(data.events || []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load agent portal");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleLogout = async () => {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    document.cookie = "user-role=; path=/; max-age=0";
    document.cookie = "user-name=; path=/; max-age=0";
    document.cookie = "venue-id=; path=/; max-age=0";
    document.cookie = "venue-name=; path=/; max-age=0";
    window.location.href = "/login";
  };

  if (loading) {
    return (
      <div className="admin-form-page" style={{ minHeight: "100vh", background: "#0b0d1d" }}>
        <div style={{ textAlign: "center", padding: "80px 20px", color: "rgba(255,255,255,0.5)" }}>
          Loading agent portal…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-form-page" style={{ minHeight: "100vh", background: "#0b0d1d" }}>
        <div style={{ textAlign: "center", padding: "80px 20px" }}>
          <h1 style={{ color: "#d0c290", marginBottom: 12 }}>Agent Portal</h1>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>{error}</p>
          <Link href="/login" style={{ color: "#d0c290", textDecoration: "underline", marginTop: 16, display: "inline-block" }}>
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  const totalRevenue = events.reduce((s, e) => s + e.sales.total_revenue, 0);
  const totalSold = events.reduce((s, e) => s + e.sales.total_sold, 0);
  const totalViews = events.reduce((s, e) => s + e.analytics.views, 0);

  return (
    <div style={{ minHeight: "100vh", background: "#0b0d1d", color: "#fff" }}>
      {/* Header */}
      <div style={{
        background: "#131629",
        borderBottom: "1px solid rgba(208,194,144,0.15)",
        padding: "20px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {agent?.avatar_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={agent.avatar_url}
              alt={agent.first_name}
              style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(208,194,144,0.3)" }}
            />
          ) : (
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "rgba(208,194,144,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, fontWeight: 700, color: "#d0c290",
              border: "3px solid rgba(208,194,144,0.3)",
            }}>
              {agent?.first_name?.charAt(0)?.toUpperCase() || "A"}
            </div>
          )}
          <div>
            <h1 style={{ margin: 0, fontSize: 22, color: "#d0c290" }}>
              Welcome, {agent?.first_name}!
            </h1>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
              {agent?.agency_name}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setActiveTab("dashboard")}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid rgba(208,194,144,0.2)",
              background: activeTab === "dashboard" ? "rgba(208,194,144,0.15)" : "transparent",
              color: activeTab === "dashboard" ? "#d0c290" : "rgba(255,255,255,0.5)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab("reports")}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid rgba(208,194,144,0.2)",
              background: activeTab === "reports" ? "rgba(208,194,144,0.15)" : "transparent",
              color: activeTab === "reports" ? "#d0c290" : "rgba(255,255,255,0.5)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Reports
          </button>
          <button
            onClick={handleLogout}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid rgba(255,100,100,0.3)",
              background: "transparent",
              color: "rgba(255,100,100,0.7)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
        {/* Summary Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
          <div style={{ background: "#131629", borderRadius: 12, padding: "20px 24px", border: "1px solid rgba(208,194,144,0.1)" }}>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>Total Events</p>
            <p style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 700, color: "#d0c290" }}>{events.length}</p>
          </div>
          <div style={{ background: "#131629", borderRadius: 12, padding: "20px 24px", border: "1px solid rgba(208,194,144,0.1)" }}>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>Tickets Sold</p>
            <p style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 700, color: "#d0c290" }}>{totalSold.toLocaleString()}</p>
          </div>
          <div style={{ background: "#131629", borderRadius: 12, padding: "20px 24px", border: "1px solid rgba(208,194,144,0.1)" }}>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>Total Revenue</p>
            <p style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 700, color: "#d0c290" }}>${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
          <div style={{ background: "#131629", borderRadius: 12, padding: "20px 24px", border: "1px solid rgba(208,194,144,0.1)" }}>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>Total Views</p>
            <p style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 700, color: "#d0c290" }}>{totalViews.toLocaleString()}</p>
          </div>
        </div>

        {activeTab === "dashboard" && (
          <>
            <h2 style={{ fontSize: 18, color: "rgba(255,255,255,0.8)", marginBottom: 16 }}>Assigned Events</h2>
            {events.length === 0 ? (
              <div style={{ background: "#131629", borderRadius: 12, padding: "40px 24px", textAlign: "center", border: "1px solid rgba(208,194,144,0.1)" }}>
                <p style={{ color: "rgba(255,255,255,0.4)" }}>No events assigned yet. Contact your venue administrator.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {events.map((event) => (
                  <div
                    key={event.id}
                    style={{
                      background: "#131629",
                      borderRadius: 12,
                      border: "1px solid rgba(208,194,144,0.1)",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ display: "flex", gap: 16, padding: "20px 24px", flexWrap: "wrap" }}>
                      {event.image_url && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={event.image_url}
                          alt={event.title}
                          style={{ width: 80, height: 80, borderRadius: 8, objectFit: "cover" }}
                        />
                      )}
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <h3 style={{ margin: 0, fontSize: 16, color: "#d0c290" }}>{event.title}</h3>
                        <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
                          {event.date ? new Date(event.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "TBD"}
                          {event.venue ? ` · ${event.venue}` : ""}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ textAlign: "center" }}>
                          <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Sold</p>
                          <p style={{ margin: "2px 0 0", fontSize: 20, fontWeight: 700, color: "#fff" }}>{event.sales.total_sold}</p>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Revenue</p>
                          <p style={{ margin: "2px 0 0", fontSize: 20, fontWeight: 700, color: "#fff" }}>${event.sales.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Views</p>
                          <p style={{ margin: "2px 0 0", fontSize: 20, fontWeight: 700, color: "#fff" }}>{event.analytics.views}</p>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Conv.</p>
                          <p style={{ margin: "2px 0 0", fontSize: 20, fontWeight: 700, color: "#fff" }}>{event.analytics.conversion_rate}%</p>
                        </div>
                      </div>
                    </div>

                    {/* Tier breakdown */}
                    {Object.keys(event.sales.by_tier).length > 0 && (
                      <div style={{
                        borderTop: "1px solid rgba(208,194,144,0.08)",
                        padding: "12px 24px",
                        display: "flex",
                        gap: 16,
                        flexWrap: "wrap",
                      }}>
                        {Object.entries(event.sales.by_tier).map(([tier, data]) => (
                          <span
                            key={tier}
                            style={{
                              fontSize: 12,
                              color: "rgba(255,255,255,0.5)",
                              background: "rgba(208,194,144,0.08)",
                              padding: "4px 10px",
                              borderRadius: 6,
                            }}
                          >
                            {tier}: {data.sold} sold · ${data.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "reports" && (
          <>
            <h2 style={{ fontSize: 18, color: "rgba(255,255,255,0.8)", marginBottom: 16 }}>Sales Reports</h2>
            <div style={{ background: "#131629", borderRadius: 12, border: "1px solid rgba(208,194,144,0.1)", overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(208,194,144,0.1)" }}>
                    <th style={{ padding: "12px 16px", textAlign: "left", color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Event</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Date</th>
                    <th style={{ padding: "12px 16px", textAlign: "right", color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Tickets</th>
                    <th style={{ padding: "12px 16px", textAlign: "right", color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Revenue</th>
                    <th style={{ padding: "12px 16px", textAlign: "right", color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Views</th>
                    <th style={{ padding: "12px 16px", textAlign: "right", color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Conv. Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "12px 16px", color: "#d0c290" }}>{event.title}</td>
                      <td style={{ padding: "12px 16px", color: "rgba(255,255,255,0.6)" }}>
                        {event.date ? new Date(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "TBD"}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", color: "#fff" }}>{event.sales.total_sold}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right", color: "#fff" }}>${event.sales.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right", color: "#fff" }}>{event.analytics.views}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right", color: "#fff" }}>{event.analytics.conversion_rate}%</td>
                    </tr>
                  ))}
                  {events.length > 0 && (
                    <tr style={{ borderTop: "2px solid rgba(208,194,144,0.15)" }}>
                      <td style={{ padding: "12px 16px", fontWeight: 700, color: "#d0c290" }}>Total</td>
                      <td style={{ padding: "12px 16px" }}></td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "#d0c290" }}>{totalSold}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "#d0c290" }}>${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "#d0c290" }}>{totalViews}</td>
                      <td style={{ padding: "12px 16px" }}></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
