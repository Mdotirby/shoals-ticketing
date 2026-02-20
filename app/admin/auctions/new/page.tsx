"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCookie } from "@/lib/cookies";

type EventOption = { id: string; title: string };

export default function AdminCreateAuctionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<EventOption[]>([]);

  const [form, setForm] = useState({
    name: "",
    description: "",
    event_id: "",
    auction_open_date: "",
    auction_open_time: "",
    auction_close_date: "",
    auction_close_time: "",
    anti_snipe_enabled: true,
    anti_snipe_minutes: "2",
    host_fee_percent: "8",
  });

  // Logo upload
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setEvents(data);
      })
      .catch(() => {});
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const target = e.target;
    const value = target.type === "checkbox" ? (target as HTMLInputElement).checked : target.value;
    setForm({ ...form, [target.name]: value });
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const venueId = getCookie("venue-id");
    if (!venueId) {
      setError("No venue assigned. Contact your administrator.");
      setLoading(false);
      return;
    }

    // Combine date + time into ISO strings
    const auctionOpen = form.auction_open_date && form.auction_open_time
      ? new Date(`${form.auction_open_date}T${form.auction_open_time}`).toISOString()
      : "";
    const auctionClose = form.auction_close_date && form.auction_close_time
      ? new Date(`${form.auction_close_date}T${form.auction_close_time}`).toISOString()
      : "";

    if (!form.name || !auctionOpen || !auctionClose) {
      setError("Name, open date/time, and close date/time are required.");
      setLoading(false);
      return;
    }

    // Upload logo if provided
    let logoUrl = "";
    if (logoFile) {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", logoFile, `auction-logo-${Date.now()}.png`);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        logoUrl = uploadData.url;
      }
      setUploading(false);
    }

    const res = await fetch("/api/auctions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        venue_id: venueId,
        name: form.name,
        description: form.description || null,
        event_id: form.event_id || null,
        logo_url: logoUrl || null,
        auction_open: auctionOpen,
        auction_close: auctionClose,
        anti_snipe_enabled: form.anti_snipe_enabled,
        anti_snipe_minutes: parseInt(form.anti_snipe_minutes) || 2,
        host_fee_percent: parseFloat(form.host_fee_percent) || 8,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create auction.");
      setLoading(false);
      return;
    }

    const auction = await res.json();
    router.push(`/admin/auctions/${auction.id}/edit`);
  };

  // Prevent Enter from submitting — act like Tab
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
      const form = (e.target as HTMLElement).closest("form");
      if (!form) return;
      const inputs = Array.from(
        form.querySelectorAll<HTMLElement>("input, select, textarea, button[type='submit']")
      ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
      const idx = inputs.indexOf(e.target as HTMLElement);
      if (idx >= 0 && idx < inputs.length - 1) {
        inputs[idx + 1].focus();
      }
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Create Auction</h1>
      </div>

      {error && <div className="admin-error-banner">{error}</div>}

      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="admin-form">
        {/* Auction Name */}
        <div className="admin-form-group">
          <label className="admin-label">Auction Name *</label>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            className="admin-input"
            placeholder="e.g., Annual Charity Gala Silent Auction"
            required
          />
        </div>

        {/* Description */}
        <div className="admin-form-group">
          <label className="admin-label">Description</label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            className="admin-input admin-textarea"
            placeholder="Optional auction description"
            rows={3}
          />
        </div>

        {/* Link to Event (optional) */}
        <div className="admin-form-group">
          <label className="admin-label">Link to Event (optional)</label>
          <select
            name="event_id"
            value={form.event_id}
            onChange={handleChange}
            className="admin-input"
          >
            <option value="">— Standalone Auction —</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.title}</option>
            ))}
          </select>
        </div>

        {/* Logo Upload */}
        <div className="admin-form-group">
          <label className="admin-label">Auction Logo</label>
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            onChange={handleLogoSelect}
            className="admin-input"
          />
          {logoPreview && (
            <img
              src={logoPreview}
              alt="Logo preview"
              style={{ maxWidth: 160, maxHeight: 80, marginTop: 8, borderRadius: 8 }}
            />
          )}
          {uploading && <span className="admin-label" style={{ color: "#d0c290" }}>Uploading…</span>}
        </div>

        {/* Open Date/Time */}
        <div className="admin-form-row">
          <div className="admin-form-group">
            <label className="admin-label">Auction Opens — Date *</label>
            <input
              type="date"
              name="auction_open_date"
              value={form.auction_open_date}
              onChange={handleChange}
              className="admin-input"
              required
            />
          </div>
          <div className="admin-form-group">
            <label className="admin-label">Auction Opens — Time *</label>
            <input
              type="time"
              name="auction_open_time"
              value={form.auction_open_time}
              onChange={handleChange}
              className="admin-input"
              required
            />
          </div>
        </div>

        {/* Close Date/Time */}
        <div className="admin-form-row">
          <div className="admin-form-group">
            <label className="admin-label">Auction Closes — Date *</label>
            <input
              type="date"
              name="auction_close_date"
              value={form.auction_close_date}
              onChange={handleChange}
              className="admin-input"
              required
            />
          </div>
          <div className="admin-form-group">
            <label className="admin-label">Auction Closes — Time *</label>
            <input
              type="time"
              name="auction_close_time"
              value={form.auction_close_time}
              onChange={handleChange}
              className="admin-input"
              required
            />
          </div>
        </div>

        {/* Host Fee */}
        <div className="admin-form-group">
          <label className="admin-label">Host Fee (%)</label>
          <input
            type="number"
            name="host_fee_percent"
            value={form.host_fee_percent}
            onChange={handleChange}
            className="admin-input"
            min="0"
            max="100"
            step="0.5"
          />
        </div>

        {/* Anti-Snipe */}
        <div className="admin-form-row" style={{ alignItems: "center" }}>
          <div className="admin-form-group">
            <label className="admin-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                name="anti_snipe_enabled"
                checked={form.anti_snipe_enabled}
                onChange={handleChange}
                style={{ width: 18, height: 18 }}
              />
              Anti-Snipe Protection
            </label>
          </div>
          {form.anti_snipe_enabled && (
            <div className="admin-form-group">
              <label className="admin-label">Extend by (minutes)</label>
              <input
                type="number"
                name="anti_snipe_minutes"
                value={form.anti_snipe_minutes}
                onChange={handleChange}
                className="admin-input"
                min="1"
                max="10"
              />
            </div>
          )}
        </div>

        <button
          type="submit"
          className="admin-btn admin-btn-primary"
          disabled={loading}
          style={{ marginTop: 16 }}
        >
          {loading ? "Creating…" : "Create Auction & Add Items"}
        </button>
      </form>
    </div>
  );
}
