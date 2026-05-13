"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type EventOption = { id: string; title: string };

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
    name: "", logo_url: "", website_url: "", tier: "supporting",
    event_id: "", bio: "", contact_name: "", contact_email: "",
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
      fd.append("bucket", "sponsor-logos");
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
          name: form.name, logo_url: form.logo_url || null,
          website_url: form.website_url || null, tier: form.tier,
          event_id: form.event_id || null, bio: form.bio || null,
          contact_name: form.contact_name || null,
          contact_email: form.contact_email || null,
          display_on_homepage: form.display_on_homepage,
          is_active: form.is_active,
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
      <h1 className="admin-page-title">Add Partner</h1>

      <form className="admin-form" onSubmit={handleSubmit}>
        {error && <div className="admin-form-error">{error}</div>}

        <div className="admin-form-grid">
          <label className="admin-form-label">
            Partner Name *
            <input className="admin-form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Coca-Cola" required />
          </label>

          <label className="admin-form-label">
            Tier *
            <select className="admin-form-input" value={form.tier} onChange={e => setForm(p => ({ ...p, tier: e.target.value }))}>
              <option value="title">Title Partner</option>
              <option value="presenting">Presenting Partner</option>
              <option value="supporting">Supporting Partner</option>
            </select>
          </label>

          {/* Logo — drag and drop upload */}
          <label className="admin-form-label admin-form-full">
            Logo
            <div className="admin-image-upload-area">
              {form.logo_url ? (
                <div className="admin-image-preview-wrapper">
                  <img
                    src={form.logo_url}
                    alt="Partner logo"
                    className="admin-image-preview"
                    style={{ objectFit: "contain", background: "rgba(255,255,255,0.05)", borderRadius: 8 }}
                  />
                  <button
                    type="button"
                    className="admin-image-remove-btn"
                    onClick={() => {
                      setForm(p => ({ ...p, logo_url: "" }));
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    ✕ Remove
                  </button>
                </div>
              ) : (
                <div
                  className="admin-image-dropzone"
                  style={isDragging ? { borderColor: "#d0c290", background: "rgba(208,194,144,0.05)" } : undefined}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files[0];
                    if (file) handleUpload(file);
                  }}
                >
                  {uploading ? (
                    <span className="admin-image-uploading">Uploading…</span>
                  ) : (
                    <>
                      <span className="admin-image-dropzone-icon">🖼</span>
                      <span className="admin-image-dropzone-text">
                        Drop logo here or click to upload
                      </span>
                      <span className="admin-image-dropzone-hint">
                        PNG, JPG, WEBP, or SVG — transparent PNG works best
                      </span>
                    </>
                  )}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="admin-image-file-input"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                }}
              />
            </div>
            {uploadError && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>{uploadError}</p>}
          </label>

          <label className="admin-form-label">
            Website URL
            <input className="admin-form-input" type="url" value={form.website_url} onChange={e => setForm(p => ({ ...p, website_url: e.target.value }))} placeholder="https://example.com" />
          </label>

          <label className="admin-form-label">
            Contact Name
            <input className="admin-form-input" value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} placeholder="Primary billing contact" />
          </label>

          <label className="admin-form-label">
            Contact Email
            <input className="admin-form-input" type="email" value={form.contact_email} onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))} placeholder="billing@company.com" />
          </label>

          <label className="admin-form-label admin-form-full">
            Partner Bio
            <textarea
              className="admin-form-input"
              value={form.bio}
              onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
              placeholder="2–3 sentences about this company. Shown publicly on the Our Partners page on hover."
              rows={3}
              style={{ resize: "vertical" }}
            />
          </label>

          <label className="admin-form-label admin-form-full">
            Assign to Event (leave blank for global)
            <select className="admin-form-input" value={form.event_id} onChange={e => setForm(p => ({ ...p, event_id: e.target.value }))}>
              <option value="">— Global sponsor —</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
            </select>
          </label>

          <div className="admin-form-full" style={{ display: "flex", gap: 32, padding: "4px 0" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "#fff" }}>
              <input type="checkbox" checked={form.display_on_homepage} onChange={e => setForm(p => ({ ...p, display_on_homepage: e.target.checked }))} style={{ accentColor: "#d0c290", width: 16, height: 16 }} />
              Show on Homepage
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "#fff" }}>
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} style={{ accentColor: "#d0c290", width: 16, height: 16 }} />
              Active
            </label>
          </div>
        </div>

        <button type="submit" className="admin-form-submit" disabled={loading || uploading}>
          {loading ? "Creating..." : "Create Partner"}
        </button>
      </form>
    </div>
  );
}
