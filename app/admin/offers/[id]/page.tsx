"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCookie } from "@/lib/cookies";
import type { ArtistOffer, ShowLineupItem, TicketScalingRow, ExpenseItem, VariableExpenseItem } from "@/lib/types/offer";
import type { Venue } from "@/lib/types/venue";

const DEFAULT_FIXED: ExpenseItem[] = [
  { name: "Rent", amount: 0 }, { name: "Production", amount: 0 }, { name: "Catering", amount: 0 },
  { name: "Hospitality", amount: 0 }, { name: "Support", amount: 0 }, { name: "Talent", amount: 0 },
  { name: "Marketing", amount: 0 }, { name: "Labor", amount: 0 }, { name: "Insurance", amount: 0 },
  { name: "Security", amount: 0 }, { name: "Ushers", amount: 0 }, { name: "Police", amount: 0 },
  { name: "Cleaning", amount: 0 }, { name: "Medical", amount: 0 },
];

const DEFAULT_VARIABLE: VariableExpenseItem[] = [
  { name: "ASCAP", rate: 0.008, amount: 0 }, { name: "BMI", rate: 0.008, amount: 0 },
  { name: "SESAC", rate: 0.0003, amount: 0 }, { name: "GMR", rate: 0.0015, amount: 0 },
  { name: "Credit Card (Stripe)", rate: 0.03, amount: 0 },
];

