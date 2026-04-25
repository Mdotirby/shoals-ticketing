"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import type {
  Settlement,
  SettlementExpense,
  SettlementDeposit,
  TicketAuditRow,
  OtherAncillaryItem,
  TaxMethod,
} from "@/lib/types/settlement";
import { exportArtistSettlementPDF, exportVenueSettlementPDF } from "@/lib/pdf/settlement-pdf";

/* ─── helpers ─── */
const fmt = (n: number) =>
  "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pct = (n: number) => (Number(n || 0) * 100).toFixed(2) + "%";

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "6px 0",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};
const labelStyle: React.CSSProperties = { color: "rgba(255,255,255,0.6)", fontSize: 14 };
const valStyle: React.CSSProperties = { color: "#fff", fontSize: 14, fontWeight: 600 };
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "var(--admin-primary, #d0c290)",
  margin: "28px 0 12px",
  borderBottom: "1px solid rgba(208,194,144,0.25)",
  paddingBottom: 6,
};

const DEAL_TYPES = ["FLAT", "VS", "PLUS", "DOOR", "CO_PROMOTE"];

export default function SettlementDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Core settlement
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [expenses, setExpenses] = useState<SettlementExpense[]>([]);
  const [deposits, setDeposits] = useState<SettlementDeposit[]>([]);

  // ── Editable DEAL TERMS (draft mode) ─────────────────────────────────
  const [artistName, setArtistName] = useState("");
  const [dealType, setDealType] = useState("FLAT");
  const [guaranteeInput, setGuaranteeInput] = useState(0);
  const [backendPctInput, setBackendPctInput] = useState(0);
  const [splitpointInput, setSplitpointInput] = useState(0);
  const [radiusClause, setRadiusClause] = useState("");
  const [bonusStructureRaw, setBonusStructureRaw] = useState("");

  // ── Editable FEE / TAX inputs (draft mode) ───────────────────────────
  // These are ALSO populated from the order data via "Refresh from Orders".
  // The user can override (e.g. add an off-platform fee).
  const [ticketingFees, setTicketingFees] = useState(0);
  const [facilityFees, setFacilityFees] = useState(0);
  const [ccFees, setCcFees] = useState(0);
  const [taxesInput, setTaxesInput] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [taxMethod, setTaxMethod] = useState<TaxMethod>("multiplier");

  // Per-ticket rate snapshots (for display)
  const [ticketingFeePerTicket, setTicketingFeePerTicket] = useState(0);
  const [facilityFeePerTicket, setFacilityFeePerTicket] = useState(0);

  // Ancillary revenue
  const [barRevenue, setBarRevenue] = useState(0);
  const [concessionsRevenue, setConcessionsRevenue] = useState(0);
  const [merchCommission, setMerchCommission] = useState(0);
  const [ticketingRebate, setTicketingRebate] = useState(0);
  const [parkingRevenue, setParkingRevenue] = useState(0);
  const [sponsorshipRevenue, setSponsorshipRevenue] = useState(0);
  const [otherAncillary, setOtherAncillary] = useState<OtherAncillaryItem[]>([]);

  const isFinalized = settlement?.status === "finalized";

  /* ─── Hydrate state from a fetched / refreshed settlement ─── */
  const hydrate = useCallback((data: Settlement) => {
    setSettlement(data);
    setArtistName(data.artist_name ?? "");
    setDealType(data.deal_type ?? "FLAT");
    setGuaranteeInput(Number(data.guarantee) || 0);
    setBackendPctInput(Number(data.backend_percentage) || 0);
    setSplitpointInput(Number(data.splitpoint) || 0);
    setRadiusClause(data.radius_clause ?? "");
    setBonusStructureRaw(
      data.bonus_structure ? JSON.stringify(data.bonus_structure, null, 0) : ""
    );

    setTicketingFees(Number(data.ticketing_fees) || 0);
    setFacilityFees(Number(data.facility_fees) || 0);
    setCcFees(Number(data.cc_fees) || 0);
    setTaxesInput(Number(data.taxes) || 0);
    setTaxRate(Number(data.tax_rate) || 0);
    setTaxMethod((data.tax_method as TaxMethod) || "multiplier");
    setTicketingFeePerTicket(Number(data.ticketing_fee_per_ticket) || 0);
    setFacilityFeePerTicket(Number(data.facility_fee_per_ticket) || 0);

    setBarRevenue(Number(data.bar_revenue) || 0);
    setConcessionsRevenue(Number(data.concessions_revenue) || 0);
    setMerchCommission(Number(data.merch_commission) || 0);
    setTicketingRebate(Number(data.ticketing_rebate) || 0);
    setParkingRevenue(Number(data.parking_revenue) || 0);
    setSponsorshipRevenue(Number(data.sponsorship_revenue) || 0);
    setOtherAncillary(Array.isArray(data.other_ancillary) ? data.other_ancillary : []);
  }, []);

  /* ─── Load data ─── */
  useEffect(() => {
    fetch(`/api/settlements/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        hydrate(data);
        setExpenses(data.expenses || []);
        setDeposits(data.deposits || []);
      })
      .catch(() => setError("Failed to load settlement"))
      .finally(() => setLoading(false));
  }, [id, hydrate]);

  /* ─── Client-side calculations ─── */
  const ticketAudit: TicketAuditRow[] = settlement?.ticket_audit || [];
  const auditTotals = {
    capacity: ticketAudit.reduce((s, r) => s + r.capacity, 0),
    sold: ticketAudit.reduce((s, r) => s + r.sold, 0),
    comps: ticketAudit.reduce((s, r) => s + r.comps, 0),
    gross: ticketAudit.reduce((s, r) => s + (r.gross || 0), 0),
  };
  const totalGross = auditTotals.gross;

  // Adj gross subtracts ticketing + facility fees from gross.
  const adjGross = totalGross - ticketingFees - facilityFees;

  // Tax: honor the chosen method
  //   • multiplier → tax was added on top:         tax = adjGross × rate
  //   • divisor    → adjGross is tax-inclusive:    tax = adjGross − adjGross / (1 + rate)
  // We display BOTH the actual recorded tax (taxesInput from orders) and the
  // computed tax so the user can spot mismatches.
  const computedTax =
    taxMethod === "divisor" && taxRate > 0
      ? adjGross - adjGross / (1 + taxRate)
      : adjGross * taxRate;
  const taxes = taxesInput > 0 ? taxesInput : computedTax;
  const netReceipts = adjGross - taxes;

  const totalExpenses = expenses.reduce((s, e) => s + (e.actual_amount || 0), 0);
  const splitpoint = netReceipts - totalExpenses;

  // Artist payment math, deal-type aware
  const artistBackend = (() => {
    if (dealType === "VS" || dealType === "PLUS") {
      return splitpoint > 0 ? splitpoint * backendPctInput : 0;
    }
    if (dealType === "DOOR") {
      // Pure door deal = % of net (no guarantee floor)
      return netReceipts > 0 ? netReceipts * backendPctInput : 0;
    }
    return 0;
  })();
  const artistTotal =
    dealType === "DOOR"
      ? artistBackend // pure door — no guarantee
      : guaranteeInput + artistBackend;

  const totalDeposits = deposits
    .filter((d) => d.type === "deposit")
    .reduce((s, d) => s + (d.amount || 0), 0);
  const totalCashAdvances = deposits
    .filter((d) => d.type === "cash_advance")
    .reduce((s, d) => s + (d.amount || 0), 0);
  const balanceDue = artistTotal - totalDeposits - totalCashAdvances;

  // Ancillary
  const totalOtherAncillary = otherAncillary.reduce((s, i) => s + (i.amount || 0), 0);
  const totalAncillary =
    barRevenue + concessionsRevenue + merchCommission + ticketingRebate +
    parkingRevenue + sponsorshipRevenue + totalOtherAncillary;
  const venueNetProfit = netReceipts + totalAncillary - totalExpenses - artistTotal;

  // Per-ticket all-in (for display)
  const ticketsSold = settlement?.tickets_sold_count ?? auditTotals.sold;
  const compCount = settlement?.comp_count ?? auditTotals.comps;
  const grossPerTicket = ticketsSold > 0 ? totalGross / ticketsSold : 0;
  const ccFeePerTicket = ticketsSold > 0 ? ccFees / ticketsSold : 0;
  const totalCustomerPaid = totalGross + ticketingFees + facilityFees + taxes + ccFees;

  /* ─── Recalculate variable expenses when totalGross changes ─── */
  const recalcVariableExpenses = useCallback(
    (exps: SettlementExpense[], gross: number) =>
      exps.map((e) =>
        e.category === "variable" && e.rate > 0
          ? { ...e, actual_amount: e.rate * gross }
          : e
      ),
    []
  );

  useEffect(() => {
    setExpenses((prev) => recalcVariableExpenses(prev, totalGross));
  }, [totalGross, recalcVariableExpenses]);

  /* ─── Refresh from orders ─── */
  const handleRefreshFromOrders = async () => {
    if (!confirm(
      "Pull fresh ticket sales / fees / tax from the orders table?\n\nThis overwrites the audit table and fee totals but keeps your deal terms, expenses, and deposits."
    )) return;
    setRefreshing(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/settlements/${id}/refresh`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Refresh failed");
      hydrate(data);
      setSuccess("Refreshed from orders.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  /* ─── Save Draft / Finalize ─── */
  const handleSave = async (status: "draft" | "finalized" = "draft") => {
    if (!settlement) return;
    setSaving(true);
    setError("");
    setSuccess("");

    let bonusStructureParsed: Record<string, unknown> | null = null;
    if (bonusStructureRaw.trim()) {
      try {
        bonusStructureParsed = JSON.parse(bonusStructureRaw);
      } catch {
        // Allow free-text — store as { note: <raw> }
        bonusStructureParsed = { note: bonusStructureRaw };
      }
    }

    const payload = {
      status,
      // Deal terms
      artist_name: artistName || null,
      deal_type: dealType,
      guarantee: guaranteeInput,
      backend_percentage: backendPctInput,
      bonus_structure: bonusStructureParsed,
      radius_clause: radiusClause || null,

      // Fee / tax breakdown
      ticketing_fees: ticketingFees,
      facility_fees: facilityFees,
      cc_fees: ccFees,
      taxes,
      tax_rate: taxRate,
      tax_method: taxMethod,

      // Calculated
      total_gross: totalGross,
      adj_gross: adjGross,
      net_receipts: netReceipts,
      total_expenses: totalExpenses,
      splitpoint: dealType === "DOOR" ? 0 : splitpointInput || splitpoint,
      artist_backend: artistBackend,
      artist_total: artistTotal,
      deposit_paid: totalDeposits,
      cash_advance: totalCashAdvances,
      balance_due: balanceDue,

      // Ancillary
      bar_revenue: barRevenue,
      concessions_revenue: concessionsRevenue,
      merch_commission: merchCommission,
      ticketing_rebate: ticketingRebate,
      parking_revenue: parkingRevenue,
      sponsorship_revenue: sponsorshipRevenue,
      other_ancillary: otherAncillary,
      venue_total_revenue: totalAncillary + netReceipts,
      venue_net_profit: venueNetProfit,
    };

    try {
      const res = await fetch(`/api/settlements/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      const updated = await res.json();
      setSettlement((prev) => (prev ? { ...prev, ...updated } : updated));
      setSuccess(status === "finalized" ? "Settlement finalized." : "Draft saved.");
    } catch {
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = () => {
    if (!confirm("Finalize this settlement? This will lock all fields.")) return;
    handleSave("finalized");
  };

  /* ─── Expense CRUD ─── */
  const addExpense = async () => {
    const res = await fetch(`/api/settlements/${id}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New Expense",
        category: "fixed",
        estimated_amount: 0,
        actual_amount: 0,
        rate: 0,
        sort_order: expenses.length,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setExpenses((prev) => [...prev, created]);
    }
  };

  const updateExpense = async (expense: SettlementExpense, updates: Partial<SettlementExpense>) => {
    const updated = { ...expense, ...updates };
    setExpenses((prev) => prev.map((e) => (e.id === expense.id ? updated : e)));
    await fetch(`/api/settlements/${id}/expenses`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expense_id: expense.id, ...updates }),
    });
  };

  const removeExpense = async (expenseId: string) => {
    const res = await fetch(`/api/settlements/${id}/expenses?expense_id=${expenseId}`, {
      method: "DELETE",
    });
    if (res.ok) setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
  };

  const uploadReceipt = async (expenseId: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,application/pdf";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const { url } = await res.json();
        const exp = expenses.find((e) => e.id === expenseId);
        if (exp) updateExpense(exp, { receipt_url: url });
      }
    };
    input.click();
  };

  /* ─── Deposit CRUD ─── */
  const addDeposit = async (type: "deposit" | "cash_advance" = "deposit") => {
    const res = await fetch(`/api/settlements/${id}/deposits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, amount: 0, date: new Date().toISOString().slice(0, 10) }),
    });
    if (res.ok) {
      const created = await res.json();
      setDeposits((prev) => [...prev, created]);
    }
  };

  const updateDepositLocal = (depositId: string, updates: Partial<SettlementDeposit>) => {
    setDeposits((prev) => prev.map((d) => (d.id === depositId ? { ...d, ...updates } : d)));
  };

  const removeDeposit = async (depositId: string) => {
    const res = await fetch(`/api/settlements/${id}/deposits?deposit_id=${depositId}`, {
      method: "DELETE",
    });
    if (res.ok) setDeposits((prev) => prev.filter((d) => d.id !== depositId));
  };

  const uploadDepositReceipt = async (depositId: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,application/pdf";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const { url } = await res.json();
        updateDepositLocal(depositId, { receipt_url: url });
      }
    };
    input.click();
  };

  /* ─── Build a "live" settlement object for PDF export ─── */
  const buildPdfSettlement = (): Settlement => {
    if (!settlement) throw new Error("no settlement");
    return {
      ...settlement,
      artist_name: artistName,
      deal_type: dealType,
      guarantee: guaranteeInput,
      backend_percentage: backendPctInput,
      radius_clause: radiusClause,
      total_gross: totalGross,
      ticketing_fees: ticketingFees,
      facility_fees: facilityFees,
      cc_fees: ccFees,
      ticketing_fee_per_ticket: ticketingFeePerTicket,
      facility_fee_per_ticket: facilityFeePerTicket,
      adj_gross: adjGross,
      taxes,
      tax_rate: taxRate,
      tax_method: taxMethod,
      net_receipts: netReceipts,
      total_expenses: totalExpenses,
      splitpoint,
      artist_backend: artistBackend,
      artist_total: artistTotal,
      tickets_sold_count: ticketsSold,
      comp_count: compCount,
      comp_face_value: settlement.comp_face_value ?? 0,
      deposit_paid: totalDeposits,
      cash_advance: totalCashAdvances,
      balance_due: balanceDue,
      bar_revenue: barRevenue,
      concessions_revenue: concessionsRevenue,
      merch_commission: merchCommission,
      ticketing_rebate: ticketingRebate,
      parking_revenue: parkingRevenue,
      sponsorship_revenue: sponsorshipRevenue,
      other_ancillary: otherAncillary,
      venue_total_revenue: totalAncillary + netReceipts,
      venue_net_profit: venueNetProfit,
    };
  };

  const exportArtistPDF = async () => {
    if (!settlement) return;
    const pdfSettlement = buildPdfSettlement();
    const venueInfo = {
      name: settlement.event_title || settlement.artist_name || "Venue",
      address_street: undefined as string | undefined,
      address_city: undefined as string | undefined,
      address_state: undefined as string | undefined,
      address_zip: undefined as string | undefined,
    };
    await exportArtistSettlementPDF(
      pdfSettlement,
      venueInfo,
      expenses.map((e) => ({ name: e.name, category: e.category, actual_amount: e.actual_amount })),
      deposits.map((d) => ({ type: d.type, amount: d.amount, date: d.date, notes: d.notes }))
    );
  };

  const exportVenuePDF = async () => {
    if (!settlement) return;
    const pdfSettlement = buildPdfSettlement();
    const venueInfo = {
      name: settlement.event_title || settlement.artist_name || "Venue",
      address_street: undefined as string | undefined,
      address_city: undefined as string | undefined,
      address_state: undefined as string | undefined,
      address_zip: undefined as string | undefined,
    };
    await exportVenueSettlementPDF(
      pdfSettlement,
      venueInfo,
      expenses.map((e) => ({ name: e.name, category: e.category, actual_amount: e.actual_amount })),
      deposits.map((d) => ({ type: d.type, amount: d.amount, date: d.date, notes: d.notes }))
    );
  };

  /* ─── Other Ancillary CRUD ─── */
  const addOtherAncillary = () =>
    setOtherAncillary((prev) => [...prev, { name: "", amount: 0 }]);
  const updateOtherAncillary = (idx: number, updates: Partial<OtherAncillaryItem>) =>
    setOtherAncillary((prev) => prev.map((item, i) => (i === idx ? { ...item, ...updates } : item)));
  const removeOtherAncillary = (idx: number) =>
    setOtherAncillary((prev) => prev.filter((_, i) => i !== idx));

  /* ─── Render ─── */
  if (loading)
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Loading…</h1>
      </div>
    );
  if (!settlement)
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Settlement Not Found</h1>
        {error && <div className="admin-form-error">{error}</div>}
      </div>
    );

  const eventDateLabel =
    settlement.event_date
      ? new Date(settlement.event_date).toLocaleDateString("en-US", {
          weekday: "short", month: "short", day: "numeric", year: "numeric",
        })
      : "—";

  return (
    <div className="admin-form-page">
      {/* ── Header ── */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">
            Settlement — {settlement.event_title || artistName || "Event"}
            {isFinalized && (
              <span style={{
                marginLeft: 12, fontSize: 13,
                background: "rgba(100,200,100,0.15)", color: "#7ddb7d",
                padding: "3px 10px", borderRadius: 4,
              }}>
                FINALIZED
              </span>
            )}
          </h1>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, margin: "4px 0 0" }}>
            {artistName || "—"} · {eventDateLabel}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {settlement.event_id && (
            <button
              className="admin-sponsor-edit-btn"
              onClick={() => router.push(`/admin/orders/${settlement.event_id}`)}
            >
              ← View Sales
            </button>
          )}
          <button className="admin-sponsor-edit-btn" onClick={() => router.push("/admin/settlements")}>
            All Settlements
          </button>
        </div>
      </div>

      {error && <div className="admin-form-error">{error}</div>}
      {success && <div className="admin-form-success">{success}</div>}

      {/* ════════════════════════════════════════════
          §1  DEAL TERMS (editable in draft)
      ════════════════════════════════════════════ */}
      <h2 style={sectionTitleStyle}>Deal Terms</h2>
      <div className="admin-form-grid">
        <div>
          <label className="admin-form-label">Artist</label>
          <input
            className="admin-form-input"
            value={artistName}
            onChange={(e) => setArtistName(e.target.value)}
            disabled={isFinalized}
          />
        </div>
        <div>
          <label className="admin-form-label">Deal Type</label>
          <select
            className="admin-form-input"
            value={dealType}
            onChange={(e) => setDealType(e.target.value)}
            disabled={isFinalized}
          >
            {DEAL_TYPES.map((dt) => (
              <option key={dt} value={dt}>{dt}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="admin-form-label">Guarantee ($)</label>
          <input
            type="number"
            step="0.01"
            className="admin-form-input"
            value={guaranteeInput}
            onChange={(e) => setGuaranteeInput(Number(e.target.value))}
            disabled={isFinalized}
          />
        </div>
        <div>
          <label className="admin-form-label">
            Backend % (decimal, e.g. 0.85 = 85%)
          </label>
          <input
            type="number"
            step="0.01"
            className="admin-form-input"
            value={backendPctInput}
            onChange={(e) => setBackendPctInput(Number(e.target.value))}
            disabled={isFinalized}
          />
        </div>
        <div>
          <label className="admin-form-label">Splitpoint Override ($)</label>
          <input
            type="number"
            step="0.01"
            className="admin-form-input"
            value={splitpointInput}
            onChange={(e) => setSplitpointInput(Number(e.target.value))}
            disabled={isFinalized}
            placeholder="0 = computed from net − expenses"
          />
        </div>
        <div>
          <label className="admin-form-label">Radius Clause</label>
          <input
            className="admin-form-input"
            value={radiusClause}
            onChange={(e) => setRadiusClause(e.target.value)}
            disabled={isFinalized}
            placeholder="e.g. 50 mi / 30 days prior"
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="admin-form-label">Bonus Structure (free text or JSON)</label>
          <input
            className="admin-form-input"
            value={bonusStructureRaw}
            onChange={(e) => setBonusStructureRaw(e.target.value)}
            disabled={isFinalized}
            placeholder='e.g. {"75% sold":"$500","sellout":"$1000"}'
          />
        </div>
      </div>

      {/* ════════════════════════════════════════════
          §2  TICKET AUDIT
      ════════════════════════════════════════════ */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={sectionTitleStyle}>Ticket Audit</h2>
        {!isFinalized && (
          <button
            className="admin-header-btn"
            style={{ fontSize: 13 }}
            onClick={handleRefreshFromOrders}
            disabled={refreshing}
            title="Re-pull live ticket sales, fees, and tax from the orders table"
          >
            {refreshing ? "Refreshing…" : "↻ Refresh from Orders"}
          </button>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: "#fff" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid rgba(208,194,144,0.3)", textAlign: "left" }}>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Tier</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Capacity</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Sold</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Comps</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>% House</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Price</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Gross (paid)</th>
            </tr>
          </thead>
          <tbody>
            {ticketAudit.map((row, i) => {
              const pctHouse = row.capacity > 0 ? (row.sold / row.capacity) * 100 : 0;
              return (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "6px" }}>{row.tier}</td>
                  <td style={{ padding: "6px" }}>{row.capacity}</td>
                  <td style={{ padding: "6px" }}>{row.sold}</td>
                  <td style={{ padding: "6px" }}>{row.comps}</td>
                  <td style={{ padding: "6px" }}>{pctHouse.toFixed(1)}%</td>
                  <td style={{ padding: "6px" }}>{fmt(row.price)}</td>
                  <td style={{ padding: "6px", fontWeight: 600 }}>{fmt(row.gross)}</td>
                </tr>
              );
            })}
            {ticketAudit.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 12, color: "rgba(255,255,255,0.3)" }}>
                  No ticket data — click &ldquo;Refresh from Orders&rdquo; to pull live sales.
                </td>
              </tr>
            )}
          </tbody>
          {ticketAudit.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: "2px solid rgba(208,194,144,0.3)" }}>
                <td style={{ padding: "8px 6px", fontWeight: 700 }}>Total</td>
                <td style={{ padding: "8px 6px" }}>{auditTotals.capacity}</td>
                <td style={{ padding: "8px 6px" }}>{auditTotals.sold}</td>
                <td style={{ padding: "8px 6px" }}>{auditTotals.comps}</td>
                <td style={{ padding: "8px 6px" }}>
                  {auditTotals.capacity > 0
                    ? ((auditTotals.sold / auditTotals.capacity) * 100).toFixed(1) + "%"
                    : "—"}
                </td>
                <td style={{ padding: "8px 6px" }}>—</td>
                <td style={{ padding: "8px 6px", fontWeight: 700 }}>{fmt(totalGross)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 6 }}>
        Comps are listed for inventory accuracy but excluded from the gross.
        {compCount > 0 && (
          <> Comp face value of <strong>{fmt(settlement.comp_face_value || 0)}</strong> across {compCount} ticket{compCount === 1 ? "" : "s"} is informational only.</>
        )}
      </p>

      {/* ════════════════════════════════════════════
          §3  FEES & TAX BREAKDOWN
      ════════════════════════════════════════════ */}
      <h2 style={sectionTitleStyle}>Fees &amp; Tax Collected</h2>
      <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: -8, marginBottom: 8 }}>
        Pulled from actual order data. Each line item is what the customer paid in addition to the ticket face value.
      </p>
      <div style={{ maxWidth: 640 }}>
        <div style={rowStyle}>
          <span style={labelStyle}>
            Ticketing Service Fee
            {ticketingFeePerTicket > 0 && (
              <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginLeft: 8 }}>
                {fmt(ticketingFeePerTicket)} × {ticketsSold} ticket{ticketsSold === 1 ? "" : "s"}
              </span>
            )}
          </span>
          <input
            type="number"
            step="0.01"
            className="admin-form-input"
            style={{ width: 140, textAlign: "right" }}
            value={ticketingFees}
            onChange={(e) => setTicketingFees(Number(e.target.value))}
            disabled={isFinalized}
          />
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>
            Facility Fee
            {facilityFeePerTicket > 0 && (
              <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginLeft: 8 }}>
                {fmt(facilityFeePerTicket)} × {ticketsSold} ticket{ticketsSold === 1 ? "" : "s"}
              </span>
            )}
          </span>
          <input
            type="number"
            step="0.01"
            className="admin-form-input"
            style={{ width: 140, textAlign: "right" }}
            value={facilityFees}
            onChange={(e) => setFacilityFees(Number(e.target.value))}
            disabled={isFinalized}
          />
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>
            CC / Processing Fee (Stripe)
            {ccFeePerTicket > 0 && (
              <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginLeft: 8 }}>
                ~{fmt(ccFeePerTicket)} / ticket
              </span>
            )}
          </span>
          <input
            type="number"
            step="0.01"
            className="admin-form-input"
            style={{ width: 140, textAlign: "right" }}
            value={ccFees}
            onChange={(e) => setCcFees(Number(e.target.value))}
            disabled={isFinalized}
          />
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>
            Tax Rate{" "}
            <input
              type="number"
              step="0.001"
              className="admin-form-input"
              style={{ width: 80, textAlign: "right", marginLeft: 8, display: "inline" }}
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value))}
              disabled={isFinalized}
            />
            {" "}
            <select
              className="admin-form-input"
              style={{ width: 130, marginLeft: 8, display: "inline" }}
              value={taxMethod}
              onChange={(e) => setTaxMethod(e.target.value as TaxMethod)}
              disabled={isFinalized}
            >
              <option value="multiplier">Add on top</option>
              <option value="divisor">Divide out (incl.)</option>
            </select>
          </span>
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
            Computed: {fmt(computedTax)}
          </span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Tax Collected (actual)</span>
          <input
            type="number"
            step="0.01"
            className="admin-form-input"
            style={{ width: 140, textAlign: "right" }}
            value={taxesInput}
            onChange={(e) => setTaxesInput(Number(e.target.value))}
            disabled={isFinalized}
          />
        </div>
        <div style={{ ...rowStyle, borderBottom: "2px solid rgba(208,194,144,0.3)" }}>
          <span style={{ ...labelStyle, fontWeight: 700 }}>Total Fees + Tax Collected</span>
          <span style={valStyle}>
            {fmt(ticketingFees + facilityFees + ccFees + taxes)}
          </span>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          §4  FINANCIAL SUMMARY
          Math chain: Gross − fees = Adj. Gross. Adj. Gross − tax = Net.
      ════════════════════════════════════════════ */}
      <h2 style={sectionTitleStyle}>Financial Summary</h2>
      <div style={{ maxWidth: 540 }}>
        <div style={rowStyle}>
          <span style={labelStyle}>Tickets Sold (paying)</span>
          <span style={valStyle}>{ticketsSold}</span>
        </div>
        <div style={{ ...rowStyle, borderBottom: "2px solid rgba(208,194,144,0.3)" }}>
          <span style={{ ...labelStyle, fontWeight: 700 }}>Total Gross Receipts (face value)</span>
          <span style={valStyle}>{fmt(totalGross)}</span>
        </div>
        <div style={rowStyle}>
          <span style={{ ...labelStyle, paddingLeft: 12 }}>− Ticketing Service Fees</span>
          <span style={valStyle}>({fmt(ticketingFees)})</span>
        </div>
        <div style={rowStyle}>
          <span style={{ ...labelStyle, paddingLeft: 12 }}>− Facility Fees</span>
          <span style={valStyle}>({fmt(facilityFees)})</span>
        </div>
        <div style={{ ...rowStyle, borderBottom: "2px solid rgba(208,194,144,0.3)" }}>
          <span style={{ ...labelStyle, fontWeight: 700 }}>= Adj. Gross</span>
          <span style={valStyle}>{fmt(adjGross)}</span>
        </div>
        <div style={rowStyle}>
          <span style={{ ...labelStyle, paddingLeft: 12 }}>
            − Tax ({(taxRate * 100).toFixed(2)}%
            {taxMethod === "divisor" ? ", divided out" : ", added on top"})
          </span>
          <span style={valStyle}>({fmt(taxes)})</span>
        </div>
        <div style={{ ...rowStyle, borderBottom: "3px solid var(--admin-primary, #d0c290)", paddingBottom: 10 }}>
          <span style={{ ...labelStyle, fontWeight: 700, fontSize: 16 }}>= Net Receipts</span>
          <span style={{ ...valStyle, fontSize: 18, color: "var(--admin-primary, #d0c290)" }}>
            {fmt(netReceipts)}
          </span>
        </div>

        {/* ── Reconciliation / informational ────────────────────────── */}
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, margin: "16px 0 6px" }}>
          Reconciliation (informational — not part of the artist split):
        </p>
        <div style={rowStyle}>
          <span style={labelStyle}>Total Customer Paid (incl. all fees + tax)</span>
          <span style={valStyle}>{fmt(totalCustomerPaid)}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>CC / Processing Fees paid to Stripe</span>
          <span style={valStyle}>{fmt(ccFees)}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Avg. gross / ticket sold</span>
          <span style={valStyle}>{fmt(grossPerTicket)}</span>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          §5  EXPENSES
      ════════════════════════════════════════════ */}
      <h2 style={sectionTitleStyle}>Expenses</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: "#fff" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid rgba(208,194,144,0.3)", textAlign: "left" }}>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Name</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Category</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Estimated</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Actual</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Receipt</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}></th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((exp) => (
              <tr key={exp.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: "6px" }}>
                  <input
                    className="admin-form-input"
                    style={{ width: "100%", minWidth: 100 }}
                    value={exp.name}
                    onChange={(e) => updateExpense(exp, { name: e.target.value })}
                    disabled={isFinalized}
                  />
                </td>
                <td style={{ padding: "6px" }}>
                  <select
                    className="admin-form-input"
                    value={exp.category}
                    onChange={(e) => updateExpense(exp, { category: e.target.value as "fixed" | "variable" })}
                    disabled={isFinalized}
                  >
                    <option value="fixed">Fixed</option>
                    <option value="variable">Variable</option>
                  </select>
                </td>
                <td style={{ padding: "6px", opacity: 0.5 }}>{fmt(exp.estimated_amount)}</td>
                <td style={{ padding: "6px" }}>
                  {exp.category === "variable" ? (
                    <span title={`Rate: ${pct(exp.rate)}`}>{fmt(exp.actual_amount)}</span>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      className="admin-form-input"
                      style={{ width: 120, textAlign: "right" }}
                      value={exp.actual_amount}
                      onChange={(e) => updateExpense(exp, { actual_amount: Number(e.target.value) })}
                      disabled={isFinalized}
                    />
                  )}
                </td>
                <td style={{ padding: "6px" }}>
                  {exp.receipt_url ? (
                    <a href={exp.receipt_url} target="_blank" rel="noopener noreferrer"
                      style={{ color: "var(--admin-primary, #d0c290)", fontSize: 12 }}>
                      View
                    </a>
                  ) : !isFinalized ? (
                    <button
                      style={{
                        background: "none", border: "1px solid rgba(255,255,255,0.15)",
                        color: "rgba(255,255,255,0.5)", fontSize: 11,
                        padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                      }}
                      onClick={() => uploadReceipt(exp.id)}
                    >
                      Upload
                    </button>
                  ) : "—"}
                </td>
                <td style={{ padding: "6px" }}>
                  {!isFinalized && (
                    <button
                      className="admin-sponsor-delete-btn"
                      onClick={() => removeExpense(exp.id)}
                      style={{ fontSize: 11 }}
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid rgba(208,194,144,0.3)" }}>
              <td colSpan={3} style={{ padding: "8px 6px", fontWeight: 700 }}>Total Expenses</td>
              <td style={{ padding: "8px 6px", fontWeight: 700 }}>{fmt(totalExpenses)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      {!isFinalized && (
        <button className="admin-header-btn" style={{ marginTop: 8, fontSize: 13 }} onClick={addExpense}>
          + Add Expense
        </button>
      )}

      {/* ════════════════════════════════════════════
          §6  DEPOSITS & ADVANCES
      ════════════════════════════════════════════ */}
      <h2 style={sectionTitleStyle}>Deposits &amp; Advances</h2>
      {deposits.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No deposits recorded.</p>
      )}
      {deposits.map((dep) => (
        <div key={dep.id} style={{
          display: "flex", gap: 10, alignItems: "center",
          padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexWrap: "wrap",
        }}>
          <select
            className="admin-form-input"
            style={{ width: 140 }}
            value={dep.type}
            onChange={(e) => updateDepositLocal(dep.id, { type: e.target.value as SettlementDeposit["type"] })}
            disabled={isFinalized}
          >
            <option value="deposit">Deposit</option>
            <option value="cash_advance">Cash Advance</option>
            <option value="other">Other</option>
          </select>
          <input
            type="number"
            step="0.01"
            className="admin-form-input"
            style={{ width: 120, textAlign: "right" }}
            value={dep.amount}
            onChange={(e) => updateDepositLocal(dep.id, { amount: Number(e.target.value) })}
            disabled={isFinalized}
          />
          <input
            type="date"
            className="admin-form-input"
            style={{ width: 150 }}
            value={dep.date?.slice(0, 10) || ""}
            onChange={(e) => updateDepositLocal(dep.id, { date: e.target.value })}
            disabled={isFinalized}
          />
          <input
            className="admin-form-input"
            style={{ flex: 1, minWidth: 100 }}
            placeholder="Notes"
            value={dep.notes || ""}
            onChange={(e) => updateDepositLocal(dep.id, { notes: e.target.value })}
            disabled={isFinalized}
          />
          {dep.receipt_url ? (
            <a href={dep.receipt_url} target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--admin-primary, #d0c290)", fontSize: 12 }}>
              Receipt
            </a>
          ) : !isFinalized ? (
            <button
              style={{
                background: "none", border: "1px solid rgba(255,255,255,0.15)",
                color: "rgba(255,255,255,0.5)", fontSize: 11,
                padding: "3px 8px", borderRadius: 4, cursor: "pointer",
              }}
              onClick={() => uploadDepositReceipt(dep.id)}
            >
              Upload
            </button>
          ) : null}
          {!isFinalized && (
            <button
              className="admin-sponsor-delete-btn"
              onClick={() => removeDeposit(dep.id)}
              style={{ fontSize: 11 }}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <div style={{ ...rowStyle, fontWeight: 700, marginTop: 4 }}>
        <span style={labelStyle}>Total Deposits + Advances</span>
        <span style={valStyle}>{fmt(totalDeposits + totalCashAdvances)}</span>
      </div>
      {!isFinalized && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="admin-header-btn" style={{ fontSize: 13 }} onClick={() => addDeposit("deposit")}>
            + Add Deposit
          </button>
          <button className="admin-header-btn" style={{ fontSize: 13 }} onClick={() => addDeposit("cash_advance")}>
            + Add Cash Advance
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════
          §7  SETTLEMENT CALCULATION
      ════════════════════════════════════════════ */}
      <h2 style={sectionTitleStyle}>Settlement Calculation</h2>
      <div style={{ maxWidth: 500 }}>
        <div style={rowStyle}>
          <span style={labelStyle}>Net Receipts</span>
          <span style={valStyle}>{fmt(netReceipts)}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>– Total Expenses</span>
          <span style={valStyle}>{fmt(totalExpenses)}</span>
        </div>
        <div style={{ ...rowStyle, borderBottom: "2px solid rgba(208,194,144,0.3)" }}>
          <span style={{ ...labelStyle, fontWeight: 700 }}>= Splitpoint</span>
          <span style={{ ...valStyle, color: splitpoint >= 0 ? "#7ddb7d" : "#ff9a9a" }}>
            {fmt(splitpoint)}
          </span>
        </div>
        {(dealType === "VS" || dealType === "PLUS" || dealType === "DOOR") && (
          <div style={rowStyle}>
            <span style={labelStyle}>
              Artist Backend ({(backendPctInput * 100).toFixed(2)}%
              {dealType === "DOOR" ? " of net" : " of splitpoint"})
            </span>
            <span style={valStyle}>{fmt(artistBackend)}</span>
          </div>
        )}
        {dealType !== "DOOR" && (
          <div style={rowStyle}>
            <span style={labelStyle}>Guarantee</span>
            <span style={valStyle}>{fmt(guaranteeInput)}</span>
          </div>
        )}
        <div style={{ ...rowStyle, borderBottom: "2px solid rgba(208,194,144,0.3)" }}>
          <span style={{ ...labelStyle, fontWeight: 700 }}>Artist Total</span>
          <span style={valStyle}>{fmt(artistTotal)}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>– Deposits Paid</span>
          <span style={valStyle}>{fmt(totalDeposits)}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>– Cash Advances</span>
          <span style={valStyle}>{fmt(totalCashAdvances)}</span>
        </div>
        <div style={{
          ...rowStyle,
          borderBottom: "3px solid var(--admin-primary, #d0c290)",
          paddingBottom: 10,
        }}>
          <span style={{ ...labelStyle, fontWeight: 700, fontSize: 16 }}>Balance Due to Artist</span>
          <span style={{
            ...valStyle, fontSize: 18,
            color: balanceDue >= 0 ? "var(--admin-primary, #d0c290)" : "#ff9a9a",
          }}>
            {fmt(balanceDue)}
          </span>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          §8  ANCILLARY REVENUE (venue P&L)
      ════════════════════════════════════════════ */}
      <h2 style={sectionTitleStyle}>Ancillary Revenue (Venue)</h2>
      <div className="admin-form-grid">
        {[
          { label: "Bar Revenue", value: barRevenue, setter: setBarRevenue },
          { label: "Concessions", value: concessionsRevenue, setter: setConcessionsRevenue },
          { label: "Merch Commission", value: merchCommission, setter: setMerchCommission },
          { label: "Ticketing Rebate", value: ticketingRebate, setter: setTicketingRebate },
          { label: "Parking Revenue", value: parkingRevenue, setter: setParkingRevenue },
          { label: "Sponsorship", value: sponsorshipRevenue, setter: setSponsorshipRevenue },
        ].map((field) => (
          <div key={field.label}>
            <label className="admin-form-label">{field.label}</label>
            <input
              type="number"
              step="0.01"
              className="admin-form-input"
              value={field.value}
              onChange={(e) => field.setter(Number(e.target.value))}
              disabled={isFinalized}
            />
          </div>
        ))}
      </div>

      {otherAncillary.map((item, idx) => (
        <div key={idx} style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
          <input
            className="admin-form-input"
            placeholder="Name"
            value={item.name}
            onChange={(e) => updateOtherAncillary(idx, { name: e.target.value })}
            disabled={isFinalized}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            step="0.01"
            className="admin-form-input"
            style={{ width: 140, textAlign: "right" }}
            value={item.amount}
            onChange={(e) => updateOtherAncillary(idx, { amount: Number(e.target.value) })}
            disabled={isFinalized}
          />
          {!isFinalized && (
            <button
              className="admin-sponsor-delete-btn"
              onClick={() => removeOtherAncillary(idx)}
              style={{ fontSize: 11 }}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {!isFinalized && (
        <button
          className="admin-header-btn"
          style={{ marginTop: 8, fontSize: 13 }}
          onClick={addOtherAncillary}
        >
          + Add Other Revenue
        </button>
      )}

      <div style={{ maxWidth: 500, marginTop: 16 }}>
        <div style={rowStyle}>
          <span style={labelStyle}>Total Ancillary Revenue</span>
          <span style={valStyle}>{fmt(totalAncillary)}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Net Receipts + Ancillary</span>
          <span style={valStyle}>{fmt(netReceipts + totalAncillary)}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>– Total Expenses + Artist Total</span>
          <span style={valStyle}>{fmt(totalExpenses + artistTotal)}</span>
        </div>
        <div style={{
          ...rowStyle,
          borderBottom: "3px solid var(--admin-primary, #d0c290)",
          paddingBottom: 10,
        }}>
          <span style={{ ...labelStyle, fontWeight: 700, fontSize: 16 }}>Venue Net Profit</span>
          <span style={{
            ...valStyle, fontSize: 18,
            color: venueNetProfit >= 0 ? "#7ddb7d" : "#ff9a9a",
          }}>
            {fmt(venueNetProfit)}
          </span>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          §9  ACTIONS
      ════════════════════════════════════════════ */}
      <h2 style={sectionTitleStyle}>Actions</h2>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 40 }}>
        {!isFinalized && (
          <>
            <button
              className="admin-form-submit"
              onClick={() => handleSave("draft")}
              disabled={saving}
              style={{ padding: "10px 24px" }}
            >
              {saving ? "Saving…" : "Save Draft"}
            </button>
            <button
              className="admin-form-submit"
              onClick={handleFinalize}
              disabled={saving}
              style={{
                padding: "10px 24px",
                background: "rgba(100,200,100,0.15)",
                borderColor: "rgba(100,200,100,0.4)",
                color: "#7ddb7d",
              }}
            >
              Finalize Settlement
            </button>
          </>
        )}
        <button className="admin-header-btn" onClick={exportArtistPDF} style={{ padding: "10px 20px" }}>
          Export Artist Settlement PDF
        </button>
        <button className="admin-header-btn" onClick={exportVenuePDF} style={{ padding: "10px 20px" }}>
          Export Venue Settlement PDF
        </button>
      </div>
    </div>
  );
}
