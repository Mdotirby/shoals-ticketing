"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import type { SponsorPackage } from "@/lib/types/sponsor";
import { getCookie } from "@/lib/cookies";

type EventOption = { id: string; title: string };

const GOLD = "#d0c290";
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

function fmt(n: number) {
  return Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
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

  // ── Profile form ─────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    name: "", logo_url: "", website_url: "", tier: "supporting",
    event_id: "", bio: "", contact_name: "", contact_email: "",
    display_on_homepage: false, is_active: true,
  });

  // ── Packages ─────────────────────────────────────────────────────────────
  const [packages, setPackages] = useState<SponsorPackage[]>([]);
  const [showNewPackage, setShowNewPackage] = useState(false);
  const [editingPkg, setEditingPkg] = useState<SponsorPackage | null>(null);
  const [pkgForm, setPkgForm] = useState(emptyPackage());
  const [pkgSaving, setPkgSaving] = useState(false);
  const [deliverableInput, setDeliverableInput] = useState("");
  const [generatingInvoice, setGeneratingInvoice] = useState<string | null>(null);

  const venueId = getCookie("venue-id") || "";
  const venueName = getCookie("venue-name") || "";

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
        name: sponsor.name || "",
        logo_url: sponsor.logo_url || "",
        website_url: sponsor.website_url || "",
        tier: sponsor.tier || "supporting",
        event_id: sponsor.event_id || "",
        bio: sponsor.bio || "",
        contact_name: sponsor.contact_name || "",
        contact_email: sponsor.contact_email || "",
        display_on_homepage: sponsor.display_on_homepage ?? false,
        is_active: sponsor.is_active ?? true,
      });
      if (Array.isArray(eventsData)) setEvents(eventsData);
    }).catch(() => setError("Failed to load partner"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (tab === "packages") loadPackages();
  }, [tab, loadPackages]);

  // ── Profile save ─────────────────────────────────────────────────────────
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/sponsors/${id}`, {
        method: "PUT",
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
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      router.push("/admin/sponsors");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally { setSaving(false); }
  };

  // ── Package save ──────────────────────────────────────────────────────────
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

  // ── Invoice PDF generation ─────────────────────────────────────────────────
  const handleGenerateInvoice = async (pkg: SponsorPackage) => {
    setGeneratingInvoice(pkg.id);
    try {
      const { exportInvoicePDF } = await import("@/lib/pdf/invoice-pdf");
      const invNum = `SP-${new Date().getFullYear()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
      const today = new Date();
      const due = new Date(today); due.setDate(due.getDate() + 30);
      await exportInvoicePDF({
        invoice_number: invNum,
        invoice_date: today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        due_date: due.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        client_name: form.name,
        client_email: form.contact_email || undefined,
        client_phone: undefined,
        client_company: form.name,
        client_address: undefined,
        event_name: `${pkg.name} — Sponsorship Package`,
        event_date: pkg.start_date
          ? new Date(pkg.start_date + "T12:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
          : pkg.term,
        line_items: [
          { description: pkg.name, amount: pkg.price },
          ...(pkg.deliverables || []).map(d => ({ description: `  • ${d}`, amount: 0 })),
        ],
        subtotal: pkg.price,
        tax_rate: 0,
        tax_amount: 0,
        total: pkg.price,
        payment_url: undefined,
        venue_name: venueName || "West 72 Entertainment",
        venue_slug: undefined,
      });
    } finally { setGeneratingInvoice(null); }
  };

  if (loading) {
    return <div className="admin-form-page"><p style={{ color: "rgba(255,255,255,0.5)", padding: "40px 0" }}>Loading…</p></div>;
  }

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Edit Partner</h1>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 24 }}>
        {(["profile", "packages"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "10px 24px", border: "none", background: "none", cursor: "pointer",
            color: tab === t ? GOLD : "rgba(255,255,255,0.45)",
            borderBottom: tab === t ? `2px solid ${GOLD}` : "2px solid transparent",
            fontWeight: tab === t ? 700 : 500, fontSize: 14, textTransform: "capitalize",
          }}>{t === "packages" ? `Packages (${packages.length})` : "Profile"}</button>
        ))}
      </div>

      {/* ── PROFILE TAB ── */}
      {tab === "profile" && (
        <form onSubmit={handleSaveProfile}>
          {error && <div className="admin-form-error">{error}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Partner Name *</label>
              <input style={inp} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
            </div>
            <div>
              <label style={lbl}>Tier *</label>
              <select style={inp} value={form.tier} onChange={e => setForm(p => ({ ...p, tier: e.target.value }))}>
                <option value="title">Title Partner</option>
                <option value="presenting">Presenting Partner</option>
                <option value="supporting">Supporting Partner</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Logo URL</label>
              <input style={inp} type="url" value={form.logo_url} onChange={e => setForm(p => ({ ...p, logo_url: e.target.value }))} placeholder="https://example.com/logo.png" />
            </div>
            <div>
              <label style={lbl}>Website URL</label>
              <input style={inp} type="url" value={form.website_url} onChange={e => setForm(p => ({ ...p, website_url: e.target.value }))} placeholder="https://example.com" />
            </div>
            <div>
              <label style={lbl}>Contact Name</label>
              <input style={inp} value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} placeholder="Primary contact at this company" />
            </div>
            <div>
              <label style={lbl}>Contact Email</label>
              <input style={inp} type="email" value={form.contact_email} onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))} placeholder="billing@company.com" />
            </div>
          </div>

          {/* Bio */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Partner Bio (shown on Partners page on hover)</label>
            <textarea
              style={{ ...inp, minHeight: 90, resize: "vertical" }}
              value={form.bio}
              onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
              placeholder="2–3 sentences about this company. Shown to the public on the Our Partners page."
            />
          </div>

          {/* Event assignment */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Assign to Event (leave blank for global)</label>
            <select style={inp} value={form.event_id} onChange={e => setForm(p => ({ ...p, event_id: e.target.value }))}>
              <option value="">— Global sponsor —</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
            </select>
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

          {/* Logo preview */}
          {form.logo_url && (
            <div style={{ ...card, textAlign: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.logo_url} alt={form.name} style={{ maxHeight: 80, maxWidth: 300, objectFit: "contain" }} />
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 8 }}>Logo preview</p>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="submit" style={btnPrimary} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button>
            <button type="button" style={btnSecondary} onClick={() => router.push("/admin/sponsors")}>Cancel</button>
          </div>
        </form>
      )}

      {/* ── PACKAGES TAB ── */}
      {tab === "packages" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <h3 style={{ color: "#fff", margin: 0, fontSize: 16 }}>Sponsorship Packages</h3>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "4px 0 0" }}>
                Define what each sponsor receives and generate invoices from here.
              </p>
            </div>
            {!showNewPackage && (
              <button onClick={() => { setEditingPkg(null); setPkgForm(emptyPackage()); setShowNewPackage(true); }} style={btnPrimary}>
                + New Package
              </button>
            )}
          </div>

          {/* Package form */}
          {showNewPackage && (
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
                  {pkgForm.deliverables.map((d, i) => (
                    <span key={i} style={{ background: "rgba(208,194,144,0.1)", color: GOLD, border: "1px solid rgba(208,194,144,0.2)", borderRadius: 20, padding: "3px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                      {d}
                      <button onClick={() => setPkgForm(p => ({ ...p, deliverables: p.deliverables.filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", color: "rgba(208,194,144,0.6)", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    style={{ ...inp, flex: 1 }}
                    value={deliverableInput}
                    onChange={e => setDeliverableInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addDeliverable(); }}}
                    placeholder="e.g. Homepage logo placement, 10 VIP tickets, Banner at venue…"
                  />
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
          )}

          {/* Package list */}
          {packages.length === 0 && !showNewPackage ? (
            <div style={{ ...card, textAlign: "center", padding: "48px 24px" }}>
              <p style={{ color: "rgba(255,255,255,0.3)", margin: "0 0 16px" }}>No packages yet</p>
              <button onClick={() => setShowNewPackage(true)} style={btnPrimary}>Create First Package</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {packages.map(pkg => (
                <div key={pkg.id} style={card}>
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
                          {pkg.deliverables.map((d, i) => (
                            <span key={i} style={{ background: "rgba(208,194,144,0.08)", color: "rgba(208,194,144,0.7)", borderRadius: 20, padding: "2px 8px", fontSize: 11 }}>• {d}</span>
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
                      <div style={{ color: GOLD, fontWeight: 700, fontSize: 20 }}>{fmt(pkg.price)}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                    <button
                      onClick={() => handleGenerateInvoice(pkg)}
                      disabled={generatingInvoice === pkg.id}
                      style={{ ...btnPrimary, fontSize: 12, padding: "8px 16px" }}
                    >
                      {generatingInvoice === pkg.id ? "Generating..." : "⬇ Generate Invoice PDF"}
                    </button>
                    <button onClick={() => openEditPkg(pkg)} style={{ ...btnSecondary, fontSize: 12, padding: "8px 16px" }}>Edit</button>
                    <button onClick={() => handleDeletePackage(pkg)} style={{ ...btnDanger, marginLeft: "auto" }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
