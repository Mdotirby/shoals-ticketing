"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type EventOption = { id: string; title: string };

export default function AdminCreateSponsorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<EventOption[]>([]);

  const [form, setForm] = useState({
    name: "", logo_url: "", website_url: "", tier: "supporting",
    event_id: "", bio: "", contact_name: "", contact_email: "",
    display_on_homepage: false, is_active: true,
  });

  useEffect(() => {
    fetch("/api/events?all=1")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setEvents(data); })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/sponsors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, logo_url: form.logo_url || null,
          website_url: form.website_url || null, tier: form.tier,
          event_id: form.event_id || null, bio: form.bio || null,
          contact_name: form.contact_name || null,
          contact_email: form.contact_email || null,
          display_on_homepage: form.display_on_homepage,
          is_active: form.is_active,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to create partner");
      router.push("/admin/sponsors");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create partner");
    } finally { setLoading(false); }
  };

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Add Partner</h1>

      <form className="admin-form" onSubmit={handleSubmit}>
        {error && <div className="admin-form-error">{error}</div>}

        <div className="admin-form-grid">
          <label className="admin-form-label">
            Partner Name *
            <input className="admin-form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Coca-Cola" required />
          </label>

          <label className="admin-form-label">
            Tier *
            <select className="admin-form-input" value={form.tier} onChange={e => setForm(p => ({ ...p, tier: e.target.value }))}>
              <option value="title">Title Partner</option>
              <option value="presenting">Presenting Partner</option>
              <option value="supporting">Supporting Partner</option>
            </select>
          </label>

          <label className="admin-form-label">
            Logo URL
            <input className="admin-form-input" type="url" value={form.logo_url} onChange={e => setForm(p => ({ ...p, logo_url: e.target.value }))} placeholder="https://example.com/logo.png" />
          </label>

          <label className="admin-form-label">
            Website URL
            <input className="admin-form-input" type="url" value={form.website_url} onChange={e => setForm(p => ({ ...p, website_url: e.target.value }))} placeholder="https://example.com" />
          </label>

          <label className="admin-form-label">
            Contact Name
            <input className="admin-form-input" value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} placeholder="Primary billing contact" />
          </label>

          <label className="admin-form-label">
            Contact Email
            <input className="admin-form-input" type="email" value={form.contact_email} onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))} placeholder="billing@company.com" />
          </label>

          <label className="admin-form-label admin-form-full">
            Partner Bio
            <textarea
              className="admin-form-input"
              value={form.bio}
              onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
              placeholder="2–3 sentences about this company. Shown publicly on the Our Partners page on hover."
              rows={3}
              style={{ resize: "vertical" }}
            />
          </label>

          <label className="admin-form-label admin-form-full">
            Assign to Event (leave blank for global)
            <select className="admin-form-input" value={form.event_id} onChange={e => setForm(p => ({ ...p, event_id: e.target.value }))}>
              <option value="">— Global sponsor —</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
            </select>
          </label>

          <div className="admin-form-full" style={{ display: "flex", gap: 32, padding: "4px 0" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "#fff" }}>
              <input type="checkbox" checked={form.display_on_homepage} onChange={e => setForm(p => ({ ...p, display_on_homepage: e.target.checked }))} style={{ accentColor: "#d0c290", width: 16, height: 16 }} />
              Show on Homepage
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "#fff" }}>
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} style={{ accentColor: "#d0c290", width: 16, height: 16 }} />
              Active
            </label>
          </div>
        </div>

        <button type="submit" className="admin-form-submit" disabled={loading}>
          {loading ? "Creating..." : "Create Partner"}
        </button>
      </form>
    </div>
  );
}
