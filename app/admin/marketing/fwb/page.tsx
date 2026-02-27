"use client";

import { useEffect, useState, useMemo } from "react";
import { getCookie } from "@/lib/cookies";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import Link from "next/link";

type Subscriber = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  source: string | null;
  venue_id: string | null;
  subscribed_at: string;
  unsubscribed_at: string | null;
};

type FWBEmailKPIs = {
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  total_bounced: number;
  total_failed: number;
  open_rate: string;
  click_rate: string;
  bounce_rate: string;
  daily_sends: { date: string; count: number }[];
  recent_sends: { email: string; name: string; status: string; sent_at: string; opened_at: string | null; clicked_at: string | null }[];
};

export default function FWBPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ sent: number; failed: number; total: number; from_email?: string; errors?: string[] } | null>(null);
  const [emailKpis, setEmailKpis] = useState<FWBEmailKPIs | null>(null);

  const role = getCookie("user-role");
  if (role !== "owner") {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Access Denied</h1>
      </div>
    );
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    fetch("/api/marketing/fwb")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSubscribers(data);
      })
      .finally(() => setLoading(false));

    // Fetch FWB email KPIs
    fetch("/api/marketing/fwb-email-kpis")
      .then((r) => r.json())
      .then((data) => setEmailKpis(data))
      .catch(() => {});
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const filtered = useMemo(() => {
    if (!search.trim()) return subscribers;
    const q = search.toLowerCase();
    return subscribers.filter(
      (s) =>
        s.first_name?.toLowerCase().includes(q) ||
        s.last_name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.source?.toLowerCase().includes(q)
    );
  }, [subscribers, search]);

  // Growth data: signups per month
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const monthlyGrowth = useMemo(() => {
    const months: Record<string, number> = {};
    subscribers.forEach((s) => {
      const d = new Date(s.subscribed_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months[key] = (months[key] || 0) + 1;
    });
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));
  }, [subscribers]);

  const exportCSV = async () => {
    const Papa = (await import("papaparse")).default;
    const csv = Papa.unparse(
      filtered.map((s) => ({
        "First Name": s.first_name,
        "Last Name": s.last_name,
        Email: s.email,
        Source: s.source || "homepage",
        "Subscribed At": new Date(s.subscribed_at).toLocaleDateString(),
        Status: s.unsubscribed_at ? "Unsubscribed" : "Active",
      }))
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fwb-subscribers-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Friends With Benefits — Subscribers", 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Exported: ${new Date().toLocaleString()} · Total: ${filtered.length}`, 14, 30);

    autoTable(doc, {
      startY: 36,
      head: [["First Name", "Last Name", "Email", "Source", "Subscribed", "Status"]],
      body: filtered.map((s) => [
        s.first_name,
        s.last_name,
        s.email,
        s.source || "homepage",
        new Date(s.subscribed_at).toLocaleDateString(),
        s.unsubscribed_at ? "Unsubscribed" : "Active",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [208, 194, 144], textColor: [11, 13, 29] },
    });

    doc.save(`fwb-subscribers-${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const sendWelcomeToAll = async () => {
    if (!confirm(`Send the FWB Welcome email to all ${subscribers.filter((s) => !s.unsubscribed_at).length} active subscribers?`)) return;
    setBulkSending(true);
    setBulkResult(null);
    try {
      const supabase = getSupabaseBrowser();
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) {
        alert("Not authenticated. Please log in again.");
        return;
      }
      const res = await fetch("/api/newsletter/send-welcome", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to send emails");
      } else {
        setBulkResult({ sent: data.sent, failed: data.failed, total: data.total, from_email: data.from_email, errors: data.errors });
      }
    } catch {
      alert("Network error — check console");
    } finally {
      setBulkSending(false);
    }
  };

  return (
    <div className="admin-form-page">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <Link href="/admin/marketing" style={{ color: "rgba(208,194,144,0.7)", textDecoration: "none", fontSize: 13 }}>
          ← Marketing Hub
        </Link>
      </div>
      <h1 className="admin-page-title">Friends With Benefits</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>
        {subscribers.length} total subscribers · {subscribers.filter((s) => !s.unsubscribed_at).length} active
      </p>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "16px 14px" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#d0c290" }}>{subscribers.length}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Total Signups</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "16px 14px" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#d0c290" }}>{subscribers.filter((s) => !s.unsubscribed_at).length}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Active</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "16px 14px" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#d0c290" }}>
            {monthlyGrowth.length > 0 ? monthlyGrowth[monthlyGrowth.length - 1].count : 0}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>This Month</div>
        </div>
      </div>

      {/* Growth chart */}
      {monthlyGrowth.length > 1 && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ color: "#d0c290", fontSize: 14, margin: "0 0 12px", fontWeight: 600 }}>Signups Over Time</h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120 }}>
            {monthlyGrowth.map((m) => {
              const maxCount = Math.max(...monthlyGrowth.map((g) => g.count));
              const height = maxCount > 0 ? (m.count / maxCount) * 100 : 0;
              return (
                <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>{m.count}</span>
                  <div style={{
                    width: "100%",
                    maxWidth: 40,
                    height: `${Math.max(height, 4)}%`,
                    background: "linear-gradient(to top, rgba(208,194,144,0.3), rgba(208,194,144,0.7))",
                    borderRadius: "4px 4px 0 0",
                  }} />
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>{m.month.split("-")[1]}/{m.month.split("-")[0].slice(2)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Email KPIs Dashboard ── */}
      {emailKpis && emailKpis.total_sent > 0 && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ color: "#d0c290", fontSize: 14, margin: "0 0 16px", fontWeight: 600 }}>Welcome Email Performance</h3>
          
          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "12px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#d0c290" }}>{emailKpis.total_sent}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Sent</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "12px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "rgba(100,149,237,0.9)" }}>{emailKpis.total_delivered}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Delivered</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "12px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "rgba(80,200,120,0.9)" }}>{emailKpis.open_rate}%</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Open Rate</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>avg ~20%</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "12px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "rgba(208,194,144,0.9)" }}>{emailKpis.click_rate}%</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Click Rate</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>avg ~2.5%</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "12px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: emailKpis.total_bounced > 0 ? "rgba(255,80,80,0.9)" : "rgba(80,200,120,0.9)" }}>{emailKpis.bounce_rate}%</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Bounce Rate</div>
            </div>
            {emailKpis.total_failed > 0 && (
              <div style={{ background: "rgba(255,80,80,0.05)", borderRadius: 8, padding: "12px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,80,80,0.9)" }}>{emailKpis.total_failed}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Failed</div>
              </div>
            )}
          </div>

          {/* Email Funnel */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {[
              { label: "Sent", value: emailKpis.total_sent, color: "rgba(255,255,255,0.15)" },
              { label: "Delivered", value: emailKpis.total_delivered, color: "rgba(100,149,237,0.35)" },
              { label: "Opened", value: emailKpis.total_opened, color: "rgba(80,200,120,0.35)" },
              { label: "Clicked", value: emailKpis.total_clicked, color: "rgba(208,194,144,0.45)" },
            ].map((step) => {
              const pct = emailKpis.total_sent > 0 ? (step.value / emailKpis.total_sent) * 100 : 0;
              return (
                <div key={step.label} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ height: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                    <div style={{ width: "80%", height: `${Math.max(pct, 5)}%`, background: step.color, borderRadius: "4px 4px 0 0" }} />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginTop: 6 }}>{step.value}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{step.label}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>{pct.toFixed(1)}%</div>
                </div>
              );
            })}
          </div>

          {/* Recent Sends */}
          {emailKpis.recent_sends.length > 0 && (
            <div>
              <h4 style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 600, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Recent Welcome Emails</h4>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, fontSize: 10 }}>Recipient</th>
                      <th style={{ ...thStyle, fontSize: 10 }}>Status</th>
                      <th style={{ ...thStyle, fontSize: 10 }}>Sent</th>
                      <th style={{ ...thStyle, fontSize: 10 }}>Opened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emailKpis.recent_sends.map((s, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ ...tdStyle, fontSize: 12 }}>{s.email}</td>
                        <td style={{ ...tdStyle, fontSize: 12 }}>
                          <span style={{
                            fontSize: 10, padding: "2px 8px", borderRadius: 6,
                            background: s.status === "opened" || s.status === "clicked" ? "rgba(80,200,120,0.1)" :
                              s.status === "delivered" ? "rgba(100,149,237,0.1)" :
                              s.status === "sent" ? "rgba(255,255,255,0.05)" :
                              s.status === "failed" || s.status === "bounced" ? "rgba(255,80,80,0.1)" : "rgba(255,255,255,0.05)",
                            color: s.status === "opened" || s.status === "clicked" ? "rgba(80,200,120,0.8)" :
                              s.status === "delivered" ? "rgba(100,149,237,0.8)" :
                              s.status === "sent" ? "rgba(255,255,255,0.5)" :
                              s.status === "failed" || s.status === "bounced" ? "rgba(255,80,80,0.8)" : "rgba(255,255,255,0.4)",
                          }}>
                            {s.status}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{new Date(s.sent_at).toLocaleDateString()}</td>
                        <td style={{ ...tdStyle, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{s.opened_at ? new Date(s.opened_at).toLocaleDateString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search + Export */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          className="admin-form-input"
          placeholder="Search by name, email, or source..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, maxWidth: 400 }}
        />
        <button onClick={exportCSV} className="admin-form-submit" style={{ padding: "10px 20px", fontSize: 13 }}>
          Export CSV
        </button>
        <button onClick={exportPDF} className="admin-form-submit" style={{ padding: "10px 20px", fontSize: 13, background: "rgba(208,194,144,0.15)", color: "#d0c290" }}>
          Export PDF
        </button>
        <button
          onClick={sendWelcomeToAll}
          disabled={bulkSending || subscribers.filter((s) => !s.unsubscribed_at).length === 0}
          className="admin-form-submit"
          style={{ padding: "10px 20px", fontSize: 13, background: "rgba(80,200,120,0.15)", color: "rgba(80,200,120,0.9)", border: "1px solid rgba(80,200,120,0.3)" }}
        >
          {bulkSending ? "Sending..." : "Send Welcome Email to All"}
        </button>
      </div>
      {bulkResult && (
        <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 8, background: bulkResult.failed > 0 ? "rgba(255,180,80,0.08)" : "rgba(80,200,120,0.08)", border: `1px solid ${bulkResult.failed > 0 ? "rgba(255,180,80,0.2)" : "rgba(80,200,120,0.2)"}`, fontSize: 13 }}>
          <strong style={{ color: bulkResult.failed > 0 ? "rgba(255,180,80,0.9)" : "rgba(80,200,120,0.9)" }}>Bulk send complete:</strong>{" "}
          <span style={{ color: "rgba(255,255,255,0.7)" }}>
            {bulkResult.sent} of {bulkResult.total} sent successfully
            {bulkResult.failed > 0 && <span style={{ color: "rgba(255,80,80,0.8)" }}> · {bulkResult.failed} failed</span>}
          </span>
          {bulkResult.from_email && (
            <div style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              From: {bulkResult.from_email}
            </div>
          )}
          {bulkResult.errors && bulkResult.errors.length > 0 && (
            <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(255,80,80,0.06)", borderRadius: 6, fontSize: 11, color: "rgba(255,80,80,0.7)" }}>
              {bulkResult.errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </div>
      )}

      {/* Subscriber table */}
      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading subscribers...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>
          {search ? "No subscribers match your search." : "No subscribers yet."}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Source</th>
                <th style={thStyle}>Subscribed</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={tdStyle}>{s.first_name} {s.last_name}</td>
                  <td style={tdStyle}>{s.email}</td>
                  <td style={tdStyle}>
                    <span style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: "rgba(208,194,144,0.1)",
                      color: "rgba(208,194,144,0.8)",
                    }}>
                      {s.source || "homepage"}
                    </span>
                  </td>
                  <td style={tdStyle}>{new Date(s.subscribed_at).toLocaleDateString()}</td>
                  <td style={tdStyle}>
                    <span style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: s.unsubscribed_at ? "rgba(255,80,80,0.1)" : "rgba(80,200,120,0.1)",
                      color: s.unsubscribed_at ? "rgba(255,80,80,0.8)" : "rgba(80,200,120,0.8)",
                    }}>
                      {s.unsubscribed_at ? "Unsubscribed" : "Active"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 600,
  color: "rgba(255,255,255,0.4)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  borderBottom: "1px solid rgba(255,255,255,0.1)",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  color: "rgba(255,255,255,0.7)",
};
