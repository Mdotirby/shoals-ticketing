"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

type EventOption = { id: string; title: string };

const GOLD = "#ffffff";
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const fieldVariant = (delay: number) => ({
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE, delay } },
});

// ── Multi-select event dropdown ────────────────────────────────────────
function EventMultiSelect({
  events,
  selectedIds,
  onChange,
}: {
  events: EventOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);

  const label =
    selectedIds.length === 0
      ? "— Global sponsor (no event assignment) —"
      : events.filter(e => selectedIds.includes(e.id)).map(e => e.title).join(", ");

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <motion.div
        onClick={() => setOpen(o => !o)}
        whileTap={{ scale: 0.99 }}
        className="admin-form-input"
        style={{
          cursor: "pointer",
          userSelect: "none",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          minHeight: 42,
        }}
      >
        <span style={{ color: selectedIds.length ? "#fff" : "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14 }}>
          {label}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ color: "rgba(255,255,255,0.4)", flexShrink: 0, marginLeft: 8, fontSize: 12 }}
        >
          ▼
        </motion.span>
      </motion.div>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6, scaleY: 0.95 }}
          animate={{ opacity: 1, y: 0, scaleY: 1 }}
          exit={{ opacity: 0, y: -4, scaleY: 0.97 }}
          transition={{ duration: 0.18, ease: EASE }}
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200,
            background: "#0f1129", border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10, maxHeight: 260, overflowY: "auto",
            boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
            transformOrigin: "top",
          }}
        >
          {events.length === 0 && (
            <div style={{ padding: "12px 16px", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No events available</div>
          )}
          {events.map(ev => (
            <motion.label
              key={ev.id}
              whileHover={{ background: "rgba(255, 255, 255, 0.06)" }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 16px", cursor: "pointer",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                color: "#fff", fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(ev.id)}
                onChange={() => toggle(ev.id)}
                style={{ accentColor: GOLD, width: 15, height: 15, flexShrink: 0 }}
              />
              {ev.title}
            </motion.label>
          ))}
        </motion.div>
      )}
    </div>
  );
}

