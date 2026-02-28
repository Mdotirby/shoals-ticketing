"use client";

import { useState } from "react";
import { getCookie } from "@/lib/cookies";

type OnboardingType = "venue" | "organizer" | "artist" | "partner";
type Step = "form" | "admin" | "done";

export default function AdminOnboardingPage() {
  const [onboardingType, setOnboardingType] = useState<OnboardingType>("venue");
  const [step, setStep] = useState<Step>("form");
  const [uploading, setUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdEntityId, setCreatedEntityId] = useState("");
  const [createdEntityName, setCreatedEntityName] = useState("");

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
    facility_fee: "0",
    venue_rebate: "0.00",
    tax_rate: "0.09",
  });

  // Organizer form
  const [organizer, setOrganizer] = useState({
    company_name: "",
    slug: "",
    contact_first: "",
    contact_last: "",
    email: "",
    phone: "",
  });

  // Artist form
  const [artist, setArtist] = useState({
    name: "",
    genre: "",
    mgmt_email: "",
    mgmt_phone: "",
    instagram: "",
    spotify: "",
    website: "",
    bio: "",
  });

  // Partner form
  const [partner, setPartner] = useState({
    company_name: "",
    contact_first: "",
    contact_last: "",
    email: "",
    phone: "",
    tier: "standard",
  });

  // Admin form (step 2 for venue/organizer/partner)
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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 45 * 1024 * 1024) { setError("File too large (45MB max)"); return; }
    setUploading(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file, `logo-${Date.now()}.${file.name.split(".").pop()}`);
      fd.append("bucket", "venue-logos");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      setLogoPreview(url);
    } catch { setError("Logo upload failed"); }
    finally { setUploading(false); }
  };

  // ── VENUE CREATION ──
  const handleCreateVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
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
      setCreatedEntityId(newVenue.id);
      setCreatedEntityName(newVenue.name);

      // Update venue settings
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
          facility_fee: parseFloat(venue.facility_fee) || 0,
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

  // ── ORGANIZER CREATION (creates a venue record typed as organizer) ──
  const handleCreateOrganizer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: organizer.company_name,
          slug: organizer.slug,
          logo_url: logoPreview || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create organizer");
      }

      const newVenue = await res.json();
      setCreatedEntityId(newVenue.id);
      setCreatedEntityName(organizer.company_name);

      // Update with organizer contact info
      await fetch("/api/venues", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newVenue.id,
          buyer_name: `${organizer.contact_first} ${organizer.contact_last}`.trim(),
          buyer_email: organizer.email || null,
          buyer_phone: organizer.phone || null,
        }),
      });

      setStep("admin");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  // ── ARTIST CREATION ──
  const handleCreateArtist = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Create admin user with artist role (no venue_id)
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: artist.name,
          last_name: "",
          role: "artist",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create artist");
      }

      const newArtist = await res.json();
      setCreatedEntityId(newArtist.id);
      setCreatedEntityName(artist.name);
      setStep("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  // ── PARTNER CREATION ──
  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: partner.email,
          password: "TempPass123!",
          first_name: partner.contact_first,
          last_name: partner.contact_last,
          role: "partner",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create partner");
      }

      const newPartner = await res.json();
      setCreatedEntityId(newPartner.id);
      setCreatedEntityName(partner.company_name);
      setStep("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  // ── ADMIN USER CREATION (step 2 for venue/organizer) ──
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const adminRole = onboardingType === "venue" ? "venue_admin" : "venue_admin";
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: admin.email,
          password: admin.password,
          role: adminRole,
          venue_id: createdEntityId,
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

  const resetAll = () => {
    setStep("form");
    setError("");
    setLogoPreview(null);
    setCreatedEntityId("");
    setCreatedEntityName("");
    setVenue({ name: "", slug: "", capacity: "", address_street: "", address_city: "", address_state: "", address_zip: "", ticketing_fee: "3.00", facility_fee: "0", venue_rebate: "0.00", tax_rate: "0.09" });
    setOrganizer({ company_name: "", slug: "", contact_first: "", contact_last: "", email: "", phone: "" });
    setArtist({ name: "", genre: "", mgmt_email: "", mgmt_phone: "", instagram: "", spotify: "", website: "", bio: "" });
    setPartner({ company_name: "", contact_first: "", contact_last: "", email: "", phone: "", tier: "standard" });
    setAdmin({ email: "", password: "", first_name: "", last_name: "" });
  };

  const typeLabels: Record<OnboardingType, string> = {
    venue: "Venue",
    organizer: "Organizer",
    artist: "Artist",
    partner: "Partner",
  };

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Onboarding</h1>

      {/* ── Type Selector ── */}
      {step === "form" && (
        <div style={{ marginBottom: 24 }}>
          <label className="admin-form-label" style={{ marginBottom: 8 }}>
            What are you onboarding?
            <select
              className="admin-form-input"
              value={onboardingType}
              onChange={(e) => {
                setOnboardingType(e.target.value as OnboardingType);
                setError("");
                setLogoPreview(null);
              }}
              style={{ maxWidth: 300 }}
            >
              <option value="venue">Venue</option>
              <option value="organizer">Organizer</option>
              <option value="artist">Artist</option>
              <option value="partner">Partner</option>
            </select>
          </label>
        </div>
      )}

      {/* ═══════════════════════════════════
           VENUE FORM
          ═══════════════════════════════════ */}
      {step === "form" && onboardingType === "venue" && (
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
              Facility Fee ($)
              <input type="number" className="admin-form-input" value={venue.facility_fee} onChange={(e) => setVenue({ ...venue, facility_fee: e.target.value })} step="0.01" min="0" placeholder="0.00" />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Per-ticket facility fee included in ticket price</span>
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
                <button type="button" className="admin-tier-remove-btn" onClick={() => setLogoPreview(null)}>Remove</button>
              </div>
            ) : (
              <label className="admin-form-label">
                Upload Logo (.png, .jpg, .jpeg — max 45MB)
                <input type="file" accept=".png,.jpg,.jpeg" className="admin-form-input" style={{ padding: 8 }} onChange={handleLogoUpload} />
                {uploading && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Uploading...</span>}
              </label>
            )}
          </div>

          <button type="submit" className="admin-form-submit" disabled={loading}>
            {loading ? "Creating Venue..." : "Create Venue & Continue"}
          </button>
        </form>
      )}

      {/* ═══════════════════════════════════
           ORGANIZER FORM
          ═══════════════════════════════════ */}
      {step === "form" && onboardingType === "organizer" && (
        <form className="admin-form" onSubmit={handleCreateOrganizer}>
          {error && <div className="admin-form-error">{error}</div>}

          <h2 className="admin-form-section-title">Organizer Information</h2>
          <div className="admin-form-grid">
            <label className="admin-form-label">
              Company / Organization Name *
              <input type="text" className="admin-form-input" value={organizer.company_name} onChange={(e) => setOrganizer({ ...organizer, company_name: e.target.value })} required />
            </label>
            <label className="admin-form-label">
              Subdomain Slug *
              <input type="text" className="admin-form-input" value={organizer.slug} onChange={(e) => setOrganizer({ ...organizer, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="e.g. west72" required />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{organizer.slug ? `${organizer.slug}.venuecore.live` : ""}</span>
            </label>
          </div>

          <h2 className="admin-form-section-title">Primary Contact</h2>
          <div className="admin-form-grid">
            <label className="admin-form-label">
              First Name *
              <input type="text" className="admin-form-input" value={organizer.contact_first} onChange={(e) => setOrganizer({ ...organizer, contact_first: e.target.value })} required />
            </label>
            <label className="admin-form-label">
              Last Name *
              <input type="text" className="admin-form-input" value={organizer.contact_last} onChange={(e) => setOrganizer({ ...organizer, contact_last: e.target.value })} required />
            </label>
            <label className="admin-form-label">
              Email
              <input type="email" className="admin-form-input" value={organizer.email} onChange={(e) => setOrganizer({ ...organizer, email: e.target.value })} />
            </label>
            <label className="admin-form-label">
              Phone
              <input type="tel" className="admin-form-input" value={organizer.phone} onChange={(e) => setOrganizer({ ...organizer, phone: e.target.value })} />
            </label>
          </div>

          <h2 className="admin-form-section-title">Logo</h2>
          <div style={{ marginBottom: 16 }}>
            {logoPreview ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img src={logoPreview} alt="Logo" style={{ width: 80, height: 80, objectFit: "contain", borderRadius: 8 }} />
                <button type="button" className="admin-tier-remove-btn" onClick={() => setLogoPreview(null)}>Remove</button>
              </div>
            ) : (
              <label className="admin-form-label">
                Upload Logo (.png, .jpg, .jpeg — max 45MB)
                <input type="file" accept=".png,.jpg,.jpeg" className="admin-form-input" style={{ padding: 8 }} onChange={handleLogoUpload} />
                {uploading && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Uploading...</span>}
              </label>
            )}
          </div>

          <button type="submit" className="admin-form-submit" disabled={loading}>
            {loading ? "Creating Organizer..." : "Create Organizer & Continue"}
          </button>
        </form>
      )}

      {/* ═══════════════════════════════════
           ARTIST FORM
          ═══════════════════════════════════ */}
      {step === "form" && onboardingType === "artist" && (
        <form className="admin-form" onSubmit={handleCreateArtist}>
          {error && <div className="admin-form-error">{error}</div>}

          <h2 className="admin-form-section-title">Artist Information</h2>
          <div className="admin-form-grid">
            <label className="admin-form-label">
              Artist / Act Name *
              <input type="text" className="admin-form-input" value={artist.name} onChange={(e) => setArtist({ ...artist, name: e.target.value })} required />
            </label>
            <label className="admin-form-label">
              Genre
              <input type="text" className="admin-form-input" value={artist.genre} onChange={(e) => setArtist({ ...artist, genre: e.target.value })} placeholder="e.g. Country, Rock, Hip-Hop" />
            </label>
          </div>

          <h2 className="admin-form-section-title">Management Contact</h2>
          <div className="admin-form-grid">
            <label className="admin-form-label">
              Management Email
              <input type="email" className="admin-form-input" value={artist.mgmt_email} onChange={(e) => setArtist({ ...artist, mgmt_email: e.target.value })} />
            </label>
            <label className="admin-form-label">
              Management Phone
              <input type="tel" className="admin-form-input" value={artist.mgmt_phone} onChange={(e) => setArtist({ ...artist, mgmt_phone: e.target.value })} />
            </label>
          </div>

          <h2 className="admin-form-section-title">Social & Links</h2>
          <div className="admin-form-grid">
            <label className="admin-form-label">
              Instagram
              <input type="text" className="admin-form-input" value={artist.instagram} onChange={(e) => setArtist({ ...artist, instagram: e.target.value })} placeholder="@handle" />
            </label>
            <label className="admin-form-label">
              Spotify
              <input type="url" className="admin-form-input" value={artist.spotify} onChange={(e) => setArtist({ ...artist, spotify: e.target.value })} placeholder="https://open.spotify.com/artist/..." />
            </label>
            <label className="admin-form-label">
              Website
              <input type="url" className="admin-form-input" value={artist.website} onChange={(e) => setArtist({ ...artist, website: e.target.value })} placeholder="https://..." />
            </label>
          </div>

          <h2 className="admin-form-section-title">Bio</h2>
          <textarea
            className="admin-form-input"
            value={artist.bio}
            onChange={(e) => setArtist({ ...artist, bio: e.target.value })}
            rows={4}
            placeholder="Brief artist bio..."
            style={{ resize: "vertical" }}
          />

          <button type="submit" className="admin-form-submit" disabled={loading} style={{ marginTop: 16 }}>
            {loading ? "Creating Artist..." : "Create Artist"}
          </button>
        </form>
      )}

      {/* ═══════════════════════════════════
           PARTNER FORM
          ═══════════════════════════════════ */}
      {step === "form" && onboardingType === "partner" && (
        <form className="admin-form" onSubmit={handleCreatePartner}>
          {error && <div className="admin-form-error">{error}</div>}

          <h2 className="admin-form-section-title">Partner Information</h2>
          <div className="admin-form-grid">
            <label className="admin-form-label">
              Company Name *
              <input type="text" className="admin-form-input" value={partner.company_name} onChange={(e) => setPartner({ ...partner, company_name: e.target.value })} required />
            </label>
            <label className="admin-form-label">
              Partner Tier
              <select className="admin-form-input" value={partner.tier} onChange={(e) => setPartner({ ...partner, tier: e.target.value })}>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
                <option value="platinum">Platinum</option>
              </select>
            </label>
          </div>

          <h2 className="admin-form-section-title">Primary Contact</h2>
          <div className="admin-form-grid">
            <label className="admin-form-label">
              First Name *
              <input type="text" className="admin-form-input" value={partner.contact_first} onChange={(e) => setPartner({ ...partner, contact_first: e.target.value })} required />
            </label>
            <label className="admin-form-label">
              Last Name *
              <input type="text" className="admin-form-input" value={partner.contact_last} onChange={(e) => setPartner({ ...partner, contact_last: e.target.value })} required />
            </label>
            <label className="admin-form-label">
              Email *
              <input type="email" className="admin-form-input" value={partner.email} onChange={(e) => setPartner({ ...partner, email: e.target.value })} required />
            </label>
            <label className="admin-form-label">
              Phone
              <input type="tel" className="admin-form-input" value={partner.phone} onChange={(e) => setPartner({ ...partner, phone: e.target.value })} />
            </label>
          </div>

          <h2 className="admin-form-section-title">Logo</h2>
          <div style={{ marginBottom: 16 }}>
            {logoPreview ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img src={logoPreview} alt="Logo" style={{ width: 80, height: 80, objectFit: "contain", borderRadius: 8 }} />
                <button type="button" className="admin-tier-remove-btn" onClick={() => setLogoPreview(null)}>Remove</button>
              </div>
            ) : (
              <label className="admin-form-label">
                Upload Logo (.png, .jpg, .jpeg — max 45MB)
                <input type="file" accept=".png,.jpg,.jpeg" className="admin-form-input" style={{ padding: 8 }} onChange={handleLogoUpload} />
                {uploading && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Uploading...</span>}
              </label>
            )}
          </div>

          <button type="submit" className="admin-form-submit" disabled={loading}>
            {loading ? "Creating Partner..." : "Create Partner"}
          </button>
        </form>
      )}

      {/* ═══════════════════════════════════
           STEP 2: ADMIN ACCOUNT (venue/organizer)
          ═══════════════════════════════════ */}
      {step === "admin" && (
        <form className="admin-form" onSubmit={handleCreateAdmin}>
          {error && <div className="admin-form-error">{error}</div>}

          <div className="admin-form-success">
            {typeLabels[onboardingType]} &quot;{createdEntityName}&quot; created. Now assign an admin.
          </div>

          <h2 className="admin-form-section-title">{typeLabels[onboardingType]} Admin Account</h2>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: "0 0 12px" }}>
            This person will manage {createdEntityName}. They&apos;ll be assigned the <strong>venue_admin</strong> role.
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
            {loading ? "Creating Admin..." : "Create Admin & Finish"}
          </button>
        </form>
      )}

      {/* ═══════════════════════════════════
           DONE
          ═══════════════════════════════════ */}
      {step === "done" && (
        <div className="admin-form">
          <div className="admin-form-success">
            Onboarding complete! {typeLabels[onboardingType]} &quot;{createdEntityName}&quot; is ready.
            {onboardingType === "partner" && " The partner can now log in with their email and temporary password (TempPass123!)."}
            {(onboardingType === "venue" || onboardingType === "organizer") && " The admin can now log in."}
            {onboardingType === "artist" && " The artist has been added to the system."}
          </div>
          <button className="admin-form-submit" onClick={resetAll}>
            Onboard Another {typeLabels[onboardingType]}
          </button>
        </div>
      )}
    </div>
  );
}
