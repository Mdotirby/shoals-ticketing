"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";

type Flow = {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  segment_id: string | null;
  is_active: boolean;
  steps: Array<{ delay_minutes: number; subject: string }>;
  ee_segments: { name: string } | null;
  updated_at: string;
};

type Segment = { id: string; name: string };

const TRIGGER_LABELS: Record<string, string> = {
  new_event_announcement: "New event announcement",
  cart_abandonment: "Cart abandonment",
  post_event_followup: "Post-event follow-up",
  repeat_buyer_nurture: "Repeat-buyer nurture",
  welcome_series: "Welcome series",
  reengagement: "Re-engagement",
};

const STARTER_STEP = {
  delay_minutes: 0,
  subject: "Thanks for coming to {{event_name}}",
  content_html: "<p>Hi {{first_name}},</p><p>Thanks for coming out.</p>",
};

export default function AutomationsListPage() {
  const venueId = getCookie("venue-id") || "";
  const [flows, setFlows] = useState<Flow[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    description: "",
    trigger_type: "post_event_followup",
    segment_id: "",
    config_json: "{}",
    steps: JSON.stringify([STARTER_STEP], null, 2),
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    const q = venueId ? `?venue_id=${venueId}` : "";
    Promise.all([
      fetch(`/api/email-engine/automations${q}`).then((r) => r.json()),
      fetch(`/api/email-engine/segments${q}`).then((r) => r.json()),
    ]).then(([f, s]) => {
      if (Array.isArray(f)) setFlows(f);
      if (Array.isArray(s)) setSegments(s);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [venueId]);

  const handleToggle = async (f: Flow) => {
    await fetch(`/api/email-engine/automations/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !f.is_active }),
    });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this automation? Running drips will stop immediately.")) return;
    await fetch(`/api/email-engine/automations/${id}`, { method: "DELETE" });
    load();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let steps: unknown = [];
      let config: unknown = {};
      try { steps = JSON.parse(form.steps); }
      catch { alert("Steps must be valid JSON array"); setSaving(false); return; }
      try { config = JSON.parse(form.config_json || "{}"); }
      catch { alert("Config must be valid JSON"); setSaving(false); return; }

      const res = await fetch("/api/email-engine/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venue_id: venueId || null,
          name: form.name,
          description: form.description,
          trigger_type: form.trigger_type,
          segment_id: form.segment_id || null,
          steps,
          config,
          is_active: form.is_active,
        }),
      });
      const j = await res.json();
      if (!res.ok) { alert(j.error || "Save failed"); return; }
      setShowForm(false);
      setForm({ ...form, name: "", description: "" });
      load();
    } finally { setSaving(false); }
  };

  return (
    <div className="admin-form-page">
      <Link href="/admin/email" style={{ color: "rgba(208,194,144,0.7)", textDecoration: "none", fontSize: 13 }}>← Email Engine</Link>
      <h1 className="admin-page-title" style={{ marginTop: 8 }}>Automations</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>
        Event-triggered flows: cart recovery, post-event follow-up, repeat-buyer nurture, welcome series, re-engagement.
      </p>

      <button onClick={() => setShowForm(!showForm)} className="admin-form-submit" style={{ padding: "10px 20px", fontSize: 13, marginBottom: 16 }}>
        {showForm ? "Cancel" : "+ New Automation"}
      </button>

      {showForm && (
        <div className="admin-form" style={{ marginBottom: 24 }}>
          <div className="admin-form-grid">
            <label className="admin-form-label">Name *
              <input className="admin-form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="admin-form-label">Description
              <input className="admin-form-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="admin-form-label">Trigger *
              <select className="admin-form-input" value={form.trigger_type} onChange={(e) => setForm({ ...form, trigger_type: e.target.value })}>
                {Object.entries(TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="admin-form-label">Segment (for new_event_announcement)
              <select className="admin-form-input" value={form.segment_id} onChange={(e) => setForm({ ...form, segment_id: e.target.value })}>
                <option value="">—</option>
                {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>

          <label className="admin-form-label" style={{ marginTop: 12 }}>
            Steps (JSON array — each step: {"{ delay_minutes, subject, content_html }"})
            <textarea className="admin-form-input" style={{ minHeight: 180, fontFamily: "monospace", fontSize: 12 }}
              value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} />
          </label>
          <label className="admin-form-label">
            Config (JSON — trigger-specific settings, e.g. {"{ \"grace_minutes\": 45 }"})
            <textarea className="admin-form-input" style={{ minHeight: 60, fontFamily: "monospace", fontSize: 12 }}
              value={form.config_json} onChange={(e) => setForm({ ...form, config_json: e.target.value })} />
          </label>

          <div style={{ marginTop: 14 }}>
            <button onClick={handleSave} disabled={saving} className="admin-form-submit" style={{ padding: "10px 20px", fontSize: 13 }}>
              {saving ? "Saving…" : "Save automation"}
            </button>
          </div>
        </div>
      )}

      {loading ? <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading…</p>
        : flows.length === 0 ? <p style={{ color: "rgba(255,255,255,0.4)" }}>No automations yet.</p>
        : (
          <div style={{ display: "grid", gap: 10 }}>
            {flows.map((f) => (
              <div key={f.id} style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                padding: "14px 18px",
                display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10,
              }}>
                <div>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{f.name}</div>
                  <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 4 }}>
                    {TRIGGER_LABELS[f.trigger_type] ?? f.trigger_type}
                    {f.ee_segments?.name && <> · Segment: {f.ee_segments.name}</>}
                    {" · "}{Array.isArray(f.steps) ? f.steps.length : 0} step(s)
                  </div>
                  {f.description && <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "4px 0 0" }}>{f.description}</p>}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={() => handleToggle(f)}
                    style={{
                      padding: "6px 14px", fontSize: 12, borderRadius: 6, cursor: "pointer", fontWeight: 600,
                      background: f.is_active ? "rgba(80,200,120,0.15)" : "rgba(255,255,255,0.06)",
                      color: f.is_active ? "rgba(80,200,120,0.9)" : "rgba(255,255,255,0.6)",
                      border: `1px solid ${f.is_active ? "rgba(80,200,120,0.3)" : "rgba(255,255,255,0.15)"}`,
                    }}>
                    {f.is_active ? "Active" : "Paused"}
                  </button>
                  <button onClick={() => handleDelete(f.id)}
                    style={{ padding: "6px 10px", fontSize: 12, background: "transparent", color: "rgba(255,100,100,0.6)", border: "1px solid rgba(255,100,100,0.2)", borderRadius: 6, cursor: "pointer" }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}
