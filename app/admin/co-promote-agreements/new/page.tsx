"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";
import type { CoPromoteDealStructure, CoPromoteSettlementTiming } from "@/lib/types/co-promote";
import { DEAL_STRUCTURE_LABELS, SETTLEMENT_TIMING_LABELS } from "@/lib/types/co-promote";

type Form = {
  // Parties
  buyer_company_name: string;
  buyer_signatory_name: string;
  buyer_signatory_title: string;
  buyer_email: string;
  buyer_phone: string;
  buyer_address: string;

  partner_venue_name: string;
  partner_venue_address: string;
  partner_contact_name: string;
  partner_contact_title: string;
  partner_email: string;
  partner_phone: string;

  // Event
  event_name: string;
  event_date: string;
  event_load_in_time: string;
  event_doors_time: string;
  event_show_time: string;
  event_curfew: string;
  expected_capacity: string;

  // Deal
  deal_structure: CoPromoteDealStructure;
  buyer_percentage: string;
  venue_percentage: string;
  flat_rent_amount: string;
  include_ticketing_fees: boolean;
  include_facility_fees: boolean;

  // Deposit
  deposit_amount: string;
  deposit_due_date: string;

  // Venue services
  venue_provides_staff: boolean;
  venue_provides_sound: boolean;
  venue_provides_lights: boolean;
  venue_provides_security: boolean;
  venue_bar_revenue_split: string;
  venue_merch_fee_pct: string;

  // Settlement
  settlement_timing: CoPromoteSettlementTiming;

  // Preview inputs (for settlement calculator only)
  preview_avg_price: string;
  preview_tax_rate: string;
};

const DEFAULTS: Form = {
  buyer_company_name: "",
  buyer_signatory_name: "",
  buyer_signatory_title: "",
  buyer_email: "",
  buyer_phone: "",
  buyer_address: "",

  partner_venue_name: "",
  partner_venue_address: "",
  partner_contact_name: "",
  partner_contact_title: "",
  partner_email: "",
  partner_phone: "",

  event_name: "",
  event_date: "",
  event_load_in_time: "",
  event_doors_time: "",
  event_show_time: "",
  event_curfew: "",
  expected_capacity: "300",

  deal_structure: "rev_share_after_tax",
  buyer_percentage: "80",
  venue_percentage: "20",
  flat_rent_amount: "0",
  include_ticketing_fees: false,
  include_facility_fees: false,

  deposit_amount: "0",
  deposit_due_date: "",

  venue_provides_staff: true,
  venue_provides_sound: true,
  venue_provides_lights: true,
  venue_provides_security: true,
  venue_bar_revenue_split: "100% Venue",
  venue_merch_fee_pct: "0",

  settlement_timing: "night_of_show",

  preview_avg_price: "30",
  preview_tax_rate: "9",
};

