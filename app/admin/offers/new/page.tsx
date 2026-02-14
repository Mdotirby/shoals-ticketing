"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminCreateOfferPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    artist_name: "",
    venue: "",
    event_date: "",
    guarantee: "",
    door_split: "",
    merch_split: "",
    terms: "",
    notes: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artist_name: form.artist_name,
          venue: form.venue || null,
          event_date: form.event_date || null,
          guarantee: form.guarantee ? parseFloat(form.guarantee) : null,
          door_split: form.door_split || null,
          merch_split: form.merch_split || null,
          terms: form.terms || null,
          notes: form.notes || null,
          status: "draft",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create offer");
      }

      router.push("/admin/offers");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create offer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Create New Offer</h1>

      <form className="admin-form" onSubmit={handleSubmit}>
        {error && <div className="admin-form-error">{error}</div>}

        <div className="admin-form-grid">
          <label className="admin-form-label">
            Artist Name *
            <input
              type="text"
              name="artist_name"
              className="admin-form-input"
              value={form.artist_name}
              onChange={handleChange}
              placeholder="e.g. Band of Heathens"
              required
            />
          </label>

          <label className="admin-form-label">
            Venue
            <input
              type="text"
              name="venue"
              className="admin-form-input"
              value={form.venue}
              onChange={handleChange}
              placeholder="e.g. Singin River Live"
            />
          </label>

          <label className="admin-form-label">
            Event Date
            <input
              type="date"
              name="event_date"
              className="admin-form-input"
              value={form.event_date}
              onChange={handleChange}
            />
          </label>

          <label className="admin-form-label">
            Guarantee ($)
            <input
              type="number"
              name="guarantee"
              className="admin-form-input"
              value={form.guarantee}
              onChange={handleChange}
              placeholder="5000.00"
              step="0.01"
              min="0"
            />
          </label>

          <label className="admin-form-label">
            Door Split
            <input
              type="text"
              name="door_split"
              className="admin-form-input"
              value={form.door_split}
              onChange={handleChange}
              placeholder="e.g. 80/20"
            />
          </label>

          <label className="admin-form-label">
            Merch Split
            <input
              type="text"
              name="merch_split"
              className="admin-form-input"
              value={form.merch_split}
              onChange={handleChange}
              placeholder="e.g. 85/15"
            />
          </label>
        </div>

        <label className="admin-form-label admin-form-full">
          Terms
          <textarea
            name="terms"
            className="admin-form-textarea"
            value={form.terms}
            onChange={handleChange}
            placeholder="Contract terms..."
            rows={4}
          />
        </label>

        <label className="admin-form-label admin-form-full">
          Internal Notes
          <textarea
            name="notes"
            className="admin-form-textarea"
            value={form.notes}
            onChange={handleChange}
            placeholder="Notes about this deal..."
            rows={3}
          />
        </label>

        <button
          type="submit"
          className="admin-form-submit"
          disabled={loading}
        >
          {loading ? "Creating..." : "Create Offer"}
        </button>
      </form>
    </div>
  );
}
