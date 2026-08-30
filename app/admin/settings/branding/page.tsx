"use client";

import { useState, useEffect, useRef } from "react";
import { getCookie } from "@/lib/cookies";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type BrandingState = {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  logo_url: string | null;
  favicon_url: string | null;
  hero_image_url: string | null;
  hero_image_2_url: string | null;
  homepage_headline: string;
  homepage_subheadline: string;
  homepage_cta_text: string;
  homepage_cta_url: string;
  tagline: string;
  footer_description: string;
  support_email: string;
  contact_email: string;
  instagram_url: string;
  facebook_url: string;
};

const DEFAULTS: BrandingState = {
  primary_color: "#ffffff",
  secondary_color: "#111827",
  accent_color: "#202045",
  logo_url: null,
  favicon_url: null,
  hero_image_url: null,
  hero_image_2_url: null,
  homepage_headline: "",
  homepage_subheadline: "",
  homepage_cta_text: "See What's Coming",
  homepage_cta_url: "/events",
  tagline: "",
  footer_description: "",
  support_email: "",
  contact_email: "",
  instagram_url: "",
  facebook_url: "",
};

/* ------------------------------------------------------------------ */
/*  Color Picker Component                                             */
/* ------------------------------------------------------------------ */

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--vc-text-secondary)",
        }}
      >
        {label}
      </label>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "var(--vc-surface)",
          border: "1px solid var(--vc-border)",
          borderRadius: "var(--vc-radius-sm)",
          padding: "8px 12px",
        }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 36,
            height: 36,
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            background: "transparent",
            padding: 0,
          }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9A-Fa-f]{0,8}$/.test(v)) onChange(v);
          }}
          maxLength={9}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            color: "var(--vc-text)",
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 14,
            outline: "none",
          }}
        />
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: value,
            border: "1px solid rgba(255,255,255,0.1)",
            flexShrink: 0,
          }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Image Upload Component                                             */
/* ------------------------------------------------------------------ */

