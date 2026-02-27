"use client";

import { getCookie } from "@/lib/cookies";

export default function PartnerDashboardPage() {
  const role = getCookie("user-role");

  if (role && role !== "partner" && role !== "owner") {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Access Denied</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>
          This dashboard is only available to partners.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Partner Dashboard</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 24 }}>
        Your hub for event performance, engagement data, and marketing insights.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {[
          { title: "Event Sales", desc: "Ticket sales by event (quantities)" },
          { title: "Email Performance", desc: "Open rates, click-through rates for your campaigns" },
          { title: "Engagement Data", desc: "Page views, conversion rates, unique visitors" },
          { title: "Location Heatmap", desc: "Geographic distribution of ticket buyers" },
          { title: "Landing Page Metrics", desc: "Views and click-throughs on partner pages" },
        ].map((item) => (
          <div
            key={item.title}
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: "24px 20px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ color: "#d0c290", fontSize: 16, margin: 0, fontWeight: 600 }}>{item.title}</h3>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                color: "rgba(208,194,144,0.7)",
                background: "rgba(208,194,144,0.1)",
                padding: "3px 8px",
                borderRadius: 6,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}>
                Coming Soon
              </span>
            </div>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
