"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCookie } from "@/lib/cookies";
import type { ArtistOffer, ShowLineupItem, TicketScalingRow, ExpenseItem, VariableExpenseItem } from "@/lib/types/offer";
import type { Venue } from "@/lib/types/venue";
import type { Contract } from "@/lib/types/contract";
import { exportContractPDF } from "@/lib/pdf/contract-pdf";
import { exportOfferPDF } from "@/lib/pdf/offer-pdf";
import { formatPhoneNumber } from "@/lib/formatPhone";
import DealLabPanel from "@/app/components/deal-lab/DealLabPanel";

/** Convert 24hr time (e.g. "19:00") to 12hr format (e.g. "7:00 PM") */
function formatTime12hr(time: string): string {
  if (!time) return time;
  const match = time.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return time;
  let hours = parseInt(match[1]);
  const minutes = match[2];
  const ampm = hours >= 12 ? "PM" : "AM";
  if (hours === 0) hours = 12;
  else if (hours > 12) hours -= 12;
  return `${hours}:${minutes} ${ampm}`;
}

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

  // Tab state
  const [activeTab, setActiveTab] = useState<"details" | "pnl" | "deal_lab">("details");

  // Ancillary revenue state (P&L tab)
  const [ancillaryItems, setAncillaryItems] = useState([
    { name: "Concessions", income: 0, expenses: 0 },
    { name: "Bars", income: 0, expenses: 0 },
    { name: "Catering/F&B", income: 0, expenses: 0 },
    { name: "Merch", income: 0, expenses: 0 },
    { name: "Venue Merch", income: 0, expenses: 0 },
  ]);

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

    fetch(`/api/offers/${id}`).then((r) => r.json())
      .then(async (offerData) => {
        if (offerData.error) { setError(offerData.error); return; }
        setOffer(offerData);
        setForm(offerData);

        // Resolve venue: use venue-id cookie, offer's venue_id, or first available venue (for owner)
        try {
          const venues: Venue[] = await fetch("/api/venues").then((r) => r.json());
          if (Array.isArray(venues) && venues.length > 0) {
            const resolveVenueId = venueId || offerData.venue_id;
            const found = resolveVenueId
              ? venues.find((v) => v.id === resolveVenueId) || venues[0]
              : venues[0]; // owner without cookie — use first venue
            setVenue(found);
          }
        } catch { /* ignore */ }
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

  // ── Live-computed financials (recalculate whenever tiers/expenses/tax change) ──
  const live = useMemo(() => {
    const scaling = Array.isArray(form.ticket_scaling) ? form.ticket_scaling as Array<Record<string, number>> : [];
    const fixedExp = Array.isArray(form.fixed_expenses) ? form.fixed_expenses as Array<{ amount: number }> : [];
    const varExp = Array.isArray(form.variable_expenses) ? form.variable_expenses as Array<{ rate: number; amount: number }> : [];

    const grossPotential = scaling.reduce((s, r) => s + (Number(r.sellable_cap) || 0) * (Number(r.price) || 0), 0);
    const totalFees = scaling.reduce((s, r) => s + ((Number(r.ticketing_fee) || 0) + (Number(r.facility_fee) || 0)) * (Number(r.sellable_cap) || 0), 0);
    const adjGross = grossPotential - totalFees;

    const rawTaxRate = Number(form.tax_rate) || 0;
    const taxRatePct = rawTaxRate > 0 && rawTaxRate < 1 ? rawTaxRate * 100 : rawTaxRate;
    const taxRateDecimal = taxRatePct / 100;
    const taxMethod = (form.tax_method as string) || "multiplier";

    let netPotential: number;
    let taxAmount: number;
    if (taxMethod === "divisor") {
      netPotential = Math.round((adjGross / (1 + taxRateDecimal)) * 100) / 100;
      taxAmount = Math.round((adjGross - netPotential) * 100) / 100;
    } else {
      taxAmount = Math.round((adjGross * taxRateDecimal) * 100) / 100;
      netPotential = adjGross; // customer funds the tax — promoter nets the full adj gross
    }

    const totalFixed = fixedExp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    // Variable expenses amount is stored (rate × gross_potential at save time), but for live display
    // we recompute it from the live gross so editing tiers updates these too.
    const totalVariable = varExp.reduce((s, e) => s + ((Number(e.rate) || 0) * grossPotential), 0);
    const totalExpenses = totalFixed + totalVariable;

    const splitpoint = Math.max(netPotential - totalExpenses, 0);

    return {
      grossPotential,
      adjGross,
      taxRatePct,
      taxAmount,
      netPotential,
      totalFixed,
      totalVariable,
      totalExpenses,
      splitpoint,
    };
  }, [form.ticket_scaling, form.fixed_expenses, form.variable_expenses, form.tax_rate, form.tax_method]);

  // Merge live-computed derived totals into form state before saving so the
  // database always has the up-to-date totals/splitpoint/net_potential/etc.
  const buildSavePayload = (overrides: Record<string, unknown> = {}) => ({
    ...form,
    gross_potential: live.grossPotential,
    adj_gross: live.adjGross,
    net_potential: live.netPotential,
    tax_amount: live.taxAmount,
    total_fixed: live.totalFixed,
    total_variable: live.totalVariable,
    total_expenses: live.totalExpenses,
    splitpoint: live.splitpoint,
    // Re-sync variable expense amounts so stored amounts match live display
    variable_expenses: (Array.isArray(form.variable_expenses) ? form.variable_expenses as Array<Record<string, unknown>> : [])
      .map((e) => ({
        ...e,
        amount: Math.round((Number(e.rate) || 0) * live.grossPotential * 100) / 100,
      })),
    ...overrides,
  });

  const handleSave = async () => {
    setSaving(true); setError(""); setSuccess("");
    try {
      const res = await fetch(`/api/offers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSavePayload()),
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
        body: JSON.stringify(buildSavePayload({ status })),
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
          .map((r: { name: string; price: number; net_price?: number; sellable_cap: number }) => ({
            tier_name: r.name || "General Admission",
            price: r.net_price ?? r.price ?? 0,
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
            event_venue_id: updated.event_venue_id || null,
            status: "published",
            description: `${updated.artist_name} - ${updated.billing || "Live Performance"}`,
            tiers: tiers.length > 0 ? tiers : undefined,
          }),
        });
        if (eventRes.ok) {
          setSuccess("Offer confirmed & event published with ticket tiers! Go to Events to add an image.");
        } else {
          setSuccess("Offer confirmed but event creation failed. Create manually.");
        }
      } else if (status === "declined") {
        setSuccess("Offer declined.");
      }
    } catch { setError("Failed to update status."); }
    finally { setSaving(false); }
  };

  // ── PDF Export (uses shared offer-pdf module with pagination) ──
  const exportPDF = async () => {
    if (!offer) return;
    setExporting(true);
    try {
      await exportOfferPDF({
        venue: form.venue as string,
        venue_address: form.venue_address as string,
        venue_contact: form.venue_contact as string,
        venue_phone: form.venue_phone as string,
        venue_capacity: venue?.capacity ?? undefined,
        agency: form.agency as string,
        agent_name: form.agent_name as string,
        agent_phone: form.agent_phone as string,
        agent_email: form.agent_email as string,
        artist_name: form.artist_name as string,
        event_date: form.event_date as string,
        num_shows: form.num_shows as number,
        show_length: form.show_length as string,
        show_time: form.show_time as string,
        billing: form.billing as string,
        show_lineup: (form.show_lineup as { time: string; artist: string; set_length: string }[]) || [],
        guarantee: form.guarantee as number,
        deal_type: form.deal_type as string,
        backend_percentage: form.backend_percentage as number,
        other_terms: form.other_terms as string,
        radius_distance: form.radius_distance as string,
        radius_days_prior: form.radius_days_prior as number,
        radius_days_after: form.radius_days_after as number,
        production_by: form.production_by as string,
        deposit_amount: form.deposit_amount as number,
        deposit_pct: form.deposit_pct as number,
        deposit_due: form.deposit_due as string,
        balance_due: form.balance_due as string,
        merch_split: form.merch_split as string,
        merch_seller: form.merch_seller as string,
        comps: form.comps as number,
        artist_comps: form.artist_comps as number,
        marketing_comps: form.marketing_comps as number,
        ticket_scaling: form.ticket_scaling as TicketScalingRow[],
        fixed_expenses: form.fixed_expenses as ExpenseItem[],
        variable_expenses: form.variable_expenses as VariableExpenseItem[],
        total_fixed: live.totalFixed,
        total_variable: live.totalVariable,
        total_expenses: live.totalExpenses,
        gross_potential: live.grossPotential,
        adj_gross: live.adjGross,
        tax_rate: form.tax_rate as number,
        tax_method: (form.tax_method as "divisor" | "multiplier") || "multiplier",
        net_potential: live.netPotential,
        splitpoint: live.splitpoint,
        artist_backend: form.artist_backend as number,
        offer_valid_days: form.offer_valid_days as number,
      }, venue);
    } catch (err) { console.error("PDF failed:", err); }
    finally { setExporting(false); }
  };

  if (loading) return <div className="admin-form-page"><h1 className="admin-page-title">Loading…</h1></div>;
  if (!offer) return <div className="admin-form-page"><h1 className="admin-page-title">Offer Not Found</h1></div>;

  return (
    <div className="admin-form-page" style={{ maxWidth: 1100 }}>
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

      {/* Tab Bar */}
      <div style={{
        display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.1)",
        marginBottom: 20, marginTop: 8,
      }}>
        {(["details", "pnl", "deal_lab"] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 600,
              color: activeTab === tab ? "#d0c290" : "rgba(255,255,255,0.4)",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid #d0c290" : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {tab === "details"
              ? "Offer Details"
              : tab === "pnl"
              ? "P&L / Breakeven"
              : "Deal Lab (Simulated)"}
          </button>
        ))}
      </div>

      {activeTab === "details" && (
      <>
      {/* Editable Fields */}
      <div className="admin-form">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24 }}>
          <div>
            <h2 className="admin-form-section-title" style={{ marginTop: 0 }}>Venue Info</h2>
            {eventVenues.length > 0 && (
              <label className="admin-form-label" style={{ marginBottom: 12 }}>
                Select Previous Venue
                <select className="admin-form-input" onChange={(e) => {
                  const v = eventVenues.find((x) => x.id === e.target.value);
                  if (v) {
                    updateField("event_venue_id", v.id);
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
              <label className="admin-form-label">Venue Phone <span style={{ opacity: 0.5, fontSize: 11 }}>(optional)</span><input type="tel" className="admin-form-input" value={String(form.venue_phone || "")} onChange={(e) => updateField("venue_phone", formatPhoneNumber(e.target.value))} /></label>
            </div>
          </div>

          <div>
            <h2 className="admin-form-section-title" style={{ marginTop: 0 }}>Agency & Artist</h2>
            <div className="admin-form-grid">
              <label className="admin-form-label">Artist Name<input type="text" className="admin-form-input" value={String(form.artist_name || "")} onChange={(e) => updateField("artist_name", e.target.value)} /></label>
              <label className="admin-form-label">Agency<input type="text" className="admin-form-input" value={String(form.agency || "")} onChange={(e) => updateField("agency", e.target.value)} /></label>
              <label className="admin-form-label">Agent Name<input type="text" className="admin-form-input" value={String(form.agent_name || "")} onChange={(e) => updateField("agent_name", e.target.value)} /></label>
              <label className="admin-form-label">Agent Phone<input type="tel" className="admin-form-input" value={String(form.agent_phone || "")} onChange={(e) => updateField("agent_phone", formatPhoneNumber(e.target.value))} /></label>
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
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24 }}>
          <div>
            <h2 className="admin-form-section-title" style={{ marginTop: 0 }}>Deal</h2>
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
              <label className="admin-form-label">Total Comps<input type="number" className="admin-form-input" value={String(form.comps || "")} onChange={(e) => updateField("comps", parseInt(e.target.value) || 0)} /></label>
              <label className="admin-form-label">Artist Comps<input type="number" className="admin-form-input" value={String(form.artist_comps || "")} onChange={(e) => updateField("artist_comps", parseInt(e.target.value) || 0)} /></label>
              <label className="admin-form-label">Marketing Comps<input type="number" className="admin-form-input" value={String(form.marketing_comps || "")} onChange={(e) => updateField("marketing_comps", parseInt(e.target.value) || 0)} /></label>
            </div>
          </div>

          <div>
            <h2 className="admin-form-section-title" style={{ marginTop: 0 }}>Tax</h2>
            <div className="admin-form-grid">
              <label className="admin-form-label">
                Tax Method
                <select className="admin-form-input" value={String(form.tax_method || "multiplier")} onChange={(e) => updateField("tax_method", e.target.value)}>
                  <option value="multiplier">Multiplier (default — customer pays tax on top)</option>
                  <option value="divisor">Divisor (tax baked into face price)</option>
                </select>
              </label>
              <label className="admin-form-label">
                Tax Rate (%)
                <input type="number" className="admin-form-input" value={(() => { const r = Number(form.tax_rate || 0); return r > 0 && r < 1 ? r * 100 : r; })()} onChange={(e) => updateField("tax_rate", parseFloat(e.target.value) / 100 || 0)} step="0.5" min="0" placeholder="9.5" />
              </label>
            </div>
          </div>
        </div>

        {/* ── Ticket Scaling ── */}
        <h2 className="admin-form-section-title">Ticket Scaling</h2>
        {(() => {
          const scaling = Array.isArray(form.ticket_scaling) ? form.ticket_scaling as Array<Record<string, number | string>> : [];
          const rawTax = Number(form.tax_rate) || 0;
          const trd = (rawTax > 0 && rawTax < 1 ? rawTax * 100 : rawTax) / 100;
          const tm = (form.tax_method as string) || "multiplier";
          // Derive global fee values from first tier (all tiers share the same fees)
          const globalFacFee = Number(scaling[0]?.facility_fee ?? 0);
          const globalTktFee = Number(scaling[0]?.ticketing_fee ?? 0);
          const applyFeesToAll = (ff: number, tf: number) => {
            const s = scaling.map((r) => ({ ...r, facility_fee: ff, ticketing_fee: tf, price: Number(r.net_price || 0) + ff + tf }));
            updateField("ticket_scaling", s);
          };
          return (
            <>
              <div className="offer-scaling-table">
                <div className="offer-scaling-header">
                  <span>Name</span><span># Seats</span><span>Comps</span><span>Kills</span><span>Sellable</span><span>Net Price</span><span>Fac. Fee</span><span>Tkt Fee</span><span>Price</span><span>Tax/Ticket</span><span>All-In</span><span>Gross</span>
                </div>
                {scaling.map((r, i) => {
                  const np = Number(r.net_price || 0);
                  const ff = Number(r.facility_fee || 0);
                  const tf = Number(r.ticketing_fee || 0);
                  const price = Number(r.price || np + ff + tf);
                  const taxPerTicket = tm === "divisor"
                    ? Math.round(np * trd / (1 + trd) * 100) / 100
                    : Math.round(np * trd * 100) / 100;
                  const allIn = tm === "divisor" ? price : price + taxPerTicket;
                  const sellable = Number(r.sellable_cap || 0);
                  return (
                    <div key={i} className="offer-scaling-row">
                      <input type="text" className="admin-form-input" value={String(r.name || "")} onChange={(e) => { const s = [...(form.ticket_scaling as Array<Record<string, unknown>>)]; s[i] = { ...s[i], name: e.target.value }; updateField("ticket_scaling", s); }} />
                      <input type="number" className="admin-form-input" value={r.seats || ""} onChange={(e) => {
                        const s = [...(form.ticket_scaling as Array<Record<string, unknown>>)];
                        const v = parseInt(e.target.value) || 0;
                        s[i] = { ...s[i], seats: v, sellable_cap: v - Number(s[i].comps || 0) - Number(s[i].kills || 0) };
                        updateField("ticket_scaling", s);
                      }} />
                      <input type="number" className="admin-form-input" value={r.comps || ""} onChange={(e) => {
                        const s = [...(form.ticket_scaling as Array<Record<string, unknown>>)];
                        const v = parseInt(e.target.value) || 0;
                        s[i] = { ...s[i], comps: v, sellable_cap: Number(s[i].seats || 0) - v - Number(s[i].kills || 0) };
                        updateField("ticket_scaling", s);
                      }} />
                      <input type="number" className="admin-form-input" value={r.kills || ""} onChange={(e) => {
                        const s = [...(form.ticket_scaling as Array<Record<string, unknown>>)];
                        const v = parseInt(e.target.value) || 0;
                        s[i] = { ...s[i], kills: v, sellable_cap: Number(s[i].seats || 0) - Number(s[i].comps || 0) - v };
                        updateField("ticket_scaling", s);
                      }} />
                      <span className="offer-calc-cell">{sellable}</span>
                      <input type="number" className="admin-form-input" value={r.net_price || ""} onChange={(e) => {
                        const s = [...(form.ticket_scaling as Array<Record<string, unknown>>)];
                        const np2 = parseFloat(e.target.value) || 0;
                        s[i] = { ...s[i], net_price: np2, price: np2 + Number(s[i].facility_fee || 0) + Number(s[i].ticketing_fee || 0) };
                        updateField("ticket_scaling", s);
                      }} step="0.01" />
                      <span className="offer-calc-cell">${ff.toFixed(2)}</span>
                      <span className="offer-calc-cell">${tf.toFixed(2)}</span>
                      <span className="offer-calc-cell">${price.toFixed(2)}</span>
                      <span className="offer-calc-cell">${taxPerTicket.toFixed(2)}</span>
                      <span className="offer-calc-cell">${allIn.toFixed(2)}</span>
                      <span className="offer-calc-cell">${(sellable * price).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                      {scaling.length > 1 && <button type="button" className="admin-tier-remove-btn" onClick={() => updateField("ticket_scaling", scaling.filter((_, j) => j !== i))}>✕</button>}
                    </div>
                  );
                })}
              </div>
              <div className="offer-scaling-footer">
                <button type="button" className="admin-tier-add-btn" onClick={() => updateField("ticket_scaling", [...scaling, { name: "General Admission", seats: 0, comps: 0, kills: 0, sellable_cap: 0, price: globalFacFee + globalTktFee, net_price: 0, facility_fee: globalFacFee, ticketing_fee: globalTktFee }])}>+ Add Tier</button>
                <label className="admin-form-label offer-inline-label">Facility Fee $<input type="number" className="admin-form-input" style={{ width: 80 }} value={globalFacFee} onChange={(e) => applyFeesToAll(parseFloat(e.target.value) || 0, globalTktFee)} step="0.01" /></label>
                <label className="admin-form-label offer-inline-label">Ticketing Fee $<input type="number" className="admin-form-input" style={{ width: 80 }} value={globalTktFee} onChange={(e) => applyFeesToAll(globalFacFee, parseFloat(e.target.value) || 0)} step="0.01" /></label>
              </div>
              <div className="offer-totals-row">
                <span>Total Cap: <strong>{scaling.reduce((s, r) => s + Number(r.seats || 0), 0)}</strong></span>
                <span>Sellable: <strong>{scaling.reduce((s, r) => s + Number(r.sellable_cap || 0), 0)}</strong></span>
                <span>Gross Potential: <strong>${live.grossPotential.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>
                <span>Adj. Gross: <strong>${live.adjGross.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>
              </div>
            </>
          );
        })()}

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
            {(Array.isArray(form.variable_expenses) ? form.variable_expenses as Array<{name: string; rate: number; amount: number}> : []).map((e, i) => {
              // Live amount = rate × current gross potential (not the stored stale value)
              const liveAmount = Math.round((Number(e.rate) || 0) * live.grossPotential * 100) / 100;
              return (
                <div key={i} className="offer-expense-row">
                  <span className="offer-var-name">{e.name}</span>
                  <input
                    type="number"
                    className="admin-form-input"
                    style={{ width: 80 }}
                    value={e.rate}
                    onChange={(ev) => {
                      const v = [...(form.variable_expenses as Array<Record<string, unknown>>)];
                      const rate = parseFloat(ev.target.value) || 0;
                      v[i] = { ...v[i], rate, amount: Math.round(live.grossPotential * rate * 100) / 100 };
                      updateField("variable_expenses", v);
                    }}
                    step="0.0001"
                  />
                  <span className="offer-var-amount">${liveAmount.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>



        {/* ── Financials Summary ── */}
        <h2 className="admin-form-section-title">Financials</h2>
        <div className="offer-potential-grid">
          <div className="offer-potential-col">
            <div className="offer-potential-row"><span>Gross Potential:</span><strong>${live.grossPotential.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            <div className="offer-potential-row"><span>Adj. Gross:</span><strong>${live.adjGross.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            <div className="offer-potential-row"><span>{(form.tax_method || "multiplier") === "multiplier" ? `Tax Collected (${live.taxRatePct.toFixed(2)}% — from customers):` : `Tax (${live.taxRatePct.toFixed(2)}% — embedded in price):`}</span><strong>${live.taxAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            <div className="offer-potential-row"><span>Net Potential:</span><strong>${live.netPotential.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            <div className="offer-potential-row"><span>Total Expenses:</span><strong>${live.totalExpenses.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            {form.deal_type !== "FLAT" && (
              <div className="offer-potential-row highlight"><span>Splitpoint:</span><strong>${live.splitpoint.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            )}
          </div>
          <div className="offer-potential-col">
            <h3 className="offer-expenses-heading">Artist Potential at Sellout</h3>
            <div className="offer-potential-row"><span>Guarantee:</span><strong>${Number(form.guarantee || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            {form.deal_type === "VS" && (() => {
              const bp = Number(form.backend_percentage || 0) / 100;
              const backendCalc = live.splitpoint * bp;
              const artistTotal = Math.max(Number(form.guarantee || 0), backendCalc);
              const backendVS = Math.max(backendCalc - Number(form.guarantee || 0), 0);
              return <>
                <div className="offer-potential-row"><span>Backend (VS):</span><strong>${backendVS.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                <div className="offer-potential-row highlight"><span>Artist Total:</span><strong>${artistTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
              </>;
            })()}
            {(form.deal_type === "PLUS" || form.deal_type === "BONUS") && (() => {
              const bp = Number(form.backend_percentage || 0) / 100;
              const backendPlus = live.splitpoint * bp;
              const artistTotal = Number(form.guarantee || 0) + backendPlus;
              return <>
                <div className="offer-potential-row"><span>Backend ({String(form.deal_type)}):</span><strong>${backendPlus.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                <div className="offer-potential-row highlight"><span>Artist Total:</span><strong>${artistTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
              </>;
            })()}
            {form.deal_type === "FLAT" && (
              <div className="offer-potential-row highlight"><span>Artist Total:</span><strong>${Number(form.guarantee || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
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
              if (!offer) return;
              setContractLoading(true);
              setError("");
              try {
                // Build a fallback venue from offer fields if no venue object
                const contractVenue: Venue = venue || {
                  id: offer.venue_id || "",
                  name: String(form.venue || "Venue"),
                  slug: "",
                  logo_url: null,
                  nickname: null,
                  capacity: null,
                  address_street: String(form.venue_address || "").split(",")[0]?.trim() || null,
                  address_city: String(form.venue_address || "").split(",")[1]?.trim() || null,
                  address_state: String(form.venue_address || "").split(",")[2]?.trim() || null,
                  address_zip: String(form.venue_address || "").split(",")[3]?.trim() || null,
                  buyer_name: null,
                  contract_signatory: null,
                  buyer_phone: String(form.venue_phone || "") || null,
                  buyer_email: null,
                  promoter_address: null,
                  ticketing_fee: null,
                  facility_fee: null,
                  tax_rate: null,
                  venue_rebate: null,
                  primary_color: "#d0c290",
                  secondary_color: "#111827",
                  created_at: new Date().toISOString(),
                };
                // Resolve venue_id: offer's venue_id, cookie, or fallback venue's id
                const contractVenueId = offer.venue_id || getCookie("venue-id") || contractVenue.id;
                if (!contractVenueId) {
                  throw new Error("No venue is associated with this offer. Please assign a venue first.");
                }
                // Create contract record
                const res = await fetch("/api/contracts", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    offer_id: offer.id,
                    venue_id: contractVenueId,
                    source: "generated",
                    guarantee: offer.guarantee,
                    deal_type: offer.deal_type,
                    backend_percentage: offer.backend_percentage,
                    deposit_amount: offer.deposit_amount,
                    status: "draft",
                  }),
                });
                if (!res.ok) {
                  const errData = await res.json().catch(() => ({}));
                  throw new Error(errData.error || "Failed to create contract");
                }
                const created: Contract = await res.json();
                setContract(created);

                // Generate PDF
                await exportContractPDF(created, offer, contractVenue);
                setSuccess("Contract generated & PDF downloaded.");
              } catch (err) {
                console.error("Contract generation error:", err);
                setError(err instanceof Error ? err.message : "Failed to generate contract.");
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
                } else if (offer) {
                  setContractLoading(true);
                  try {
                    // Use venue or build fallback from offer fields
                    const dlVenue: Venue = venue || {
                      id: offer.venue_id || "", name: String(form.venue || "Venue"), slug: "",
                      logo_url: null, nickname: null, capacity: null,
                      address_street: String(form.venue_address || "").split(",")[0]?.trim() || null,
                      address_city: String(form.venue_address || "").split(",")[1]?.trim() || null,
                      address_state: String(form.venue_address || "").split(",")[2]?.trim() || null,
                      address_zip: String(form.venue_address || "").split(",")[3]?.trim() || null,
                      buyer_name: null, contract_signatory: null, buyer_phone: String(form.venue_phone || "") || null,
                      buyer_email: null, promoter_address: null,
                      ticketing_fee: null, facility_fee: null, tax_rate: null, venue_rebate: null,
                      primary_color: "#d0c290", secondary_color: "#111827",
                      created_at: new Date().toISOString(),
                    };
                    await exportContractPDF(contract, offer, dlVenue);
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
      </>
      )}

      {activeTab === "pnl" && (() => {
        // ── P&L Calculations ──
        const scaling = Array.isArray(form.ticket_scaling) ? form.ticket_scaling as Array<Record<string, number>> : [];
        const fixedExp = Array.isArray(form.fixed_expenses) ? form.fixed_expenses as Array<{name: string; amount: number}> : [];
        const varExp = Array.isArray(form.variable_expenses) ? form.variable_expenses as Array<{name: string; rate: number; amount: number}> : [];

        const totalFixed = fixedExp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const totalVariable = varExp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const totalExpenses = totalFixed + totalVariable;

        const grossPotential = scaling.reduce((s, r) => s + (Number(r.sellable_cap) || 0) * (Number(r.price) || 0), 0);
        const totalFees = scaling.reduce((s, r) => s + ((Number(r.ticketing_fee) || 0) + (Number(r.facility_fee) || 0)) * (Number(r.sellable_cap) || 0), 0);
        const adjGross = grossPotential - totalFees;
        const rawTaxRate = Number(form.tax_rate) || 0;
        // Handle tax_rate stored as decimal (0.095) or percentage (9.5)
        const taxRate = rawTaxRate > 0 && rawTaxRate < 1 ? rawTaxRate * 100 : rawTaxRate;
        const taxRateDecimal = taxRate / 100;
        const taxMethod = (form.tax_method as string) || "divisor";
        let netPotential: number;
        let taxAmount: number;
        if (taxMethod === "divisor") {
          netPotential = Math.round((adjGross / (1 + taxRateDecimal)) * 100) / 100;
          taxAmount = Math.round((adjGross - netPotential) * 100) / 100;
        } else {
          taxAmount = Math.round((adjGross * taxRateDecimal) * 100) / 100;
          netPotential = Math.round((adjGross - taxAmount) * 100) / 100;
        }

        const guarantee = Number(form.guarantee) || 0;
        const backendPct = Number(form.backend_percentage) || 0;
        const dealType = String(form.deal_type || "FLAT");
        // Splitpoint is always (netPotential − totalExpenses), computed live so it updates
        // whenever tiers/expenses/tax change.
        const splitpoint = Math.max(netPotential - totalExpenses, 0);

        // Artist backend calculation (mirrors details tab logic)
        let backendAmount = 0;
        let artistTotal = guarantee;
        if (dealType === "VS") {
          artistTotal = splitpoint * (backendPct / 100);
          backendAmount = Math.max(artistTotal - guarantee, 0);
        } else if (dealType === "PLUS" || dealType === "BONUS") {
          backendAmount = splitpoint * (backendPct / 100);
          artistTotal = guarantee + backendAmount;
        }
        // FLAT: backendAmount = 0, artistTotal = guarantee

        // For FLAT / PLUS / BONUS deals, the guarantee is entered as the "Talent" line in
        // fixed_expenses. It's already baked into totalExpenses — do NOT subtract it again
        // in breakeven or P&L, or it will be double-counted. Only VS deals treat the guarantee
        // as a separate outflow from show expenses.
        const guaranteeInExpenses = dealType === "FLAT" || dealType === "PLUS" || dealType === "BONUS";

        // Breakeven
        const tierCount = scaling.length || 1;
        const avgTicketPrice = tierCount > 0
          ? scaling.reduce((s, r) => s + (Number(r.net_price) || 0), 0) / tierCount
          : 0;
        // For FLAT: no extra artist cost beyond expenses. For PLUS/BONUS: add just the backend
        // (guarantee already in expenses). For VS: add the full artist total.
        const artistCostForBreakeven = guaranteeInExpenses ? backendAmount : artistTotal;
        const breakevenOffer = avgTicketPrice > 0
          ? Math.round(((totalExpenses + artistCostForBreakeven) / avgTicketPrice) * 100) / 100
          : 0;

        // Ancillary totals
        const ancillaryTotal = ancillaryItems.reduce((s, item) => s + (item.income - item.expenses), 0);

        // Final P&L — avoid double-counting the guarantee when it's already in expenses
        const netTicketRevenue = netPotential;
        const totalAllExpenses = guaranteeInExpenses
          ? (totalExpenses + backendAmount)
          : (totalExpenses + guarantee + backendAmount);
        const finalPnl = (netTicketRevenue + ancillaryTotal) - totalAllExpenses;

        // P&L at sellout (without ancillary)
        const pnlOffer = netPotential - totalAllExpenses;

        const fmtDollar = (v: number) => {
          const abs = Math.abs(v);
          const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          return v < 0 ? `$(${formatted})` : `$${formatted}`;
        };

        return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24 }}>
            {/* ── Section A: Breakeven Point ── */}
            <div>
              <h2 className="admin-form-section-title" style={{ marginTop: 0 }}>Breakeven Point (Based on Offer)</h2>
              <div className="offer-potential-grid">
                <div className="offer-potential-col">
                  <div className="offer-potential-row"><span>Total Expenses:</span><strong>${totalExpenses.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row"><span>Artist Pot (at Walkout):</span><strong>${artistTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row"><span>Avg Ticket Price (Net):</span><strong>${avgTicketPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row">
                    <span style={{ fontWeight: 700 }}>Breakeven:</span>
                    <strong style={{ color: "#d0c290", fontSize: 16 }}>{breakevenOffer.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tickets</strong>
                  </div>
                  <div className="offer-potential-row">
                    <span style={{ fontWeight: 700 }}>Tickets to Pay Band:</span>
                    <strong style={{ color: "#d0c290", fontSize: 16 }}>{avgTicketPrice > 0 ? (guarantee / avgTicketPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"} tickets</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Section B: Potential at Sellout ── */}
            <div>
              <h2 className="admin-form-section-title" style={{ marginTop: 0 }}>Potential at Sellout (Based on Offer)</h2>
              <div className="offer-potential-grid">
                <div className="offer-potential-col">
                  <div className="offer-potential-row"><span>Gross Potential:</span><strong>${grossPotential.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row"><span>Adj. Gross Potential:</span><strong>${adjGross.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row"><span>Tax ({taxRate}% — {taxMethod}):</span><strong>${taxAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row"><span>Net Potential:</span><strong>${netPotential.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row"><span>Total Expenses:</span><strong>${totalExpenses.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row">
                    <span style={{ fontWeight: 700 }}>P&amp;L (Offer):</span>
                    <strong style={{ color: pnlOffer >= 0 ? "#7ddb7d" : "#ff9a9a" }}>{fmtDollar(pnlOffer)}</strong>
                  </div>
                </div>
                <div className="offer-potential-col">
                  <h3 className="offer-expenses-heading">Artist Potential at Sellout</h3>
                  <div className="offer-potential-row"><span>Guarantee:</span><strong>${guarantee.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  {dealType !== "FLAT" && (
                    <div className="offer-potential-row"><span>Backend ({dealType}):</span><strong>${backendAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  )}
                  <div className="offer-potential-row highlight"><span>Artist Total:</span><strong>${artistTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  {dealType !== "FLAT" && (
                    <div className="offer-potential-row"><span>Artist Lift:</span><strong style={{ color: "#d0c290" }}>${backendAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Section C: Ancillary Revenue ── */}
          <h2 className="admin-form-section-title">Ancillary Revenue</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Category</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Income</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Expenses</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {ancillaryItems.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "6px 12px", color: "rgba(255,255,255,0.8)" }}>{item.name}</td>
                    <td style={{ padding: "6px 12px", textAlign: "right" }}>
                      <input
                        type="number"
                        className="admin-form-input"
                        style={{ width: 100, textAlign: "right", padding: "4px 8px", fontSize: 13 }}
                        value={item.income || ""}
                        onChange={(e) => {
                          const updated = [...ancillaryItems];
                          updated[idx] = { ...updated[idx], income: parseFloat(e.target.value) || 0 };
                          setAncillaryItems(updated);
                        }}
                        step="0.01"
                        placeholder="0.00"
                      />
                    </td>
                    <td style={{ padding: "6px 12px", textAlign: "right" }}>
                      <input
                        type="number"
                        className="admin-form-input"
                        style={{ width: 100, textAlign: "right", padding: "4px 8px", fontSize: 13 }}
                        value={item.expenses || ""}
                        onChange={(e) => {
                          const updated = [...ancillaryItems];
                          updated[idx] = { ...updated[idx], expenses: parseFloat(e.target.value) || 0 };
                          setAncillaryItems(updated);
                        }}
                        step="0.01"
                        placeholder="0.00"
                      />
                    </td>
                    <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: (item.income - item.expenses) >= 0 ? "#7ddb7d" : "#ff9a9a" }}>
                      {fmtDollar(item.income - item.expenses)}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid rgba(255,255,255,0.15)" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: "#fff" }}>Total</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#fff" }}>
                    ${ancillaryItems.reduce((s, i) => s + i.income, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#fff" }}>
                    ${ancillaryItems.reduce((s, i) => s + i.expenses, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: ancillaryTotal >= 0 ? "#7ddb7d" : "#ff9a9a" }}>
                    {fmtDollar(ancillaryTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── Section D: Profit & Loss Summary ── */}
          <h2 className="admin-form-section-title">Profit &amp; Loss (Based on Actuals / Offer)</h2>
          <div className="offer-potential-grid">
            <div className="offer-potential-col">
              <div className="offer-potential-row"><span>Net Ticket Revenue:</span><strong>${netTicketRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
              <div className="offer-potential-row"><span>Ancillary Revenue:</span><strong>{fmtDollar(ancillaryTotal)}</strong></div>
              <div style={{ height: 12 }} />
              <div className="offer-potential-row">
                <span>Artist Guarantee{guaranteeInExpenses ? " (in Show Expenses)" : ""}:</span>
                <strong style={{ opacity: guaranteeInExpenses ? 0.55 : 1 }}>
                  ${guarantee.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>
              {dealType !== "FLAT" && backendAmount > 0 && (
                <div className="offer-potential-row"><span>Backend ({dealType}):</span><strong>${backendAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
              )}
              <div className="offer-potential-row"><span>Show Expenses{guaranteeInExpenses ? " (incl. Talent)" : ""}:</span><strong>${totalExpenses.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
              <div className="offer-potential-row">
                <span style={{ fontWeight: 700 }}>Total Expenses:</span>
                <strong style={{ color: "#ff9a9a" }}>${totalAllExpenses.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
              <div style={{ height: 12 }} />
              <div className="offer-potential-row" style={{ padding: "12px 16px" }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>P&amp;L:</span>
                <strong style={{ color: finalPnl >= 0 ? "#7ddb7d" : "#ff9a9a", fontSize: 16 }}>{fmtDollar(finalPnl)}</strong>
              </div>
            </div>
          </div>

        </div>
        );
      })()}

      {activeTab === "deal_lab" && (() => {
        const scalingArr = Array.isArray(form.ticket_scaling)
          ? (form.ticket_scaling as Array<Record<string, number>>)
          : [];
        const fixedArr = Array.isArray(form.fixed_expenses)
          ? (form.fixed_expenses as Array<{ name: string; amount: number }>)
          : [];
        const varArr = Array.isArray(form.variable_expenses)
          ? (form.variable_expenses as Array<{ name: string; rate: number }>)
          : [];
        const totalCapacity = scalingArr.reduce(
          (s, r) => s + (Number(r.sellable_cap) || 0),
          0
        );
        const rawBackend = form.backend_percentage;
        const backendPct =
          rawBackend === null || rawBackend === undefined || rawBackend === ""
            ? null
            : Number(rawBackend);
        return (
          <DealLabPanel
            inputs={{
              gross_potential_full: live.grossPotential,
              adj_gross_full: live.adjGross,
              net_potential_full: live.netPotential,
              total_capacity: totalCapacity,
              fixed_expenses: fixedArr.map((e) => ({
                name: String(e.name ?? ""),
                amount: Number(e.amount) || 0,
              })),
              variable_expense_rates: varArr.map((e) => ({
                name: String(e.name ?? ""),
                rate: Number(e.rate) || 0,
              })),
              offer_guarantee: Number(form.guarantee) || 0,
              offer_deal_type:
                (form.deal_type as "FLAT" | "VS" | "PLUS" | "BONUS") ?? null,
              offer_backend_percentage: backendPct,
            }}
          />
        );
      })()}

    </div>
  );
}
