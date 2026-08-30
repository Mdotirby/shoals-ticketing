"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type {
  CoPromoteAgreement, CoPromoteStatus, CoPromoteClause,
  CoPromoteDealStructure, CoPromoteSettlementTiming,
} from "@/lib/types/co-promote";
import { DEAL_STRUCTURE_LABELS, SETTLEMENT_TIMING_LABELS } from "@/lib/types/co-promote";

const statusColors: Record<CoPromoteStatus, { bg: string; color: string; border: string }> = {
  draft:  { bg: "rgba(255,200,50,0.12)", color: "#e8c94a", border: "rgba(255,200,50,0.3)" },
  sent:   { bg: "rgba(100,180,255,0.12)", color: "#6ab4ff", border: "rgba(100,180,255,0.3)" },
  signed: { bg: "rgba(100,200,100,0.15)", color: "#7ddb7d", border: "rgba(100,200,100,0.3)" },
  void:   { bg: "rgba(255,100,100,0.12)", color: "#ff9a9a", border: "rgba(255,100,100,0.3)" },
};

const fmtCurrency = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function CoPromoteAgreementDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [agreement, setAgreement] = useState<CoPromoteAgreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Send-email modal state
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendNote, setSendNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/co-promote-agreements/${id}`);
      if (!res.ok) throw new Error("Failed to load agreement");
      const data = await res.json();
      setAgreement(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── Settlement preview (based on capacity + deal) ────────────────────────
  const preview = useMemo(() => {
    if (!agreement) return null;
    const capacity = agreement.expected_capacity ?? 0;
    const avgPrice = 20;
    const taxRate = 0.0975;
    const gross = capacity * avgPrice;
    const tax = gross * taxRate;
    const afterTax = gross - tax;
    const buyerPct = (agreement.buyer_percentage ?? 0) / 100;
    const venuePct = (agreement.venue_percentage ?? 0) / 100;
    const rent = agreement.flat_rent_amount || 0;

    let base = afterTax;
    if (agreement.deal_structure === "rev_share_gross") base = gross;

    let venueShare = 0;
    let buyerShare = 0;
    if (agreement.deal_structure === "flat_rent") {
      venueShare = rent;
      buyerShare = gross - rent;
    } else if (agreement.deal_structure === "rent_plus_rev_share") {
      venueShare = rent + base * venuePct;
      buyerShare = base * buyerPct;
    } else {
      venueShare = base * venuePct;
      buyerShare = base * buyerPct;
    }
    return { gross, tax, afterTax, base, venueShare, buyerShare };
  }, [agreement]);

  // ── Field save ────────────────────────────────────────────────────────────
  async function saveField(field: keyof CoPromoteAgreement, value: unknown) {
    if (!agreement) return;
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/admin/co-promote-agreements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setAgreement(data);
      setSaveMsg({ type: "success", text: "Saved." });
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (e) {
      setSaveMsg({ type: "error", text: e instanceof Error ? e.message : "Save failed" });
    }
  }

  // ── PDF generation ────────────────────────────────────────────────────────
  async function generatePDF() {
    if (!agreement) return;
    try {
      const { exportCoPromoteAgreementPDF } = await import("@/lib/pdf/co-promote-agreement-pdf");
      await exportCoPromoteAgreementPDF(agreement, agreement.buyer_company_name, agreement.buyer_address ?? undefined);
    } catch (e) {
      setSaveMsg({ type: "error", text: "PDF generation failed: " + (e instanceof Error ? e.message : String(e)) });
    }
  }

  // ── Send email ────────────────────────────────────────────────────────────
  async function handleSendEmail() {
    setSending(true);
    setSendMsg(null);
    try {
      const res = await fetch(`/api/admin/co-promote-agreements/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: sendNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      setSendMsg({ type: "success", text: `Sent to ${data.sentTo}. Don't forget to attach the PDF you downloaded.` });
      await load();
      setTimeout(() => {
        setShowSendModal(false);
        setSendMsg(null);
      }, 2500);
    } catch (e) {
      setSendMsg({ type: "error", text: e instanceof Error ? e.message : "Send failed" });
    } finally {
      setSending(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!confirm("Delete this agreement? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/admin/co-promote-agreements/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      router.push("/admin/co-promote-agreements");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  // ── Custom clause helpers ─────────────────────────────────────────────────
  function addClause() {
    if (!agreement) return;
    const next: CoPromoteClause[] = [...(agreement.custom_clauses ?? []), { title: "New Clause", body: "" }];
    saveField("custom_clauses", next);
  }
  function updateClause(idx: number, field: keyof CoPromoteClause, value: string) {
    if (!agreement) return;
    const next = [...(agreement.custom_clauses ?? [])];
    next[idx] = { ...next[idx], [field]: value };
    saveField("custom_clauses", next);
  }
  function removeClause(idx: number) {
    if (!agreement) return;
    const next = (agreement.custom_clauses ?? []).filter((_, i) => i !== idx);
    saveField("custom_clauses", next);
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) return <div className="admin-form-page"><p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p></div>;
  if (error || !agreement) {
    return (
      <div className="admin-form-page">
        <div style={{ padding: 16, borderRadius: 8, background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>
          {error || "Agreement not found"}
        </div>
        <Link href="/admin/co-promote-agreements" style={{ display: "inline-block", marginTop: 16, color: "#ffffff" }}>
          ← Back
        </Link>
      </div>
    );
  }

  const sc = statusColors[agreement.status];

  const sectionTitle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: "#ffffff",
    textTransform: "uppercase", letterSpacing: 1, margin: "24px 0 12px",
  };

  const showPct = agreement.deal_structure !== "flat_rent";
  const showRent = agreement.deal_structure === "flat_rent" || agreement.deal_structure === "rent_plus_rev_share";

  return (
    <div className="admin-form-page">
      {/* ─── Header ─── */}
      <div className="admin-page-header">
        <div>
          <Link
            href="/admin/co-promote-agreements"
            style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.6)", textDecoration: "none" }}
          >
            ← Back to Agreements
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            <h1 className="admin-page-title" style={{ margin: 0 }}>
              {agreement.agreement_number}
            </h1>
            <span style={{
              padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
              textTransform: "uppercase",
              background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
            }}>
              {agreement.status}
            </span>
          </div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 4 }}>
            {agreement.partner_venue_name} · {agreement.event_date}
          </div>
        </div>

        <div className="admin-page-header-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={generatePDF}
            style={{
              padding: "10px 16px", borderRadius: 8, fontWeight: 600, fontSize: 13,
              background: "rgba(255, 255, 255, 0.12)", border: "1px solid rgba(255, 255, 255, 0.3)",
              color: "#ffffff", cursor: "pointer",
            }}
          >
            Download PDF
          </button>
          <button
            onClick={() => setShowSendModal(true)}
            disabled={!agreement.partner_email}
            title={!agreement.partner_email ? "Add a partner email first" : undefined}
            style={{
              padding: "10px 16px", borderRadius: 8, fontWeight: 600, fontSize: 13,
              background: "rgba(100,180,255,0.12)", border: "1px solid rgba(100,180,255,0.3)",
              color: "#6ab4ff", cursor: agreement.partner_email ? "pointer" : "not-allowed",
              opacity: agreement.partner_email ? 1 : 0.5,
            }}
          >
            Send to Venue
          </button>
          <select
            value={agreement.status}
            onChange={(e) => saveField("status", e.target.value)}
            style={{
              padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff",
            }}
          >
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="signed">Signed</option>
            <option value="void">Void</option>
          </select>
          <button
            onClick={handleDelete}
            style={{
              padding: "10px 14px", borderRadius: 8, fontWeight: 600, fontSize: 13,
              background: "transparent", border: "1px solid rgba(255,100,100,0.2)",
              color: "rgba(255,100,100,0.7)", cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {saveMsg && (
        <div style={{
          marginTop: 12, padding: "8px 14px", borderRadius: 6, fontSize: 12,
          background: saveMsg.type === "success" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${saveMsg.type === "success" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
          color: saveMsg.type === "success" ? "#22c55e" : "#ef4444",
        }}>
          {saveMsg.text}
        </div>
      )}

      <div style={{
        display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)", gap: 24, marginTop: 20,
      }}>
        {/* ─── LEFT: EDITABLE FORM ─── */}
        <div>

          {/* Promoter */}
          <div style={sectionTitle}>Promoter (You)</div>
          <div className="admin-form-grid">
            <EditField label="Company Name" value={agreement.buyer_company_name} onSave={(v) => saveField("buyer_company_name", v)} />
            <EditField label="Signatory Name" value={agreement.buyer_signatory_name} onSave={(v) => saveField("buyer_signatory_name", v)} />
            <EditField label="Signatory Title" value={agreement.buyer_signatory_title} onSave={(v) => saveField("buyer_signatory_title", v)} />
            <EditField label="Email" value={agreement.buyer_email} onSave={(v) => saveField("buyer_email", v)} type="email" />
            <EditField label="Phone" value={agreement.buyer_phone} onSave={(v) => saveField("buyer_phone", v)} />
            <EditField label="Address" value={agreement.buyer_address} onSave={(v) => saveField("buyer_address", v)} full />
          </div>

          {/* Partner Venue */}
          <div style={sectionTitle}>Partner Venue (Them)</div>
          <div className="admin-form-grid">
            <EditField label="Venue Name" value={agreement.partner_venue_name} onSave={(v) => saveField("partner_venue_name", v)} full />
            <EditField label="Venue Address" value={agreement.partner_venue_address} onSave={(v) => saveField("partner_venue_address", v)} full />
            <EditField label="Contact Name" value={agreement.partner_contact_name} onSave={(v) => saveField("partner_contact_name", v)} />
            <EditField label="Contact Title" value={agreement.partner_contact_title} onSave={(v) => saveField("partner_contact_title", v)} />
            <EditField label="Email" value={agreement.partner_email} onSave={(v) => saveField("partner_email", v)} type="email" />
            <EditField label="Phone" value={agreement.partner_phone} onSave={(v) => saveField("partner_phone", v)} />
          </div>

          {/* Event */}
          <div style={sectionTitle}>Event</div>
          <div className="admin-form-grid">
            <EditField label="Event Name" value={agreement.event_name} onSave={(v) => saveField("event_name", v)} full />
            <EditField label="Event Date" value={agreement.event_date} onSave={(v) => saveField("event_date", v)} type="date" />
            <EditField label="Expected Capacity" value={String(agreement.expected_capacity ?? "")} onSave={(v) => saveField("expected_capacity", v ? parseInt(v) : null)} type="number" />
            <EditField label="Load-in" value={agreement.event_load_in_time} onSave={(v) => saveField("event_load_in_time", v)} type="time" />
            <EditField label="Doors" value={agreement.event_doors_time} onSave={(v) => saveField("event_doors_time", v)} type="time" />
            <EditField label="Show Time" value={agreement.event_show_time} onSave={(v) => saveField("event_show_time", v)} type="time" />
            <EditField label="Curfew" value={agreement.event_curfew} onSave={(v) => saveField("event_curfew", v)} type="time" />
          </div>

          {/* Deal Structure */}
          <div style={sectionTitle}>Deal Structure</div>
          <div className="admin-form-grid">
            <label className="admin-form-label admin-form-full">
              Deal Type
              <select
                className="admin-form-input"
                value={agreement.deal_structure}
                onChange={(e) => saveField("deal_structure", e.target.value as CoPromoteDealStructure)}
              >
                {(Object.keys(DEAL_STRUCTURE_LABELS) as CoPromoteDealStructure[]).map((k) => (
                  <option key={k} value={k}>{DEAL_STRUCTURE_LABELS[k]}</option>
                ))}
              </select>
            </label>
            {showPct && (
              <>
                <EditField label="Buyer %" value={String(agreement.buyer_percentage ?? "")} onSave={(v) => {
                  const n = parseFloat(v) || 0;
                  saveField("buyer_percentage", n);
                  saveField("venue_percentage", 100 - n);
                }} type="number" />
                <EditField label="Venue %" value={String(agreement.venue_percentage ?? "")} onSave={(v) => {
                  const n = parseFloat(v) || 0;
                  saveField("venue_percentage", n);
                  saveField("buyer_percentage", 100 - n);
                }} type="number" />
              </>
            )}
            {showRent && (
              <EditField label="Flat Rent ($)" value={String(agreement.flat_rent_amount ?? 0)} onSave={(v) => saveField("flat_rent_amount", parseFloat(v) || 0)} type="number" />
            )}
            <div className="admin-form-full" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                <input type="checkbox" checked={agreement.include_ticketing_fees} onChange={(e) => saveField("include_ticketing_fees", e.target.checked)} />
                Include ticketing fees in split base
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                <input type="checkbox" checked={agreement.include_facility_fees} onChange={(e) => saveField("include_facility_fees", e.target.checked)} />
                Include facility fees in split base
              </label>
            </div>
          </div>

          {/* Venue Services */}
          <div style={sectionTitle}>Venue Services</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            {[
              { key: "venue_provides_staff" as const, label: "Staff" },
              { key: "venue_provides_sound" as const, label: "Sound" },
              { key: "venue_provides_lights" as const, label: "Lights" },
              { key: "venue_provides_security" as const, label: "Security" },
              { key: "venue_provides_bar" as const, label: "Bar" },
            ].map((s) => (
              <label key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
                <input
                  type="checkbox"
                  checked={agreement[s.key] as boolean}
                  onChange={(e) => saveField(s.key, e.target.checked)}
                />
                {s.label}
              </label>
            ))}
          </div>
          <div className="admin-form-grid">
            <EditField label="Bar Revenue Split" value={agreement.venue_bar_revenue_split} onSave={(v) => saveField("venue_bar_revenue_split", v)} />
            <EditField label="Venue Merch Fee %" value={String(agreement.venue_merch_fee_pct ?? 0)} onSave={(v) => saveField("venue_merch_fee_pct", parseFloat(v) || 0)} type="number" />
          </div>

          {/* Deposit & Settlement */}
          <div style={sectionTitle}>Deposit & Settlement</div>
          <div className="admin-form-grid">
            <EditField label="Deposit Amount" value={String(agreement.deposit_amount ?? 0)} onSave={(v) => saveField("deposit_amount", parseFloat(v) || 0)} type="number" />
            <EditField label="Deposit Due Date" value={agreement.deposit_due_date} onSave={(v) => saveField("deposit_due_date", v || null)} type="date" />
            <label className="admin-form-label">
              Deposit Paid
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, color: "rgba(255,255,255,0.8)" }}>
                <input
                  type="checkbox"
                  checked={agreement.deposit_paid}
                  onChange={(e) => saveField("deposit_paid", e.target.checked)}
                />
                Mark as paid
              </label>
            </label>
            <label className="admin-form-label">
              Settlement Timing
              <select
                className="admin-form-input"
                value={agreement.settlement_timing}
                onChange={(e) => saveField("settlement_timing", e.target.value as CoPromoteSettlementTiming)}
              >
                {(Object.keys(SETTLEMENT_TIMING_LABELS) as CoPromoteSettlementTiming[]).map((k) => (
                  <option key={k} value={k}>{SETTLEMENT_TIMING_LABELS[k]}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Terms */}
          <div style={sectionTitle}>Terms & Clauses</div>
          <div className="admin-form-grid">
            <TextArea label="Cancellation Policy" value={agreement.cancellation_policy} onSave={(v) => saveField("cancellation_policy", v)} />
            <TextArea label="Force Majeure" value={agreement.force_majeure_clause} onSave={(v) => saveField("force_majeure_clause", v)} />
            <TextArea label="Marketing Rights" value={agreement.marketing_rights} onSave={(v) => saveField("marketing_rights", v)} />
            <TextArea label="Radius Clause" value={agreement.radius_clause} onSave={(v) => saveField("radius_clause", v)} />
            <TextArea label="Additional Terms" value={agreement.additional_terms} onSave={(v) => saveField("additional_terms", v)} />
          </div>

          {/* Custom Clauses */}
          <div style={{ ...sectionTitle, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Custom Clauses</span>
            <button
              type="button"
              onClick={addClause}
              style={{
                padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255, 255, 255, 0.2)",
                color: "#ffffff", cursor: "pointer",
              }}
            >
              + Add Clause
            </button>
          </div>
          {(agreement.custom_clauses ?? []).length === 0 ? (
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
              No custom clauses. Add any venue-specific requirements here (e.g. rigging limits, load-in rules, staffing).
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(agreement.custom_clauses ?? []).map((c, i) => (
                <div
                  key={i}
                  style={{
                    padding: 12, borderRadius: 8,
                    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <input
                      className="admin-form-input"
                      style={{ flex: 1, fontWeight: 600 }}
                      value={c.title}
                      onChange={(e) => updateClause(i, "title", e.target.value)}
                      placeholder="Clause title"
                    />
                    <button
                      type="button"
                      onClick={() => removeClause(i)}
                      style={{
                        padding: "6px 10px", fontSize: 12,
                        background: "transparent", border: "1px solid rgba(255,100,100,0.2)",
                        color: "rgba(255,100,100,0.7)", borderRadius: 6, cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <textarea
                    className="admin-form-input"
                    style={{ marginTop: 8, minHeight: 80, resize: "vertical" }}
                    value={c.body}
                    onChange={(e) => updateClause(i, "body", e.target.value)}
                    placeholder="Clause body"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── RIGHT: SUMMARY PANEL ─── */}
        <div style={{ position: "sticky", top: 20, alignSelf: "start" }}>
          {preview && (
            <div style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: 12, padding: 20, marginBottom: 16,
            }}>
              <div style={{ ...sectionTitle, marginTop: 0 }}>Settlement Preview</div>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, margin: "0 0 12px" }}>
                At {agreement.expected_capacity ?? 0} tickets @ $20 avg, 9.75% tax
              </p>
              <div style={{
                background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 14, fontSize: 12,
              }}>
                <Row label="Gross Revenue" value={fmtCurrency(preview.gross)} />
                {agreement.deal_structure !== "rev_share_gross" && agreement.deal_structure !== "flat_rent" && (
                  <>
                    <Row label="Sales Tax" value={`(${fmtCurrency(preview.tax)})`} muted />
                    <Row label="Net After Tax" value={fmtCurrency(preview.base)} bold />
                  </>
                )}
                <div style={{ margin: "8px 0", height: 1, background: "rgba(255, 255, 255, 0.3)" }} />
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "#6ab4ff", fontWeight: 700 }}>
                  <span>To VENUE</span>
                  <span>{fmtCurrency(preview.venueShare)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "#7ddb7d", fontWeight: 700 }}>
                  <span>To PROMOTER</span>
                  <span>{fmtCurrency(preview.buyerShare)}</span>
                </div>
              </div>
            </div>
          )}

          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12, padding: 20,
          }}>
            <div style={{ ...sectionTitle, marginTop: 0 }}>Metadata</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Created:</span> {new Date(agreement.created_at).toLocaleString()}</div>
              <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Updated:</span> {new Date(agreement.updated_at).toLocaleString()}</div>
              {agreement.buyer_signed_at && (
                <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Buyer signed:</span> {new Date(agreement.buyer_signed_at).toLocaleDateString()}</div>
              )}
              {agreement.venue_signed_at && (
                <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Venue signed:</span> {new Date(agreement.venue_signed_at).toLocaleDateString()}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Send Email Modal ─── */}
      {showSendModal && (
        <div
          onClick={() => !sending && setShowSendModal(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#131629", border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: 14, padding: 24, maxWidth: 480, width: "100%",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#fff" }}>
              Send Agreement to {agreement.partner_venue_name}
            </h2>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: "8px 0 16px" }}>
              Sending to <strong style={{ color: "#ffffff" }}>{agreement.partner_email}</strong>.
              <br />
              <em>Tip: download the PDF first and attach it to the sent email from your inbox, or forward it from your sent folder.</em>
            </p>

            <label className="admin-form-label">
              Message (optional)
              <textarea
                className="admin-form-input"
                style={{ minHeight: 120, resize: "vertical", marginTop: 4 }}
                value={sendNote}
                onChange={(e) => setSendNote(e.target.value)}
                placeholder="Hi — here's the agreement for our event on…"
              />
            </label>

            {sendMsg && (
              <div style={{
                marginTop: 12, padding: 10, borderRadius: 6, fontSize: 12,
                background: sendMsg.type === "success" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                color: sendMsg.type === "success" ? "#22c55e" : "#ef4444",
              }}>
                {sendMsg.text}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                onClick={handleSendEmail}
                disabled={sending}
                style={{
                  flex: 1, padding: "10px 16px", borderRadius: 8, fontWeight: 700, fontSize: 13,
                  background: "rgba(100,180,255,0.15)", border: "1px solid rgba(100,180,255,0.3)",
                  color: "#6ab4ff", cursor: sending ? "not-allowed" : "pointer",
                }}
              >
                {sending ? "Sending…" : "Send Email"}
              </button>
              <button
                onClick={() => setShowSendModal(false)}
                disabled={sending}
                style={{
                  padding: "10px 16px", borderRadius: 8, fontWeight: 600, fontSize: 13,
                  background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.5)", cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function Row({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", padding: "4px 0",
      color: muted ? "rgba(255,255,255,0.5)" : "#fff",
      fontWeight: bold ? 700 : 400,
    }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function EditField({
  label, value, onSave, type, full,
}: {
  label: string;
  value: string | null | undefined;
  onSave: (v: string) => void;
  type?: string;
  full?: boolean;
}) {
  const [local, setLocal] = useState(value ?? "");
  useEffect(() => { setLocal(value ?? ""); }, [value]);
  return (
    <label className={full ? "admin-form-label admin-form-full" : "admin-form-label"}>
      {label}
      <input
        type={type ?? "text"}
        className="admin-form-input"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== (value ?? "")) onSave(local);
        }}
      />
    </label>
  );
}

function TextArea({
  label, value, onSave,
}: {
  label: string;
  value: string | null | undefined;
  onSave: (v: string) => void;
}) {
  const [local, setLocal] = useState(value ?? "");
  useEffect(() => { setLocal(value ?? ""); }, [value]);
  return (
    <label className="admin-form-label admin-form-full">
      {label}
      <textarea
        className="admin-form-input"
        style={{ minHeight: 80, resize: "vertical" }}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== (value ?? "")) onSave(local);
        }}
      />
    </label>
  );
}
