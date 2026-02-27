"use client";

import { useEffect, useState } from "react";
import { getCookie } from "@/lib/cookies";
import Link from "next/link";

type Template = {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  category: string;
  is_system: boolean;
  created_at: string;
};

const categoryLabels: Record<string, string> = {
  welcome: "FWB Welcome",
  know_before_show: "Know Before the Show",
  post_show_survey: "Post-Show Survey",
  we_hope_you_enjoyed: "We Hope You Enjoyed",
  last_chance: "Last Chance Tickets",
  event_announcement: "Event Announcement",
  custom: "Custom",
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", subject: "", body_html: "", category: "custom" });

  const venueId = getCookie("venue-id") || "";

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const params = venueId ? `?venue_id=${venueId}` : "";
    fetch(`/api/email-templates${params}`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setTemplates(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [venueId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const method = editingId ? "PUT" : "POST";
      const body = editingId
        ? { id: editingId, ...form }
        : { venue_id: venueId || null, ...form };

      const res = await fetch("/api/email-templates", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const saved = await res.json();
        if (editingId) {
          setTemplates(templates.map((t) => (t.id === editingId ? saved : t)));
        } else {
          setTemplates([saved, ...templates]);
        }
        resetForm();
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    const res = await fetch(`/api/email-templates?id=${id}`, { method: "DELETE" });
    if (res.ok) setTemplates(templates.filter((t) => t.id !== id));
  };

  const startEdit = (t: Template) => {
    setEditingId(t.id);
    setForm({ name: t.name, subject: t.subject, body_html: t.body_html, category: t.category });
    setShowForm(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({ name: "", subject: "", body_html: "", category: "custom" });
    setShowForm(false);
  };

  return (
    <div className="admin-form-page">
      <Link href="/admin/venue-marketing" style={{ color: "rgba(208,194,144,0.7)", textDecoration: "none", fontSize: 13 }}>← Venue Marketing</Link>
      <h1 className="admin-page-title" style={{ marginTop: 8 }}>Email Templates</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>
        Create reusable email templates. Use <code style={{ color: "#d0c290" }}>{"{{first_name}}"}</code> for personalization.
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => { resetForm(); setShowForm(!showForm); }} className="admin-form-submit" style={{ padding: "10px 20px", fontSize: 13 }}>
          {showForm ? "Cancel" : "+ New Email Template"}
        </button>
        {templates.length === 0 && (
          <button
            onClick={async () => {
              const params = venueId ? `?venue_id=${venueId}` : "";
              const res = await fetch(`/api/email-templates/seed${params}`, { method: "POST" });
              if (res.ok) {
                const result = await res.json();
                if (result.count > 0) {
                  // Reload templates
                  const reloadParams = venueId ? `?venue_id=${venueId}` : "";
                  const reloaded = await fetch(`/api/email-templates${reloadParams}`).then((r) => r.json());
                  if (Array.isArray(reloaded)) setTemplates(reloaded);
                }
              }
            }}
            style={{ padding: "10px 20px", fontSize: 13, background: "rgba(208,194,144,0.1)", color: "#d0c290", border: "1px solid rgba(208,194,144,0.2)", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}
          >
            Seed Default Templates
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="admin-form" style={{ marginBottom: 24 }}>
          <div className="admin-form-grid">
            <label className="admin-form-label">
              Template Name *
              <input type="text" className="admin-form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Know Before the Show" />
            </label>
            <label className="admin-form-label">
              Category
              <select className="admin-form-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <label className="admin-form-label" style={{ marginTop: 8 }}>
            Subject Line *
            <input type="text" className="admin-form-input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required placeholder="e.g. Hey {{first_name}}, here's what you need to know!" />
          </label>
          <label className="admin-form-label" style={{ marginTop: 8 }}>
            Email Body (HTML) *
            <textarea
              className="admin-form-input"
              value={form.body_html}
              onChange={(e) => setForm({ ...form, body_html: e.target.value })}
              required
              rows={12}
              style={{ fontFamily: "monospace", fontSize: 12, resize: "vertical" }}
              placeholder={`<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n  <h1>Hey {{first_name}}!</h1>\n  <p>Your email content here...</p>\n</div>`}
            />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="submit" className="admin-form-submit" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update Template" : "Create Template"}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} style={{ padding: "10px 20px", fontSize: 13, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, cursor: "pointer" }}>
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      )}

      {/* Preview area */}
      {showForm && form.body_html && (
        <div style={{ background: "#fff", borderRadius: 12, padding: 20, marginBottom: 24, maxWidth: 640 }}>
          <p style={{ fontSize: 11, color: "#666", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>Preview</p>
          <div dangerouslySetInnerHTML={{ __html: form.body_html.replace(/\{\{first_name\}\}/g, "Matt") }} />
        </div>
      )}

      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading templates...</p>
      ) : templates.length === 0 ? (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>No templates yet. Create your first one above.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {templates.map((t) => (
            <div key={t.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ color: "#fff", fontSize: 15, margin: "0 0 4px", fontWeight: 600 }}>{t.name}</h3>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: 0 }}>
                    Subject: {t.subject} · {categoryLabels[t.category] || t.category}
                    {t.is_system && <span style={{ color: "rgba(208,194,144,0.6)", marginLeft: 8 }}>System</span>}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => startEdit(t)} style={{ padding: "6px 12px", fontSize: 12, background: "rgba(208,194,144,0.1)", color: "#d0c290", border: "none", borderRadius: 6, cursor: "pointer" }}>Edit</button>
                  {!t.is_system && (
                    <button onClick={() => handleDelete(t.id)} style={{ padding: "6px 12px", fontSize: 12, background: "rgba(255,80,80,0.1)", color: "rgba(255,80,80,0.8)", border: "none", borderRadius: 6, cursor: "pointer" }}>Delete</button>
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
