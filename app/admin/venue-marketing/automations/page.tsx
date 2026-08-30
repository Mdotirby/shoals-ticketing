"use client";

import { useEffect, useState } from "react";
import { getCookie } from "@/lib/cookies";
import Link from "next/link";

type Template = { id: string; name: string; category: string };
type EventOption = { id: string; title: string; date: string };
type Rule = {
  id: string;
  trigger_type: string;
  days_offset: number;
  send_time: string;
  is_active: boolean;
  applies_to: string;
  event_id: string | null;
  template_id: string;
  email_templates?: { name: string; subject: string; category: string } | null;
  events?: { title: string; date: string } | null;
};

export default function AutomationsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    template_id: "", trigger_type: "after_event", days_offset: "2", send_time: "10:00", event_id: "",
  });

  const venueId = getCookie("venue-id") || "";

  useEffect(() => {
    const params = venueId ? `?venue_id=${venueId}` : "";
    Promise.all([
      fetch(`/api/email-automations${params}`).then((r) => r.json()),
      fetch(`/api/email-templates${params}`).then((r) => r.json()),
      fetch("/api/events?all=1").then((r) => r.json()),
    ]).then(([rulesData, temps, evs]) => {
      if (Array.isArray(rulesData)) setRules(rulesData);
      if (Array.isArray(temps)) setTemplates(temps);
      if (Array.isArray(evs)) setEvents(evs.map((e: EventOption) => ({ id: e.id, title: e.title, date: e.date })));
    }).finally(() => setLoading(false));
  }, [venueId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/email-automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venue_id: venueId || null,
          template_id: form.template_id,
          trigger_type: form.trigger_type,
          days_offset: parseInt(form.days_offset) || 1,
          send_time: form.send_time,
          event_id: form.event_id || null,
        }),
      });
      if (res.ok) {
        const newRule = await res.json();
        setRules([newRule, ...rules]);
        setShowForm(false);
        setForm({ template_id: "", trigger_type: "after_event", days_offset: "2", send_time: "10:00", event_id: "" });
      }
    } finally { setSaving(false); }
  };

  const toggleActive = async (rule: Rule) => {
    const res = await fetch("/api/email-automations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, is_active: !rule.is_active }),
    });
    if (res.ok) {
      setRules(rules.map((r) => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this automation rule?")) return;
    const res = await fetch(`/api/email-automations?id=${id}`, { method: "DELETE" });
    if (res.ok) setRules(rules.filter((r) => r.id !== id));
  };

  return (
    <div className="admin-form-page">
      <Link href="/admin/venue-marketing" style={{ color: "rgba(255, 255, 255, 0.7)", textDecoration: "none", fontSize: 13 }}>← Venue Marketing</Link>
      <h1 className="admin-page-title" style={{ marginTop: 8 }}>Email Automations</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>
        Set up automated emails before or after events. E.g., send a survey 2 days after every show at 10am.
      </p>

      <button onClick={() => setShowForm(!showForm)} className="admin-form-submit" style={{ marginBottom: 16, padding: "10px 20px", fontSize: 13 }}>
        {showForm ? "Cancel" : "+ New Automation Rule"}
      </button>

      {showForm && (
        <form onSubmit={handleCreate} className="admin-form" style={{ marginBottom: 24 }}>
          <div className="admin-form-grid">
            <label className="admin-form-label">
              Email Template *
              <select className="admin-form-input" value={form.template_id} onChange={(e) => setForm({ ...form, template_id: e.target.value })} required>
                <option value="">— Select template —</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="admin-form-label">
              Trigger
              <select className="admin-form-input" value={form.trigger_type} onChange={(e) => setForm({ ...form, trigger_type: e.target.value })}>
                <option value="before_event">Before Event</option>
                <option value="after_event">After Event</option>
              </select>
            </label>
            <label className="admin-form-label">
              Days {form.trigger_type === "before_event" ? "Before" : "After"}
              <input type="number" className="admin-form-input" value={form.days_offset} onChange={(e) => setForm({ ...form, days_offset: e.target.value })} min="0" max="30" />
            </label>
            <label className="admin-form-label">
              Send Time
              <input type="time" className="admin-form-input" value={form.send_time} onChange={(e) => setForm({ ...form, send_time: e.target.value })} />
            </label>
            <label className="admin-form-label">
              Specific Event (optional)
              <select className="admin-form-input" value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value })}>
                <option value="">All Events</option>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title} ({new Date(ev.date).toLocaleDateString()})</option>)}
              </select>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Leave blank to apply to all events</span>
            </label>
          </div>

          {/* Preview */}
          <div style={{ background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: 8, padding: 12, marginTop: 12, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
            Preview: Send <strong>{templates.find((t) => t.id === form.template_id)?.name || "..."}</strong> at <strong>{form.send_time}</strong>, <strong>{form.days_offset}</strong> day(s) <strong>{form.trigger_type === "before_event" ? "before" : "after"}</strong> {form.event_id ? events.find((e) => e.id === form.event_id)?.title || "event" : "every event"}
          </div>

          <button type="submit" className="admin-form-submit" disabled={saving} style={{ marginTop: 12 }}>
            {saving ? "Saving..." : "Create Automation"}
          </button>
        </form>
      )}

      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading automations...</p>
      ) : rules.length === 0 ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>No automation rules yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {rules.map((r) => (
            <div key={r.id} style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${r.is_active ? "rgba(80,200,120,0.2)" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 12,
              padding: "16px 20px",
              opacity: r.is_active ? 1 : 0.6,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ color: "#fff", fontSize: 15, margin: "0 0 4px", fontWeight: 600 }}>
                    {r.email_templates?.name || "Unknown Template"}
                  </h3>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: 0 }}>
                    {r.days_offset} day(s) {r.trigger_type === "before_event" ? "before" : "after"} event · at {r.send_time}
                    {r.events ? ` · ${r.events.title}` : " · All events"}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={() => toggleActive(r)}
                    style={{
                      padding: "6px 14px", fontSize: 12, border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600,
                      background: r.is_active ? "rgba(80,200,120,0.1)" : "rgba(255,255,255,0.05)",
                      color: r.is_active ? "rgba(80,200,120,0.8)" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    {r.is_active ? "Active" : "Paused"}
                  </button>
                  <button onClick={() => handleDelete(r.id)} style={{ padding: "6px 12px", fontSize: 12, background: "rgba(255,80,80,0.1)", color: "rgba(255,80,80,0.8)", border: "none", borderRadius: 6, cursor: "pointer" }}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
