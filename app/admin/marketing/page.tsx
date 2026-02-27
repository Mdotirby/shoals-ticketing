"use client";

import { useState } from "react";
import { getCookie } from "@/lib/cookies";
import Link from "next/link";

const subTabs = [
  { key: "fwb", label: "Friends With Benefits", href: "/admin/marketing/fwb" },
  { key: "email-kpis", label: "Email KPIs", href: "/admin/marketing/email-kpis" },
  { key: "demographics", label: "Demographics & Heatmaps", href: "/admin/marketing/demographics" },
  { key: "lfv", label: "Lifetime Fan Value", href: "/admin/marketing/lfv" },
  { key: "ad-spend", label: "Ad Spend / ROAS", href: "/admin/marketing/ad-spend" },
  { key: "social", label: "Social Performance", href: "/admin/marketing/social" },
];

export default function MarketingHubPage() {
  const role = getCookie("user-role");
  const [activeTab] = useState("overview");

  if (role !== "owner") {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Access Denied</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>
          Only the platform owner can access the marketing hub.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Marketing Hub</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 24 }}>
        Your command center for marketing analytics, email performance, and audience insights.
      </p>

      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {subTabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
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
                e.currentTarget.style.borderColor = "rgba(208,194,144,0.3)";
                e.currentTarget.style.background = "rgba(208,194,144,0.05)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                e.currentTarget.style.background = "rgba(255,255,255,0.03)";
              }}
            >
              <h3 style={{ color: "#d0c290", fontSize: 16, margin: "0 0 8px", fontWeight: 600 }}>{tab.label}</h3>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>
                {tab.key === "fwb" && "Email database signups, export CSV/PDF, growth metrics"}
                {tab.key === "email-kpis" && "Open rates, click-through rates, bounce rates, campaign performance"}
                {tab.key === "demographics" && "Zip code heatmaps, age/gender breakdowns by event"}
                {tab.key === "lfv" && "Customer lifetime value, repeat buyers, fan segments"}
                {tab.key === "ad-spend" && "Digital ad spend tracking, ROAS by platform and event"}
                {tab.key === "social" && "Hashtag performance, social media engagement metrics"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
