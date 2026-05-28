"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { SponsorPackage } from "@/lib/types/sponsor";
import { getCookie } from "@/lib/cookies";

type EventOption = { id: string; title: string };

const GOLD = "#d0c290";
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(208,194,144,0.12)",
  borderRadius: 10, padding: "20px 24px", marginBottom: 14,
};
const inp: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 14,
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600,
  color: "rgba(255,255,255,0.4)", textTransform: "uppercase",
  letterSpacing: "0.5px", marginBottom: 4,
};
const sublbl: React.CSSProperties = {
  display: "block", fontSize: 10, color: "rgba(255,255,255,0.3)",
  marginBottom: 6, textTransform: "none", letterSpacing: 0, fontWeight: 400,
};
const btnPrimary: React.CSSProperties = {
  background: GOLD, color: "#0b0d1d", border: "none", borderRadius: 8,
  padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 14,
};
const btnSecondary: React.CSSProperties = {
  background: "transparent", color: GOLD, border: `1px solid ${GOLD}`,
  borderRadius: 8, padding: "10px 20px", fontWeight: 600,
  cursor: "pointer", fontSize: 14,
};
const btnDanger: React.CSSProperties = {
  background: "transparent", color: "#ef4444",
  border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8,
  padding: "6px 14px", fontWeight: 600, cursor: "pointer", fontSize: 12,
};

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e", pending: "#f59e0b", expired: "#6b7280", cancelled: "#ef4444",
};

function statusBadge(status: string) {
  const c = STATUS_COLORS[status] ?? "#6b7280";
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, textTransform: "uppercase",
      background: `${c}22`, color: c, border: `1px solid ${c}44`,
    }}>
      {status}
    </span>
  );
}

