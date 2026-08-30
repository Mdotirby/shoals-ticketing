"use client";

import { useState } from "react";
import { getCookie } from "@/lib/cookies";
import Link from "next/link";

export default function VenueMarketingPage() {
  const role = getCookie("user-role");
  const allowed = ["owner", "venue_admin", "full_admin"];
  const [activeTab] = useState("overview");

  if (role && !allowed.includes(role)) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Access Denied</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>You do not have access to venue marketing tools.</p>
      </div>
    );
  }

  const sections = [
    { key: "templates", label: "Email Templates", href: "/admin/venue-marketing/templates", desc: "Create and manage reusable email templates with a rich editor", icon: "" },
    { key: "campaigns", label: "Campaigns", href: "/admin/venue-marketing/campaigns", desc: "Send targeted emails to event buyers and FWB subscribers", icon: "" },
    { key: "automations", label: "Automations", href: "/admin/venue-marketing/automations", desc: "Schedule pre/post-show emails automatically", icon: "" },
  ];

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Venue Marketing</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 24 }}>
        Email campaigns, templates, and automations for your venue.
      </p>

      {activeTab === "overview" && (
        <div className="admin-marketing-grid">
          {sections.map((s) => (
            <Link
              key={s.key}
              href={s.href}
              style={{
                display: "block",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                padding: "24px 20px",
                textDecoration: "none",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                e.currentTarget.style.background = "rgba(255,255,255,0.03)";
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
              <h3 style={{ color: "#ffffff", fontSize: 16, margin: "0 0 8px", fontWeight: 600 }}>{s.label}</h3>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>{s.desc}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
