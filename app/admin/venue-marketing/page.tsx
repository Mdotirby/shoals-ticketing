"use client";

import { getCookie } from "@/lib/cookies";

export default function VenueMarketingPage() {
  const role = getCookie("user-role");
  const allowed = ["owner", "venue_admin", "full_admin"];

  if (role && !allowed.includes(role)) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Access Denied</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>
          You do not have access to venue marketing tools.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Venue Marketing</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 24 }}>
        Email campaigns, templates, automations, and retargeting tools for your venue.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {[
          { title: "Email Templates", desc: "Create and manage reusable email templates", status: "Coming Soon" },
          { title: "Campaigns", desc: "Send targeted emails to event buyers and subscribers", status: "Coming Soon" },
          { title: "Automations", desc: "Schedule automated pre/post-show emails", status: "Coming Soon" },
          { title: "Customer Data", desc: "Site views, conversion rates, visitor analytics", status: "Coming Soon" },
          { title: "Retargeting", desc: "Pixel tracking, exit-intent popups, cart abandonment", status: "Coming Soon" },
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
                {item.status}
              </span>
            </div>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
