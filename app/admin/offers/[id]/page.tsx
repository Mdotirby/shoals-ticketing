"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCookie } from "@/lib/cookies";
import type { ArtistOffer, ShowLineupItem, TicketScalingRow, ExpenseItem, VariableExpenseItem } from "@/lib/types/offer";
import type { Venue } from "@/lib/types/venue";
import type { Contract } from "@/lib/types/contract";
import { exportContractPDF } from "@/lib/pdf/contract-pdf";

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
  type EventVenueOption = { id: string; name: string; full_address: string | null; contact_name: string | null; phone: string | null };
  const [offer, setOffer] = useState<ArtistOffer | null>(null);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [eventVenues, setEventVenues] = useState<EventVenueOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Contract state
  const [contract, setContract] = useState<Contract | null>(null);
  const [contractLoading, setContractLoading] = useState(false);
  const [signedByArtist, setSignedByArtist] = useState("");
  const [signedByBuyer, setSignedByBuyer] = useState("");

  // Editable fields
  const [form, setForm] = useState<Record<string, unknown>>({});

  // Fetch contract for this offer
  const fetchContract = async () => {
    try {
      const res = await fetch(`/api/contracts?venue_id=${getCookie("venue-id") || ""}`);
      if (res.ok) {
        const all: Contract[] = await res.json();
        const found = all.find((c) => c.offer_id === id);
        if (found) {
          setContract(found);
          setSignedByArtist(found.signed_by_artist || "");
          setSignedByBuyer(found.signed_by_buyer || "");
        }
      }
    } catch { /* ignore */ }
  };

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

    // Also load contract
    fetchContract();

    // Fetch event venues for dropdown
    import("@/lib/supabase-browser").then(({ getSupabaseBrowser }) => {
      getSupabaseBrowser()
        .from("event_venues")
        .select("id, name, full_address, contact_name, phone")
        .order("name")
        .then(({ data }: { data: EventVenueOption[] | null }) => {
          if (data) setEventVenues(data);
        });
    });
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

        // Build date with show time (local string, not ISO — matches how events are stored)
        const offerDate = updated.event_date ? String(updated.event_date).slice(0, 10) : "";
        const showTime = updated.show_time || "19:00"; // default 7 PM
        const eventDate = offerDate
          ? `${offerDate}T${showTime.length === 5 ? showTime : "19:00"}:00`
          : new Date().toISOString();

        // Build ticket tiers from offer scaling
        const scaling = Array.isArray(updated.ticket_scaling) ? updated.ticket_scaling : [];
        const tiers = scaling
          .filter((r: { sellable_cap: number; price: number }) => r.sellable_cap > 0)
          .map((r: { name: string; price: number; sellable_cap: number }) => ({
            tier_name: r.name || "General Admission",
            price: r.price || 0,
            capacity: r.sellable_cap || 500,
          }));

        // Display price = lowest tier price, or 0 if no tiers
        const displayPrice = tiers.length > 0
          ? Math.min(...tiers.map((t: { price: number }) => t.price))
          : 0;

        const eventRes = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: updated.artist_name,
            venue: updated.venue || venue?.name || "TBD",
            date: eventDate,
            price: displayPrice,
            venue_id: updated.venue_id || getCookie("venue-id") || null,
            status: "draft",
            description: `${updated.artist_name} - ${updated.billing || "Live Performance"}`,
            tiers: tiers.length > 0 ? tiers : undefined,
          }),
        });
        if (eventRes.ok) {
          setSuccess("Offer confirmed & event created with ticket tiers! Go to Events to add an image and publish.");
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
      const pc = "#d0c290";
      const sc = "#0b0d1d";
      const hex = (h: string) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)] as [number,number,number];
      const W = 215.9; // letter width mm
      let y = 0;

      // ─── HEADER BAR (venue branding) ───
      doc.setFillColor(...hex(sc));
      doc.rect(0, 0, W, 26, "F");
      doc.setFillColor(...hex(pc));
      doc.rect(0, 26, W, 1.5, "F");

      // Venue logo (top-left of header) — try slug logo, fall back to default
      try {
        const slugForLogo = venue?.slug || "";
        const logoUrls = slugForLogo
          ? [`/logos/${slugForLogo}/logo.png`, "/logos/default/logo.png"]
          : ["/logos/default/logo.png"];

        let logoLoaded = false;
        for (const logoUrl of logoUrls) {
          if (logoLoaded) break;
          try {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = logoUrl;
            await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; setTimeout(reject, 2000); });
            if (img.complete && img.naturalWidth > 0) {
              const canvas = document.createElement("canvas");
              canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
              canvas.getContext("2d")?.drawImage(img, 0, 0);
              doc.addImage(canvas.toDataURL("image/png"), "PNG", 8, 3, 20, 20);
              logoLoaded = true;
            }
          } catch { /* try next logo */ }
        }
      } catch {}

      // Venue info (top-right): Use offer venue fields first, then fall back to venue object
      const pdfVenueName = String(form.venue || venue?.name || "Venue");
      const pdfVenueAddr = String(form.venue_address || [venue?.address_street, venue?.address_city, venue?.address_state, venue?.address_zip].filter(Boolean).join(", ") || "");

      doc.setTextColor(...hex(pc));
      doc.setFontSize(16);
      doc.text(pdfVenueName, W - 10, 10, { align: "right" });
      doc.setFontSize(9);
      if (pdfVenueAddr) doc.text(pdfVenueAddr, W - 10, 16, { align: "right" });
      if (venue?.capacity) {
        doc.text(`Venue Capacity: ${venue.capacity}`, W - 10, pdfVenueAddr ? 21 : 16, { align: "right" });
      }

      y = 32;

      // Helpers
      const sectionTitle = (title: string) => { doc.setFillColor(...hex(pc)); doc.rect(10, y - 1, W - 20, 5, "F"); doc.setTextColor(...hex(sc)); doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.text(title, 12, y + 2.5); doc.setFont("helvetica", "normal"); y += 7; };
      const labelVal = (label: string, val: string, x1 = 10, x2 = 50) => { doc.setTextColor(60,60,60); doc.setFontSize(7); doc.text(`${label}:`, x1, y); doc.setTextColor(0,0,0); doc.setFontSize(7.5); doc.text(val, x2, y); y += 3.8; };
      const labelValR = (label: string, val: string, x1: number, x2: number) => { doc.setTextColor(60,60,60); doc.setFontSize(7); doc.text(`${label}:`, x1, y); doc.setTextColor(0,0,0); doc.setFontSize(7.5); doc.text(val, x2, y); };

      // ─── VENUE INFO ───
      if (form.venue || form.venue_address) {
        sectionTitle("Venue");
        labelVal("Venue", String(form.venue || "—"));
        labelVal("Address", String(form.venue_address || "—"));
        if (form.venue_contact) labelVal("Contact", String(form.venue_contact));
        if (form.venue_phone) labelVal("Phone", String(form.venue_phone));
        y += 2;
      }

      // ─── AGENCY & ARTIST ───
      sectionTitle("Agency / Artist");
      labelVal("Agency", String(form.agency || "—"));
      labelVal("Agent", String(form.agent_name || "—"));
      labelVal("Phone", String(form.agent_phone || "—"));
      labelVal("Email", String(form.agent_email || "—"));
      labelVal("Artist", String(form.artist_name || "—"));
      labelVal("Date", form.event_date ? new Date(String(form.event_date).slice(0,10) + "T12:00:00").toLocaleDateString() : "MA");
      labelVal("Shows", `${form.num_shows || 1}  |  Length: ${form.show_length || "—"}  |  Time: ${form.show_time || "—"}`);
      labelVal("Billing", String(form.billing || "—"));
      y += 2;

      // ─── DEAL ───
      sectionTitle("Deal");
      labelVal("Guarantee", `$${Number(form.guarantee || 0).toLocaleString()}`);
      labelVal("Type", `${form.deal_type || "FLAT"}`);
      labelVal("Backend", `${form.backend_percentage || "0"}%`);
      labelVal("Other Terms", String(form.other_terms || "—"));
      labelVal("Radius", `${form.radius_distance || "—"} mi  |  ${form.radius_days_prior || "—"} days prior  |  ${form.radius_days_after || "—"} days after`);
      labelVal("Production", String(form.production_by || "—"));
      labelVal("Deposit", `$${Number(form.deposit_amount || 0).toLocaleString()} (${form.deposit_pct || 0}%)  |  Due: ${form.deposit_due || "—"}`);
      labelVal("Balance", String(form.balance_due || "Day of Show"));
      labelVal("Merch", `${form.merch_split || "—"}  |  Sells: ${form.merch_seller || "—"}`);
      labelVal("Comps", String(form.comps || 0));
      y += 2;

      // ─── TICKET SCALING ───
      const scaling = (form.ticket_scaling || []) as TicketScalingRow[];
      if (scaling.length > 0) {
        sectionTitle("Ticket Scaling");
        // Column headers
        doc.setTextColor(80,80,80); doc.setFontSize(6);
        const cols = [10, 35, 55, 70, 85, 105, 130, 155];
        ["Scaling", "# Seats", "Comps", "Kills", "Sellable", "Net Price", "Price", "Gross"].forEach((h, i) => doc.text(h, cols[i], y));
        y += 3.5;
        doc.setTextColor(0,0,0); doc.setFontSize(7);
        scaling.forEach((r) => {
          [r.name, String(r.seats), String(r.comps), String(r.kills), String(r.sellable_cap), `$${r.net_price?.toFixed(2)}`, `$${r.price?.toFixed(2)}`, `$${(r.sellable_cap * r.price).toLocaleString()}`].forEach((v, i) => doc.text(v, cols[i], y));
          y += 3.5;
        });
        y += 2;
      }

      // ─── EXPENSES (two columns) ───
      sectionTitle("Expenses");
      const fe = (form.fixed_expenses || []) as ExpenseItem[];
      const ve = (form.variable_expenses || []) as VariableExpenseItem[];
      const startY = y;

      // Fixed (left)
      doc.setTextColor(80,80,80); doc.setFontSize(6); doc.text("Fixed Expenses", 10, y); doc.text("Est.", 60, y); y += 3.5;
      doc.setFontSize(7); doc.setTextColor(0,0,0);
      fe.forEach((e) => { if (e.amount > 0) { doc.text(e.name, 10, y); doc.text(`$${e.amount.toFixed(2)}`, 60, y); y += 3.2; } });
      doc.setFont("helvetica", "bold"); doc.text("Fixed Total", 10, y); doc.text(`$${Number(form.total_fixed || 0).toFixed(2)}`, 60, y); doc.setFont("helvetica", "normal");
      const fixedEndY = y + 4;

      // Variable (right)
      y = startY;
      doc.setTextColor(80,80,80); doc.setFontSize(6); doc.text("Variable Expenses", 110, y); doc.text("Rate", 160, y); doc.text("$", 180, y); y += 3.5;
      doc.setFontSize(7); doc.setTextColor(0,0,0);
      ve.forEach((e) => { if (e.amount > 0) { doc.text(e.name, 110, y); doc.text(`${(e.rate * 100).toFixed(2)}%`, 160, y); doc.text(`$${e.amount.toFixed(2)}`, 180, y); y += 3.2; } });
      doc.setFont("helvetica", "bold"); doc.text("Variable Total", 110, y); doc.text(`$${Number(form.total_variable || 0).toFixed(2)}`, 180, y); doc.setFont("helvetica", "normal");

      y = Math.max(fixedEndY, y + 4) + 2;
      doc.setFont("helvetica", "bold"); doc.setFontSize(8);
      doc.text(`Total Expenses:  $${Number(form.total_expenses || 0).toLocaleString()}`, 10, y);
      doc.setFont("helvetica", "normal");
      y += 6;

      // ─── POTENTIAL AT SELLOUT ───
      sectionTitle("Potential at Sellout");
      labelVal("Gross Potential", `$${Number(form.gross_potential || 0).toLocaleString()}`);
      labelVal("Adj. Gross", `$${Number(form.adj_gross || 0).toLocaleString()}`);
      const taxPct = Number(form.tax_rate || 0) * 100;
      labelVal(`Tax (${taxPct.toFixed(1)}%)`, `$${(Number(form.adj_gross || 0) * Number(form.tax_rate || 0)).toFixed(2)}`);
      labelVal("Net Potential", `$${Number(form.net_potential || 0).toLocaleString()}`);
      labelVal("Total Expenses", `$${Number(form.total_expenses || 0).toLocaleString()}`);
      if (form.deal_type !== "FLAT") labelVal("Splitpoint", `$${Number(form.splitpoint || 0).toLocaleString()}`);
      y += 2;

      // ─── ARTIST POTENTIAL ───
      sectionTitle("Artist Potential at Sellout");
      labelVal("Guarantee", `$${Number(form.guarantee || 0).toLocaleString()}`);
      if (form.deal_type !== "FLAT") labelVal("Backend", `$${Number(form.artist_backend || 0).toLocaleString()}`);
      y += 5;

      // ─── FOOTER ───
      doc.setFontSize(7); doc.setTextColor(120,120,120);
      doc.text(`Offer Good for ${form.offer_valid_days || 14} days from Today     ${new Date().toLocaleDateString()}`, 10, y);

      // Save
      const dateStr = form.event_date ? new Date(String(form.event_date).slice(0,10) + "T12:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).replace(/\//g, ".") : "TBD";
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
        <h2 className="admin-form-section-title">Venue Info</h2>
        {eventVenues.length > 0 && (
          <label className="admin-form-label" style={{ marginBottom: 12 }}>
            Select Previous Venue
            <select className="admin-form-input" onChange={(e) => {
              const v = eventVenues.find((x) => x.id === e.target.value);
              if (v) {
                updateField("venue", v.name);
                updateField("venue_address", v.full_address || "");
                updateField("venue_contact", v.contact_name || "");
                updateField("venue_phone", v.phone || "");
              }
            }} defaultValue="">
              <option value="" disabled>— Choose a venue —</option>
              {eventVenues.map((v) => (
                <option key={v.id} value={v.id}>{v.name}{v.full_address ? ` (${v.full_address})` : ""}</option>
              ))}
            </select>
          </label>
        )}
        <div className="admin-form-grid">
          <label className="admin-form-label">Venue<input type="text" className="admin-form-input" value={String(form.venue || "")} onChange={(e) => updateField("venue", e.target.value)} /></label>
          <label className="admin-form-label admin-form-full">Venue Address<input type="text" className="admin-form-input" value={String(form.venue_address || "")} onChange={(e) => updateField("venue_address", e.target.value)} /></label>
          <label className="admin-form-label">Venue Contact <span style={{ opacity: 0.5, fontSize: 11 }}>(optional)</span><input type="text" className="admin-form-input" value={String(form.venue_contact || "")} onChange={(e) => updateField("venue_contact", e.target.value)} /></label>
          <label className="admin-form-label">Venue Phone <span style={{ opacity: 0.5, fontSize: 11 }}>(optional)</span><input type="tel" className="admin-form-input" value={String(form.venue_phone || "")} onChange={(e) => updateField("venue_phone", e.target.value)} /></label>
        </div>

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

        {/* ── Ticket Scaling ── */}
        <h2 className="admin-form-section-title">Ticket Scaling</h2>
        <div className="admin-tiers-list">
          {(Array.isArray(form.ticket_scaling) ? form.ticket_scaling as Array<Record<string, number | string>> : []).map((r, i) => (
            <div key={i} className="admin-tier-row">
              <input type="text" className="admin-form-input admin-tier-input" value={String(r.name || "")} onChange={(e) => { const s = [...(form.ticket_scaling as Array<Record<string, unknown>>)]; s[i] = { ...s[i], name: e.target.value }; updateField("ticket_scaling", s); }} placeholder="Tier name" />
              <input type="number" className="admin-form-input admin-tier-input" value={r.seats || ""} onChange={(e) => { const s = [...(form.ticket_scaling as Array<Record<string, unknown>>)]; const v = parseInt(e.target.value) || 0; s[i] = { ...s[i], seats: v, sellable_cap: v - Number(s[i].comps || 0) - Number(s[i].kills || 0) }; updateField("ticket_scaling", s); }} placeholder="Seats" />
              <input type="number" className="admin-form-input admin-tier-input admin-tier-price" value={r.net_price || ""} onChange={(e) => { const s = [...(form.ticket_scaling as Array<Record<string, unknown>>)]; s[i] = { ...s[i], net_price: parseFloat(e.target.value) || 0 }; updateField("ticket_scaling", s); }} placeholder="Net $" step="0.01" />
              <span className="offer-calc-cell" style={{ minWidth: 50, fontSize: 12 }}>{r.sellable_cap || 0} sell</span>
            </div>
          ))}
          <button type="button" className="admin-tier-add-btn" onClick={() => updateField("ticket_scaling", [...(Array.isArray(form.ticket_scaling) ? form.ticket_scaling : []), { name: `P${((form.ticket_scaling as [])?.length || 0) + 1}`, seats: 0, comps: 0, kills: 0, sellable_cap: 0, price: 0, net_price: 0, facility_fee: 0 }])}>+ Add Tier</button>
        </div>

        {/* ── Fixed Expenses ── */}
        <h2 className="admin-form-section-title">Expenses</h2>
        <div className="offer-expenses-grid">
          <div className="offer-expenses-col">
            <h3 className="offer-expenses-heading">Fixed Expenses</h3>
            {(Array.isArray(form.fixed_expenses) ? form.fixed_expenses as Array<{name: string; amount: number}> : []).map((e, i) => (
              <div key={i} className="offer-expense-row">
                <input type="text" className="admin-form-input" value={e.name} onChange={(ev) => { const f = [...(form.fixed_expenses as Array<Record<string, unknown>>)]; f[i] = { ...f[i], name: ev.target.value }; updateField("fixed_expenses", f); }} />
                <input type="number" className="admin-form-input" value={e.amount || ""} onChange={(ev) => { const f = [...(form.fixed_expenses as Array<Record<string, unknown>>)]; f[i] = { ...f[i], amount: parseFloat(ev.target.value) || 0 }; updateField("fixed_expenses", f); }} step="0.01" />
              </div>
            ))}
            <button type="button" className="admin-tier-add-btn" onClick={() => updateField("fixed_expenses", [...(Array.isArray(form.fixed_expenses) ? form.fixed_expenses : []), { name: "", amount: 0 }])}>+ New Expense</button>
          </div>
          <div className="offer-expenses-col">
            <h3 className="offer-expenses-heading">Variable Expenses</h3>
            {(Array.isArray(form.variable_expenses) ? form.variable_expenses as Array<{name: string; rate: number; amount: number}> : []).map((e, i) => (
              <div key={i} className="offer-expense-row">
                <span className="offer-var-name">{e.name}</span>
                <input type="number" className="admin-form-input" style={{ width: 80 }} value={e.rate} onChange={(ev) => { const v = [...(form.variable_expenses as Array<Record<string, unknown>>)]; const rate = parseFloat(ev.target.value) || 0; v[i] = { ...v[i], rate, amount: Math.round(Number(form.gross_potential || 0) * rate * 100) / 100 }; updateField("variable_expenses", v); }} step="0.0001" />
                <span className="offer-var-amount">${e.amount?.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Financials Summary ── */}
        <h2 className="admin-form-section-title">Financials</h2>
        <div className="offer-potential-grid">
          <div className="offer-potential-col">
            <div className="offer-potential-row"><span>Gross Potential:</span><strong>${Number(form.gross_potential || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            <div className="offer-potential-row"><span>Net Potential:</span><strong>${Number(form.net_potential || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            <div className="offer-potential-row"><span>Total Expenses:</span><strong>${Number(form.total_expenses || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            {form.deal_type !== "FLAT" && (
              <div className="offer-potential-row highlight"><span>Splitpoint:</span><strong>${Number(form.splitpoint || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            )}
          </div>
          <div className="offer-potential-col">
            <h3 className="offer-expenses-heading">Artist Potential</h3>
            <div className="offer-potential-row"><span>Guarantee:</span><strong>${Number(form.guarantee || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            {form.deal_type !== "FLAT" && (
              <div className="offer-potential-row"><span>Backend ({String(form.deal_type)}):</span><strong>${Number(form.artist_backend || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            )}
          </div>
        </div>

        <label className="admin-form-label admin-form-full" style={{ marginTop: 16 }}>
          Notes
          <textarea className="admin-form-textarea" rows={3} value={String(form.notes || "")} onChange={(e) => updateField("notes", e.target.value)} />
        </label>
      </div>

      {/* ════════════════════════════════════════════
          CONTRACT SECTION
      ════════════════════════════════════════════ */}
      <h2 className="admin-form-section-title" style={{ marginTop: 32 }}>Contract</h2>

      {!contract ? (
        /* ── No contract yet ── */
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          <button
            className="admin-form-submit"
            style={{ padding: "10px 20px" }}
            disabled={contractLoading}
            onClick={async () => {
              if (!offer || !venue) return;
              setContractLoading(true);
              setError("");
              try {
                // Create contract record
                const res = await fetch("/api/contracts", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    offer_id: offer.id,
                    venue_id: offer.venue_id || getCookie("venue-id"),
                    source: "generated",
                    guarantee: offer.guarantee,
                    deal_type: offer.deal_type,
                    backend_percentage: offer.backend_percentage,
                    deposit_amount: offer.deposit_amount,
                    status: "draft",
                  }),
                });
                if (!res.ok) throw new Error("Failed to create contract");
                const created: Contract = await res.json();
                setContract(created);

                // Generate PDF
                await exportContractPDF(created, offer, venue);
                setSuccess("Contract generated & PDF downloaded.");
              } catch {
                setError("Failed to generate contract.");
              } finally {
                setContractLoading(false);
              }
            }}
          >
            {contractLoading ? "Generating…" : "Generate Contract"}
          </button>

          <button
            className="admin-header-btn"
            style={{ padding: "10px 20px" }}
            disabled={contractLoading}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file || !offer) return;
                setContractLoading(true);
                setError("");
                try {
                  // Upload file
                  const formData = new FormData();
                  formData.append("file", file);
                  const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
                  if (!uploadRes.ok) throw new Error("Upload failed");
                  const { url } = await uploadRes.json();

                  // Create contract record
                  const res = await fetch("/api/contracts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      offer_id: offer.id,
                      venue_id: offer.venue_id || getCookie("venue-id"),
                      source: "uploaded",
                      file_url: url,
                      file_name: file.name,
                      guarantee: offer.guarantee,
                      deal_type: offer.deal_type,
                      backend_percentage: offer.backend_percentage,
                      deposit_amount: offer.deposit_amount,
                      status: "draft",
                    }),
                  });
                  if (!res.ok) throw new Error("Failed to create contract");
                  const created: Contract = await res.json();
                  setContract(created);
                  setSuccess("Contract uploaded successfully.");
                } catch {
                  setError("Failed to upload contract.");
                } finally {
                  setContractLoading(false);
                }
              };
              input.click();
            }}
          >
            Upload Contract
          </button>
        </div>
      ) : (
        /* ── Contract exists ── */
        <div style={{ marginTop: 8 }}>
          {/* Status badge */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
            <span
              style={{
                background:
                  contract.status === "signed" ? "rgba(100,200,100,0.15)" :
                  contract.status === "sent" ? "rgba(100,180,255,0.12)" :
                  contract.status === "void" ? "rgba(255,100,100,0.12)" :
                  "rgba(255,200,50,0.12)",
                color:
                  contract.status === "signed" ? "#7ddb7d" :
                  contract.status === "sent" ? "#6ab4ff" :
                  contract.status === "void" ? "#ff9a9a" :
                  "#e8c94a",
                padding: "4px 14px",
                borderRadius: 4,
                fontSize: 13,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              {contract.status}
            </span>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
              Source: {contract.source} · v{contract.version}
            </span>
            {contract.signed_at && (
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
                Signed: {new Date(contract.signed_at).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            {/* Download / Generate PDF */}
            <button
              className="admin-header-btn"
              style={{ padding: "8px 16px" }}
              disabled={contractLoading}
              onClick={async () => {
                if (contract.source === "uploaded" && contract.file_url) {
                  window.open(contract.file_url, "_blank");
                } else if (offer && venue) {
                  setContractLoading(true);
                  try {
                    await exportContractPDF(contract, offer, venue);
                  } catch {
                    setError("Failed to generate PDF.");
                  } finally {
                    setContractLoading(false);
                  }
                }
              }}
            >
              {contract.source === "uploaded" ? "Download Contract" : "Download Contract PDF"}
            </button>

            {/* Mark as Sent */}
            {contract.status === "draft" && (
              <button
                className="admin-header-btn"
                style={{
                  padding: "8px 16px",
                  background: "rgba(100,180,255,0.1)",
                  borderColor: "rgba(100,180,255,0.3)",
                  color: "#6ab4ff",
                }}
                disabled={contractLoading}
                onClick={async () => {
                  setContractLoading(true);
                  try {
                    const res = await fetch(`/api/contracts/${contract.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "sent" }),
                    });
                    if (!res.ok) throw new Error("Failed");
                    const updated = await res.json();
                    setContract(updated);
                    setSuccess("Contract marked as sent.");
                  } catch {
                    setError("Failed to update contract.");
                  } finally {
                    setContractLoading(false);
                  }
                }}
              >
                Mark as Sent
              </button>
            )}

            {/* Mark as Signed */}
            {(contract.status === "draft" || contract.status === "sent") && (
              <button
                className="admin-form-submit"
                style={{
                  padding: "8px 16px",
                  background: "rgba(100,200,100,0.15)",
                  borderColor: "rgba(100,200,100,0.4)",
                  color: "#7ddb7d",
                }}
                disabled={contractLoading}
                onClick={async () => {
                  if (!signedByArtist && !signedByBuyer) {
                    setError("Enter at least one signer name before marking as signed.");
                    return;
                  }
                  setContractLoading(true);
                  try {
                    const res = await fetch(`/api/contracts/${contract.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        status: "signed",
                        signed_at: new Date().toISOString(),
                        signed_by_artist: signedByArtist || null,
                        signed_by_buyer: signedByBuyer || null,
                      }),
                    });
                    if (!res.ok) throw new Error("Failed");
                    const updated = await res.json();
                    setContract(updated);
                    setSuccess("Contract marked as signed.");
                  } catch {
                    setError("Failed to update contract.");
                  } finally {
                    setContractLoading(false);
                  }
                }}
              >
                ✓ Mark as Signed
              </button>
            )}

            {/* Upload countersigned copy */}
            <button
              className="admin-header-btn"
              style={{ padding: "8px 16px" }}
              disabled={contractLoading}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                input.onchange = async () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  setContractLoading(true);
                  try {
                    const formData = new FormData();
                    formData.append("file", file);
                    const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
                    if (!uploadRes.ok) throw new Error("Upload failed");
                    const { url } = await uploadRes.json();

                    const res = await fetch(`/api/contracts/${contract.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        file_url: url,
                        file_name: file.name,
                        version: (contract.version || 1) + 1,
                      }),
                    });
                    if (!res.ok) throw new Error("Failed");
                    const updated = await res.json();
                    setContract(updated);
                    setSuccess("Countersigned copy uploaded.");
                  } catch {
                    setError("Failed to upload countersigned copy.");
                  } finally {
                    setContractLoading(false);
                  }
                };
                input.click();
              }}
            >
              Upload Countersigned Copy
            </button>
          </div>

          {/* Signed-by fields (visible when not yet signed) */}
          {contract.status !== "signed" && contract.status !== "void" && (
            <div className="admin-form-grid" style={{ maxWidth: 500 }}>
              <label className="admin-form-label">
                Signed by Artist
                <input
                  type="text"
                  className="admin-form-input"
                  value={signedByArtist}
                  onChange={(e) => setSignedByArtist(e.target.value)}
                  placeholder="Artist or agent name"
                />
              </label>
              <label className="admin-form-label">
                Signed by Buyer
                <input
                  type="text"
                  className="admin-form-input"
                  value={signedByBuyer}
                  onChange={(e) => setSignedByBuyer(e.target.value)}
                  placeholder="Buyer / promoter name"
                />
              </label>
            </div>
          )}

          {/* Show signer info if already signed */}
          {contract.status === "signed" && (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 8 }}>
              {contract.signed_by_artist && <div>Artist: <strong style={{ color: "#fff" }}>{contract.signed_by_artist}</strong></div>}
              {contract.signed_by_buyer && <div>Buyer: <strong style={{ color: "#fff" }}>{contract.signed_by_buyer}</strong></div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