export default function AdminOfferDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [offer, setOffer] = useState<ArtistOffer | null>(null);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Editable fields
  const [form, setForm] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const venueId = getCookie("venue-id");

    Promise.all([
      fetch(`/api/offers/${id}`).then((r) => r.json()),
      venueId ? fetch("/api/venues").then((r) => r.json()).then((vs: Venue[]) => vs.find((v) => v.id === venueId) || null) : Promise.resolve(null),
    ])
      .then(([offerData, venueData]) => {
        if (offerData.error) { setError(offerData.error); return; }
        setOffer(offerData);
        setForm(offerData);
        setVenue(venueData);
      })
      .catch(() => setError("Failed to load offer"))
      .finally(() => setLoading(false));
  }, [id]);

  const updateField = (key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true); setError(""); setSuccess("");
    try {
      const res = await fetch(`/api/offers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Save failed");
      const updated = await res.json();
      setOffer(updated);
      setForm(updated);
      setSuccess("Offer saved.");
    } catch { setError("Failed to save."); }
    finally { setSaving(false); }
  };

  const handleStatusChange = async (status: string) => {
    setSaving(true); setError(""); setSuccess("");
    try {
      const res = await fetch(`/api/offers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, status }),
      });
      if (!res.ok) throw new Error("Failed");
      const updated = await res.json();
      setOffer(updated);
      setForm(updated);

      if (status === "accepted") {
        // Auto-create event from offer data
        setSuccess("Offer confirmed! Creating event...");
        const eventRes = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: updated.artist_name,
            venue: venue?.name || updated.venue || "TBD",
            date: updated.event_date || new Date().toISOString(),
            price: updated.guarantee || 0,
            venue_id: updated.venue_id || getCookie("venue-id") || null,
            status: "draft",
            description: `${updated.artist_name} - ${updated.billing || "Live Performance"}`,
          }),
        });
        if (eventRes.ok) {
          setSuccess("Offer confirmed & event created! Go to Events to set up tickets.");
        } else {
          setSuccess("Offer confirmed but event creation failed. Create manually.");
        }
      } else if (status === "declined") {
        setSuccess("Offer declined.");
      }
    } catch { setError("Failed to update status."); }
    finally { setSaving(false); }
  };

  // ── PDF Export (clean, no cells, one page) ──
  const exportPDF = async () => {
    if (!offer) return;
    setExporting(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
      const pc = venue?.primary_color || "#d0c290";
      const sc = venue?.secondary_color || "#0b0d1d";
      const hex = (h: string) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)] as [number,number,number];
      let y = 10;

      // Header
      doc.setFillColor(...hex(sc));
      doc.rect(0, 0, 220, 24, "F");
      doc.setFillColor(...hex(pc));
      doc.rect(0, 24, 220, 1, "F");
      doc.setTextColor(...hex(pc));
      doc.setFontSize(14);
      doc.text(venue?.name || "Venue", 200, 10, { align: "right" });
      doc.setFontSize(9);
      if (venue?.capacity) doc.text(`Capacity: ${venue.capacity}`, 200, 15, { align: "right" });
      const addr = [venue?.address_street, venue?.address_city, venue?.address_state, venue?.address_zip].filter(Boolean).join(", ");
      if (addr) doc.text(addr, 200, 20, { align: "right" });

      y = 30;
      doc.setTextColor(0,0,0);
      doc.setFontSize(16);
      doc.text(String(form.artist_name || ""), 10, y);
      y += 6;
      doc.setFontSize(8);
      doc.setTextColor(100,100,100);
      doc.text(`Offer Sheet — ${form.event_date ? new Date(String(form.event_date)).toLocaleDateString() : "Date TBD"}`, 10, y);
      y += 8;

      // Helper for labeled rows
      const row = (label: string, val: string) => {
        doc.setTextColor(80,80,80);
        doc.setFontSize(7);
        doc.text(label, 10, y);
        doc.setTextColor(0,0,0);
        doc.setFontSize(8);
        doc.text(val, 50, y);
        y += 4;
      };

      // Agency
      doc.setTextColor(...hex(pc)); doc.setFontSize(9); doc.text("Agency & Artist", 10, y); y += 5;
      row("Agency", String(form.agency || "—"));
      row("Agent", `${form.agent_name || "—"}  |  ${form.agent_phone || "—"}  |  ${form.agent_email || "—"}`);
      row("Shows", `${form.num_shows || 1}  |  Length: ${form.show_length || "—"}  |  Time: ${form.show_time || "—"}`);
      row("Billing", String(form.billing || "—"));
      y += 2;

      // Deal
      doc.setTextColor(...hex(pc)); doc.setFontSize(9); doc.text("Deal", 10, y); y += 5;
      row("Guarantee", `$${Number(form.guarantee || 0).toLocaleString()}`);
      row("Deal Type", `${form.deal_type || "FLAT"}  |  Backend: ${form.backend_percentage || "0"}%`);
      row("Radius", `${form.radius_distance || "—"} mi  |  ${form.radius_days_prior || "—"} days prior  |  ${form.radius_days_after || "—"} days after`);
      row("Deposit", `$${Number(form.deposit_amount || 0).toLocaleString()}  (${form.deposit_pct || 0}%)  |  Due: ${form.deposit_due || "—"}`);
      row("Balance", String(form.balance_due || "Day of Show"));
      row("Merch", `${form.merch_split || "—"}  |  Sells: ${form.merch_seller || "—"}`);
      row("Production", String(form.production_by || "—"));
      row("Comps", String(form.comps || 0));
      y += 2;

      // Scaling
      const scaling = (form.ticket_scaling || []) as TicketScalingRow[];
      if (scaling.length > 0) {
        doc.setTextColor(...hex(pc)); doc.setFontSize(9); doc.text("Ticket Scaling", 10, y); y += 5;
        scaling.forEach((r) => {
          row(r.name, `${r.seats} seats  |  Sellable: ${r.sellable_cap}  |  Net: $${r.net_price?.toFixed(2)}  |  Price: $${r.price?.toFixed(2)}  |  Gross: $${(r.sellable_cap * r.price).toLocaleString()}`);
        });
        y += 2;
      }

      // Expenses
      doc.setTextColor(...hex(pc)); doc.setFontSize(9); doc.text("Expenses", 10, y); y += 5;
      const fe = (form.fixed_expenses || []) as ExpenseItem[];
      const ve = (form.variable_expenses || []) as VariableExpenseItem[];
      fe.filter(e => e.amount > 0).forEach((e) => row(e.name, `$${e.amount.toFixed(2)}`));
      row("Fixed Total", `$${Number(form.total_fixed || 0).toLocaleString()}`);
      y += 1;
      ve.filter(e => e.amount > 0).forEach((e) => row(e.name, `${(e.rate * 100).toFixed(2)}% → $${e.amount.toFixed(2)}`));
      row("Variable Total", `$${Number(form.total_variable || 0).toLocaleString()}`);
      row("TOTAL EXPENSES", `$${Number(form.total_expenses || 0).toLocaleString()}`);
      y += 3;

      // Potential
      doc.setTextColor(...hex(pc)); doc.setFontSize(9); doc.text("Potential at Sellout", 10, y); y += 5;
      row("Gross Potential", `$${Number(form.gross_potential || 0).toLocaleString()}`);
      row("Adj. Gross", `$${Number(form.adj_gross || 0).toLocaleString()}`);
      row("Net Potential", `$${Number(form.net_potential || 0).toLocaleString()}`);
      row("Total Expenses", `$${Number(form.total_expenses || 0).toLocaleString()}`);
      row("Splitpoint", `$${Number(form.splitpoint || 0).toLocaleString()}`);
      y += 1;
      doc.setTextColor(...hex(pc)); doc.setFontSize(9); doc.text("Artist Potential", 10, y); y += 5;
      row("Guarantee", `$${Number(form.guarantee || 0).toLocaleString()}`);
      if (form.deal_type !== "FLAT") row("Backend", `$${Number(form.artist_backend || 0).toLocaleString()}`);
      y += 1;
      doc.setTextColor(...hex(pc)); doc.setFontSize(9); doc.text("Promoter Potential", 10, y); y += 5;
      row("Promoter Walkout", `$${Number(form.pot_walkout || 0).toLocaleString()}`);
      y += 4;

      doc.setFontSize(7); doc.setTextColor(120,120,120);
      doc.text(`Offer valid for ${form.offer_valid_days || 14} days from ${new Date().toLocaleDateString()}`, 10, y);

      const dateStr = form.event_date ? new Date(String(form.event_date)).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).replace(/\//g, ".") : "TBD";
      const city = venue?.address_city || "City";
      const state = venue?.address_state || "ST";
      doc.save(`${String(form.artist_name || "Offer").replace(/\s+/g, "_")}.${dateStr}.${city},${state}.pdf`);
    } catch (err) { console.error("PDF failed:", err); }
    finally { setExporting(false); }
  };

  if (loading) return <div className="admin-form-page"><h1 className="admin-page-title">Loading…</h1></div>;
  if (!offer) return <div className="admin-form-page"><h1 className="admin-page-title">Offer Not Found</h1></div>;

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">{String(form.artist_name || "Offer")}</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="report-export-btn report-export-pdf" onClick={exportPDF} disabled={exporting}>{exporting ? "Generating…" : "Export PDF"}</button>
          <button className="admin-form-submit" onClick={handleSave} disabled={saving} style={{ padding: "8px 16px" }}>{saving ? "Saving…" : "Save"}</button>
          <button className="admin-sponsor-edit-btn" onClick={() => router.push("/admin/offers")}>← Back</button>
        </div>
      </div>

      {error && <div className="admin-form-error">{error}</div>}
      {success && <div className="admin-form-success">{success}</div>}

      {/* Status + Confirm/Deny */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "12px 0" }}>
        <span className={`admin-event-status ${offer.status === "accepted" ? "status-published" : offer.status === "declined" ? "status-declined" : "status-draft"}`}>
          {offer.status}
        </span>
        {offer.status !== "accepted" && offer.status !== "declined" && (
          <>
            <button className="portal-form-submit" style={{ background: "rgba(100,200,100,0.15)", borderColor: "rgba(100,200,100,0.4)", color: "#7ddb7d" }} onClick={() => handleStatusChange("accepted")} disabled={saving}>
              ✓ Confirm Offer
            </button>
            <button className="portal-form-submit" style={{ background: "rgba(255,100,100,0.1)", borderColor: "rgba(255,100,100,0.3)", color: "#ff9a9a" }} onClick={() => handleStatusChange("declined")} disabled={saving}>
              ✕ Deny Offer
            </button>
          </>
        )}
      </div>

      {/* Editable Fields */}
      <div className="admin-form">
        <h2 className="admin-form-section-title">Agency & Artist</h2>
        <div className="admin-form-grid">
          <label className="admin-form-label">Artist Name<input type="text" className="admin-form-input" value={String(form.artist_name || "")} onChange={(e) => updateField("artist_name", e.target.value)} /></label>
          <label className="admin-form-label">Agency<input type="text" className="admin-form-input" value={String(form.agency || "")} onChange={(e) => updateField("agency", e.target.value)} /></label>
          <label className="admin-form-label">Agent Name<input type="text" className="admin-form-input" value={String(form.agent_name || "")} onChange={(e) => updateField("agent_name", e.target.value)} /></label>
          <label className="admin-form-label">Agent Phone<input type="tel" className="admin-form-input" value={String(form.agent_phone || "")} onChange={(e) => updateField("agent_phone", e.target.value)} /></label>
          <label className="admin-form-label">Agent Email<input type="email" className="admin-form-input" value={String(form.agent_email || "")} onChange={(e) => updateField("agent_email", e.target.value)} /></label>
          <label className="admin-form-label">Event Date
            <select className="admin-form-input" value={form.event_date ? "date" : "ma"} onChange={(e) => { if (e.target.value === "ma") updateField("event_date", null); }}>
              <option value="ma">MA — No date attached</option>
              <option value="date">Specific date</option>
            </select>
          </label>
          {form.event_date !== null && form.event_date !== undefined && (
            <label className="admin-form-label">Date<input type="date" className="admin-form-input" value={form.event_date ? String(form.event_date).slice(0,10) : ""} onChange={(e) => updateField("event_date", e.target.value)} /></label>
          )}
          <label className="admin-form-label">Billing<select className="admin-form-input" value={String(form.billing || "100% Headline")} onChange={(e) => updateField("billing", e.target.value)}>
            <option>100% Headline</option><option>Co-Headline</option><option>Support</option>
          </select></label>
        </div>

        <h2 className="admin-form-section-title">Deal</h2>
        <div className="admin-form-grid">
          <label className="admin-form-label">Guarantee ($)<input type="number" className="admin-form-input" value={String(form.guarantee || "")} onChange={(e) => updateField("guarantee", parseFloat(e.target.value) || 0)} step="0.01" /></label>
          <label className="admin-form-label">Deal Type<select className="admin-form-input" value={String(form.deal_type || "FLAT")} onChange={(e) => updateField("deal_type", e.target.value)}>
            <option>VS</option><option>FLAT</option><option>PLUS</option><option>BONUS</option>
          </select></label>
          <label className="admin-form-label">Backend %<input type="text" className="admin-form-input" value={String(form.backend_percentage || "")} onChange={(e) => updateField("backend_percentage", e.target.value)} /></label>
          <label className="admin-form-label">Radius (mi)<input type="text" className="admin-form-input" value={String(form.radius_distance || "")} onChange={(e) => updateField("radius_distance", e.target.value)} /></label>
          <label className="admin-form-label">Days Prior<input type="number" className="admin-form-input" value={String(form.radius_days_prior || "")} onChange={(e) => updateField("radius_days_prior", parseInt(e.target.value) || null)} /></label>
          <label className="admin-form-label">Days After<input type="number" className="admin-form-input" value={String(form.radius_days_after || "")} onChange={(e) => updateField("radius_days_after", parseInt(e.target.value) || null)} /></label>
          <label className="admin-form-label">Deposit $<input type="number" className="admin-form-input" value={String(form.deposit_amount || "")} onChange={(e) => updateField("deposit_amount", parseFloat(e.target.value) || 0)} step="0.01" /></label>
          <label className="admin-form-label">Balance Due<input type="text" className="admin-form-input" value={String(form.balance_due || "")} onChange={(e) => updateField("balance_due", e.target.value)} /></label>
          <label className="admin-form-label">Merch<input type="text" className="admin-form-input" value={String(form.merch_split || "")} onChange={(e) => updateField("merch_split", e.target.value)} /></label>
          <label className="admin-form-label">Comps<input type="number" className="admin-form-input" value={String(form.comps || "")} onChange={(e) => updateField("comps", parseInt(e.target.value) || 0)} /></label>
        </div>

        <h2 className="admin-form-section-title">Financials (read-only)</h2>
        <div className="offer-potential-grid">
          <div className="offer-potential-col">
            <div className="offer-potential-row"><span>Gross Potential:</span><strong>${Number(form.gross_potential || 0).toLocaleString()}</strong></div>
            <div className="offer-potential-row"><span>Net Potential:</span><strong>${Number(form.net_potential || 0).toLocaleString()}</strong></div>
            <div className="offer-potential-row"><span>Total Expenses:</span><strong>${Number(form.total_expenses || 0).toLocaleString()}</strong></div>
            <div className="offer-potential-row highlight"><span>Splitpoint:</span><strong>${Number(form.splitpoint || 0).toLocaleString()}</strong></div>
          </div>
          <div className="offer-potential-col">
            <h3 className="offer-expenses-heading">Artist Potential</h3>
            <div className="offer-potential-row"><span>Guarantee:</span><strong>${Number(form.guarantee || 0).toLocaleString()}</strong></div>
            {form.deal_type !== "FLAT" && (
              <div className="offer-potential-row"><span>Backend ({String(form.deal_type)}):</span><strong>${Number(form.artist_backend || 0).toLocaleString()}</strong></div>
            )}
            <h3 className="offer-expenses-heading" style={{ marginTop: 12 }}>Promoter Potential</h3>
            <div className="offer-potential-row highlight"><span>Promoter Walkout:</span><strong>${Number(form.pot_walkout || 0).toLocaleString()}</strong></div>
          </div>
        </div>

        <label className="admin-form-label admin-form-full" style={{ marginTop: 16 }}>
          Notes
          <textarea className="admin-form-textarea" rows={3} value={String(form.notes || "")} onChange={(e) => updateField("notes", e.target.value)} />
        </label>
      </div>
    </div>
  );
}