export default function AdminCreateSponsorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<EventOption[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    sponsor_name: "", client_name: "", sponsor_address: "",
    logo_url: "", website_url: "", tier: "supporting",
    event_ids: [] as string[], bio: "", contact_name: "", contact_email: "",
    display_on_homepage: false, is_active: true,
  });

  useEffect(() => {
    fetch("/api/events?all=1")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setEvents(data); })
      .catch(() => {});
  }, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bucket", "Sponsor-logos");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
      const { url } = await res.json();
      setForm(p => ({ ...p, logo_url: url }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/sponsors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sponsor_name:     form.sponsor_name,
          client_name:      form.client_name      || null,
          sponsor_address:  form.sponsor_address  || null,
          logo_url:         form.logo_url         || null,
          website_url:      form.website_url      || null,
          tier:             form.tier,
          event_ids:        form.event_ids,
          bio:              form.bio              || null,
          contact_name:     form.contact_name     || null,
          contact_email:    form.contact_email    || null,
          display_on_homepage: form.display_on_homepage,
          is_active:        form.is_active,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to create partner");
      router.push("/admin/sponsors");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create partner");
    } finally { setLoading(false); }
  };

  return (
    <div className="admin-form-page">
      <motion.h1
        className="admin-page-title"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
      >
        Add Partner
      </motion.h1>

      <form className="admin-form" onSubmit={handleSubmit}>
        {error && (
          <motion.div className="admin-form-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {error}
          </motion.div>
        )}

        <div className="admin-form-grid">

          {/* Sponsor Name */}
          <motion.label className="admin-form-label" variants={fieldVariant(0.05)} initial="hidden" animate="visible">
            Sponsor Name *
            <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>Customer-facing display name</span>
            <input className="admin-form-input" value={form.sponsor_name} onChange={e => setForm(p => ({ ...p, sponsor_name: e.target.value }))} placeholder="e.g. Coca-Cola" required />
          </motion.label>

          {/* Tier */}
          <motion.label className="admin-form-label" variants={fieldVariant(0.09)} initial="hidden" animate="visible">
            Tier *
            <select className="admin-form-input" value={form.tier} onChange={e => setForm(p => ({ ...p, tier: e.target.value }))}>
              <option value="title">Title Partner</option>
              <option value="presenting">Presenting Partner</option>
              <option value="supporting">Supporting Partner</option>
            </select>
          </motion.label>

          {/* Client Name (legal) */}
          <motion.label className="admin-form-label" variants={fieldVariant(0.13)} initial="hidden" animate="visible">
            Client Name
            <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>Legal business name — internal only, used on invoices</span>
            <input className="admin-form-input" value={form.client_name} onChange={e => setForm(p => ({ ...p, client_name: e.target.value }))} placeholder="e.g. The Coca-Cola Company" />
          </motion.label>

          {/* Sponsor Address */}
          <motion.label className="admin-form-label" variants={fieldVariant(0.17)} initial="hidden" animate="visible">
            Billing Address
            <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>Appears on invoice</span>
            <input className="admin-form-input" value={form.sponsor_address} onChange={e => setForm(p => ({ ...p, sponsor_address: e.target.value }))} placeholder="123 Main St, Nashville, TN 37201" />
          </motion.label>

          {/* Logo upload */}
          <motion.label className="admin-form-label admin-form-full" variants={fieldVariant(0.21)} initial="hidden" animate="visible">
            Logo
            <div className="admin-image-upload-area">
              {form.logo_url ? (
                <div className="admin-image-preview-wrapper">
                  <img src={form.logo_url} alt="Partner logo" className="admin-image-preview" style={{ objectFit: "contain", background: "rgba(255,255,255,0.05)", borderRadius: 8 }} />
                  <button type="button" className="admin-image-remove-btn" onClick={() => { setForm(p => ({ ...p, logo_url: "" })); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                    ✕ Remove
                  </button>
                </div>
              ) : (
                <div
                  className="admin-image-dropzone"
                  style={isDragging ? { borderColor: GOLD, background: "rgba(255, 255, 255, 0.05)" } : undefined}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files[0]; if (file) handleUpload(file); }}
                >
                  {uploading ? (
                    <span className="admin-image-uploading">Uploading…</span>
                  ) : (
                    <>
                      <span className="admin-image-dropzone-icon">🖼</span>
                      <span className="admin-image-dropzone-text">Drop logo here or click to upload</span>
                      <span className="admin-image-dropzone-hint">PNG, JPG, WEBP, or SVG — transparent PNG works best</span>
                    </>
                  )}
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="admin-image-file-input" onChange={e => { const file = e.target.files?.[0]; if (file) handleUpload(file); }} />
            </div>
            {uploadError && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>{uploadError}</p>}
          </motion.label>

          {/* Website */}
          <motion.label className="admin-form-label" variants={fieldVariant(0.25)} initial="hidden" animate="visible">
            Website URL
            <input className="admin-form-input" type="url" value={form.website_url} onChange={e => setForm(p => ({ ...p, website_url: e.target.value }))} placeholder="https://example.com" />
          </motion.label>

          {/* Contact Name */}
          <motion.label className="admin-form-label" variants={fieldVariant(0.29)} initial="hidden" animate="visible">
            Contact Name
            <input className="admin-form-input" value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} placeholder="Primary billing contact" />
          </motion.label>

          {/* Contact Email */}
          <motion.label className="admin-form-label" variants={fieldVariant(0.33)} initial="hidden" animate="visible">
            Contact Email
            <input className="admin-form-input" type="email" value={form.contact_email} onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))} placeholder="billing@company.com" />
          </motion.label>

          {/* Bio */}
          <motion.label className="admin-form-label admin-form-full" variants={fieldVariant(0.37)} initial="hidden" animate="visible">
            Partner Bio
            <textarea className="admin-form-input" value={form.bio} onChange={e => setForm(p => ({ ...p, bio: e.target.value }))} placeholder="2–3 sentences about this company. Shown publicly on the Our Partners page on hover." rows={3} style={{ resize: "vertical" }} />
          </motion.label>

          {/* Event multi-select */}
          <motion.div className="admin-form-full" variants={fieldVariant(0.41)} initial="hidden" animate="visible">
            <label className="admin-form-label" style={{ display: "block" }}>
              Assign to Events
              <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Select one or more events, or leave blank for a global sponsor</span>
            </label>
            <EventMultiSelect events={events} selectedIds={form.event_ids} onChange={ids => setForm(p => ({ ...p, event_ids: ids }))} />
          </motion.div>

          {/* Toggles */}
          <motion.div className="admin-form-full" style={{ display: "flex", gap: 32, padding: "4px 0" }} variants={fieldVariant(0.45)} initial="hidden" animate="visible">
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "#fff" }}>
              <input type="checkbox" checked={form.display_on_homepage} onChange={e => setForm(p => ({ ...p, display_on_homepage: e.target.checked }))} style={{ accentColor: GOLD, width: 16, height: 16 }} />
              Show on Homepage
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "#fff" }}>
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} style={{ accentColor: GOLD, width: 16, height: 16 }} />
              Active
            </label>
          </motion.div>
        </div>

        <motion.div variants={fieldVariant(0.49)} initial="hidden" animate="visible">
          <button type="submit" className="admin-form-submit" disabled={loading || uploading}>
            {loading ? "Creating..." : "Create Partner"}
          </button>
        </motion.div>
      </form>
    </div>
  );
}
