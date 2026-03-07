"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import ImageCropper from "@/app/components/ImageCropper";
import { TicketTierDraft } from "@/lib/types/ticket";
import { getCookie } from "@/lib/cookies";
import { formatPhoneNumber } from "@/lib/formatPhone";

type EventVenue = { id: string; name: string; full_address: string | null; contact_name: string | null; phone: string | null };

type RevenueItem = {
  id?: string;
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
    event_type: "hard_ticket",
    booking_status: "confirmed",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    // Private event fields
    client_name: "",
    client_email: "",
    client_phone: "",
    client_billing_address: "",
    client_company: "",
    tax_exempt: false,
    start_time: "",
    end_time: "",
  });

  const [tiers, setTiers] = useState<TicketTierDraft[]>([]);

  // Revenue items for private events
  const [revenueItems, setRevenueItems] = useState<RevenueItem[]>(
    REVENUE_CATEGORIES.map((c) => ({ category: c.value, amount: "" }))
  );

  // Promo codes state
  type PromoCode = {
    id: string;
    code: string;
    discount_type: string;
    discount_value: number;
    max_uses: number | null;
    current_uses: number;
    active: boolean;
    expires_at: string | null;
  };
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [newPromo, setNewPromo] = useState({ code: "", discount_type: "fixed", discount_value: "", max_uses: "", expires_at: "" });
  const [promoLoading, setPromoLoading] = useState(false);

  // Cropper state
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ── Fetch existing event + tiers + revenue ──
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

        // Parse date + time from raw string
        const raw = event.date || "";
        const dateStr = raw.length >= 10 ? raw.slice(0, 10) : "";
        const sep = raw.length > 10 ? raw[10] : "";
        let timeStr = raw.length >= 16 && (sep === "T" || sep === " ") ? raw.slice(11, 16) : "";
        if (timeStr === "00:00") timeStr = "";

        setForm({
          title: event.title || "",
          venue: event.venue || "",
          date: dateStr,
          time: timeStr,
          description: event.description || "",
          image_url: event.image_url || "",
          event_type: event.event_type || "hard_ticket",
          booking_status: event.booking_status || "confirmed",
          contact_name: event.contact_name || "",
          contact_phone: event.contact_phone || "",
          contact_email: event.contact_email || "",
          client_name: event.client_name || "",
          client_email: event.client_email || "",
          client_phone: event.client_phone || "",
          client_billing_address: event.client_billing_address || "",
          client_company: event.client_company || "",
          tax_exempt: event.tax_exempt || false,
          start_time: event.start_time ? (event.start_time.match(/T(\d{2}:\d{2})/)?.[1] || event.start_time) : "",
          end_time: event.end_time ? (event.end_time.match(/T(\d{2}:\d{2})/)?.[1] || event.end_time) : "",
        });

        if (event.image_url) {
          setPreviewUrl(event.image_url);
        }

        if (event.event_venue_id) {
          setSelectedEventVenueId(event.event_venue_id);
        }

        // Map existing tiers
        if (Array.isArray(tierData) && tierData.length > 0) {
          setTiers(
            tierData.map((t: { tier_name: string; price: number; capacity: number }) => ({
              tier_name: t.tier_name,
              price: String(t.price),
              capacity: String(t.capacity),
            }))
          );
        } else {
          setTiers([
            {
              tier_name: "General Admission",
              price: String(event.price ?? 0),
              capacity: "500",
            },
          ]);
        }

        // Fetch private event revenue if applicable
        if (event.event_type === "private") {
          fetch(`/api/private-events/${id}/revenue`)
            .then((r) => r.json())
            .then((revData) => {
              if (Array.isArray(revData) && revData.length > 0) {
                // Merge existing revenue with default categories
                const merged = REVENUE_CATEGORIES.map((c) => {
                  const existing = revData.find((r: { category: string; amount: number; id: string }) => r.category === c.value);
                  return {
                    id: existing?.id,
                    category: c.value,
                    amount: existing ? String(existing.amount) : "",
                  };
                });
                setRevenueItems(merged);
              }
            })
            .catch(() => { /* revenue API might not exist yet */ });
        }
      })
      .catch(() => setError("Failed to load event"))
      .finally(() => setLoading(false));

    // Load promo codes for this event
    fetch(`/api/promo-codes?event_id=${id}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setPromoCodes(data); })
      .catch(() => {});

    // Load event venues
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

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const isHardTicket = form.event_type === "hard_ticket" || form.event_type === "ticketed";
    const isPrivate = form.event_type === "private";

    // Validate tiers only for hard ticket
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

    setSaving(true);

    try {
      const dateTime = form.time
        ? `${form.date}T${form.time}:00`
        : `${form.date}T19:00:00`;

      const lowestPrice = isHardTicket
        ? Math.min(...tiers.map((t) => parseFloat(t.price) || 0))
        : 0;

      const venueId = getCookie("venue-id");

      // 1. Update event
      const eventRes = await fetch(`/api/events/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          venue: form.venue,
          date: dateTime,
          price: isPrivate ? null : lowestPrice,
          ticketing_fee: isPrivate ? null : undefined,
          venue_rebate: isPrivate ? null : undefined,
          description: form.description || null,
          image_url: form.image_url || null,
          event_venue_id: selectedEventVenueId || null,
          event_type: form.event_type,
          booking_status: form.booking_status,
          contact_name: form.contact_name || null,
          contact_phone: form.contact_phone || null,
          contact_email: form.contact_email || null,
          // Private event fields
          client_name: isPrivate ? (form.client_name || null) : null,
          client_email: isPrivate ? (form.client_email || null) : null,
          client_phone: isPrivate ? (form.client_phone || null) : null,
          client_billing_address: isPrivate ? (form.client_billing_address || null) : null,
          client_company: isPrivate ? (form.client_company || null) : null,
          tax_exempt: isPrivate ? form.tax_exempt : false,
          start_time: isPrivate && form.start_time ? `${form.date}T${form.start_time}:00` : null,
          end_time: isPrivate && form.end_time ? `${form.date}T${form.end_time}:00` : null,
        }),
      });

      if (!eventRes.ok) {
        const data = await eventRes.json();
        throw new Error(data.error || "Failed to update event");
      }

      // 2. Replace tiers (only for hard ticket)
      if (isHardTicket) {
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
      }

      // 3. Save private event revenue items
      if (form.event_type === "private" && venueId) {
        const revenueToSave = revenueItems.filter((r) => r.amount && parseFloat(r.amount) > 0);
        if (revenueToSave.length > 0) {
          await fetch(`/api/private-events/${id}/revenue`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              venue_id: venueId,
              items: revenueToSave.map((r, i) => ({
                category: r.category,
                amount: parseFloat(r.amount),
                sort_order: i,
              })),
            }),
          });
        }
      }

      router.push("/admin/events");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update event");
    } finally {
      setSaving(false);
    }
  };

  const isHardTicket = form.event_type === "hard_ticket" || form.event_type === "ticketed";
  const isPrivate = form.event_type === "private";

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
              { value: "cancelled", label: "Cancelled" },
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

        {/* Contact Fields — shown for private events */}
        {isPrivate && (
          <div className="admin-form-label admin-form-full" style={{
            padding: 16, borderRadius: 10,
            background: "rgba(180,100,200,0.06)",
            border: "1px solid rgba(180,100,200,0.15)",
            marginTop: 8,
          }}>
            <span style={{ color: "rgba(180,100,200,0.8)", fontWeight: 700, fontSize: 13, marginBottom: 10, display: "block" }}>
              Client Contact Info
            </span>
            <div className="admin-form-grid">
              <label className="admin-form-label">
                Contact Name
                <input
                  type="text"
                  name="contact_name"
                  className="admin-form-input"
                  value={form.contact_name}
                  onChange={handleChange}
                  placeholder="Client name"
                />
              </label>
              <label className="admin-form-label">
                Phone
                <input
                  type="tel"
                  name="contact_phone"
                  className="admin-form-input"
                  value={form.contact_phone}
                  onChange={(e) => setForm({ ...form, contact_phone: formatPhoneNumber(e.target.value) })}
                  placeholder="(555)-123-4567"
                />
              </label>
              <label className="admin-form-label" style={{ gridColumn: "span 2" }}>
                Email
                <input
                  type="email"
                  name="contact_email"
                  className="admin-form-input"
                  value={form.contact_email}
                  onChange={handleChange}
                  placeholder="client@example.com"
                />
              </label>
            </div>
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

        {/* ── Promo Codes (only for hard ticket events) ── */}
        {isHardTicket && (
          <div className="admin-form-label admin-form-full" style={{
            padding: 16, borderRadius: 10,
            background: "rgba(208,194,144,0.04)",
            border: "1px solid rgba(208,194,144,0.12)",
            marginTop: 8,
          }}>
            <span style={{ color: "#d0c290", fontWeight: 700, fontSize: 13, marginBottom: 10, display: "block" }}>
              Promo Codes
            </span>

            {/* Existing promo codes */}
            {promoCodes.length > 0 && (
              <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                {promoCodes.map((pc) => (
                  <div key={pc.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", borderRadius: 8,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <span style={{ fontWeight: 700, color: "#d0c290", fontSize: 13, minWidth: 80 }}>{pc.code}</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", flex: 1 }}>
                      {pc.discount_type === "fixed" ? `$${pc.discount_value}` : `${pc.discount_value}%`} off
                      {pc.max_uses ? ` · ${pc.current_uses}/${pc.max_uses} used` : ` · ${pc.current_uses} used`}
                      {pc.expires_at ? ` · Exp ${new Date(pc.expires_at).toLocaleDateString()}` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/promo-codes?id=${pc.id}`, { method: "DELETE" });
                        setPromoCodes((prev) => prev.filter((p) => p.id !== pc.id));
                      }}
                      style={{
                        background: "transparent", border: "none",
                        color: "rgba(255,107,107,0.7)", cursor: "pointer", fontSize: 14,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new promo code */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
              <div style={{ flex: "1 1 120px" }}>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Code</label>
                <input
                  type="text"
                  className="admin-form-input"
                  value={newPromo.code}
                  onChange={(e) => setNewPromo({ ...newPromo, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. VIP20"
                  style={{ textTransform: "uppercase" }}
                />
              </div>
              <div style={{ flex: "0 0 100px" }}>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Type</label>
                <select
                  className="admin-form-input"
                  value={newPromo.discount_type}
                  onChange={(e) => setNewPromo({ ...newPromo, discount_type: e.target.value })}
                >
                  <option value="fixed">Fixed $</option>
                  <option value="percentage">Percent %</option>
                </select>
              </div>
              <div style={{ flex: "0 0 80px" }}>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Value</label>
                <input
                  type="number"
                  className="admin-form-input"
                  value={newPromo.discount_value}
                  onChange={(e) => setNewPromo({ ...newPromo, discount_value: e.target.value })}
                  placeholder="10"
                  min="0"
                  step="0.01"
                />
              </div>
              <div style={{ flex: "0 0 70px" }}>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Max Uses</label>
                <input
                  type="number"
                  className="admin-form-input"
                  value={newPromo.max_uses}
                  onChange={(e) => setNewPromo({ ...newPromo, max_uses: e.target.value })}
                  placeholder="∞"
                  min="1"
                />
              </div>
              <div style={{ flex: "0 0 130px" }}>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Expires</label>
                <input
                  type="date"
                  className="admin-form-input"
                  value={newPromo.expires_at}
                  onChange={(e) => setNewPromo({ ...newPromo, expires_at: e.target.value })}
                />
              </div>
              <button
                type="button"
                disabled={promoLoading || !newPromo.code.trim() || !newPromo.discount_value}
                onClick={async () => {
                  setPromoLoading(true);
                  try {
                    const res = await fetch("/api/promo-codes", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        event_id: id,
                        code: newPromo.code.trim(),
                        discount_type: newPromo.discount_type,
                        discount_value: newPromo.discount_value,
                        max_uses: newPromo.max_uses || null,
                        expires_at: newPromo.expires_at ? `${newPromo.expires_at}T23:59:59Z` : null,
                      }),
                    });
                    if (res.ok) {
                      const created = await res.json();
                      setPromoCodes((prev) => [created, ...prev]);
                      setNewPromo({ code: "", discount_type: "fixed", discount_value: "", max_uses: "", expires_at: "" });
                    } else {
                      const err = await res.json();
                      setError(err.error || "Failed to create promo code");
                    }
                  } catch {
                    setError("Failed to create promo code");
                  } finally {
                    setPromoLoading(false);
                  }
                }}
                style={{
                  padding: "8px 14px", borderRadius: 8,
                  border: "1px solid rgba(208,194,144,0.3)",
                  background: "rgba(208,194,144,0.1)",
                  color: "#d0c290", fontSize: 12, fontWeight: 600,
                  cursor: promoLoading || !newPromo.code.trim() || !newPromo.discount_value ? "not-allowed" : "pointer",
                  opacity: promoLoading || !newPromo.code.trim() || !newPromo.discount_value ? 0.5 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {promoLoading ? "..." : "+ Add"}
              </button>
            </div>
          </div>
        )}

        {/* ── Private Event Revenue Fields ── */}
        {isPrivate && (
          <div className="admin-form-label admin-form-full" style={{
            padding: 16, borderRadius: 10,
            background: "rgba(180,100,200,0.04)",
            border: "1px solid rgba(180,100,200,0.12)",
            marginTop: 8,
          }}>
            <span style={{ color: "rgba(180,100,200,0.8)", fontWeight: 700, fontSize: 13, marginBottom: 10, display: "block" }}>
              Revenue Line Items
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {revenueItems.map((item, i) => {
                const label = REVENUE_CATEGORIES.find((c) => c.value === item.category)?.label || item.category;
                return (
                  <div key={item.category} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{label}</span>
                    <div style={{ position: "relative", width: 140 }}>
                      <span style={{
                        position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                        color: "rgba(255,255,255,0.3)", fontSize: 13, pointerEvents: "none",
                      }}>$</span>
                      <input
                        type="number"
                        className="admin-form-input"
                        value={item.amount}
                        onChange={(e) => {
                          const updated = [...revenueItems];
                          updated[i] = { ...updated[i], amount: e.target.value };
                          setRevenueItems(updated);
                        }}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        style={{ width: "100%", paddingLeft: 24 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {(() => {
              const total = revenueItems.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
              return total > 0 ? (
                <div style={{ textAlign: "right", marginTop: 10, fontSize: 14, fontWeight: 700, color: "#d0c290" }}>
                  Total: ${total.toFixed(2)}
                </div>
              ) : null;
            })()}
          </div>
        )}

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
