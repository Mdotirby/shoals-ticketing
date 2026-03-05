"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ImageCropper from "@/app/components/ImageCropper";
import { TicketTierDraft } from "@/lib/types/ticket";
import { getCookie } from "@/lib/cookies";

type EventVenue = { id: string; name: string; full_address: string | null; contact_name: string | null; phone: string | null };

type RevenueItem = {
  category: string;
  amount: string;
};

const ACCEPTED_IMAGE_TYPES = ".jpg,.jpeg,.png,.webp";
const MAX_TIERS = 8;

const REVENUE_CATEGORIES = [
  { value: "room_rental", label: "Room Rental" },
  { value: "production", label: "Production" },
  { value: "food_beverage", label: "Food & Beverage" },
  { value: "setup", label: "Setup - Tables & Chairs" },
  { value: "labor", label: "Labor" },
];

const BOOKING_STATUS_COLORS: Record<string, string> = {
  confirmed: "#50c878",
  hold: "#ffc832",
  cancelled: "#ff6b6b",
};

function emptyTier(): TicketTierDraft {
  return { tier_name: "General Admission", price: "", capacity: "" };
}

export default function AdminCreateEventPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [eventVenues, setEventVenues] = useState<EventVenue[]>([]);
  const [selectedEventVenueId, setSelectedEventVenueId] = useState<string | null>(null);

  // Resolved venue_id — from cookie or admin_users table
  const [resolvedVenueId, setResolvedVenueId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    venue: "",
    date: "",
    time: "",
    description: "",
    image_url: "",
    event_type: "hard_ticket",
    booking_status: "confirmed",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    // Private event client fields
    client_name: "",
    client_email: "",
    client_phone: "",
    client_billing_address: "",
    client_company: "",
    tax_exempt: false,
    start_time: "",
    end_time: "",
  });

  // Revenue items for private events
  const [revenueItems, setRevenueItems] = useState<RevenueItem[]>(
    REVENUE_CATEGORIES.map((c) => ({ category: c.value, amount: "" }))
  );

  // Resolve venue_id from cookie or admin_users table (ensures events are tagged correctly)
  useEffect(() => {
    const cookieVenueId = getCookie("venue-id");
    if (cookieVenueId) {
      setResolvedVenueId(cookieVenueId);
    } else {
      // Fallback: resolve from admin_users record
      import("@/lib/supabase-browser").then(async ({ getSupabaseBrowser }) => {
        const supabase = getSupabaseBrowser();
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) return;
        const { data: adminRecord } = await supabase
          .from("admin_users")
          .select("venue_id")
          .eq("id", authData.user.id)
          .single();
        if (adminRecord?.venue_id) {
          setResolvedVenueId(adminRecord.venue_id);
        }
      });
    }
  }, []);

  // Load event venues for dropdown
  useEffect(() => {
    import("@/lib/supabase-browser").then(({ getSupabaseBrowser }) => {
      getSupabaseBrowser()
        .from("event_venues")
        .select("id, name, full_address, contact_name, phone")
        .order("name")
        .then(({ data }: { data: EventVenue[] | null }) => {
          if (data) setEventVenues(data);
        });
    });
  }, []);

  // Tier builder state — starts with one default tier
  const [tiers, setTiers] = useState<TicketTierDraft[]>([emptyTier()]);

  // Cropper state
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // ── Tier handlers ──
  const handleTierChange = (
    index: number,
    field: keyof TicketTierDraft,
    value: string
  ) => {
    setTiers((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  };

  const addTier = () => {
    if (tiers.length >= MAX_TIERS) return;
    setTiers((prev) => [
      ...prev,
      { tier_name: "", price: "", capacity: "" },
    ]);
  };

  const removeTier = (index: number) => {
    if (tiers.length <= 1) return; // always keep at least 1
    setTiers((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Image handlers ──
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      setError("Only .jpeg, .jpg .png, and .webp images are allowed.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setRawImageSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setRawImageSrc(null);
    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", croppedBlob, `event-${Date.now()}.jpg`);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const { url } = await res.json();
      setForm((prev) => ({ ...prev, image_url: url }));
      setPreviewUrl(URL.createObjectURL(croppedBlob));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleCropCancel = () => {
    setRawImageSrc(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveImage = () => {
    setForm((prev) => ({ ...prev, image_url: "" }));
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const isHardTicket = form.event_type === "hard_ticket" || form.event_type === "ticketed";

    // Validate tiers only for hard ticket events
    if (isHardTicket) {
      for (let i = 0; i < tiers.length; i++) {
        const t = tiers[i];
        if (!t.tier_name.trim()) {
          setError(`Tier ${i + 1}: name is required.`);
          return;
        }
        if (!t.price || isNaN(parseFloat(t.price)) || parseFloat(t.price) < 0) {
          setError(`Tier ${i + 1}: price must be a valid number.`);
          return;
        }
        if (!t.capacity || isNaN(parseInt(t.capacity)) || parseInt(t.capacity) < 1) {
          setError(`Tier ${i + 1}: capacity must be at least 1.`);
          return;
        }
      }
    }

    setLoading(true);

    try {
      const dateTime = form.time
        ? `${form.date}T${form.time}:00`
        : `${form.date}T19:00:00`;

      // Use the lowest tier price as the event's display price (or 0 for non-ticketed)
      const lowestPrice = isHardTicket
        ? Math.min(...tiers.map((t) => parseFloat(t.price) || 0))
        : 0;

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          venue: form.venue,
          date: dateTime,
          price: lowestPrice,
          description: isPrivate ? null : (form.description || null),
          image_url: isPrivate ? null : (form.image_url || null),
          status: "published",
          venue_id: resolvedVenueId || null,
          event_venue_id: selectedEventVenueId || null,
          event_type: form.event_type,
          booking_status: form.booking_status,
          contact_name: form.contact_name || null,
          contact_phone: form.contact_phone || null,
          contact_email: form.contact_email || null,
          // Private event client fields
          client_name: isPrivate ? (form.client_name || null) : null,
          client_email: isPrivate ? (form.client_email || null) : null,
          client_phone: isPrivate ? (form.client_phone || null) : null,
          client_billing_address: isPrivate ? (form.client_billing_address || null) : null,
          client_company: isPrivate ? (form.client_company || null) : null,
          tax_exempt: isPrivate ? form.tax_exempt : false,
          start_time: isPrivate ? (form.start_time || null) : null,
          end_time: isPrivate ? (form.end_time || null) : null,
          tiers: isHardTicket
            ? tiers.map((t, i) => ({
                tier_name: t.tier_name.trim(),
                price: parseFloat(t.price),
                capacity: parseInt(t.capacity),
                sort_order: i,
              }))
            : [],
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create event");
      }

      const event = await res.json();

      // Save private event revenue items if applicable
      if (form.event_type === "private" && resolvedVenueId && event.id) {
        const revenueToSave = revenueItems.filter((r) => r.amount && parseFloat(r.amount) > 0);
        if (revenueToSave.length > 0) {
          await fetch(`/api/private-events/${event.id}/revenue`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              venue_id: resolvedVenueId,
              items: revenueToSave.map((r, i) => ({
                category: r.category,
                amount: parseFloat(r.amount),
                sort_order: i,
              })),
            }),
          });
        }
      }

      // Redirect private events to management hub, others to events list
      if (form.event_type === "private") {
        router.push(`/admin/private-events/${event.id}`);
      } else {
        router.push("/admin/events");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setLoading(false);
    }
  };

  const isHardTicket = form.event_type === "hard_ticket" || form.event_type === "ticketed";
  const isPrivate = form.event_type === "private";

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Create New Event</h1>

      <form className="admin-form" onSubmit={handleSubmit}>
        {error && <div className="admin-form-error">{error}</div>}

        {/* Event Type Selector */}
        <div className="admin-form-label admin-form-full">
          Event Type
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {[
              { value: "hard_ticket", label: "Hard Ticket" },
              { value: "non_ticketed", label: "Non-Ticketed" },
              { value: "private", label: "Private Event" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm({ ...form, event_type: opt.value })}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: `1px solid ${form.event_type === opt.value ? "#d0c290" : "rgba(255,255,255,0.1)"}`,
                  background: form.event_type === opt.value ? "rgba(208,194,144,0.1)" : "transparent",
                  color: form.event_type === opt.value ? "#d0c290" : "rgba(255,255,255,0.5)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Booking Status */}
        <div className="admin-form-label admin-form-full">
          Booking Status
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {[
              { value: "confirmed", label: "Confirmed" },
              { value: "hold", label: "Hold" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm({ ...form, booking_status: opt.value })}
                style={{
                  flex: 1,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: `1px solid ${form.booking_status === opt.value ? BOOKING_STATUS_COLORS[opt.value] : "rgba(255,255,255,0.1)"}`,
                  background: form.booking_status === opt.value ? BOOKING_STATUS_COLORS[opt.value] + "18" : "transparent",
                  color: form.booking_status === opt.value ? BOOKING_STATUS_COLORS[opt.value] : "rgba(255,255,255,0.5)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

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
            Venue *
            {eventVenues.length > 0 && (
              <select
                className="admin-form-input"
                value={selectedEventVenueId || ""}
                onChange={(e) => {
                  const v = eventVenues.find((x) => x.id === e.target.value);
                  if (v) {
                    setSelectedEventVenueId(v.id);
                    setForm((prev) => ({ ...prev, venue: v.name }));
                  } else {
                    setSelectedEventVenueId(null);
                  }
                }}
                style={{ marginBottom: 6 }}
              >
                <option value="">— Select a venue or type below —</option>
                {eventVenues.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}{v.full_address ? ` (${v.full_address})` : ""}</option>
                ))}
              </select>
            )}
            <input
              type="text"
              name="venue"
              className="admin-form-input"
              value={form.venue}
              onChange={(e) => {
                handleChange(e);
                // Clear selected venue if user types manually
                setSelectedEventVenueId(null);
              }}
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

          {/* Hide the generic Time dropdown for private events — they use Start/End Time instead */}
          {!isPrivate && (
            <label className="admin-form-label">
              Time
              <select
                name="time"
                className="admin-form-input"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              >
                <option value="">— Select time —</option>
                {Array.from({ length: 30 }, (_, i) => {
                  const h24 = Math.floor(i / 2) + 10;
                  const m = i % 2 === 0 ? "00" : "30";
                  const h12 = h24 > 12 ? h24 - 12 : h24;
                  const ampm = h24 >= 12 ? "PM" : "AM";
                  const val = `${String(h24).padStart(2, "0")}:${m}`;
                  return <option key={val} value={val}>{h12}:{m} {ampm}</option>;
                })}
              </select>
            </label>
          )}

        </div>

        {/* Client Fields — shown for private events */}
        {isPrivate && (
          <div className="admin-form-label admin-form-full" style={{
            padding: 16, borderRadius: 10,
            background: "rgba(180,100,200,0.06)",
            border: "1px solid rgba(180,100,200,0.15)",
            marginTop: 8,
          }}>
            <span style={{ color: "rgba(180,100,200,0.8)", fontWeight: 700, fontSize: 13, marginBottom: 10, display: "block" }}>
              Client Information
            </span>
            <div className="admin-form-grid">
              <label className="admin-form-label">
                Client Name *
                <input
                  type="text"
                  name="client_name"
                  className="admin-form-input"
                  value={form.client_name}
                  onChange={handleChange}
                  placeholder="Client name"
                  required
                />
              </label>
              <label className="admin-form-label">
                Client Email
                <input
                  type="email"
                  name="client_email"
                  className="admin-form-input"
                  value={form.client_email}
                  onChange={handleChange}
                  placeholder="client@example.com"
                />
              </label>
              <label className="admin-form-label">
                Client Phone
                <input
                  type="tel"
                  name="client_phone"
                  className="admin-form-input"
                  value={form.client_phone}
                  onChange={handleChange}
                  placeholder="(555) 123-4567"
                />
              </label>
              <label className="admin-form-label">
                Client Company
                <input
                  type="text"
                  name="client_company"
                  className="admin-form-input"
                  value={form.client_company}
                  onChange={handleChange}
                  placeholder="Company name (optional)"
                />
              </label>
              <label className="admin-form-label" style={{ gridColumn: "span 2" }}>
                Client Billing Address
                <input
                  type="text"
                  name="client_billing_address"
                  className="admin-form-input"
                  value={form.client_billing_address}
                  onChange={handleChange}
                  placeholder="123 Main St, City, ST 12345"
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: 16, marginTop: 12, alignItems: "center" }}>
              <label className="admin-form-label" style={{ flex: 1 }}>
                Start Time
                <select
                  name="start_time"
                  className="admin-form-input"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                >
                  <option value="">— Select —</option>
                  {Array.from({ length: 30 }, (_, i) => {
                    const h24 = Math.floor(i / 2) + 10;
                    const m = i % 2 === 0 ? "00" : "30";
                    const h12 = h24 > 12 ? h24 - 12 : h24;
                    const ampm = h24 >= 12 ? "PM" : "AM";
                    const val = `${String(h24).padStart(2, "0")}:${m}`;
                    return <option key={val} value={val}>{h12}:{m} {ampm}</option>;
                  })}
                </select>
              </label>
              <label className="admin-form-label" style={{ flex: 1 }}>
                End Time
                <select
                  name="end_time"
                  className="admin-form-input"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                >
                  <option value="">— Select —</option>
                  {Array.from({ length: 30 }, (_, i) => {
                    const h24 = Math.floor(i / 2) + 10;
                    const m = i % 2 === 0 ? "00" : "30";
                    const h12 = h24 > 12 ? h24 - 12 : h24;
                    const ampm = h24 >= 12 ? "PM" : "AM";
                    const val = `${String(h24).padStart(2, "0")}:${m}`;
                    return <option key={val} value={val}>{h12}:{m} {ampm}</option>;
                  })}
                </select>
              </label>
            </div>

            <label style={{
              display: "flex", alignItems: "center", gap: 10, marginTop: 14,
              color: "rgba(255,255,255,0.7)", fontSize: 14, cursor: "pointer",
            }}>
              <input
                type="checkbox"
                checked={form.tax_exempt}
                onChange={(e) => setForm({ ...form, tax_exempt: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: "#d0c290" }}
              />
              Tax Exempt
            </label>
          </div>
        )}

        {/* ── Ticket Tiers (only for hard ticket events) ── */}
        {isHardTicket && (
          <div className="admin-form-label admin-form-full">
            Ticket Tiers *
            <div className="admin-tiers-list">
              {tiers.map((tier, i) => (
                <div key={i} className="admin-tier-row">
                  <span className="admin-tier-number">Tier {i + 1}</span>
                  <input
                    type="text"
                    className="admin-form-input admin-tier-input"
                    placeholder="Tier name (e.g. GA, VIP)"
                    value={tier.tier_name}
                    onChange={(e) =>
                      handleTierChange(i, "tier_name", e.target.value)
                    }
                    required
                  />
                  <input
                    type="number"
                    className="admin-form-input admin-tier-input admin-tier-price"
                    placeholder="Price"
                    value={tier.price}
                    onChange={(e) =>
                      handleTierChange(i, "price", e.target.value)
                    }
                    step="0.01"
                    min="0"
                    required
                  />
                  <input
                    type="number"
                    className="admin-form-input admin-tier-input admin-tier-capacity"
                    placeholder="Capacity"
                    value={tier.capacity}
                    onChange={(e) =>
                      handleTierChange(i, "capacity", e.target.value)
                    }
                    min="1"
                    step="1"
                    required
                  />
                  {tiers.length > 1 && (
                    <button
                      type="button"
                      className="admin-tier-remove-btn"
                      onClick={() => removeTier(i)}
                      title="Remove tier"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            {tiers.length < MAX_TIERS && (
              <button
                type="button"
                className="admin-tier-add-btn"
                onClick={addTier}
              >
                + Add Tier
              </button>
            )}
          </div>
        )}

        {/* ── Promo Codes note (only for hard ticket events) ── */}
        {isHardTicket && (
          <div className="admin-form-label admin-form-full" style={{
            padding: 16, borderRadius: 10,
            background: "rgba(208,194,144,0.04)",
            border: "1px solid rgba(208,194,144,0.12)",
            marginTop: 8,
          }}>
            <span style={{ color: "#d0c290", fontWeight: 700, fontSize: 13, display: "block" }}>
              Promo Codes
            </span>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, margin: "6px 0 0" }}>
              Save this event first, then add promo codes from the Edit page.
            </p>
          </div>
        )}

        {/* Image upload section — hidden for private events */}
        {!isPrivate && <div className="admin-form-label admin-form-full">
          Event Image
          <div className="admin-image-upload-area">
            {previewUrl ? (
              <div className="admin-image-preview-wrapper">
                <img
                  src={previewUrl}
                  alt="Event preview"
                  className="admin-image-preview"
                />
                <button
                  type="button"
                  className="admin-image-remove-btn"
                  onClick={handleRemoveImage}
                >
                  ✕ Remove
                </button>
              </div>
            ) : (
              <div
                className="admin-image-dropzone"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <span className="admin-image-uploading">Uploading…</span>
                ) : (
                  <>
                    <span className="admin-image-dropzone-icon">📷</span>
                    <span className="admin-image-dropzone-text">
                      Click to upload an image
                    </span>
                    <span className="admin-image-dropzone-hint">
                      .jpg, .jpeg, .png, or .webp — max 45 MB
                    </span>
                  </>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              onChange={handleFileSelect}
              className="admin-image-file-input"
            />
          </div>
        </div>}

        {!isPrivate && (
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
        )}

        <button
          type="submit"
          className="admin-form-submit"
          disabled={loading || uploading}
        >
          {loading ? "Creating..." : "Create Event"}
        </button>
      </form>

      {/* Crop modal */}
      {rawImageSrc && (
        <ImageCropper
          imageSrc={rawImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
          aspect={16 / 9}
        />
      )}
    </div>
  );
}
