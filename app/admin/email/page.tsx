"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";

type DashboardStats = {
  campaigns: number;
  sending: number;
  segments: number;
  flows: number;
  active_flows: number;
  queue_pending: number;
};

export default function EmailEngineHomePage() {
  const role = getCookie("user-role");
  const allowed = ["owner", "super_admin", "venue_admin", "full_admin"];
  const venueId = getCookie("venue-id") || "";

  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    // Light polling of summary counters
    const q = venueId ? `?venue_id=${venueId}` : "";
    Promise.all([
      fetch(`/api/email-engine/campaigns${q}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/email-engine/segments${q}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/email-engine/automations${q}`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([camps, segs, flows]) => {
        const sending = Array.isArray(camps) ? camps.filter((c: { status: string }) => c.status === "sending").length : 0;
        const active = Array.isArray(flows) ? flows.filter((f: { is_active: boolean }) => f.is_active).length : 0;
        setStats({
          campaigns: Array.isArray(camps) ? camps.length : 0,
          sending,
          segments: Array.isArray(segs) ? segs.length : 0,
          flows: Array.isArray(flows) ? flows.length : 0,
          active_flows: active,
          queue_pending: 0,
        });
      })
      .catch(() => setStats(null));
  }, [venueId]);

  if (role && !allowed.includes(role)) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Access Denied</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>You do not have access to Email Engine.</p>
      </div>
    );
  }

  const sections = [
    { key: "campaigns", label: "Campaigns", href: "/admin/email/campaigns", desc: "Create, preview, schedule, and send emails." },
    { key: "segments", label: "Segments", href: "/admin/email/segments", desc: "Rule-based audiences auto-built from ticket and engagement data." },
    { key: "automations", label: "Automations", href: "/admin/email/automations", desc: "Event-triggered drip flows: cart recovery, post-show, re-engagement." },
    { key: "metrics", label: "Performance", href: "/admin/email/metrics", desc: "Open, click, conversion, and revenue-per-email." },
    { key: "cohorts", label: "Cohort Exports", href: "/admin/email/cohorts", desc: "Hand off engaged audiences to the Ad Engine." },
  ];

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Email Engine</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>
        Mailchimp-style email marketing, tied to your ticketing and event data.
      </p>

      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 20 }}>
          <StatCard label="Campaigns" value={stats.campaigns} />
          <StatCard label="Sending now" value={stats.sending} />
          <StatCard label="Segments" value={stats.segments} />
          <StatCard label="Flows active" value={`${stats.active_flows}/${stats.flows}`} />
        </div>
      )}

      <div className="admin-marketing-grid">
        {sections.map((s) => (
          <Link key={s.key} href={s.href}
            style={{
              display: "block",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: "24px 20px",
              textDecoration: "none",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(208,194,144,0.3)"; e.currentTarget.style.background = "rgba(208,194,144,0.05)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
          >
            <h3 style={{ color: "#d0c290", fontSize: 16, margin: "0 0 8px", fontWeight: 600 }}>{s.label}</h3>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 10,
      padding: "12px 14px",
    }}>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: "#d0c290", fontSize: 22, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}
