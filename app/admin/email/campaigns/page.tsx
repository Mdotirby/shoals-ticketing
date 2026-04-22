"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";

type Campaign = {
  id: string;
  name: string;
  subject: string;
  status: string;
  performance_tier: string | null;
  total_recipients: number;
  total_sent: number;
  sent_at: string | null;
  scheduled_at: string | null;
  ee_segments: { name: string } | null;
  events: { title: string; date: string } | null;
  ee_campaign_metrics: { delivered: number; open_rate: number | null; click_rate: number | null; conversion_rate: number | null; revenue: number }[] | null;
};

const statusColor: Record<string, string> = {
  draft: "rgba(255,255,255,0.4)",
  scheduled: "rgba(100,149,237,0.85)",
  sending: "rgba(255,186,100,0.85)",
  sent: "rgba(80,200,120,0.85)",
  paused: "rgba(255,200,100,0.6)",
  failed: "rgba(255,100,100,0.85)",
  cancelled: "rgba(255,255,255,0.35)",
};

const tierBadge: Record<string, { bg: string; color: string; label: string }> = {
  high_performer: { bg: "rgba(80,200,120,0.15)", color: "rgba(80,200,120,0.9)", label: "High performer" },
  low_engagement: { bg: "rgba(255,186,100,0.15)", color: "rgba(255,186,100,0.9)", label: "Low engagement" },
  low_conversion: { bg: "rgba(255,140,100,0.15)", color: "rgba(255,140,100,0.9)", label: "Low conversion" },
  normal: { bg: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.45)", label: "Normal" },
};

export default function CampaignsListPage() {
  const venueId = getCookie("venue-id") || "";
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  const load = () => {
    const q = venueId ? `?venue_id=${venueId}` : "";
    fetch(`/api/email-engine/campaigns${q}`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setCampaigns(d); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [venueId]);

  const handleSend = async (id: string) => {
    if (!confirm("Enqueue this campaign for delivery? The queue worker will send over the next few minutes.")) return;
    setSending(id);
    try {
      const res = await fetch(`/api/email-engine/campaigns/${id}/send`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) { alert(json.error || "Send failed"); return; }
      alert(`Enqueued ${json.enqueued} recipients (${json.suppressed} suppressed).`);
      load();
    } finally { setSending(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this campaign? This cannot be undone.")) return;
    const res = await fetch(`/api/email-engine/campaigns/${id}`, { method: "DELETE" });
    if (res.ok) load();
  };

  return (
    <div className="admin-form-page">
      <Link href="/admin/email" style={{ color: "rgba(208,194,144,0.7)", textDecoration: "none", fontSize: 13 }}>← Email Engine</Link>
      <h1 className="admin-page-title" style={{ marginTop: 8 }}>Campaigns</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>
        One-off and scheduled broadcasts. Each campaign targets a single dynamic segment.
      </p>

      <div style={{ marginBottom: 20 }}>
        <Link href="/admin/email/campaigns/new" className="admin-form-submit" style={{ display: "inline-block", padding: "10px 20px", fontSize: 13, textDecoration: "none" }}>
          + New Campaign
        </Link>
      </div>

      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading…</p>
      ) : campaigns.length === 0 ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>No campaigns yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {campaigns.map((c) => {
            const m = c.ee_campaign_metrics?.[0];
            return (
              <div key={c.id} style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                padding: "14px 18px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 260px" }}>
                    <Link href={`/admin/email/campaigns/${c.id}`} style={{ color: "#fff", fontSize: 15, fontWeight: 600, textDecoration: "none" }}>
                      {c.name}
                    </Link>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 2 }}>
                      <span style={{ color: statusColor[c.status] ?? "rgba(255,255,255,0.4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{c.status}</span>
                      {c.ee_segments?.name && <> · {c.ee_segments.name}</>}
                      {c.events?.title && <> · {c.events.title}</>}
                      {c.sent_at && <> · Sent {new Date(c.sent_at).toLocaleDateString()}</>}
                      {c.scheduled_at && !c.sent_at && <> · Scheduled {new Date(c.scheduled_at).toLocaleString()}</>}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 4 }}>{c.subject}</div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {m && (
                      <MiniStats
                        delivered={m.delivered}
                        open_rate={m.open_rate}
                        click_rate={m.click_rate}
                        conversion_rate={m.conversion_rate}
                        revenue={m.revenue}
                      />
                    )}
                    {c.performance_tier && tierBadge[c.performance_tier] && (
                      <span style={{
                        fontSize: 11, padding: "3px 10px", borderRadius: 6, fontWeight: 600,
                        background: tierBadge[c.performance_tier].bg,
                        color: tierBadge[c.performance_tier].color,
                      }}>
                        {tierBadge[c.performance_tier].label}
                      </span>
                    )}
                    {c.status === "draft" && (
                      <button onClick={() => handleSend(c.id)} disabled={sending === c.id}
                        style={{ padding: "6px 14px", fontSize: 12, background: "rgba(208,194,144,0.15)", color: "#d0c290", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
                        {sending === c.id ? "Queueing…" : "Send"}
                      </button>
                    )}
                    {(c.status === "draft" || c.status === "scheduled" || c.status === "cancelled" || c.status === "failed") && (
                      <button onClick={() => handleDelete(c.id)}
                        style={{ padding: "6px 10px", fontSize: 12, background: "transparent", color: "rgba(255,100,100,0.6)", border: "1px solid rgba(255,100,100,0.2)", borderRadius: 6, cursor: "pointer" }}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniStats({ delivered, open_rate, click_rate, conversion_rate, revenue }: {
  delivered: number; open_rate: number | null; click_rate: number | null; conversion_rate: number | null; revenue: number;
}) {
  const pct = (n: number | null) => n === null ? "—" : `${(n * 100).toFixed(1)}%`;
  return (
    <div style={{ display: "flex", gap: 12, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
      <div><strong style={{ color: "#fff" }}>{delivered}</strong> sent</div>
      <div>open <strong style={{ color: "#fff" }}>{pct(open_rate)}</strong></div>
      <div>click <strong style={{ color: "#fff" }}>{pct(click_rate)}</strong></div>
      <div>conv <strong style={{ color: "#fff" }}>{pct(conversion_rate)}</strong></div>
      <div>${Number(revenue || 0).toFixed(0)}</div>
    </div>
  );
}
