"use client";

import { useEffect, useState } from "react";
import { getCookie } from "@/lib/cookies";
import Link from "next/link";

type Template = { id: string; name: string; subject: string };
type EventOption = { id: string; title: string; date: string };
type Campaign = {
  id: string;
  name: string;
  status: string;
  audience_type: string;
  total_recipients: number;
  sent_at: string | null;
  scheduled_at: string | null;
  event_id: string | null;
  template_id: string | null;
  email_templates?: { name: string; subject: string } | null;
  events?: { title: string; date: string } | null;
};

const audienceLabels: Record<string, string> = {
  event_buyers: "Event Ticket Buyers",
  fwb_subscribers: "FWB Subscribers",
  all_customers: "All Customers",
  custom_list: "Custom List",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", template_id: "", event_id: "", audience_type: "event_buyers", subject_override: "",
  });

  const venueId = getCookie("venue-id") || "";

  useEffect(() => {
    const params = venueId ? `?venue_id=${venueId}` : "";
    Promise.all([
      fetch(`/api/email-campaigns${params}`).then((r) => r.json()),
      fetch(`/api/email-templates${params}`).then((r) => r.json()),
      fetch("/api/events?all=1").then((r) => r.json()),
    ]).then(([camps, temps, evs]) => {
      if (Array.isArray(camps)) setCampaigns(camps);
      if (Array.isArray(temps)) setTemplates(temps);
      if (Array.isArray(evs)) setEvents(evs.map((e: EventOption) => ({ id: e.id, title: e.title, date: e.date })));
    }).finally(() => setLoading(false));
  }, [venueId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/email-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue_id: venueId || null, ...form }),
      });
      if (res.ok) {
        const newCamp = await res.json();
        setCampaigns([newCamp, ...campaigns]);
        setShowForm(false);
        setForm({ name: "", template_id: "", event_id: "", audience_type: "event_buyers", subject_override: "" });
      }
    } finally { setSaving(false); }
  };

  const handleSend = async (campId: string) => {
    if (!confirm("Send this campaign now? This will email all recipients immediately.")) return;
    setSending(campId);
    try {
      const res = await fetch(`/api/email-campaigns/${campId}/send`, { method: "POST" });
      const result = await res.json();
      if (res.ok) {
        alert(`Campaign sent! ${result.sent} of ${result.total} emails delivered.`);
        setCampaigns(campaigns.map((c) =>
          c.id === campId ? { ...c, status: "sent", sent_at: new Date().toISOString(), total_recipients: result.sent } : c
        ));
      } else {
        alert(result.error || "Failed to send campaign");
      }
    } finally { setSending(null); }
  };

  const selectedEvent = events.find((e) => e.id === form.event_id);

  return (
    <div className="admin-form-page">
      <Link href="/admin/venue-marketing" style={{ color: "rgba(208,194,144,0.7)", textDecoration: "none", fontSize: 13 }}>← Venue Marketing</Link>
      <h1 className="admin-page-title" style={{ marginTop: 8 }}>Email Campaigns</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>
        Send targeted emails to event buyers or FWB subscribers. Emails are personalized with <code style={{ color: "#d0c290" }}>{"{{first_name}}"}</code>.
      </p>

      <button onClick={() => setShowForm(!showForm)} className="admin-form-submit" style={{ marginBottom: 16, padding: "10px 20px", fontSize: 13 }}>
        {showForm ? "Cancel" : "+ New Campaign"}
      </button>

      {showForm && (
        <form onSubmit={handleCreate} className="admin-form" style={{ marginBottom: 24 }}>
          <div className="admin-form-grid">
            <label className="admin-form-label">
              Campaign Name *
              <input type="text" className="admin-form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Pre-show reminder for Summer Fest" />
            </label>
            <label className="admin-form-label">
              Template *
              <select className="admin-form-input" value={form.template_id} onChange={(e) => setForm({ ...form, template_id: e.target.value })} required>
                <option value="">— Select template —</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.subject})</option>)}
              </select>
            </label>
            <label className="admin-form-label">
              Audience *
              <select className="admin-form-input" value={form.audience_type} onChange={(e) => setForm({ ...form, audience_type: e.target.value })}>
                {Object.entries(audienceLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="admin-form-label">
              Event {form.audience_type === "event_buyers" ? "*" : "(optional)"}
              <select className="admin-form-input" value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value })}
                required={form.audience_type === "event_buyers"}>
                <option value="">— Select event —</option>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title} ({new Date(ev.date).toLocaleDateString()})</option>)}
              </select>
              {selectedEvent && (
                <span style={{ fontSize: 11, color: "rgba(208,194,144,0.6)", marginTop: 4, display: "block" }}>
                  Will auto-populate all ticket buyer emails for this event
                </span>
              )}
            </label>
            <label className="admin-form-label">
              Subject Override (optional)
              <input type="text" className="admin-form-input" value={form.subject_override} onChange={(e) => setForm({ ...form, subject_override: e.target.value })} placeholder="Leave blank to use template subject" />
            </label>
          </div>
          <button type="submit" className="admin-form-submit" disabled={saving} style={{ marginTop: 12 }}>
            {saving ? "Creating..." : "Create Campaign"}
          </button>
        </form>
      )}

      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading campaigns...</p>
      ) : campaigns.length === 0 ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>No campaigns yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {campaigns.map((c) => (
            <div key={c.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ color: "#fff", fontSize: 15, margin: "0 0 4px", fontWeight: 600 }}>{c.name}</h3>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: 0 }}>
                    {c.email_templates?.name || "No template"} · {audienceLabels[c.audience_type] || c.audience_type}
                    {c.events && ` · ${c.events.title}`}
                    {c.sent_at && ` · Sent ${new Date(c.sent_at).toLocaleDateString()} to ${c.total_recipients} recipients`}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{
                    fontSize: 11, padding: "3px 10px", borderRadius: 6, fontWeight: 600,
                    background: c.status === "sent" ? "rgba(80,200,120,0.1)" : c.status === "scheduled" ? "rgba(100,149,237,0.1)" : "rgba(255,255,255,0.05)",
                    color: c.status === "sent" ? "rgba(80,200,120,0.8)" : c.status === "scheduled" ? "rgba(100,149,237,0.8)" : "rgba(255,255,255,0.4)",
                  }}>
                    {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                  </span>
                  {c.status === "draft" && (
                    <button
                      onClick={() => handleSend(c.id)}
                      disabled={sending === c.id}
                      style={{ padding: "6px 14px", fontSize: 12, background: "rgba(208,194,144,0.15)", color: "#d0c290", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
                    >
                      {sending === c.id ? "Sending..." : "Send Now"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
