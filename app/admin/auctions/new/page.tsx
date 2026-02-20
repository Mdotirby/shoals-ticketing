"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCookie } from "@/lib/cookies";
import Link from "next/link";

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

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
      const formEl = (e.target as HTMLElement).closest("form");
      if (!formEl) return;
      const inputs = Array.from(
        formEl.querySelectorAll<HTMLElement>("input, select, textarea, button[type='submit']")
      ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
      const idx = inputs.indexOf(e.target as HTMLElement);
      if (idx >= 0 && idx < inputs.length - 1) {
        inputs[idx + 1].focus();
      }
    }
  };

  return (
    <div className="admin-form-page">
      {/* Header */}
      <div className="auction-create-header">
        <div>
          <Link href="/admin/auctions" className="auction-create-back">
            ← Back to Auctions
          </Link>
          <h1 className="admin-page-title">Create New Auction</h1>
          <p className="auction-create-subtitle">
            Set up your silent auction, then add items on the next step.
          </p>
        </div>
      </div>

      {error && <div className="admin-form-error">{error}</div>}

      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="auction-create-form">
        {/* ── SECTION 1: Basic Info ── */}
        <div className="auction-create-panel">
          <div className="auction-create-panel-header">
            <div className="auction-create-panel-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <div>
              <h2 className="auction-create-panel-title">Auction Details</h2>
              <p className="auction-create-panel-desc">Name your auction and add a description</p>
            </div>
          </div>

          <div className="auction-create-fields">
            <label className="admin-form-label">
              <span>Auction Name <span className="auction-required">*</span></span>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                className="admin-form-input"
                placeholder="e.g., Annual Charity Gala Silent Auction"
                required
              />
            </label>

            <label className="admin-form-label">
              <span>Description</span>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                className="admin-form-input admin-form-textarea"
                placeholder="Tell bidders what this auction is about..."
                rows={3}
              />
            </label>

            <label className="admin-form-label">
              <span>Link to Event <span className="auction-optional">(optional)</span></span>
              <select
                name="event_id"
                value={form.event_id}
                onChange={handleChange}
                className="admin-form-input"
              >
                <option value="">— Standalone Auction —</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.title}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* ── SECTION 2: Logo ── */}
        <div className="auction-create-panel">
          <div className="auction-create-panel-header">
            <div className="auction-create-panel-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <div>
              <h2 className="auction-create-panel-title">Auction Branding</h2>
              <p className="auction-create-panel-desc">Upload a logo for your auction page</p>
            </div>
          </div>

          <div className="auction-create-fields">
            {!logoPreview ? (
              <label className="auction-logo-upload">
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={handleLogoSelect}
                  className="auction-logo-input"
                />
                <div className="auction-logo-placeholder">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span>Click to upload logo</span>
                  <span className="auction-logo-hint">JPG, PNG or WebP · Max 5MB</span>
                </div>
              </label>
            ) : (
              <div className="auction-logo-preview-wrap">
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="auction-logo-preview-img"
                />
                <button type="button" onClick={removeLogo} className="auction-logo-remove">
                  Remove
                </button>
                {uploading && <span className="auction-uploading">Uploading...</span>}
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION 3: Schedule ── */}
        <div className="auction-create-panel">
          <div className="auction-create-panel-header">
            <div className="auction-create-panel-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <h2 className="auction-create-panel-title">Schedule</h2>
              <p className="auction-create-panel-desc">When does bidding open and close?</p>
            </div>
          </div>

          <div className="auction-create-fields">
            <div className="auction-schedule-row">
              <div className="auction-schedule-block">
                <span className="auction-schedule-label">
                  <span className="auction-schedule-dot auction-schedule-dot-open" />
                  Bidding Opens
                </span>
                <div className="auction-schedule-inputs">
                  <label className="admin-form-label">
                    <span>Date <span className="auction-required">*</span></span>
                    <input
                      type="date"
                      name="auction_open_date"
                      value={form.auction_open_date}
                      onChange={handleChange}
                      className="admin-form-input"
                      required
                    />
                  </label>
                  <label className="admin-form-label">
                    <span>Time <span className="auction-required">*</span></span>
                    <input
                      type="time"
                      name="auction_open_time"
                      value={form.auction_open_time}
                      onChange={handleChange}
                      className="admin-form-input"
                      required
                    />
                  </label>
                </div>
              </div>

              <div className="auction-schedule-arrow">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>

              <div className="auction-schedule-block">
                <span className="auction-schedule-label">
                  <span className="auction-schedule-dot auction-schedule-dot-close" />
                  Bidding Closes
                </span>
                <div className="auction-schedule-inputs">
                  <label className="admin-form-label">
                    <span>Date <span className="auction-required">*</span></span>
                    <input
                      type="date"
                      name="auction_close_date"
                      value={form.auction_close_date}
                      onChange={handleChange}
                      className="admin-form-input"
                      required
                    />
                  </label>
                  <label className="admin-form-label">
                    <span>Time <span className="auction-required">*</span></span>
                    <input
                      type="time"
                      name="auction_close_time"
                      value={form.auction_close_time}
                      onChange={handleChange}
                      className="admin-form-input"
                      required
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 4: Settings ── */}
        <div className="auction-create-panel">
          <div className="auction-create-panel-header">
            <div className="auction-create-panel-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div>
              <h2 className="auction-create-panel-title">Settings</h2>
              <p className="auction-create-panel-desc">Configure fees and bidding protections</p>
            </div>
          </div>

          <div className="auction-create-fields">
            <div className="auction-settings-grid">
              <label className="admin-form-label">
                <span>Host Fee (%)</span>
                <div className="auction-input-with-suffix">
                  <input
                    type="number"
                    name="host_fee_percent"
                    value={form.host_fee_percent}
                    onChange={handleChange}
                    className="admin-form-input"
                    min="0"
                    max="100"
                    step="0.5"
                  />
                  <span className="auction-input-suffix">%</span>
                </div>
                <span className="auction-field-hint">Platform fee charged on winning bids</span>
              </label>

              <div className="auction-toggle-field">
                <div className="auction-toggle-row">
                  <label className="auction-toggle-label">
                    <input
                      type="checkbox"
                      name="anti_snipe_enabled"
                      checked={form.anti_snipe_enabled}
                      onChange={handleChange}
                      className="auction-toggle-checkbox"
                    />
                    <span className="auction-toggle-switch" />
                    <span>Anti-Snipe Protection</span>
                  </label>
                </div>
                <span className="auction-field-hint">
                  Extends closing time when last-second bids come in
                </span>

                {form.anti_snipe_enabled && (
                  <label className="admin-form-label" style={{ marginTop: 12 }}>
                    <span>Extend by (minutes)</span>
                    <input
                      type="number"
                      name="anti_snipe_minutes"
                      value={form.anti_snipe_minutes}
                      onChange={handleChange}
                      className="admin-form-input"
                      min="1"
                      max="10"
                      style={{ maxWidth: 120 }}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── SUBMIT ── */}
        <div className="auction-create-actions">
          <Link href="/admin/auctions" className="auction-create-cancel">
            Cancel
          </Link>
          <button
            type="submit"
            className="admin-form-submit"
            disabled={loading}
          >
            {loading ? "Creating..." : "Create Auction & Add Items →"}
          </button>
        </div>
      </form>
    </div>
  );
}
