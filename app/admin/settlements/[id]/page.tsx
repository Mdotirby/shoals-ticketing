"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import type {
  Settlement,
  SettlementExpense,
  SettlementDeposit,
  TicketAuditRow,
  OtherAncillaryItem,
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

export default function SettlementDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Core settlement
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [expenses, setExpenses] = useState<SettlementExpense[]>([]);
  const [deposits, setDeposits] = useState<SettlementDeposit[]>([]);

  // Editable financial fields
  const [ticketingFees, setTicketingFees] = useState(0);
  const [facilityFees, setFacilityFees] = useState(0);
  const [taxRate, setTaxRate] = useState(0);

  // Ancillary revenue
  const [barRevenue, setBarRevenue] = useState(0);
  const [concessionsRevenue, setConcessionsRevenue] = useState(0);
  const [merchCommission, setMerchCommission] = useState(0);
  const [ticketingRebate, setTicketingRebate] = useState(0);
  const [parkingRevenue, setParkingRevenue] = useState(0);
  const [sponsorshipRevenue, setSponsorshipRevenue] = useState(0);
  const [otherAncillary, setOtherAncillary] = useState<OtherAncillaryItem[]>([]);

  const isFinalized = settlement?.status === "finalized";

  /* ─── Load data ─── */
  useEffect(() => {
    fetch(`/api/settlements/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setSettlement(data);
        setExpenses(data.expenses || []);
        setDeposits(data.deposits || []);
        setTicketingFees(data.ticketing_fees ?? 0);
        setFacilityFees(data.facility_fees ?? 0);
        setTaxRate(data.tax_rate ?? 0);
        setBarRevenue(data.bar_revenue ?? 0);
        setConcessionsRevenue(data.concessions_revenue ?? 0);
        setMerchCommission(data.merch_commission ?? 0);
        setTicketingRebate(data.ticketing_rebate ?? 0);
        setParkingRevenue(data.parking_revenue ?? 0);
        setSponsorshipRevenue(data.sponsorship_revenue ?? 0);
        setOtherAncillary(data.other_ancillary || []);
      })
      .catch(() => setError("Failed to load settlement"))
      .finally(() => setLoading(false));
  }, [id]);

  /* ─── Client-side calculations ─── */
  const ticketAudit: TicketAuditRow[] = settlement?.ticket_audit || [];

  const totalGross = ticketAudit.reduce((s, r) => s + (r.gross || 0), 0);
  const adjGross = totalGross - ticketingFees - facilityFees;
  const taxes = adjGross * taxRate;
  const netReceipts = adjGross - taxes;

  const totalExpenses = expenses.reduce((s, e) => s + (e.actual_amount || 0), 0);
  const splitpoint = netReceipts - totalExpenses;

  const guarantee = settlement?.guarantee ?? 0;
  const backendPct = settlement?.backend_percentage ?? 0;
  const dealType = settlement?.deal_type || "FLAT";

  const artistBackend =
    dealType === "VS" || dealType === "PLUS"
      ? splitpoint > 0
        ? splitpoint * backendPct
        : 0
      : 0;
  const artistTotal = guarantee + artistBackend;

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
    barRevenue +
    concessionsRevenue +
    merchCommission +
    ticketingRebate +
    parkingRevenue +
    sponsorshipRevenue +
    totalOtherAncillary;
  const venueNetProfit = netReceipts + totalAncillary - totalExpenses - artistTotal;

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

  /* ─── Save Draft ─── */
  const handleSave = async (status: "draft" | "finalized" = "draft") => {
    if (!settlement) return;
    setSaving(true);
    setError("");
    setSuccess("");

    const payload = {
      status,
      ticketing_fees: ticketingFees,
      facility_fees: facilityFees,
      tax_rate: taxRate,
      total_gross: totalGross,
      adj_gross: adjGross,
      taxes,
      net_receipts: netReceipts,
      total_expenses: totalExpenses,
      splitpoint,
      artist_backend: artistBackend,
      artist_total: artistTotal,
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
    const res = await fetch(
      `/api/settlements/${id}/expenses?expense_id=${expenseId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
    }
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
    const res = await fetch(
      `/api/settlements/${id}/deposits?deposit_id=${depositId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setDeposits((prev) => prev.filter((d) => d.id !== depositId));
    }
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

  /* ─── PDF Exports ─── */
  const exportArtistPDF = async () => {
    if (!settlement) return;
    const pdfSettlement: Settlement = {
      ...settlement,
      total_gross: totalGross,
      ticketing_fees: ticketingFees,
      facility_fees: facilityFees,
      adj_gross: adjGross,
      taxes,
      tax_rate: taxRate,
      net_receipts: netReceipts,
      total_expenses: totalExpenses,
      splitpoint,
      artist_backend: artistBackend,
      artist_total: artistTotal,
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
    const venueInfo = {
      name: settlement.artist_name || "Venue",
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
    const pdfSettlement: Settlement = {
      ...settlement,
      total_gross: totalGross,
      ticketing_fees: ticketingFees,
      facility_fees: facilityFees,
      adj_gross: adjGross,
      taxes,
      tax_rate: taxRate,
      net_receipts: netReceipts,
      total_expenses: totalExpenses,
      splitpoint,
      artist_backend: artistBackend,
      artist_total: artistTotal,
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
    const venueInfo = {
      name: settlement.artist_name || "Venue",
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

  return (
    <div className="admin-form-page">
      {/* ── Header ── */}
      <div className="admin-page-header">
        <h1 className="admin-page-title">
          Settlement — {settlement.artist_name || "Event"}
          {isFinalized && (
            <span
              style={{
                marginLeft: 12,
                fontSize: 13,
                background: "rgba(100,200,100,0.15)",
                color: "#7ddb7d",
                padding: "3px 10px",
                borderRadius: 4,
              }}
            >
              FINALIZED
            </span>
          )}
        </h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="admin-sponsor-edit-btn" onClick={() => router.push("/admin/settlements")}>
            ← Back
          </button>
        </div>
      </div>

      {error && <div className="admin-form-error">{error}</div>}
      {success && <div className="admin-form-success">{success}</div>}

      {/* ════════════════════════════════════════════
          §1  DEAL TERMS HEADER (read-only from offer)
      ════════════════════════════════════════════ */}
      <h2 style={sectionTitleStyle}>Deal Terms</h2>
      <div className="admin-form-grid">
        <div>
          <label className="admin-form-label">Artist</label>
          <div className="admin-form-input" style={{ opacity: 0.7 }}>
            {settlement.artist_name || "—"}
          </div>
        </div>
        <div>
          <label className="admin-form-label">Guarantee</label>
          <div className="admin-form-input" style={{ opacity: 0.7 }}>
            {fmt(guarantee)}
          </div>
        </div>
        <div>
          <label className="admin-form-label">Deal Type</label>
          <div className="admin-form-input" style={{ opacity: 0.7 }}>
            {dealType}
          </div>
        </div>
        <div>
          <label className="admin-form-label">Backend %</label>
          <div className="admin-form-input" style={{ opacity: 0.7 }}>
            {pct(backendPct)}
          </div>
        </div>
        <div>
          <label className="admin-form-label">Bonus Structure</label>
          <div className="admin-form-input" style={{ opacity: 0.7 }}>
            {settlement.bonus_structure ? JSON.stringify(settlement.bonus_structure) : "—"}
          </div>
        </div>
        <div>
          <label className="admin-form-label">Radius Clause</label>
          <div className="admin-form-input" style={{ opacity: 0.7 }}>
            {settlement.radius_clause || "—"}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          §2  TICKET AUDIT (read-only from sales data)
      ════════════════════════════════════════════ */}
      <h2 style={sectionTitleStyle}>Ticket Audit</h2>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            color: "#fff",
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: "2px solid rgba(208,194,144,0.3)",
                textAlign: "left",
              }}
            >
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Tier</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Capacity</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Sold</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Comps</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Price</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Facility Fee</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Gross</th>
            </tr>
          </thead>
          <tbody>
            {ticketAudit.map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: "6px" }}>{row.tier}</td>
                <td style={{ padding: "6px" }}>{row.capacity}</td>
                <td style={{ padding: "6px" }}>{row.sold}</td>
                <td style={{ padding: "6px" }}>{row.comps}</td>
                <td style={{ padding: "6px" }}>{fmt(row.price)}</td>
                <td style={{ padding: "6px" }}>{fmt(row.facility_fee)}</td>
                <td style={{ padding: "6px", fontWeight: 600 }}>{fmt(row.gross)}</td>
              </tr>
            ))}
            {ticketAudit.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 12, color: "rgba(255,255,255,0.3)" }}>
                  No ticket data
                </td>
              </tr>
            )}
          </tbody>
          {ticketAudit.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: "2px solid rgba(208,194,144,0.3)" }}>
                <td style={{ padding: "8px 6px", fontWeight: 700 }}>Total</td>
                <td style={{ padding: "8px 6px" }}>
                  {ticketAudit.reduce((s, r) => s + r.capacity, 0)}
                </td>
                <td style={{ padding: "8px 6px" }}>
                  {ticketAudit.reduce((s, r) => s + r.sold, 0)}
                </td>
                <td style={{ padding: "8px 6px" }}>
                  {ticketAudit.reduce((s, r) => s + r.comps, 0)}
                </td>
                <td style={{ padding: "8px 6px" }}>—</td>
                <td style={{ padding: "8px 6px" }}>
                  {fmt(ticketAudit.reduce((s, r) => s + r.facility_fee, 0))}
                </td>
                <td style={{ padding: "8px 6px", fontWeight: 700 }}>{fmt(totalGross)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ════════════════════════════════════════════
          §3  FINANCIAL SUMMARY
      ════════════════════════════════════════════ */}
      <h2 style={sectionTitleStyle}>Financial Summary</h2>
      <div style={{ maxWidth: 500 }}>
        <div style={rowStyle}>
          <span style={labelStyle}>Total Gross Receipts</span>
          <span style={valStyle}>{fmt(totalGross)}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Ticketing Fees</span>
          <input
            type="number"
            className="admin-form-input"
            style={{ width: 140, textAlign: "right" }}
            value={ticketingFees}
            onChange={(e) => setTicketingFees(Number(e.target.value))}
            disabled={isFinalized}
          />
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Facility Fees</span>
          <input
            type="number"
            className="admin-form-input"
            style={{ width: 140, textAlign: "right" }}
            value={facilityFees}
            onChange={(e) => setFacilityFees(Number(e.target.value))}
            disabled={isFinalized}
          />
        </div>
        <div style={{ ...rowStyle, borderBottom: "2px solid rgba(208,194,144,0.3)" }}>
          <span style={{ ...labelStyle, fontWeight: 700 }}>Adj. Gross</span>
          <span style={valStyle}>{fmt(adjGross)}</span>
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
          </span>
          <span style={valStyle}>{fmt(taxes)}</span>
        </div>
        <div style={{ ...rowStyle, borderBottom: "2px solid rgba(208,194,144,0.3)" }}>
          <span style={{ ...labelStyle, fontWeight: 700 }}>Net Receipts</span>
          <span style={{ ...valStyle, color: "var(--admin-primary, #d0c290)" }}>
            {fmt(netReceipts)}
          </span>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          §4  EXPENSES
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
                    onChange={(e) =>
                      updateExpense(exp, { category: e.target.value as "fixed" | "variable" })
                    }
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
                      className="admin-form-input"
                      style={{ width: 120, textAlign: "right" }}
                      value={exp.actual_amount}
                      onChange={(e) =>
                        updateExpense(exp, { actual_amount: Number(e.target.value) })
                      }
                      disabled={isFinalized}
                    />
                  )}
                </td>
                <td style={{ padding: "6px" }}>
                  {exp.receipt_url ? (
                    <a
                      href={exp.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--admin-primary, #d0c290)", fontSize: 12 }}
                    >
                      View
                    </a>
                  ) : !isFinalized ? (
                    <button
                      style={{
                        background: "none",
                        border: "1px solid rgba(255,255,255,0.15)",
                        color: "rgba(255,255,255,0.5)",
                        fontSize: 11,
                        padding: "3px 8px",
                        borderRadius: 4,
                        cursor: "pointer",
                      }}
                      onClick={() => uploadReceipt(exp.id)}
                    >
                      Upload
                    </button>
                  ) : (
                    "—"
                  )}
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
              <td colSpan={3} style={{ padding: "8px 6px", fontWeight: 700 }}>
                Total Expenses
              </td>
              <td style={{ padding: "8px 6px", fontWeight: 700 }}>{fmt(totalExpenses)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      {!isFinalized && (
        <button
          className="admin-header-btn"
          style={{ marginTop: 8, fontSize: 13 }}
          onClick={addExpense}
        >
          + Add Expense
        </button>
      )}

      {/* ════════════════════════════════════════════
          §5  DEPOSITS & ADVANCES
      ════════════════════════════════════════════ */}
      <h2 style={sectionTitleStyle}>Deposits &amp; Advances</h2>
      {deposits.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No deposits recorded.</p>
      )}
      {deposits.map((dep) => (
        <div
          key={dep.id}
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            padding: "6px 0",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            flexWrap: "wrap",
          }}
        >
          <select
            className="admin-form-input"
            style={{ width: 140 }}
            value={dep.type}
            onChange={(e) =>
              updateDepositLocal(dep.id, { type: e.target.value as SettlementDeposit["type"] })
            }
            disabled={isFinalized}
          >
            <option value="deposit">Deposit</option>
            <option value="cash_advance">Cash Advance</option>
            <option value="other">Other</option>
          </select>
          <input
            type="number"
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
            <a
              href={dep.receipt_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--admin-primary, #d0c290)", fontSize: 12 }}
            >
              Receipt
            </a>
          ) : !isFinalized ? (
            <button
              style={{
                background: "none",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "rgba(255,255,255,0.5)",
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 4,
                cursor: "pointer",
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
        <span style={labelStyle}>Total Deposits Paid</span>
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
          §6  SETTLEMENT CALCULATION
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
        {(dealType === "VS" || dealType === "PLUS") && (
          <div style={rowStyle}>
            <span style={labelStyle}>Artist Backend ({pct(backendPct)})</span>
            <span style={valStyle}>{fmt(artistBackend)}</span>
          </div>
        )}
        <div style={rowStyle}>
          <span style={labelStyle}>Guarantee</span>
          <span style={valStyle}>{fmt(guarantee)}</span>
        </div>
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
        <div
          style={{
            ...rowStyle,
            borderBottom: "3px solid var(--admin-primary, #d0c290)",
            paddingBottom: 10,
          }}
        >
          <span style={{ ...labelStyle, fontWeight: 700, fontSize: 16 }}>Balance Due</span>
          <span
            style={{
              ...valStyle,
              fontSize: 18,
              color: balanceDue >= 0 ? "var(--admin-primary, #d0c290)" : "#ff9a9a",
            }}
          >
            {fmt(balanceDue)}
          </span>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          §7  ANCILLARY REVENUE (venue settlement)
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
              className="admin-form-input"
              value={field.value}
              onChange={(e) => field.setter(Number(e.target.value))}
              disabled={isFinalized}
            />
          </div>
        ))}
      </div>

      {/* Other ancillary items */}
      {otherAncillary.map((item, idx) => (
        <div
          key={idx}
          style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}
        >
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

      {/* Venue P&L summary */}
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
        <div
          style={{
            ...rowStyle,
            borderBottom: "3px solid var(--admin-primary, #d0c290)",
            paddingBottom: 10,
          }}
        >
          <span style={{ ...labelStyle, fontWeight: 700, fontSize: 16 }}>Venue Net Profit</span>
          <span
            style={{
              ...valStyle,
              fontSize: 18,
              color: venueNetProfit >= 0 ? "#7ddb7d" : "#ff9a9a",
            }}
          >
            {fmt(venueNetProfit)}
          </span>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          §8  ACTIONS
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
        <button
          className="admin-header-btn"
          onClick={exportArtistPDF}
          style={{ padding: "10px 20px" }}
        >
          Export Artist Settlement PDF
        </button>
        <button
          className="admin-header-btn"
          onClick={exportVenuePDF}
          style={{ padding: "10px 20px" }}
        >
          Export Venue Settlement PDF
        </button>
      </div>
    </div>
  );
}
