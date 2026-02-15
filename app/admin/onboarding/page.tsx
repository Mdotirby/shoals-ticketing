"use client";

import { useState } from "react";
import { getCookie } from "@/lib/cookies";

export default function AdminOnboardingPage() {
  const [step, setStep] = useState<"venue" | "admin" | "done">("venue");
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
    primary_color: "#d0c290",
    secondary_color: "#0b0d1d",
    accent_color: "#202045",
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
          logo_url: null,
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
          primary_color: venue.primary_color,
          secondary_color: venue.secondary_color,
          accent_color: venue.accent_color,
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

          <h2 className="admin-form-section-title">Brand Colors</h2>
          <div className="admin-form-grid">
            <label className="admin-form-label">
              Primary
              <div className="color-input-row">
                <input type="color" value={venue.primary_color} onChange={(e) => setVenue({ ...venue, primary_color: e.target.value })} className="color-swatch" />
                <input type="text" className="admin-form-input" value={venue.primary_color} onChange={(e) => setVenue({ ...venue, primary_color: e.target.value })} />
              </div>
            </label>
            <label className="admin-form-label">
              Secondary
              <div className="color-input-row">
                <input type="color" value={venue.secondary_color} onChange={(e) => setVenue({ ...venue, secondary_color: e.target.value })} className="color-swatch" />
                <input type="text" className="admin-form-input" value={venue.secondary_color} onChange={(e) => setVenue({ ...venue, secondary_color: e.target.value })} />
              </div>
            </label>
            <label className="admin-form-label">
              Accent
              <div className="color-input-row">
                <input type="color" value={venue.accent_color} onChange={(e) => setVenue({ ...venue, accent_color: e.target.value })} className="color-swatch" />
                <input type="text" className="admin-form-input" value={venue.accent_color} onChange={(e) => setVenue({ ...venue, accent_color: e.target.value })} />
              </div>
            </label>
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
          <button className="admin-form-submit" onClick={() => { setStep("venue"); setVenue({ name: "", slug: "", capacity: "", address_street: "", address_city: "", address_state: "", address_zip: "", primary_color: "#d0c290", secondary_color: "#0b0d1d", accent_color: "#202045" }); setAdmin({ email: "", password: "", first_name: "", last_name: "" }); }}>
            Onboard Another Venue
          </button>
        </div>
      )}
    </div>
  );
}
