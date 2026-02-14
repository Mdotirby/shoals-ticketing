"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminCreateEventPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: "",
    venue: "",
    date: "",
    time: "",
    price: "",
    ticketing_fee: "3.00",
    venue_rebate: "0.00",
    description: "",
    image_url: "",
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
      // Combine date + time into ISO string
      const dateTime = form.time
        ? `${form.date}T${form.time}:00`
        : `${form.date}T19:00:00`;

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          venue: form.venue,
          date: dateTime,
          price: parseFloat(form.price),
          ticketing_fee: parseFloat(form.ticketing_fee),
          venue_rebate: parseFloat(form.venue_rebate),
          description: form.description || null,
          image_url: form.image_url || null,
          status: "published",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create event");
      }

      router.push("/admin/events");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Create New Event</h1>

      <form className="admin-form" onSubmit={handleSubmit}>
        {error && <div className="admin-form-error">{error}</div>}

        <div className="admin-form-grid">
          <label className="admin-form-label">
            Event Name *
            <input
              type="text"
              name="title"
              className="admin-form-input"
              value={form.title}
              onChange={handleChange}
              placeholder="e.g. Jed Harrelson"
              required
            />
          </label>

          <label className="admin-form-label">
            Venue Name *
            <input
              type="text"
              name="venue"
              className="admin-form-input"
              value={form.venue}
              onChange={handleChange}
              placeholder="e.g. Singin River Live"
              required
            />
          </label>

          <label className="admin-form-label">
            Date *
            <input
              type="date"
              name="date"
              className="admin-form-input"
              value={form.date}
              onChange={handleChange}
              required
            />
          </label>

          <label className="admin-form-label">
            Time
            <input
              type="time"
              name="time"
              className="admin-form-input"
              value={form.time}
              onChange={handleChange}
            />
          </label>

          <label className="admin-form-label">
            Ticket Price ($) *
            <input
              type="number"
              name="price"
              className="admin-form-input"
              value={form.price}
              onChange={handleChange}
              placeholder="20.00"
              step="0.01"
              min="0"
              required
            />
          </label>

          <label className="admin-form-label">
            Ticketing Fee ($)
            <input
              type="number"
              name="ticketing_fee"
              className="admin-form-input"
              value={form.ticketing_fee}
              onChange={handleChange}
              placeholder="3.00"
              step="0.01"
              min="0"
            />
          </label>

          <label className="admin-form-label">
            Venue Rebate ($)
            <input
              type="number"
              name="venue_rebate"
              className="admin-form-input"
              value={form.venue_rebate}
              onChange={handleChange}
              placeholder="0.00"
              step="0.01"
              min="0"
            />
          </label>

          <label className="admin-form-label">
            Event Image URL
            <input
              type="url"
              name="image_url"
              className="admin-form-input"
              value={form.image_url}
              onChange={handleChange}
              placeholder="Paste Supabase storage URL"
            />
          </label>
        </div>

        <label className="admin-form-label admin-form-full">
          Description
          <textarea
            name="description"
            className="admin-form-textarea"
            value={form.description}
            onChange={handleChange}
            placeholder="Event description..."
            rows={4}
          />
        </label>

        <button
          type="submit"
          className="admin-form-submit"
          disabled={loading}
        >
          {loading ? "Creating..." : "Create Event"}
        </button>
      </form>
    </div>
  );
}