function ImageUpload({
  label,
  value,
  bucket,
  onUploaded,
  aspectHint,
  accept = "image/png,image/jpeg,image/webp",
}: {
  label: string;
  value: string | null;
  bucket: string;
  onUploaded: (url: string) => void;
  aspectHint?: string;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bucket", bucket);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Upload failed");
      }
      const data = await res.json();
      if (data.url) onUploaded(data.url);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const borderColor = isDragging ? "#ffffff" : "var(--vc-border)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--vc-text-secondary)",
        }}
      >
        {label}
        {aspectHint && (
          <span style={{ fontWeight: 400, textTransform: "none", marginLeft: 6, opacity: 0.5 }}>
            {aspectHint}
          </span>
        )}
      </label>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleUpload(file);
        }}
        style={{
          background: isDragging ? "rgba(255, 255, 255, 0.05)" : "var(--vc-surface)",
          border: `2px dashed ${borderColor}`,
          borderRadius: "var(--vc-radius-md)",
          padding: value ? 0 : "32px 16px",
          cursor: "pointer",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
          minHeight: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "border-color 150ms ease, background 150ms ease",
        }}
        onMouseEnter={e => { if (!isDragging) e.currentTarget.style.borderColor = "#ffffff"; }}
        onMouseLeave={e => { if (!isDragging) e.currentTarget.style.borderColor = "var(--vc-border)"; }}
      >
        {uploading ? (
          <span style={{ color: "var(--vc-text-secondary)", fontSize: 13 }}>Uploading...</span>
        ) : value ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={value}
            alt={label}
            style={{ width: "100%", height: "auto", maxHeight: 200, objectFit: "contain" }}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, color: "var(--vc-text-muted)", fontSize: 13 }}>
            <span>{isDragging ? "Drop to upload" : "Drop here or click to upload"}</span>
            <span style={{ fontSize: 11, opacity: 0.6 }}>{accept.replace(/image\//g, "").replace(/,/g, ", ").toUpperCase()}</span>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
        />
      </div>
      {uploadError && (
        <span style={{ fontSize: 11, color: "var(--vc-danger)" }}>{uploadError}</span>
      )}
      {value && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onUploaded(""); }}
          style={{
            background: "none", border: "none", color: "var(--vc-danger)",
            fontSize: 12, cursor: "pointer", padding: 0, textAlign: "left",
          }}
        >
          Remove image
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Text Input Component                                               */
/* ------------------------------------------------------------------ */

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const shared = {
    width: "100%",
    background: "var(--vc-surface)" as const,
    border: "1px solid var(--vc-border)" as const,
    borderRadius: "var(--vc-radius-sm)" as const,
    color: "var(--vc-text)" as const,
    fontFamily: "var(--font-archivo), sans-serif" as const,
    fontSize: 16,
    padding: "10px 14px",
    outline: "none" as const,
    boxSizing: "border-box" as const,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--vc-text-secondary)",
        }}
      >
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          style={{ ...shared, resize: "vertical", minHeight: 80 }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={shared}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section Header                                                     */
/* ------------------------------------------------------------------ */

function SectionHeader({ title }: { title: string }) {
  return (
    <h2
      style={{
        fontFamily: "var(--font-archivo), sans-serif",
        fontSize: 18,
        fontWeight: 400,
        color: "#ffffff",
        margin: "0 0 16px",
        paddingBottom: 10,
        borderBottom: "1px solid var(--vc-border-subtle)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {title}
    </h2>
  );
}

/* ------------------------------------------------------------------ */
/*  Live Preview Mini                                                  */
/* ------------------------------------------------------------------ */

function LivePreview({ branding }: { branding: BrandingState }) {
  return (
    <div
      style={{
        background: branding.secondary_color,
        borderRadius: "var(--vc-radius-xl)",
        overflow: "hidden",
        border: "1px solid var(--vc-border)",
        fontSize: 11,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: `1px solid ${branding.primary_color}22`,
        }}
      >
        {branding.logo_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={branding.logo_url} alt="" style={{ height: 20, objectFit: "contain" }} />
        ) : (
          <div
            style={{
              width: 40,
              height: 12,
              borderRadius: 3,
              background: branding.primary_color,
              opacity: 0.4,
            }}
          />
        )}
        <div style={{ display: "flex", gap: 8, color: "rgba(255,255,255,0.5)" }}>
          <span>Events</span>
          <span>About</span>
        </div>
      </div>

      {/* Hero */}
      <div
        style={{
          height: 60,
          background: branding.hero_image_url
            ? `url(${branding.hero_image_url}) center/cover`
            : `linear-gradient(135deg, ${branding.accent_color}, ${branding.secondary_color})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, transparent, ${branding.secondary_color}aa)`,
          }}
        />
        <span
          style={{
            position: "relative",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            textShadow: "0 1px 4px rgba(0,0,0,0.5)",
          }}
        >
          {branding.homepage_headline || "Your Headline"}
        </span>
      </div>

      {/* Cards */}
      <div style={{ padding: "8px 12px", display: "flex", gap: 6 }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 32,
              background: "rgba(255,255,255,0.04)",
              borderRadius: 6,
              border: `1px solid ${branding.primary_color}22`,
            }}
          />
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "6px 12px",
          borderTop: `1px solid ${branding.primary_color}15`,
          color: branding.primary_color,
          fontSize: 9,
          opacity: 0.6,
          textAlign: "center",
        }}
      >
        Powered by VenueCore
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

function venueToState(v: Record<string, unknown>): BrandingState {
  return {
    primary_color: String(v.primary_color || DEFAULTS.primary_color),
    secondary_color: String(v.secondary_color || DEFAULTS.secondary_color),
    accent_color: String(v.accent_color || DEFAULTS.accent_color),
    logo_url: (v.logo_url as string) || null,
    favicon_url: (v.favicon_url as string) || null,
    hero_image_url: (v.hero_image_url as string) || null,
    hero_image_2_url: (v.hero_image_2_url as string) || null,
    homepage_headline: String(v.homepage_headline || ""),
    homepage_subheadline: String(v.homepage_subheadline || ""),
    homepage_cta_text: String(v.homepage_cta_text || DEFAULTS.homepage_cta_text),
    homepage_cta_url: String(v.homepage_cta_url || DEFAULTS.homepage_cta_url),
    tagline: String(v.tagline || ""),
    footer_description: String(v.footer_description || ""),
    support_email: String(v.support_email || ""),
    contact_email: String(v.contact_email || v.buyer_email || ""),
    instagram_url: String(v.instagram_url || ""),
    facebook_url: String(v.facebook_url || ""),
  };
}

export default function BrandingPage() {
  const [venueId, setVenueId] = useState("");
  const [venues, setVenues] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [branding, setBranding] = useState<BrandingState>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [allVenueData, setAllVenueData] = useState<Record<string, unknown>[]>([]);

  // Load venues + detect role on mount
  useEffect(() => {
    async function init() {
      const cookieVenueId = getCookie("venue-id") || "";

      // Detect user role from Supabase auth + admin_users table
      let userRole = getCookie("admin-role") || "";
      if (!userRole) {
        try {
          const supabase = getSupabaseBrowser();
          const { data: authData } = await supabase.auth.getUser();
          if (authData?.user?.id) {
            const session = await supabase.auth.getSession();
            const token = session.data.session?.access_token;
            if (token) {
              const authRes = await fetch("/api/admin/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ access_token: token }),
              });
              if (authRes.ok) {
                const authBody = await authRes.json();
                userRole = authBody.role || "";
              }
            }
          }
        } catch { /* fall through */ }
      }

      const ownerMode = userRole === "owner";
      setIsOwner(ownerMode);

      try {
        const res = await fetch("/api/venues");
        const data = await res.json();
        if (!Array.isArray(data)) return;
        setAllVenueData(data);
        setVenues(data.map((v: Record<string, string>) => ({ id: v.id, name: v.name, slug: v.slug })));

        if (ownerMode) {
          // Owner sees all venues — select first or the one from cookie
          const target = cookieVenueId
            ? data.find((v: Record<string, string>) => v.id === cookieVenueId)
            : data[0];
          if (target) {
            setVenueId(target.id as string);
            setBranding(venueToState(target));
          }
        } else {
          // Venue admin — can only edit their own venue
          if (!cookieVenueId) {
            setError("No venue assigned to your account.");
            return;
          }
          const v = data.find((x: Record<string, string>) => x.id === cookieVenueId);
          if (v) {
            setVenueId(v.id as string);
            setBranding(venueToState(v));
          } else {
            setError("Could not find your venue.");
          }
        }
      } catch {
        setError("Failed to load venue data");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  // When owner switches venue in dropdown
  const handleVenueChange = (newId: string) => {
    setVenueId(newId);
    setSaved(false);
    setError("");
    const v = allVenueData.find((x) => (x.id as string) === newId);
    if (v) setBranding(venueToState(v));
  };

  const handleSave = async () => {
    if (!venueId) return;
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/venues", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: venueId,
          ...branding,
          // Clear empty strings to null for optional fields
          logo_url: branding.logo_url || null,
          favicon_url: branding.favicon_url || null,
          hero_image_url: branding.hero_image_url || null,
          hero_image_2_url: branding.hero_image_2_url || null,
          homepage_headline: branding.homepage_headline || null,
          homepage_subheadline: branding.homepage_subheadline || null,
          tagline: branding.tagline || null,
          footer_description: branding.footer_description || null,
          support_email: branding.support_email || null,
          contact_email: branding.contact_email || null,
          instagram_url: branding.instagram_url || null,
          facebook_url: branding.facebook_url || null,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Save failed (${res.status})`);
      }
      setSaved(true);
      // Clear sessionStorage cache so VenueThemeProvider refetches
      try { sessionStorage.clear(); } catch {}
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const update = (key: keyof BrandingState, val: string) => {
    setBranding((prev) => ({ ...prev, [key]: val }));
  };

  if (loading) {
    return (
      <div style={{ padding: 40, color: "var(--vc-text-secondary)" }}>Loading branding settings...</div>
    );
  }

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 32 }}>
      {/* Page Header */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <h1
            style={{
              fontFamily: "var(--font-archivo), sans-serif",
              fontSize: "2rem",
              color: "#ffffff",
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            Site Branding
          </h1>
          {isOwner && venues.length > 1 && (
            <select
              value={venueId}
              onChange={(e) => handleVenueChange(e.target.value)}
              style={{
                background: "var(--vc-surface)",
                border: "1px solid var(--vc-border)",
                borderRadius: "var(--vc-radius-sm)",
                color: "var(--vc-text)",
                padding: "8px 32px 8px 12px",
                fontSize: 14,
                fontFamily: "var(--font-archivo), sans-serif",
                cursor: "pointer",
                appearance: "none",
                WebkitAppearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.3)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 10px center",
                outline: "none",
              }}
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id} style={{ background: "#1a1a2e" }}>
                  {v.name} ({v.slug})
                </option>
              ))}
            </select>
          )}
        </div>
        <p style={{ color: "var(--vc-text-secondary)", fontSize: 14, margin: "6px 0 0" }}>
          {isOwner
            ? "Select a venue and customize its public website. Changes update immediately after saving."
            : "Customize how your public website looks. Changes update your site immediately after saving."}
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "var(--vc-radius-sm)",
            color: "#fca5a5",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 32, alignItems: "start" }}>
        {/* Left Column — Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {/* ── Colors ── */}
          <div
            style={{
              background: "var(--vc-surface)",
              backdropFilter: "var(--vc-blur)",
              WebkitBackdropFilter: "var(--vc-blur)",
              border: "1px solid var(--vc-border)",
              boxShadow: "var(--vc-shadow-glass)",
              borderRadius: "var(--vc-radius-xl)",
              padding: "24px",
            }}
          >
            <SectionHeader title="Brand Colors" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <ColorPicker label="Primary" value={branding.primary_color} onChange={(v) => update("primary_color", v)} />
              <ColorPicker label="Secondary" value={branding.secondary_color} onChange={(v) => update("secondary_color", v)} />
              <ColorPicker label="Accent" value={branding.accent_color} onChange={(v) => update("accent_color", v)} />
            </div>
          </div>

          {/* ── Logos & Images ── */}
          <div
            style={{
              background: "var(--vc-surface)",
              backdropFilter: "var(--vc-blur)",
              WebkitBackdropFilter: "var(--vc-blur)",
              border: "1px solid var(--vc-border)",
              boxShadow: "var(--vc-shadow-glass)",
              borderRadius: "var(--vc-radius-xl)",
              padding: "24px",
            }}
          >
            <SectionHeader title="Logos & Images" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <ImageUpload
                label="Logo"
                value={branding.logo_url}
                bucket="venue-logos"
                onUploaded={(url) => update("logo_url", url)}
                aspectHint="Square or horizontal"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
              />
              <ImageUpload
                label="Favicon"
                value={branding.favicon_url}
                bucket="venue-logos"
                onUploaded={(url) => update("favicon_url", url)}
                aspectHint="Square, 32x32+"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
              />
              <ImageUpload
                label="Hero Image"
                value={branding.hero_image_url}
                bucket="hero-images"
                onUploaded={(url) => update("hero_image_url", url)}
                aspectHint="Wide, 1920x800+"
              />
              <ImageUpload
                label="Secondary Hero"
                value={branding.hero_image_2_url}
                bucket="hero-images"
                onUploaded={(url) => update("hero_image_2_url", url)}
                aspectHint="Wide, 1920x600+"
              />
            </div>
          </div>

          {/* ── Homepage Content ── */}
          <div
            style={{
              background: "var(--vc-surface)",
              backdropFilter: "var(--vc-blur)",
              WebkitBackdropFilter: "var(--vc-blur)",
              border: "1px solid var(--vc-border)",
              boxShadow: "var(--vc-shadow-glass)",
              borderRadius: "var(--vc-radius-xl)",
              padding: "24px",
            }}
          >
            <SectionHeader title="Homepage Content" />
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <TextInput
                label="Headline"
                value={branding.homepage_headline}
                onChange={(v) => update("homepage_headline", v)}
                placeholder="Feel the Music. Live the Moment."
              />
              <TextInput
                label="Subheadline"
                value={branding.homepage_subheadline}
                onChange={(v) => update("homepage_subheadline", v)}
                placeholder="Discover upcoming shows and grab your tickets"
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <TextInput
                  label="CTA Button Text"
                  value={branding.homepage_cta_text}
                  onChange={(v) => update("homepage_cta_text", v)}
                  placeholder="See What's Coming"
                />
                <TextInput
                  label="CTA Button Link"
                  value={branding.homepage_cta_url}
                  onChange={(v) => update("homepage_cta_url", v)}
                  placeholder="/events"
                />
              </div>
            </div>
          </div>

          {/* ── Contact & Social ── */}
          <div
            style={{
              background: "var(--vc-surface)",
              backdropFilter: "var(--vc-blur)",
              WebkitBackdropFilter: "var(--vc-blur)",
              border: "1px solid var(--vc-border)",
              boxShadow: "var(--vc-shadow-glass)",
              borderRadius: "var(--vc-radius-xl)",
              padding: "24px",
            }}
          >
            <SectionHeader title="Contact & Social" />
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <TextInput
                label="Tagline"
                value={branding.tagline}
                onChange={(v) => update("tagline", v)}
                placeholder="One Platform. Every Ticket."
              />
              <TextInput
                label="Footer Description"
                value={branding.footer_description}
                onChange={(v) => update("footer_description", v)}
                placeholder="Describe your venue or organization..."
                multiline
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <TextInput
                  label="Support Email"
                  value={branding.support_email}
                  onChange={(v) => update("support_email", v)}
                  placeholder="support@yourvenue.com"
                />
                <TextInput
                  label="Contact Email"
                  value={branding.contact_email}
                  onChange={(v) => update("contact_email", v)}
                  placeholder="hello@yourvenue.com"
                />
                <TextInput
                  label="Instagram URL"
                  value={branding.instagram_url}
                  onChange={(v) => update("instagram_url", v)}
                  placeholder="https://instagram.com/yourvenue"
                />
                <TextInput
                  label="Facebook URL"
                  value={branding.facebook_url}
                  onChange={(v) => update("facebook_url", v)}
                  placeholder="https://facebook.com/yourvenue"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column — Live Preview */}
        <div style={{ position: "sticky", top: 80 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--vc-text-secondary)",
              margin: "0 0 8px",
            }}
          >
            Live Preview
          </p>
          <LivePreview branding={branding} />
        </div>
      </div>

      {/* Save Bar */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "var(--vc-bg)",
          borderTop: "1px solid var(--vc-border)",
          padding: "16px 0",
          display: "flex",
          alignItems: "center",
          gap: 16,
          zIndex: 10,
        }}
      >
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "12px 32px",
            border: "none",
            borderRadius: "var(--vc-radius-sm)",
            background: "#ffffff",
            color: "var(--vc-bg)",
            fontFamily: "var(--font-archivo), sans-serif",
            fontSize: 15,
            fontWeight: 700,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
            transition: "background 180ms ease",
          }}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        {saved && (
          <span style={{ color: "var(--vc-success)", fontSize: 14, fontWeight: 600 }}>
            Saved! Your site has been updated.
          </span>
        )}
      </div>
    </div>
  );
}
