"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type EventOption = { id: string; title: string };

export default function AdminEditSponsorPage() {
  const router = useRouter();
  const { id } = useParams() as { id: string };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<EventOption[]>([]);

  const [form, setForm] = useState({
    name: "",
    logo_url: "",
    website_url: "",
    tier: "supporting",
    event_id: "",
  });

  useEffect(() => {
    Promise.all([
      fetch(`/api/sponsors/${id}`).then((r) => r.json()),
      fetch("/api/events").then((r) => r.json()),
    ])
      .then(([sponsor, eventsData]) => {
        if (sponsor.error) {
          setError(sponsor.error);
          return;
        }
        setForm({
          name: sponsor.name || "",
          logo_url: sponsor.logo_url || "",
          website_url: sponsor.website_url || "",
          tier: sponsor.tier || "supporting",
          event_id: sponsor.event_id || "",
        });
        if (Array.isArray(eventsData)) setEvents(eventsData);
      })
      .catch(() => setError("Failed to load partner"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const res = await fetch(`/api/sponsors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          logo_url: form.logo_url || null,
          website_url: form.website_url || null,
          tier: form.tier,
          event_id: form.event_id || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update partner");
      }

      router.push("/admin/sponsors");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update partner");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Edit Partner</h1>
        <p style={{ color: "rgba(255,255,255,0.5)", padding: "40px 0" }}>
          Loading…
        </p>
      </div>
    );
  }

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Edit Partner</h1>

      <form className="admin-form" onSubmit={handleSubmit}>
        {error && <div className="admin-form-error">{error}</div>}

        <div className="admin-form-grid">
          <label className="admin-form-label">
            Partner Name *
            <input
              type="text"
              name="name"
              className="admin-form-input"
              value={form.name}
              onChange={handleChange}
              required
            />
          </label>

          <label className="admin-form-label">
            Tier *
            <select
              name="tier"
              className="admin-form-input"
              value={form.tier}
              onChange={handleChange}
            >
              <option value="title">🏆 Title Partner</option>
              <option value="presenting">⭐ Presenting Partner</option>
              <option value="supporting">🤝 Supporting Partner</option>
            </select>
          </label>

          <label className="admin-form-label">
            Logo URL
            <input
              type="url"
              name="logo_url"
              className="admin-form-input"
              value={form.logo_url}
              onChange={handleChange}
              placeholder="https://example.com/logo.png"
            />
          </label>

          <label className="admin-form-label">
            Website URL
            <input
              type="url"
              name="website_url"
              className="admin-form-input"
              value={form.website_url}
              onChange={handleChange}
              placeholder="https://example.com"
            />
          </label>

          <label className="admin-form-label admin-form-full">
            Assign to Event
            <select
              name="event_id"
              className="admin-form-input"
              value={form.event_id}
              onChange={handleChange}
            >
              <option value="">— No specific event (global) —</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="submit"
          className="admin-form-submit"
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}