function fmtCurrency(n: number) {
  return Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

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
        style={{
          ...inp, cursor: "pointer", userSelect: "none",
          display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 42,
        }}
      >
        <span style={{ color: selectedIds.length ? "#fff" : "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

      <AnimatePresence>
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
              boxShadow: "0 12px 40px rgba(0,0,0,0.5)", transformOrigin: "top",
            }}
          >
            {events.length === 0 && (
              <div style={{ padding: "12px 16px", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No events available</div>
            )}
            {events.map(ev => (
              <motion.label
                key={ev.id}
                whileHover={{ background: "rgba(208,194,144,0.06)" }}
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
      </AnimatePresence>
    </div>
  );
}

function emptyPackage(): Omit<SponsorPackage, "id" | "sponsor_id" | "created_at"> {
  return {
    venue_id: null, name: "", description: null,
    deliverables: [], price: 0,
    term: "Annual", start_date: null, end_date: null,
    status: "active", notes: null,
  };
}

export default function AdminEditSponsorPage() {
  const router = useRouter();
  const { id } = useParams() as { id: string };
  const [tab, setTab] = useState<"profile" | "packages">("profile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<EventOption[]>([]);

  // ── Profile form ─────────────────────────────────────────────────────
  const [form, setForm] = useState({
    sponsor_name: "", client_name: "", sponsor_address: "",
    logo_url: "", website_url: "", tier: "supporting",
    event_ids: [] as string[], bio: "", contact_name: "", contact_email: "",
    display_on_homepage: false, is_active: true,
  });

  // ── Packages ─────────────────────────────────────────────────────────
  const [packages, setPackages] = useState<SponsorPackage[]>([]);
  const [showNewPackage, setShowNewPackage] = useState(false);
  const [editingPkg, setEditingPkg] = useState<SponsorPackage | null>(null);
  const [pkgForm, setPkgForm] = useState(emptyPackage());
  const [pkgSaving, setPkgSaving] = useState(false);
  const [deliverableInput, setDeliverableInput] = useState("");
  const [generatingInvoice, setGeneratingInvoice] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const venueId   = getCookie("venue-id")   || "";
  const venueName = getCookie("venue-name") || "";

  const handleLogoUpload = async (file: File) => {
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
    } finally { setUploading(false); }
  };

  const loadPackages = useCallback(async () => {
    const res = await fetch(`/api/sponsors/${id}/packages`);
    if (res.ok) setPackages(await res.json());
  }, [id]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/sponsors/${id}`).then(r => r.json()),
      fetch("/api/events?all=1").then(r => r.json()),
    ]).then(([sponsor, eventsData]) => {
      if (sponsor.error) { setError(sponsor.error); return; }
      setForm({
        sponsor_name:    sponsor.sponsor_name    || "",
        client_name:     sponsor.client_name     || "",
        sponsor_address: sponsor.sponsor_address || "",
        logo_url:        sponsor.logo_url        || "",
        website_url:     sponsor.website_url     || "",
        tier:            sponsor.tier            || "supporting",
        event_ids:       sponsor.event_ids       || [],
        bio:             sponsor.bio             || "",
        contact_name:    sponsor.contact_name    || "",
        contact_email:   sponsor.contact_email   || "",
        display_on_homepage: sponsor.display_on_homepage ?? false,
        is_active:           sponsor.is_active           ?? true,
      });
      if (Array.isArray(eventsData)) setEvents(eventsData);
    }).catch(() => setError("Failed to load partner"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (tab === "packages") loadPackages();
  }, [tab, loadPackages]);

  // ── Profile save ─────────────────────────────────────────────────────
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/sponsors/${id}`, {
        method: "PUT",
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
          is_active:           form.is_active,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      router.push("/admin/sponsors");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally { setSaving(false); }
  };

  // ── Package save ──────────────────────────────────────────────────────
  const handleSavePackage = async () => {
    setPkgSaving(true);
    try {
      if (editingPkg) {
        await fetch(`/api/sponsors/${id}/packages/${editingPkg.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...pkgForm, venue_id: venueId || null }),
        });
      } else {
        await fetch(`/api/sponsors/${id}/packages`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...pkgForm, venue_id: venueId || null }),
        });
      }
      setShowNewPackage(false); setEditingPkg(null);
      setPkgForm(emptyPackage()); setDeliverableInput("");
      loadPackages();
    } catch { alert("Failed to save package"); }
    finally { setPkgSaving(false); }
  };

  const handleDeletePackage = async (pkg: SponsorPackage) => {
    if (!confirm(`Delete "${pkg.name}"?`)) return;
    await fetch(`/api/sponsors/${id}/packages/${pkg.id}`, { method: "DELETE" });
    loadPackages();
  };

  const openEditPkg = (pkg: SponsorPackage) => {
    setEditingPkg(pkg);
    setPkgForm({
      venue_id: pkg.venue_id, name: pkg.name, description: pkg.description,
      deliverables: pkg.deliverables || [], price: pkg.price, term: pkg.term,
      start_date: pkg.start_date, end_date: pkg.end_date,
      status: pkg.status, notes: pkg.notes,
    });
    setDeliverableInput("");
    setShowNewPackage(true);
  };

  const addDeliverable = () => {
    const val = deliverableInput.trim();
    if (!val) return;
    setPkgForm(p => ({ ...p, deliverables: [...p.deliverables, val] }));
    setDeliverableInput("");
  };

  // ── Invoice PDF generation ─────────────────────────────────────────────
  const handleGenerateInvoice = async (pkg: SponsorPackage) => {
    setGeneratingInvoice(pkg.id);
    try {
      const { exportInvoicePDF } = await import("@/lib/pdf/invoice-pdf");
      const invNum = `SP-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const today = new Date();
      const due   = new Date(today); due.setDate(due.getDate() + 30);

      await exportInvoicePDF({
        invoice_number: invNum,
        invoice_date: today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        due_date:     due.toLocaleDateString("en-US",   { year: "numeric", month: "long", day: "numeric" }),
        // Use legal client_name for billing; fall back to sponsor_name
        client_name:    form.contact_name    || form.sponsor_name,
        client_email:   form.contact_email   || undefined,
        client_company: form.client_name     || form.sponsor_name,
        client_address: form.sponsor_address || undefined,
        event_name: `${pkg.name} — Sponsorship Package`,
        event_date: pkg.start_date
          ? new Date(pkg.start_date + "T12:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
          : pkg.term,
        line_items: [
          { description: pkg.name, amount: pkg.price },
          ...(pkg.deliverables || []).map(d => ({ description: `  • ${d}`, amount: 0 })),
        ],
        subtotal:    pkg.price,
        tax_rate:    0,
        tax_amount:  0,
        total:       pkg.price,
        amount_paid: 0,
        balance_due: pkg.price,
        venue_name:     venueName || "West 72 Entertainment",
        venue_slug:     undefined,
        venue_logo_url: decodeURIComponent(getCookie("venue-logo") || "") || null,
      });
    } finally { setGeneratingInvoice(null); }
  };

  if (loading) {
    return <div className="admin-form-page"><p style={{ color: "rgba(255,255,255,0.5)", padding: "40px 0" }}>Loading…</p></div>;
  }

  return (
    <div className="admin-form-page">
      <motion.h1
        className="admin-page-title"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
      >
        Edit Partner
      </motion.h1>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 24 }}>
        {(["profile", "packages"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "10px 24px", border: "none", background: "none", cursor: "pointer",
            color: tab === t ? GOLD : "rgba(255,255,255,0.45)",
            borderBottom: tab === t ? `2px solid ${GOLD}` : "2px solid transparent",
            fontWeight: tab === t ? 700 : 500, fontSize: 14, textTransform: "capitalize",
            transition: "color 0.2s",
          }}>
            {t === "packages" ? `Packages (${packages.length})` : "Profile"}
          </button>
        ))}
      </div>

      {/* ── PROFILE TAB ── */}
      <AnimatePresence mode="wait">
        {tab === "profile" && (
          <motion.form
            key="profile"
            onSubmit={handleSaveProfile}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: EASE }}
          >
            {error && <div className="admin-form-error">{error}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              {/* Sponsor Name */}
              <div>
                <label style={lbl}>Sponsor Name *</label>
                <span style={sublbl}>Customer-facing display name</span>
                <input style={inp} value={form.sponsor_name} onChange={e => setForm(p => ({ ...p, sponsor_name: e.target.value }))} required />
              </div>

              {/* Tier */}
              <div>
                <label style={lbl}>Tier *</label>
                <select style={inp} value={form.tier} onChange={e => setForm(p => ({ ...p, tier: e.target.value }))}>
                  <option value="title">Title Partner</option>
                  <option value="presenting">Presenting Partner</option>
                  <option value="supporting">Supporting Partner</option>
                </select>
              </div>

              {/* Client Name (legal) */}
              <div>
                <label style={lbl}>Client Name</label>
                <span style={sublbl}>Legal business name — internal, used on invoices</span>
                <input style={inp} value={form.client_name} onChange={e => setForm(p => ({ ...p, client_name: e.target.value }))} placeholder="e.g. The Coca-Cola Company" />
              </div>

              {/* Sponsor Address */}
              <div>
                <label style={lbl}>Billing Address</label>
                <span style={sublbl}>Appears on invoices</span>
                <input style={inp} value={form.sponsor_address} onChange={e => setForm(p => ({ ...p, sponsor_address: e.target.value }))} placeholder="123 Main St, Nashville, TN 37201" />
              </div>

              {/* Logo */}
              <div style={{ gridColumn: "span 2" }}>
                <label style={lbl}>Logo</label>
                <div className="admin-image-upload-area">
                  {form.logo_url ? (
                    <div className="admin-image-preview-wrapper">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={form.logo_url} alt={form.sponsor_name} className="admin-image-preview" style={{ objectFit: "contain", background: "rgba(255,255,255,0.05)", borderRadius: 8 }} />
                      <button type="button" className="admin-image-remove-btn" onClick={() => { setForm(p => ({ ...p, logo_url: "" })); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                        ✕ Remove
                      </button>
                    </div>
                  ) : (
                    <div
                      className="admin-image-dropzone"
                      style={isDragging ? { borderColor: GOLD, background: "rgba(208,194,144,0.05)" } : undefined}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={e => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files[0]; if (file) handleLogoUpload(file); }}
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
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="admin-image-file-input" onChange={e => { const file = e.target.files?.[0]; if (file) handleLogoUpload(file); }} />
                </div>
                {uploadError && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>{uploadError}</p>}
              </div>

              {/* Website */}
              <div>
                <label style={lbl}>Website URL</label>
                <input style={inp} type="url" value={form.website_url} onChange={e => setForm(p => ({ ...p, website_url: e.target.value }))} placeholder="https://example.com" />
              </div>

              {/* Contact Name */}
              <div>
                <label style={lbl}>Contact Name</label>
                <input style={inp} value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} placeholder="Primary contact at this company" />
              </div>

              {/* Contact Email */}
              <div>
                <label style={lbl}>Contact Email</label>
                <input style={inp} type="email" value={form.contact_email} onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))} placeholder="billing@company.com" />
              </div>
            </div>

            {/* Bio */}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Partner Bio (shown on Partners page on hover)</label>
              <textarea style={{ ...inp, minHeight: 90, resize: "vertical" }} value={form.bio} onChange={e => setForm(p => ({ ...p, bio: e.target.value }))} placeholder="2–3 sentences about this company. Shown to the public on the Our Partners page." />
            </div>

            {/* Event multi-select */}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Assign to Events</label>
              <span style={sublbl}>Select one or more events, or leave blank for a global sponsor</span>
              <EventMultiSelect events={events} selectedIds={form.event_ids} onChange={ids => setForm(p => ({ ...p, event_ids: ids }))} />
            </div>

            {/* Toggles */}
            <div style={{ ...card, display: "flex", gap: 32 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14, color: "#fff" }}>
                <input type="checkbox" checked={form.display_on_homepage} onChange={e => setForm(p => ({ ...p, display_on_homepage: e.target.checked }))} style={{ accentColor: GOLD, width: 16, height: 16 }} />
                <span>
                  <strong>Show on Homepage</strong>
                  <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Logo appears in the homepage partner strip</span>
                </span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14, color: "#fff" }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} style={{ accentColor: GOLD, width: 16, height: 16 }} />
                <span>
                  <strong>Active</strong>
                  <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Inactive partners are hidden everywhere</span>
                </span>
              </label>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <motion.button
                type="submit"
                style={btnPrimary}
                disabled={saving}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {saving ? "Saving…" : "Save Changes"}
              </motion.button>
              <button type="button" style={btnSecondary} onClick={() => router.push("/admin/sponsors")}>Cancel</button>
            </div>
          </motion.form>
        )}

        {/* ── PACKAGES TAB ── */}
        {tab === "packages" && (
          <motion.div
            key="packages"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: EASE }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h3 style={{ color: "#fff", margin: 0, fontSize: 16 }}>Sponsorship Packages</h3>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "4px 0 0" }}>
                  Define what each sponsor receives and generate invoices from here.
                </p>
              </div>
              {!showNewPackage && (
                <motion.button
                  onClick={() => { setEditingPkg(null); setPkgForm(emptyPackage()); setShowNewPackage(true); }}
                  style={btnPrimary}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  + New Package
                </motion.button>
              )}
            </div>

            {/* Package form */}
            <AnimatePresence>
              {showNewPackage && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  style={{ overflow: "hidden" }}
                >
                  <div style={{ ...card, border: "1px solid rgba(208,194,144,0.25)", marginBottom: 20 }}>
                    <h4 style={{ color: GOLD, margin: "0 0 16px", fontSize: 15 }}>
                      {editingPkg ? "Edit Package" : "New Package"}
                    </h4>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={lbl}>Package Name *</label>
                        <input style={inp} value={pkgForm.name} onChange={e => setPkgForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Gold Package, Logo Placement" />
                      </div>
                      <div>
                        <label style={lbl}>Price *</label>
                        <input style={inp} type="number" min="0" step="0.01" value={pkgForm.price} onChange={e => setPkgForm(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <label style={lbl}>Term</label>
                        <select style={inp} value={pkgForm.term} onChange={e => setPkgForm(p => ({ ...p, term: e.target.value as SponsorPackage["term"] }))}>
                          {["Annual", "Per Event", "One-Time", "Monthly", "Custom"].map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Status</label>
                        <select style={inp} value={pkgForm.status} onChange={e => setPkgForm(p => ({ ...p, status: e.target.value as SponsorPackage["status"] }))}>
                          {["active", "pending", "expired", "cancelled"].map(s => <option key={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Start Date</label>
                        <input style={inp} type="date" value={pkgForm.start_date || ""} onChange={e => setPkgForm(p => ({ ...p, start_date: e.target.value || null }))} />
                      </div>
                      <div>
                        <label style={lbl}>End Date</label>
                        <input style={inp} type="date" value={pkgForm.end_date || ""} onChange={e => setPkgForm(p => ({ ...p, end_date: e.target.value || null }))} />
                      </div>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <label style={lbl}>Description</label>
                      <textarea style={{ ...inp, minHeight: 60, resize: "vertical" }} value={pkgForm.description || ""} onChange={e => setPkgForm(p => ({ ...p, description: e.target.value || null }))} placeholder="Brief description of this sponsorship package" />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <label style={lbl}>Deliverables (what the sponsor receives)</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                        <AnimatePresence>
                          {pkgForm.deliverables.map((d, i) => (
                            <motion.span
                              key={`${d}-${i}`}
                              initial={{ opacity: 0, scale: 0.85 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={{ duration: 0.18 }}
                              style={{ background: "rgba(208,194,144,0.1)", color: GOLD, border: "1px solid rgba(208,194,144,0.2)", borderRadius: 20, padding: "3px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
                            >
                              {d}
                              <button onClick={() => setPkgForm(p => ({ ...p, deliverables: p.deliverables.filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", color: "rgba(208,194,144,0.6)", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                            </motion.span>
                          ))}
                        </AnimatePresence>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input style={{ ...inp, flex: 1 }} value={deliverableInput} onChange={e => setDeliverableInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addDeliverable(); }}} placeholder="e.g. Homepage logo placement, 10 VIP tickets…" />
                        <button type="button" onClick={addDeliverable} style={{ ...btnSecondary, padding: "10px 16px", fontSize: 13, whiteSpace: "nowrap" }}>+ Add</button>
                      </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <label style={lbl}>Internal Notes</label>
                      <textarea style={{ ...inp, minHeight: 50, resize: "vertical" }} value={pkgForm.notes || ""} onChange={e => setPkgForm(p => ({ ...p, notes: e.target.value || null }))} placeholder="Notes for your team (not on invoice)" />
                    </div>

                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={handleSavePackage} disabled={pkgSaving || !pkgForm.name} style={btnPrimary}>{pkgSaving ? "Saving..." : editingPkg ? "Update Package" : "Save Package"}</button>
                      <button onClick={() => { setShowNewPackage(false); setEditingPkg(null); setPkgForm(emptyPackage()); }} style={{ ...btnSecondary, color: "rgba(255,255,255,0.5)", borderColor: "rgba(255,255,255,0.15)" }}>Cancel</button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Package list */}
            {packages.length === 0 && !showNewPackage ? (
              <div style={{ ...card, textAlign: "center", padding: "48px 24px" }}>
                <p style={{ color: "rgba(255,255,255,0.3)", margin: "0 0 16px" }}>No packages yet</p>
                <button onClick={() => setShowNewPackage(true)} style={btnPrimary}>Create First Package</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <AnimatePresence>
                  {packages.map((pkg, i) => (
                    <motion.div
                      key={pkg.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.35, ease: EASE } }}
                      exit={{ opacity: 0, y: -8 }}
                      whileHover={{ scale: 1.005, transition: { duration: 0.18 } }}
                      style={card}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                            <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{pkg.name}</span>
                            {statusBadge(pkg.status)}
                            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{pkg.term}</span>
                          </div>
                          {pkg.description && <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: "0 0 6px" }}>{pkg.description}</p>}
                          {pkg.deliverables?.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                              {pkg.deliverables.map((d, j) => (
                                <span key={j} style={{ background: "rgba(208,194,144,0.08)", color: "rgba(208,194,144,0.7)", borderRadius: 20, padding: "2px 8px", fontSize: 11 }}>• {d}</span>
                              ))}
                            </div>
                          )}
                          {(pkg.start_date || pkg.end_date) && (
                            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, margin: "6px 0 0" }}>
                              {pkg.start_date && new Date(pkg.start_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              {pkg.start_date && pkg.end_date && " → "}
                              {pkg.end_date && new Date(pkg.end_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          )}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ color: GOLD, fontWeight: 700, fontSize: 20 }}>{fmtCurrency(pkg.price)}</div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                        <motion.button
                          onClick={() => handleGenerateInvoice(pkg)}
                          disabled={generatingInvoice === pkg.id}
                          style={{ ...btnPrimary, fontSize: 12, padding: "8px 16px" }}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                        >
                          {generatingInvoice === pkg.id ? "Generating…" : "⬇ Generate Invoice PDF"}
                        </motion.button>
                        <button onClick={() => openEditPkg(pkg)} style={{ ...btnSecondary, fontSize: 12, padding: "8px 16px" }}>Edit</button>
                        <button onClick={() => handleDeletePackage(pkg)} style={{ ...btnDanger, marginLeft: "auto" }}>Delete</button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
