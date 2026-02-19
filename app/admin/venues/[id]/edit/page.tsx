"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function AdminEditVenuePage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    name: "", slug: "", nickname: "", capacity: "", logo_url: "",
    hero_image_url: "", hero_image_2_url: "",
    address_street: "", address_city: "", address_state: "", address_zip: "",
    buyer_name: "", contract_signatory: "", buyer_phone: "", buyer_email: "", promoter_address: "",
    ticketing_fee: "3.00", venue_rebate: "0.00", tax_rate: "0.09",
  });

  useEffect(() => {
    fetch("/api/venues")
      .then((r) => r.json())
      .then((venues: Array<Record<string, unknown>>) => {
        const v = venues.find((x) => x.id === id);
        if (!v) { setError("Venue not found"); setLoading(false); return; }
        setForm({
          name: String(v.name || ""), slug: String(v.slug || ""), nickname: String(v.nickname || ""),
          capacity: v.capacity ? String(v.capacity) : "", logo_url: String(v.logo_url || ""),
          hero_image_url: String(v.hero_image_url || ""), hero_image_2_url: String(v.hero_image_2_url || ""),
          address_street: String(v.address_street || ""), address_city: String(v.address_city || ""),
          address_state: String(v.address_state || ""), address_zip: String(v.address_zip || ""),
          buyer_name: String(v.buyer_name || ""), contract_signatory: String(v.contract_signatory || ""),
          buyer_phone: String(v.buyer_phone || ""), buyer_email: String(v.buyer_email || ""),
          promoter_address: String(v.promoter_address || ""),
          ticketing_fee: String(v.ticketing_fee || "3.00"), venue_rebate: String(v.venue_rebate || "0"),
          tax_rate: String(v.tax_rate || "0.09"),
        });
        setLoading(false);
      })
      .catch(() => { setError("Failed to load venue"); setLoading(false); });
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(""); setSuccess("");
    try {
      const res = await fetch("/api/venues", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id, name: form.name, slug: form.slug, nickname: form.nickname || null,
          capacity: form.capacity ? parseInt(form.capacity) : null, logo_url: form.logo_url || null,
          hero_image_url: form.hero_image_url || null, hero_image_2_url: form.hero_image_2_url || null,
          address_street: form.address_street || null, address_city: form.address_city || null,
          address_state: form.address_state || null, address_zip: form.address_zip || null,
          buyer_name: form.buyer_name || null, contract_signatory: form.contract_signatory || null,
          buyer_phone: form.buyer_phone || null, buyer_email: form.buyer_email || null,
          promoter_address: form.promoter_address || null,
          ticketing_fee: parseFloat(form.ticketing_fee) || 3.00,
          venue_rebate: parseFloat(form.venue_rebate) || 0,
          tax_rate: parseFloat(form.tax_rate) || 0.09,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSuccess("Venue saved.");
    } catch { setError("Failed to save."); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="admin-form-page"><h1 className="admin-page-title">Loading…</h1></div>;

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Edit Venue: {form.name}</h1>
        <button className="admin-sponsor-edit-btn" onClick={() => router.push("/portal")}>← Back</button>
      </div>

      <form className="admin-form" onSubmit={handleSave}>
        {error && <div className="admin-form-error">{error}</div>}
        {success && <div className="admin-form-success">{success}</div>}

        <h2 className="admin-form-section-title">Venue Info</h2>
        <div className="admin-form-grid">
          <label className="admin-form-label">Name<input type="text" className="admin-form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="admin-form-label">Slug<input type="text" className="admin-form-input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></label>
          <label className="admin-form-label">Nickname<input type="text" className="admin-form-input" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} /></label>
          <label className="admin-form-label">Capacity<input type="number" className="admin-form-input" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></label>
          <label className="admin-form-label">Street<input type="text" className="admin-form-input" value={form.address_street} onChange={(e) => setForm({ ...form, address_street: e.target.value })} /></label>
          <label className="admin-form-label">City<input type="text" className="admin-form-input" value={form.address_city} onChange={(e) => setForm({ ...form, address_city: e.target.value })} /></label>
          <label className="admin-form-label">State<input type="text" className="admin-form-input" value={form.address_state} onChange={(e) => setForm({ ...form, address_state: e.target.value })} maxLength={2} /></label>
          <label className="admin-form-label">ZIP<input type="text" className="admin-form-input" value={form.address_zip} onChange={(e) => setForm({ ...form, address_zip: e.target.value })} /></label>
        </div>

        <h2 className="admin-form-section-title">Logo</h2>
        <div style={{ marginBottom: 16 }}>
          {form.logo_url ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <img src={form.logo_url} alt="Logo" style={{ width: 80, height: 80, objectFit: "contain", borderRadius: 8 }} />
              <button type="button" className="admin-tier-remove-btn" onClick={() => setForm({ ...form, logo_url: "" })}>Remove</button>
            </div>
          ) : (
            <label className="admin-form-label">
              Upload (.png, .jpg, .jpeg — max 45MB)
              <input type="file" accept=".png,.jpg,.jpeg" className="admin-form-input" style={{ padding: 8 }}
                onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  if (file.size > 45 * 1024 * 1024) { setError("File too large"); return; }
                  setUploading(true);
                  try {
                    const fd = new FormData(); fd.append("file", file); fd.append("bucket", "venue-logos");
                    const res = await fetch("/api/upload", { method: "POST", body: fd });
                    if (!res.ok) throw new Error();
                    const { url } = await res.json();
                    setForm({ ...form, logo_url: url });
                  } catch { setError("Upload failed"); }
                  finally { setUploading(false); }
                }}
              />
              {uploading && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Uploading…</span>}
            </label>
          )}
        </div>

        <h2 className="admin-form-section-title">Hero Images</h2>
        <div className="admin-form-grid">
          <label className="admin-form-label">
            Hero Image 1 (main)
            {form.hero_image_url && <img src={form.hero_image_url} alt="Hero 1" style={{ width: "100%", maxHeight: 120, objectFit: "cover", borderRadius: 8, marginTop: 4 }} />}
            <input type="file" accept=".png,.jpg,.jpeg" className="admin-form-input" style={{ padding: 8, marginTop: 4 }}
              onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return;
                const fd = new FormData(); fd.append("file", file); fd.append("bucket", "hero-images");
                const res = await fetch("/api/upload", { method: "POST", body: fd });
                if (res.ok) { const { url } = await res.json(); setForm({ ...form, hero_image_url: url }); }
              }}
            />
          </label>
          <label className="admin-form-label">
            Hero Image 2 (secondary)
            {form.hero_image_2_url && <img src={form.hero_image_2_url} alt="Hero 2" style={{ width: "100%", maxHeight: 120, objectFit: "cover", borderRadius: 8, marginTop: 4 }} />}
            <input type="file" accept=".png,.jpg,.jpeg" className="admin-form-input" style={{ padding: 8, marginTop: 4 }}
              onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return;
                const fd = new FormData(); fd.append("file", file); fd.append("bucket", "hero-images");
                const res = await fetch("/api/upload", { method: "POST", body: fd });
                if (res.ok) { const { url } = await res.json(); setForm({ ...form, hero_image_2_url: url }); }
              }}
            />
          </label>
        </div>

        <h2 className="admin-form-section-title">Fees</h2>
        <div className="admin-form-grid">
          <label className="admin-form-label">Ticketing Fee ($)<input type="number" className="admin-form-input" value={form.ticketing_fee} onChange={(e) => setForm({ ...form, ticketing_fee: e.target.value })} step="0.01" /></label>
          <label className="admin-form-label">Venue Rebate ($)<input type="number" className="admin-form-input" value={form.venue_rebate} onChange={(e) => setForm({ ...form, venue_rebate: e.target.value })} step="0.01" /></label>
          <label className="admin-form-label">Tax Rate (decimal)<input type="number" className="admin-form-input" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} step="0.01" /></label>
        </div>

        <h2 className="admin-form-section-title">Buyer / Promoter</h2>
        <div className="admin-form-grid">
          <label className="admin-form-label">Buyer Name<input type="text" className="admin-form-input" value={form.buyer_name} onChange={(e) => setForm({ ...form, buyer_name: e.target.value })} /></label>
          <label className="admin-form-label">Signatory<input type="text" className="admin-form-input" value={form.contract_signatory} onChange={(e) => setForm({ ...form, contract_signatory: e.target.value })} /></label>
          <label className="admin-form-label">Phone<input type="tel" className="admin-form-input" value={form.buyer_phone} onChange={(e) => setForm({ ...form, buyer_phone: e.target.value })} /></label>
          <label className="admin-form-label">Email<input type="email" className="admin-form-input" value={form.buyer_email} onChange={(e) => setForm({ ...form, buyer_email: e.target.value })} /></label>
          <label className="admin-form-label admin-form-full">Promoter Address<input type="text" className="admin-form-input" value={form.promoter_address} onChange={(e) => setForm({ ...form, promoter_address: e.target.value })} /></label>
        </div>

        <button type="submit" className="admin-form-submit" disabled={saving || uploading}>
          {saving ? "Saving…" : "Save Venue"}
        </button>
      </form>
    </div>
  );
}
