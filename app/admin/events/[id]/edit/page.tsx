"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import ImageCropper from "@/app/components/ImageCropper";
import { TicketTierDraft } from "@/lib/types/ticket";

type EventVenue = { id: string; name: string; full_address: string | null; contact_name: string | null; phone: string | null };

const ACCEPTED_IMAGE_TYPES = ".jpg,.jpeg,.png,.webp";
const MAX_TIERS = 8;

function emptyTier(): TicketTierDraft {
  return { tier_name: "", price: "", capacity: "" };
}

export default function AdminEditEventPage() {
  const router = useRouter();
  const { id } = useParams() as { id: string };
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [eventVenues, setEventVenues] = useState<EventVenue[]>([]);
  const [selectedEventVenueId, setSelectedEventVenueId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    venue: "",
    date: "",
    time: "",
    description: "",
    image_url: "",
  });

  const [tiers, setTiers] = useState<TicketTierDraft[]>([]);

  // Cropper state
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ── Fetch existing event + tiers ──
  useEffect(() => {
    setLoading(true);

    Promise.all([
      fetch(`/api/events/${id}`).then((r) => r.json()),
      fetch(`/api/events/${id}/ticket-types`).then((r) => r.json()),
    ])
      .then(([event, tierData]) => {
        if (event.error) {
          setError(event.error);
          return;
        }

        // Parse date + time from raw string (handles "T" or space separator, with or without tz)
        const raw = event.date || "";
        const dateStr = raw.length >= 10 ? raw.slice(0, 10) : "";
        const sep = raw.length > 10 ? raw[10] : "";
        let timeStr = raw.length >= 16 && (sep === "T" || sep === " ") ? raw.slice(11, 16) : "";
        // Treat midnight (00:00) as "no time set"
        if (timeStr === "00:00") timeStr = "";

        setForm({
          title: event.title || "",
          venue: event.venue || "",
          date: dateStr,
          time: timeStr,
          description: event.description || "",
          image_url: event.image_url || "",
        });

        if (event.image_url) {
          setPreviewUrl(event.image_url);
        }

        // Set existing event_venue_id
        if (event.event_venue_id) {
          setSelectedEventVenueId(event.event_venue_id);
        }

        // Map existing tiers to draft format
        if (Array.isArray(tierData) && tierData.length > 0) {
          setTiers(
            tierData.map((t: { tier_name: string; price: number; capacity: number }) => ({
              tier_name: t.tier_name,
              price: String(t.price),
              capacity: String(t.capacity),
            }))
          );
        } else {
          // No tiers yet — create a default based on event price
          setTiers([
            {
              tier_name: "General Admission",
              price: String(event.price ?? 0),
              capacity: "500",
            },
          ]);
        }
      })
      .catch(() => setError("Failed to load event"))
      .finally(() => setLoading(false));

    // Load event venues for dropdown
    import("@/lib/supabase-browser").then(({ getSupabaseBrowser }) => {
      getSupabaseBrowser()
        .from("event_venues")
        .select("id, name, full_address, contact_name, phone")
        .order("name")
        .then(({ data }: { data: EventVenue[] | null }) => {
          if (data) setEventVenues(data);
        });
    });
  }, [id]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
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
    setTiers((prev) => [...prev, emptyTier()]);
  };

  const removeTier = (index: number) => {
    if (tiers.length <= 1) return;
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

  // ── Submit (update event + tiers) ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate tiers
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

    setSaving(true);

    try {
      const dateTime = form.time
        ? `${form.date}T${form.time}:00`
        : `${form.date}T19:00:00`;

      const lowestPrice = Math.min(...tiers.map((t) => parseFloat(t.price)));

      // 1. Update event
      const eventRes = await fetch(`/api/events/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          venue: form.venue,
          date: dateTime,
          price: lowestPrice,
          description: form.description || null,
          image_url: form.image_url || null,
          event_venue_id: selectedEventVenueId || null,
        }),
      });

      if (!eventRes.ok) {
        const data = await eventRes.json();
        throw new Error(data.error || "Failed to update event");
      }

      // 2. Replace tiers
      const tiersRes = await fetch(`/api/events/${id}/ticket-types`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tiers: tiers.map((t, i) => ({
            tier_name: t.tier_name.trim(),
            price: parseFloat(t.price),
            capacity: parseInt(t.capacity),
            sort_order: i,
          })),
        }),
      });

      if (!tiersRes.ok) {
        const data = await tiersRes.json();
        throw new Error(data.error || "Failed to update tiers");
      }

      router.push("/admin/events");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update event");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Edit Event</h1>
        <p style={{ color: "rgba(255,255,255,0.5)", padding: "40px 0" }}>
          Loading event…
        </p>
      </div>
    );
  }

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Edit Event</h1>

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
                setSelectedEventVenueId(null);
              }}
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

        </div>

        {/* ── Ticket Tiers ── */}
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

        {/* Image upload section */}
        <div className="admin-form-label admin-form-full">
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
          disabled={saving || uploading}
        >
          {saving ? "Saving..." : "Save Changes"}
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
