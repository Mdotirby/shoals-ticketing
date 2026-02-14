"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DEAL_TYPES = ["VS", "FLAT", "PLUS", "BONUS"] as const;

export default function AdminCreateOfferPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    artist_name: "",
    venue: "",
    event_date: "",
    guarantee: "",
    deal_type: "",
    backend_percentage: "",
    merch_soft: "",
    merch_hard: "",
    terms: "",
    notes: "",
  });

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
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
          deal_type: form.deal_type || null,
          backend_percentage: form.backend_percentage || null,
          merch_soft: form.merch_soft || null,
          merch_hard: form.merch_hard || null,
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
            Deal Type
            <select
              name="deal_type"
              className="admin-form-input"
              value={form.deal_type}
              onChange={handleChange}
            >
              <option value="">Select deal type...</option>
              {DEAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-form-label">
            Backend Percentage
            <input
              type="text"
              name="backend_percentage"
              className="admin-form-input"
              value={form.backend_percentage}
              onChange={handleChange}
              placeholder="e.g. 80%"
            />
          </label>

          <label className="admin-form-label">
            Merch Split — Soft
            <input
              type="text"
              name="merch_soft"
              className="admin-form-input"
              value={form.merch_soft}
              onChange={handleChange}
              placeholder="e.g. 85/15"
            />
          </label>

          <label className="admin-form-label">
            Merch Split — Hard
            <input
              type="text"
              name="merch_hard"
              className="admin-form-input"
              value={form.merch_hard}
              onChange={handleChange}
              placeholder="e.g. 80/20"
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
