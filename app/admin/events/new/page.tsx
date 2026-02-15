"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import ImageCropper from "@/app/components/ImageCropper";
import { TicketTierDraft } from "@/lib/types/ticket";

const ACCEPTED_IMAGE_TYPES = ".jpg,.jpeg,.png,.webp";
const MAX_TIERS = 8;

function emptyTier(): TicketTierDraft {
  return { tier_name: "General Admission", price: "", capacity: "" };
}

export default function AdminCreateEventPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: "",
    venue: "",
    date: "",
    time: "",
    description: "",
    image_url: "",
  });

  // Tier builder state — starts with one default tier
  const [tiers, setTiers] = useState<TicketTierDraft[]>([emptyTier()]);

  // Cropper state
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

    setLoading(true);

    try {
      const dateTime = form.time
        ? `${form.date}T${form.time}:00`
        : `${form.date}T19:00:00`;

      // Use the lowest tier price as the event's display price
      const lowestPrice = Math.min(...tiers.map((t) => parseFloat(t.price)));

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          venue: form.venue,
          date: dateTime,
          price: lowestPrice,
          description: form.description || null,
          image_url: form.image_url || null,
          status: "published",
          tiers: tiers.map((t, i) => ({
            tier_name: t.tier_name.trim(),
            price: parseFloat(t.price),
            capacity: parseInt(t.capacity),
            sort_order: i,
          })),
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