const fmtCurrency = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function NewCoPromoteAgreementPage() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setField = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // ── Live settlement preview ─────────────────────────────────────────────────
  const preview = useMemo(() => {
    const capacity = parseFloat(form.expected_capacity) || 0;
    const avgPrice = parseFloat(form.preview_avg_price) || 0;
    const taxRate = (parseFloat(form.preview_tax_rate) || 0) / 100;
    const buyerPct = (parseFloat(form.buyer_percentage) || 0) / 100;
    const venuePct = (parseFloat(form.venue_percentage) || 0) / 100;
    const rent = parseFloat(form.flat_rent_amount) || 0;

    const gross = capacity * avgPrice;
    const tax = gross * taxRate;
    const afterTax = gross - tax;

    let venueShare = 0;
    let buyerShare = 0;
    let baseLabel = "";
    let base = 0;

    switch (form.deal_structure) {
      case "rev_share_gross":
        base = gross;
        baseLabel = "Gross Revenue";
        venueShare = base * venuePct;
        buyerShare = base * buyerPct;
        break;
      case "rev_share_after_tax":
        base = afterTax;
        baseLabel = "Gross After Tax";
        venueShare = base * venuePct;
        buyerShare = base * buyerPct;
        break;
      case "rev_share_net":
        base = afterTax;
        baseLabel = "Revenue Base (pre-expense for illustration)";
        venueShare = base * venuePct;
        buyerShare = base * buyerPct;
        break;
      case "flat_rent":
        base = gross;
        baseLabel = "Gross Revenue";
        venueShare = rent;
        buyerShare = gross - rent;
        break;
      case "rent_plus_rev_share":
        base = afterTax;
        baseLabel = "Gross After Tax";
        venueShare = rent + base * venuePct;
        buyerShare = base * buyerPct;
        break;
    }

    return { gross, tax, afterTax, base, baseLabel, venueShare, buyerShare };
  }, [form]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Required field check
    if (!form.buyer_company_name || !form.partner_venue_name || !form.event_date) {
      setError("Buyer Company Name, Partner Venue Name, and Event Date are required.");
      return;
    }

    setSaving(true);
    try {
      const venueId = getCookie("venue-id");
      const payload = {
        our_venue_id: venueId || null,
        buyer_company_name: form.buyer_company_name,
        buyer_signatory_name: form.buyer_signatory_name || null,
        buyer_signatory_title: form.buyer_signatory_title || null,
        buyer_email: form.buyer_email || null,
        buyer_phone: form.buyer_phone || null,
        buyer_address: form.buyer_address || null,

        partner_venue_name: form.partner_venue_name,
        partner_venue_address: form.partner_venue_address || null,
        partner_contact_name: form.partner_contact_name || null,
        partner_contact_title: form.partner_contact_title || null,
        partner_email: form.partner_email || null,
        partner_phone: form.partner_phone || null,

        event_name: form.event_name || null,
        event_date: form.event_date,
        event_load_in_time: form.event_load_in_time || null,
        event_doors_time: form.event_doors_time || null,
        event_show_time: form.event_show_time || null,
        event_curfew: form.event_curfew || null,
        expected_capacity: form.expected_capacity ? parseInt(form.expected_capacity) : null,

        deal_structure: form.deal_structure,
        buyer_percentage: parseFloat(form.buyer_percentage) || 0,
        venue_percentage: parseFloat(form.venue_percentage) || 0,
        flat_rent_amount: parseFloat(form.flat_rent_amount) || 0,
        include_ticketing_fees: form.include_ticketing_fees,
        include_facility_fees: form.include_facility_fees,

        deposit_amount: parseFloat(form.deposit_amount) || 0,
        deposit_due_date: form.deposit_due_date || null,

        venue_provides_staff: form.venue_provides_staff,
        venue_provides_sound: form.venue_provides_sound,
        venue_provides_lights: form.venue_provides_lights,
        venue_provides_security: form.venue_provides_security,
        venue_bar_revenue_split: form.venue_bar_revenue_split || null,
        venue_merch_fee_pct: parseFloat(form.venue_merch_fee_pct) || 0,

        settlement_timing: form.settlement_timing,
      };

      const res = await fetch("/api/admin/co-promote-agreements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create agreement");
      router.push(`/admin/co-promote-agreements/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  const sectionTitle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: "#d0c290",
    textTransform: "uppercase", letterSpacing: 1, margin: "24px 0 12px",
  };

  const showPercentages = form.deal_structure !== "flat_rent";
  const showFlatRent = form.deal_structure === "flat_rent" || form.deal_structure === "rent_plus_rev_share";

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <div>
          <Link
            href="/admin/co-promote-agreements"
            style={{ fontSize: 12, color: "rgba(208,194,144,0.6)", textDecoration: "none" }}
          >
            ← Back to Co-Promote Agreements
          </Link>
          <h1 className="admin-page-title" style={{ margin: "8px 0 0" }}>New Co-Promote Agreement</h1>
        </div>
      </div>

      {error && (
        <div style={{
          marginTop: 16, padding: 12, borderRadius: 8,
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
          color: "#ef4444", fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{
          display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)", gap: 24, marginTop: 20,
        }}>
          {/* ─── LEFT: FORM ─── */}
          <div>

            {/* PROMOTER (BUYER) */}
            <div style={sectionTitle}>Promoter (You)</div>
            <div className="admin-form-grid">
              <label className="admin-form-label">
                Company Name *
                <input className="admin-form-input" value={form.buyer_company_name} onChange={(e) => setField("buyer_company_name", e.target.value)} required />
              </label>
              <label className="admin-form-label">
                Signatory Name
                <input className="admin-form-input" value={form.buyer_signatory_name} onChange={(e) => setField("buyer_signatory_name", e.target.value)} />
              </label>
              <label className="admin-form-label">
                Signatory Title
                <input className="admin-form-input" value={form.buyer_signatory_title} onChange={(e) => setField("buyer_signatory_title", e.target.value)} placeholder="e.g. CEO" />
              </label>
              <label className="admin-form-label">
                Email
                <input type="email" className="admin-form-input" value={form.buyer_email} onChange={(e) => setField("buyer_email", e.target.value)} />
              </label>
              <label className="admin-form-label">
                Phone
                <input className="admin-form-input" value={form.buyer_phone} onChange={(e) => setField("buyer_phone", e.target.value)} />
              </label>
              <label className="admin-form-label admin-form-full">
                Address
                <input className="admin-form-input" value={form.buyer_address} onChange={(e) => setField("buyer_address", e.target.value)} />
              </label>
            </div>

            {/* PARTNER VENUE */}
            <div style={sectionTitle}>Partner Venue (Them)</div>
            <div className="admin-form-grid">
              <label className="admin-form-label admin-form-full">
                Venue Name *
                <input className="admin-form-input" value={form.partner_venue_name} onChange={(e) => setField("partner_venue_name", e.target.value)} required />
              </label>
              <label className="admin-form-label admin-form-full">
                Venue Address
                <input className="admin-form-input" value={form.partner_venue_address} onChange={(e) => setField("partner_venue_address", e.target.value)} />
              </label>
              <label className="admin-form-label">
                Contact Name
                <input className="admin-form-input" value={form.partner_contact_name} onChange={(e) => setField("partner_contact_name", e.target.value)} />
              </label>
              <label className="admin-form-label">
                Contact Title
                <input className="admin-form-input" value={form.partner_contact_title} onChange={(e) => setField("partner_contact_title", e.target.value)} placeholder="e.g. Owner" />
              </label>
              <label className="admin-form-label">
                Email
                <input type="email" className="admin-form-input" value={form.partner_email} onChange={(e) => setField("partner_email", e.target.value)} />
              </label>
              <label className="admin-form-label">
                Phone
                <input className="admin-form-input" value={form.partner_phone} onChange={(e) => setField("partner_phone", e.target.value)} />
              </label>
            </div>

            {/* EVENT */}
            <div style={sectionTitle}>Event</div>
            <div className="admin-form-grid">
              <label className="admin-form-label admin-form-full">
                Event Name
                <input className="admin-form-input" value={form.event_name} onChange={(e) => setField("event_name", e.target.value)} placeholder="e.g. Spring Tour — Memphis" />
              </label>
              <label className="admin-form-label">
                Event Date *
                <input type="date" className="admin-form-input" value={form.event_date} onChange={(e) => setField("event_date", e.target.value)} required />
              </label>
              <label className="admin-form-label">
                Expected Capacity
                <input type="number" className="admin-form-input" value={form.expected_capacity} onChange={(e) => setField("expected_capacity", e.target.value)} min="0" />
              </label>
              <label className="admin-form-label">
                Load-in
                <input type="time" className="admin-form-input" value={form.event_load_in_time} onChange={(e) => setField("event_load_in_time", e.target.value)} />
              </label>
              <label className="admin-form-label">
                Doors
                <input type="time" className="admin-form-input" value={form.event_doors_time} onChange={(e) => setField("event_doors_time", e.target.value)} />
              </label>
              <label className="admin-form-label">
                Show Time
                <input type="time" className="admin-form-input" value={form.event_show_time} onChange={(e) => setField("event_show_time", e.target.value)} />
              </label>
              <label className="admin-form-label">
                Curfew
                <input type="time" className="admin-form-input" value={form.event_curfew} onChange={(e) => setField("event_curfew", e.target.value)} />
              </label>
            </div>

            {/* DEAL STRUCTURE */}
            <div style={sectionTitle}>Deal Structure</div>
            <div className="admin-form-grid">
              <label className="admin-form-label admin-form-full">
                Deal Type
                <select
                  className="admin-form-input"
                  value={form.deal_structure}
                  onChange={(e) => setField("deal_structure", e.target.value as CoPromoteDealStructure)}
                >
                  {(Object.keys(DEAL_STRUCTURE_LABELS) as CoPromoteDealStructure[]).map((k) => (
                    <option key={k} value={k}>{DEAL_STRUCTURE_LABELS[k]}</option>
                  ))}
                </select>
              </label>

              {showPercentages && (
                <>
                  <label className="admin-form-label">
                    Buyer %
                    <input
                      type="number" step="0.01" min="0" max="100"
                      className="admin-form-input"
                      value={form.buyer_percentage}
                      onChange={(e) => {
                        const v = e.target.value;
                        setField("buyer_percentage", v);
                        const n = parseFloat(v);
                        if (!isNaN(n)) setField("venue_percentage", String(100 - n));
                      }}
                    />
                  </label>
                  <label className="admin-form-label">
                    Venue %
                    <input
                      type="number" step="0.01" min="0" max="100"
                      className="admin-form-input"
                      value={form.venue_percentage}
                      onChange={(e) => {
                        const v = e.target.value;
                        setField("venue_percentage", v);
                        const n = parseFloat(v);
                        if (!isNaN(n)) setField("buyer_percentage", String(100 - n));
                      }}
                    />
                  </label>
                </>
              )}

              {showFlatRent && (
                <label className="admin-form-label">
                  Flat Rent ($)
                  <input
                    type="number" step="0.01" min="0"
                    className="admin-form-input"
                    value={form.flat_rent_amount}
                    onChange={(e) => setField("flat_rent_amount", e.target.value)}
                  />
                </label>
              )}

              <div className="admin-form-full" style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                  <input type="checkbox" checked={form.include_ticketing_fees} onChange={(e) => setField("include_ticketing_fees", e.target.checked)} />
                  Include ticketing fees in split base
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                  <input type="checkbox" checked={form.include_facility_fees} onChange={(e) => setField("include_facility_fees", e.target.checked)} />
                  Include facility fees in split base
                </label>
              </div>
            </div>

            {/* VENUE SERVICES */}
            <div style={sectionTitle}>Venue Services</div>
            <div className="admin-form-grid">
              <div className="admin-form-full" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {[
                  { key: "venue_provides_staff", label: "Staff" },
                  { key: "venue_provides_sound", label: "Sound" },
                  { key: "venue_provides_lights", label: "Lights" },
                  { key: "venue_provides_security", label: "Security" },
                ].map((s) => (
                  <label key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
                    <input
                      type="checkbox"
                      checked={form[s.key as keyof Form] as boolean}
                      onChange={(e) => setField(s.key as keyof Form, e.target.checked as unknown as Form[keyof Form])}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
              <label className="admin-form-label">
                Bar Revenue Split
                <input
                  className="admin-form-input"
                  value={form.venue_bar_revenue_split}
                  onChange={(e) => setField("venue_bar_revenue_split", e.target.value)}
                  placeholder="e.g. 100% Venue or 80/20"
                />
              </label>
              <label className="admin-form-label">
                Venue Merch Fee %
                <input
                  type="number" step="0.01" min="0" max="100"
                  className="admin-form-input"
                  value={form.venue_merch_fee_pct}
                  onChange={(e) => setField("venue_merch_fee_pct", e.target.value)}
                />
              </label>
            </div>

            {/* DEPOSIT & SETTLEMENT */}
            <div style={sectionTitle}>Deposit & Settlement</div>
            <div className="admin-form-grid">
              <label className="admin-form-label">
                Deposit Amount
                <input
                  type="number" step="0.01" min="0"
                  className="admin-form-input"
                  value={form.deposit_amount}
                  onChange={(e) => setField("deposit_amount", e.target.value)}
                />
              </label>
              <label className="admin-form-label">
                Deposit Due Date
                <input
                  type="date"
                  className="admin-form-input"
                  value={form.deposit_due_date}
                  onChange={(e) => setField("deposit_due_date", e.target.value)}
                />
              </label>
              <label className="admin-form-label admin-form-full">
                Settlement Timing
                <select
                  className="admin-form-input"
                  value={form.settlement_timing}
                  onChange={(e) => setField("settlement_timing", e.target.value as CoPromoteSettlementTiming)}
                >
                  {(Object.keys(SETTLEMENT_TIMING_LABELS) as CoPromoteSettlementTiming[]).map((k) => (
                    <option key={k} value={k}>{SETTLEMENT_TIMING_LABELS[k]}</option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ marginTop: 32, display: "flex", gap: 8 }}>
              <button
                type="submit"
                disabled={saving}
                className="admin-form-submit"
                style={{ flex: 1 }}
              >
                {saving ? "Creating..." : "Create Agreement"}
              </button>
            </div>

            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 12 }}>
              After creating, you can edit custom clauses, cancellation policy, marketing rights,
              and other terms on the detail page — then preview & send the PDF.
            </p>
          </div>

          {/* ─── RIGHT: LIVE PREVIEW ─── */}
          <div style={{
            position: "sticky", top: 20, alignSelf: "start",
            background: "rgba(208,194,144,0.04)",
            border: "1px solid rgba(208,194,144,0.2)",
            borderRadius: 12, padding: 20,
          }}>
            <div style={{ ...sectionTitle, marginTop: 0 }}>Live Settlement Preview</div>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, margin: "0 0 14px" }}>
              Adjust the numbers below to see how the split plays out before committing.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                Avg Ticket
                <input
                  type="number" step="0.01" min="0"
                  className="admin-form-input"
                  style={{ marginTop: 2 }}
                  value={form.preview_avg_price}
                  onChange={(e) => setField("preview_avg_price", e.target.value)}
                />
              </label>
              <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                Tax %
                <input
                  type="number" step="0.01" min="0" max="25"
                  className="admin-form-input"
                  style={{ marginTop: 2 }}
                  value={form.preview_tax_rate}
                  onChange={(e) => setField("preview_tax_rate", e.target.value)}
                />
              </label>
            </div>

            <div style={{
              background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 14,
              fontSize: 13,
            }}>
              {[
                { label: `Gross (${form.expected_capacity || 0} × ${fmtCurrency(parseFloat(form.preview_avg_price) || 0)})`, val: preview.gross, muted: false },
                (form.deal_structure !== "rev_share_gross" && form.deal_structure !== "flat_rent") &&
                  { label: `− Sales Tax (${form.preview_tax_rate}%)`, val: -preview.tax, muted: true },
                (form.deal_structure !== "rev_share_gross" && form.deal_structure !== "flat_rent") &&
                  { label: preview.baseLabel, val: preview.base, muted: false, bold: true },
              ].filter(Boolean).map((row, i) => {
                const r = row as { label: string; val: number; muted?: boolean; bold?: boolean };
                return (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between",
                    padding: "4px 0", fontSize: 12,
                    color: r.muted ? "rgba(255,255,255,0.5)" : "#fff",
                    fontWeight: r.bold ? 700 : 400,
                  }}>
                    <span>{r.label}</span>
                    <span>{fmtCurrency(r.val)}</span>
                  </div>
                );
              })}

              <div style={{ margin: "8px 0", height: 1, background: "rgba(208,194,144,0.3)" }} />

              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontWeight: 700, color: "#6ab4ff" }}>
                <span>Venue Takes</span>
                <span>{fmtCurrency(preview.venueShare)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontWeight: 700, color: "#7ddb7d" }}>
                <span>You Keep (before expenses)</span>
                <span>{fmtCurrency(preview.buyerShare)}</span>
              </div>
            </div>

            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, margin: "12px 0 0", lineHeight: 1.5 }}>
              Your share still needs to cover artist guarantee, production, marketing, and any
              other show expenses — the venue takes its cut off the top.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
