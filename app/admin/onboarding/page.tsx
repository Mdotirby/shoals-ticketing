"use client";

import { useState } from "react";
import { getCookie } from "@/lib/cookies";

export default function AdminOnboardingPage() {
  const [step, setStep] = useState<"venue" | "admin" | "done">("venue");
  const [uploading, setUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdVenueId, setCreatedVenueId] = useState("");
  const [createdVenueName, setCreatedVenueName] = useState("");

  // Venue form
  const [venue, setVenue] = useState({
    name: "",
    slug: "",
    capacity: "",
    address_street: "",
    address_city: "",
    address_state: "",
    address_zip: "",
    ticketing_fee: "3.00",
    venue_rebate: "0.00",
    tax_rate: "0.09",
  });

  // Admin form
  const [admin, setAdmin] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
  });

  // Check if user is owner
  const role = getCookie("user-role");
  if (role && role !== "owner") {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Access Denied</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>
          Only the platform owner can access onboarding.
        </p>
      </div>
    );
  }

  const handleCreateVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Create the venue
      const res = await fetch("/api/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: venue.name,
          slug: venue.slug,
          logo_url: logoPreview || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create venue");
      }

      const newVenue = await res.json();
      setCreatedVenueId(newVenue.id);
      setCreatedVenueName(newVenue.name);

      // Update venue settings (capacity, address, colors)
      await fetch("/api/venues", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newVenue.id,
          capacity: venue.capacity ? parseInt(venue.capacity) : null,
          address_street: venue.address_street || null,
          address_city: venue.address_city || null,
          address_state: venue.address_state || null,
          address_zip: venue.address_zip || null,
          ticketing_fee: parseFloat(venue.ticketing_fee) || 3.00,
          venue_rebate: parseFloat(venue.venue_rebate) || 0,
          tax_rate: parseFloat(venue.tax_rate) || 0.09,
        }),
      });

      setStep("admin");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: admin.email,
          password: admin.password,
          role: "venue_admin",
          venue_id: createdVenueId,
          first_name: admin.first_name || null,
          last_name: admin.last_name || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create admin");
      }

      setStep("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Onboard New Venue</h1>

      {step === "venue" && (
        <form className="admin-form" onSubmit={handleCreateVenue}>
          {error && <div className="admin-form-error">{error}</div>}

          <h2 className="admin-form-section-title">Venue Information</h2>
          <div className="admin-form-grid">
            <label className="admin-form-label">
              Venue Name *
              <input type="text" className="admin-form-input" value={venue.name} onChange={(e) => setVenue({ ...venue, name: e.target.value })} required />
            </label>
            <label className="admin-form-label">
              Subdomain Slug *
              <input type="text" className="admin-form-input" value={venue.slug} onChange={(e) => setVenue({ ...venue, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="e.g. renshoals" required />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{venue.slug ? `${venue.slug}.venuecore.live` : ""}</span>
            </label>
            <label className="admin-form-label">
              Total Capacity
              <input type="number" className="admin-form-input" value={venue.capacity} onChange={(e) => setVenue({ ...venue, capacity: e.target.value })} />
            </label>
            <label className="admin-form-label">
              Street Address
              <input type="text" className="admin-form-input" value={venue.address_street} onChange={(e) => setVenue({ ...venue, address_street: e.target.value })} />
            </label>
            <label className="admin-form-label">
              City
              <input type="text" className="admin-form-input" value={venue.address_city} onChange={(e) => setVenue({ ...venue, address_city: e.target.value })} />
            </label>
            <label className="admin-form-label">
              State
              <input type="text" className="admin-form-input" value={venue.address_state} onChange={(e) => setVenue({ ...venue, address_state: e.target.value })} maxLength={2} />
            </label>
            <label className="admin-form-label">
              ZIP
              <input type="text" className="admin-form-input" value={venue.address_zip} onChange={(e) => setVenue({ ...venue, address_zip: e.target.value })} />
            </label>
          </div>

          <h2 className="admin-form-section-title">Fees & Rebate</h2>
          <div className="admin-form-grid">
            <label className="admin-form-label">
              Ticketing Fee ($)
              <input type="number" className="admin-form-input" value={venue.ticketing_fee} onChange={(e) => setVenue({ ...venue, ticketing_fee: e.target.value })} step="0.01" min="0" placeholder="3.00" />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Fee added to each ticket sold</span>
            </label>
            <label className="admin-form-label">
              Venue Rebate ($)
              <input type="number" className="admin-form-input" value={venue.venue_rebate} onChange={(e) => setVenue({ ...venue, venue_rebate: e.target.value })} step="0.01" min="0" placeholder="0.00" />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Quarterly rebate per ticket — incentive for platform use</span>
            </label>
            <label className="admin-form-label">
              Tax Rate (decimal)
              <input type="number" className="admin-form-input" value={venue.tax_rate} onChange={(e) => setVenue({ ...venue, tax_rate: e.target.value })} step="0.01" min="0" placeholder="0.09" />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>e.g. 0.09 = 9%, 0.11 = 11%</span>
            </label>
          </div>

          <h2 className="admin-form-section-title">Venue Logo</h2>
          <div style={{ marginBottom: 16 }}>
            {logoPreview ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img src={logoPreview} alt="Logo" style={{ width: 80, height: 80, objectFit: "contain", borderRadius: 8 }} />
                <button type="button" className="admin-tier-remove-btn" onClick={() => { setLogoPreview(null); setVenue({ ...venue }); }}>Remove</button>
              </div>
            ) : (
              <label className="admin-form-label">
                Upload Logo (.png, .jpg, .jpeg — max 45MB)
                <input type="file" accept=".png,.jpg,.jpeg" className="admin-form-input" style={{ padding: 8 }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 45 * 1024 * 1024) { setError("File too large (45MB max)"); return; }
                    setUploading(true); setError("");
                    try {
                      const fd = new FormData(); fd.append("file", file, `venue-logo-${Date.now()}.${file.name.split(".").pop()}`); fd.append("bucket", "venue-logos");
                      const res = await fetch("/api/upload", { method: "POST", body: fd });
                      if (!res.ok) throw new Error("Upload failed");
                      const { url } = await res.json();
                      setVenue({ ...venue }); // trigger re-render
                      setLogoPreview(url);
                      // Will be saved to venue on create
                      (venue as Record<string, unknown>).logo_url = url;
                    } catch { setError("Logo upload failed"); }
                    finally { setUploading(false); }
                  }}
                />
                {uploading && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Uploading…</span>}
              </label>
            )}
          </div>

          <button type="submit" className="admin-form-submit" disabled={loading}>
            {loading ? "Creating Venue…" : "Create Venue & Continue"}
          </button>
        </form>
      )}

      {step === "admin" && (
        <form className="admin-form" onSubmit={handleCreateAdmin}>
          {error && <div className="admin-form-error">{error}</div>}

          <div className="admin-form-success">
            Venue &quot;{createdVenueName}&quot; created. Now assign a venue admin.
          </div>

          <h2 className="admin-form-section-title">Venue Admin Account</h2>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: "0 0 12px" }}>
            This person will manage {createdVenueName}. They&apos;ll be assigned the <strong>venue_admin</strong> role.
          </p>
          <div className="admin-form-grid">
            <label className="admin-form-label">
              First Name
              <input type="text" className="admin-form-input" value={admin.first_name} onChange={(e) => setAdmin({ ...admin, first_name: e.target.value })} />
            </label>
            <label className="admin-form-label">
              Last Name
              <input type="text" className="admin-form-input" value={admin.last_name} onChange={(e) => setAdmin({ ...admin, last_name: e.target.value })} />
            </label>
            <label className="admin-form-label">
              Email *
              <input type="email" className="admin-form-input" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} required />
            </label>
            <label className="admin-form-label">
              Password *
              <input type="password" className="admin-form-input" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} required minLength={6} />
            </label>
          </div>

          <button type="submit" className="admin-form-submit" disabled={loading}>
            {loading ? "Creating Admin…" : "Create Admin & Finish"}
          </button>
        </form>
      )}

      {step === "done" && (
        <div className="admin-form">
          <div className="admin-form-success">
            Onboarding complete! {createdVenueName} is ready. The venue admin can now log in.
          </div>
          <button className="admin-form-submit" onClick={() => { setStep("venue"); setVenue({ name: "", slug: "", capacity: "", address_street: "", address_city: "", address_state: "", address_zip: "", ticketing_fee: "3.00", venue_rebate: "0.00", tax_rate: "0.09" }); setAdmin({ email: "", password: "", first_name: "", last_name: "" }); }}>
            Onboard Another Venue
          </button>
        </div>
      )}
    </div>
  );
}
