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
  MerchItem,
  MerchSellerFeePayer,
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

  // ── FEE / TAX values ──────────────────────────────────────────────
  // These are NOT user-editable — they're pulled from event/venue config
  // and aggregated by the audit endpoint. Stored in state so the financial
  // summary + PDF have a stable reference between refreshes/saves.
  const [ticketingFees, setTicketingFees] = useState(0);
  const [facilityFees, setFacilityFees] = useState(0);
  const [ccFees, setCcFees] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  // Tax method is the only thing the user can flip on the settlement (some
  // venues run tax-inclusive pricing); rate itself comes from venue config.
  const [taxMethod, setTaxMethod] = useState<TaxMethod>("multiplier");

  // Per-ticket rate snapshots (display-only)
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

  // ── Merch Settlement ─────────────────────────────────────────────
  const [merchItems, setMerchItems] = useState<MerchItem[]>([]);
  const [merchSplitVenuePct, setMerchSplitVenuePct] = useState(0);
  const [merchTaxRate, setMerchTaxRate] = useState(0);
  const [merchTaxMethod, setMerchTaxMethod] = useState<TaxMethod>("multiplier");
  const [merchSellerFee, setMerchSellerFee] = useState(0);
  const [merchSellerFeePayer, setMerchSellerFeePayer] =
    useState<MerchSellerFeePayer>("venue");

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

    // Merch
    setMerchItems(Array.isArray(data.merch_items) ? data.merch_items : []);
    setMerchSplitVenuePct(Number(data.merch_split_venue_pct) || 0);
    setMerchTaxRate(Number(data.merch_tax_rate) || 0);
    setMerchTaxMethod((data.merch_tax_method as TaxMethod) || "multiplier");
    setMerchSellerFee(Number(data.merch_seller_fee) || 0);
    setMerchSellerFeePayer(
      (data.merch_seller_fee_payer as MerchSellerFeePayer) || "venue"
    );
  }, []);

  /* ─── Load data ─── */
  //
  // When the settlement is in DRAFT, we silently re-pull the audit from
  // orders on every page load so the displayed numbers always reflect
  // current sales (no stale snapshot). FINALIZED settlements keep their
  // saved snapshot — that's the whole point of finalization.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const initial = await fetch(`/api/settlements/${id}`).then((r) => r.json());
        if (!active) return;
        if (initial.error) {
          setError(initial.error);
          return;
        }
        hydrate(initial);
        setExpenses(initial.expenses || []);
        setDeposits(initial.deposits || []);

        if (initial.status === "draft") {
          // Silent refresh-from-orders so the audit + fee totals are live.
          try {
            const refreshed = await fetch(`/api/settlements/${id}/refresh`, {
              method: "POST",
            }).then((r) => r.json());
            if (active && refreshed && !refreshed.error) {
              hydrate(refreshed);
              // Refresh endpoint may have created/updated the auto CC expense.
              if (Array.isArray(refreshed.expenses)) setExpenses(refreshed.expenses);
              if (Array.isArray(refreshed.deposits)) setDeposits(refreshed.deposits);
            }
          } catch {
            // network error — keep the stored snapshot
          }
        }
      } catch {
        if (active) setError("Failed to load settlement");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
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

  // Tax: honor the chosen method.
  //   • multiplier → tax was added on top:         tax = totalGross × rate
  //   • divisor    → totalGross is tax-inclusive:  tax = totalGross − totalGross / (1 + rate)
  // (Apply to face-value gross, not adj_gross — service/facility fees are
  // typically not taxable line items.)
  const taxes =
    taxMethod === "divisor" && taxRate > 0
      ? totalGross - totalGross / (1 + taxRate)
      : totalGross * taxRate;
  const netReceipts = adjGross - taxes;

  const totalExpenses = expenses.reduce((s, e) => s + (e.actual_amount || 0), 0);
  // Default splitpoint = net receipts − expenses (the dollar pool above the
  // breakeven). User can override with a fixed contracted figure.
  const computedSplitpoint = netReceipts - totalExpenses;
  const splitpoint = splitpointInput > 0 ? splitpointInput : computedSplitpoint;

  // Artist payment math, deal-type aware
  // For VS / PLUS: artist earns backend% on revenue ABOVE splitpoint.
  // The "splitpoint" itself is the threshold (revenue is "above" it when
  // net − expenses exceeds the contracted floor). When splitpointInput is
  // a fixed number (e.g. $10,000), artistBackend = (net − expenses − splitpoint) × pct.
  const artistBackend = (() => {
    if (dealType === "VS" || dealType === "PLUS") {
      if (splitpointInput > 0) {
        // Fixed contracted splitpoint — artist gets pct of revenue ABOVE it.
        const overage = computedSplitpoint - splitpointInput;
        return overage > 0 ? overage * backendPctInput : 0;
      }
      // Auto splitpoint — artist gets pct of (net − expenses) when positive.
      return computedSplitpoint > 0 ? computedSplitpoint * backendPctInput : 0;
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

  // ── Merch math ────────────────────────────────────────────────────
  const merchTotalGross = merchItems.reduce(
    (sum, item) => sum + (Number(item.gross) || 0),
    0
  );
  const merchTotalTax =
    merchTaxMethod === "divisor" && merchTaxRate > 0
      ? merchTotalGross - merchTotalGross / (1 + merchTaxRate)
      : merchTotalGross * merchTaxRate;
  const merchTotalNet = merchTotalGross - merchTotalTax;
  const merchVenueShare = merchTotalNet * merchSplitVenuePct;
  const merchArtistShare = merchTotalNet - merchVenueShare;

  // Merch seller fee — eaten by venue or artist depending on contract.
  const artistPaidMerchSellerFee =
    merchSellerFeePayer === "artist" ? merchSellerFee : 0;
  const venuePaidMerchSellerFee =
    merchSellerFeePayer === "venue" ? merchSellerFee : 0;

  // Balance due:
  //   Artist Total (from ticket deal)
  //   − Deposits
  //   − Cash Advances
  //   − Venue Merch Share (artist owes venue this from their merch)
  //   − Artist-paid Merch Seller Fee (if contract puts it on the artist)
  const balanceDue =
    artistTotal -
    totalDeposits -
    totalCashAdvances -
    merchVenueShare -
    artistPaidMerchSellerFee;

  // Ancillary
  // NOTE: `merchCommission` is the legacy single-number merch field. Once a
  // settlement has `merchItems`, the `merchVenueShare` is the source of truth
  // and we ignore the legacy number to avoid double-counting.
  const totalOtherAncillary = otherAncillary.reduce((s, i) => s + (i.amount || 0), 0);
  const legacyMerchCommission = merchItems.length > 0 ? 0 : merchCommission;
  const totalAncillary =
    barRevenue + concessionsRevenue + legacyMerchCommission + ticketingRebate +
    parkingRevenue + sponsorshipRevenue + totalOtherAncillary +
    merchVenueShare; // merch venue share is venue revenue
  const venueNetProfit =
    netReceipts +
    totalAncillary -
    totalExpenses -
    venuePaidMerchSellerFee - // merch seller fee (if venue eats it) is a venue cost
    artistTotal +
    // Add back the merch venue share + artist-paid seller fee that already
    // reduced balanceDue above — those are not artist-side costs to the venue.
    artistPaidMerchSellerFee;

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
      if (Array.isArray(data.expenses)) setExpenses(data.expenses);
      if (Array.isArray(data.deposits)) setDeposits(data.deposits);
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

      // Merch
      merch_items: merchItems,
      merch_split_venue_pct: merchSplitVenuePct,
      merch_tax_rate: merchTaxRate,
      merch_tax_method: merchTaxMethod,
      merch_seller_fee: merchSellerFee,
      merch_seller_fee_payer: merchSellerFeePayer,
      merch_total_gross: merchTotalGross,
      merch_total_tax: merchTotalTax,
      merch_total_net: merchTotalNet,
      merch_venue_share: merchVenueShare,
      merch_artist_share: merchArtistShare,
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

      // Merch
      merch_items: merchItems,
      merch_split_venue_pct: merchSplitVenuePct,
      merch_tax_rate: merchTaxRate,
      merch_tax_method: merchTaxMethod,
      merch_seller_fee: merchSellerFee,
      merch_seller_fee_payer: merchSellerFeePayer,
      merch_total_gross: merchTotalGross,
      merch_total_tax: merchTotalTax,
      merch_total_net: merchTotalNet,
      merch_venue_share: merchVenueShare,
      merch_artist_share: merchArtistShare,
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

  /* ─── Merch Item CRUD ─── */
  const addMerchItem = () =>
    setMerchItems((prev) => [...prev, { name: "", units_sold: 0, unit_price: 0, gross: 0 }]);
  const updateMerchItem = (idx: number, updates: Partial<MerchItem>) =>
    setMerchItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const merged = { ...item, ...updates };
        // Auto-recompute gross if units or price change and the user didn't type
        // a manual gross override in this update.
        if (("units_sold" in updates || "unit_price" in updates) && !("gross" in updates)) {
          merged.gross = (Number(merged.units_sold) || 0) * (Number(merged.unit_price) || 0);
        }
        return merged;
      })
    );
  const removeMerchItem = (idx: number) =>
    setMerchItems((prev) => prev.filter((_, i) => i !== idx));

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
          <label className="admin-form-label">
            Splitpoint Override ($)
            <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400, fontSize: 11, marginLeft: 6 }}>
              optional
            </span>
          </label>
          <input
            type="number"
            step="0.01"
            className="admin-form-input"
            value={splitpointInput}
            onChange={(e) => setSplitpointInput(Number(e.target.value))}
            disabled={isFinalized}
            placeholder="Leave 0 to auto-compute (net receipts − expenses)"
          />
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, margin: "4px 0 0", lineHeight: 1.4 }}>
            For VS / PLUS / DOOR deals. The dollar threshold above which the
            artist starts earning backend. Default is auto-computed as
            <em> net receipts − expenses</em>. Override only if the contract
            specifies a fixed splitpoint (e.g. &ldquo;artist gets 85% above
            $10,000&rdquo;).
          </p>
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
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)", textAlign: "right" }}>Cap</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)", textAlign: "right" }}>Sold</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)", textAlign: "right" }}>Comps</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)", textAlign: "right" }}>% House</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)", textAlign: "right" }}>Face Price</th>
              <th
                style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)", textAlign: "right" }}
                title="Face × sold = what the artist split is calculated on."
              >
                Face Revenue
              </th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)", textAlign: "right" }}>Svc Fee</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)", textAlign: "right" }}>Fac Fee</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)", textAlign: "right" }}>Tax</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)", textAlign: "right" }}>CC Fee</th>
              <th
                style={{ padding: "8px 6px", color: "rgba(208,194,144,0.7)", textAlign: "right" }}
                title="Face + Svc + Fac + Tax + CC — matches your Stripe dashboard."
              >
                Gross (Stripe)
              </th>
            </tr>
          </thead>
          <tbody>
            {ticketAudit.map((row, i) => {
              const pctHouse = row.capacity > 0 ? (row.sold / row.capacity) * 100 : 0;
              const svcFeeTotal = (row.ticketing_fee || 0) * row.sold;
              const facFeeTotal = (row.facility_fee || 0) * row.sold;
              const tierTax =
                taxMethod === "divisor" && taxRate > 0
                  ? row.gross - row.gross / (1 + taxRate)
                  : row.gross * taxRate;
              const totalSold = auditTotals.sold || 1;
              const tierCcShare = ccFees * (row.sold / totalSold);
              const stripeGross =
                row.gross + svcFeeTotal + facFeeTotal + tierTax + tierCcShare;
              return (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <td style={{ padding: "6px" }}>{row.tier}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{row.capacity}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{row.sold}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{row.comps}</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{pctHouse.toFixed(1)}%</td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{fmt(row.price)}</td>
                  <td style={{ padding: "6px", textAlign: "right", fontWeight: 600 }}>{fmt(row.gross)}</td>
                  <td
                    style={{ padding: "6px", textAlign: "right" }}
                    title={`${fmt(row.ticketing_fee || 0)} × ${row.sold} tickets`}
                  >
                    {fmt(svcFeeTotal)}
                  </td>
                  <td
                    style={{ padding: "6px", textAlign: "right" }}
                    title={`${fmt(row.facility_fee || 0)} × ${row.sold} tickets`}
                  >
                    {fmt(facFeeTotal)}
                  </td>
                  <td style={{ padding: "6px", textAlign: "right" }}>{fmt(tierTax)}</td>
                  <td
                    style={{ padding: "6px", textAlign: "right" }}
                    title="Stripe processing fees apportioned by tier sold count"
                  >
                    {fmt(tierCcShare)}
                  </td>
                  <td style={{ padding: "6px", textAlign: "right", fontWeight: 700, color: "var(--admin-primary, #d0c290)" }}>
                    {fmt(stripeGross)}
                  </td>
                </tr>
              );
            })}
            {ticketAudit.length === 0 && (
              <tr>
                <td colSpan={12} style={{ padding: 12, color: "rgba(255,255,255,0.3)" }}>
                  No ticket data — click &ldquo;Refresh from Orders&rdquo; to pull live sales.
                </td>
              </tr>
            )}
          </tbody>
          {ticketAudit.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: "2px solid rgba(208,194,144,0.3)" }}>
                <td style={{ padding: "8px 6px", fontWeight: 700 }}>Total</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{auditTotals.capacity}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{auditTotals.sold}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{auditTotals.comps}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>
                  {auditTotals.capacity > 0
                    ? ((auditTotals.sold / auditTotals.capacity) * 100).toFixed(1) + "%"
                    : "—"}
                </td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>—</td>
                <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 700 }}>{fmt(totalGross)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 700 }}>{fmt(ticketingFees)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 700 }}>{fmt(facilityFees)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 700 }}>{fmt(taxes)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 700 }}>{fmt(ccFees)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 700, color: "var(--admin-primary, #d0c290)" }}>
                  {fmt(totalCustomerPaid)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Stripe Collected Breakdown ────────────────────────────────── */}
      {ticketAudit.length > 0 && (
        <div style={{ background: "rgba(208,194,144,0.06)", border: "1px solid rgba(208,194,144,0.2)", borderRadius: 6, padding: "16px 18px", margin: "18px 0 8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 600 }}>
              Stripe Collected (Gross)
            </span>
            <span style={{ color: "#d0c290", fontSize: 22, fontWeight: 700 }}>
              {fmt(totalCustomerPaid)}
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, margin: "0 0 12px" }}>
            This is what your Stripe dashboard shows for this event. Below is the per-fee breakdown of where it came from.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 24px", fontSize: 13 }}>
            <span style={{ color: "rgba(255,255,255,0.7)" }}>
              Face Value Revenue <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>(artist split base)</span>
            </span>
            <span style={{ textAlign: "right", color: "#fff", fontWeight: 600 }}>{fmt(totalGross)}</span>

            <span style={{ color: "rgba(255,255,255,0.7)" }}>
              Service Fees Collected <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
                ({fmt(ticketingFeePerTicket)}/ticket × {ticketsSold})
              </span>
            </span>
            <span style={{ textAlign: "right", color: "#fff", fontWeight: 600 }}>{fmt(ticketingFees)}</span>

            <span style={{ color: "rgba(255,255,255,0.7)" }}>
              Facility Fees Collected <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
                ({fmt(facilityFeePerTicket)}/ticket × {ticketsSold})
              </span>
            </span>
            <span style={{ textAlign: "right", color: "#fff", fontWeight: 600 }}>{fmt(facilityFees)}</span>

            <span style={{ color: "rgba(255,255,255,0.7)" }}>
              Tax Collected <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
                ({(taxRate * 100).toFixed(2)}%, {taxMethod === "divisor" ? "divided out" : "added on top"})
              </span>
            </span>
            <span style={{ textAlign: "right", color: "#fff", fontWeight: 600 }}>{fmt(taxes)}</span>

            <span style={{ color: "rgba(255,255,255,0.7)" }}>
              CC Processing Fees <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
                (Stripe ~2.9% + $0.30/order)
              </span>
            </span>
            <span style={{ textAlign: "right", color: "#fff", fontWeight: 600 }}>{fmt(ccFees)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(208,194,144,0.25)", marginTop: 12, paddingTop: 10 }}>
            <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: 700 }}>
              Sum of above
            </span>
            <span style={{ color: "#d0c290", fontSize: 14, fontWeight: 700 }}>
              {fmt(totalCustomerPaid)}
            </span>
          </div>
        </div>
      )}
      <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 6 }}>
        Comps are listed for inventory accuracy but excluded from the gross.
        {compCount > 0 && (
          <> Comp face value of <strong>{fmt(settlement.comp_face_value || 0)}</strong> across {compCount} ticket{compCount === 1 ? "" : "s"} is informational only.</>
        )}
      </p>

      {/* ════════════════════════════════════════════
          §3  TAX CONFIG (read-only summary; values come from event/venue)
      ════════════════════════════════════════════ */}
      <div style={{ background: "rgba(208,194,144,0.06)", border: "1px solid rgba(208,194,144,0.18)", borderRadius: 6, padding: "12px 16px", margin: "16px 0" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center", fontSize: 13 }}>
          <span style={{ color: "rgba(255,255,255,0.55)" }}>
            Service fees, facility fees, and tax are pulled from this event&rsquo;s venue config and are
            <strong style={{ color: "#d0c290" }}> not editable here</strong>. Edit them in
            Admin → Venues. CC processing fee appears as an auto-expense below.
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center", fontSize: 13, marginTop: 12 }}>
          <div>
            <span style={{ color: "rgba(255,255,255,0.55)" }}>Service Fee:</span>{" "}
            <strong>{fmt(ticketingFeePerTicket)}</strong>{" "}
            <span style={{ color: "rgba(255,255,255,0.35)" }}>per ticket</span>
          </div>
          <div>
            <span style={{ color: "rgba(255,255,255,0.55)" }}>Facility Fee:</span>{" "}
            <strong>{fmt(facilityFeePerTicket)}</strong>{" "}
            <span style={{ color: "rgba(255,255,255,0.35)" }}>per ticket</span>
          </div>
          <div>
            <span style={{ color: "rgba(255,255,255,0.55)" }}>Tax Rate:</span>{" "}
            <strong>{(taxRate * 100).toFixed(2)}%</strong>{" "}
            <select
              className="admin-form-input"
              style={{ width: 150, marginLeft: 8, display: "inline" }}
              value={taxMethod}
              onChange={(e) => setTaxMethod(e.target.value as TaxMethod)}
              disabled={isFinalized}
              title="How the venue applies tax: added on top of face price (default) or already included in face price"
            >
              <option value="multiplier">Add on top</option>
              <option value="divisor">Divide out (incl.)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          §4  FINANCIAL SUMMARY
          Two walks:
            1. Stripe Reconciliation — Gross (Stripe) → Face Value
            2. Artist Settlement Math — Face Value → Net Receipts (split base)
      ════════════════════════════════════════════ */}
      <h2 style={sectionTitleStyle}>Financial Summary</h2>

      <div style={{ maxWidth: 560 }}>
        <div style={rowStyle}>
          <span style={labelStyle}>Tickets Sold (paying)</span>
          <span style={valStyle}>{ticketsSold}</span>
        </div>
      </div>

      {/* ── Walk 1: Stripe → Face Value ───────────────────────────── */}
      <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", margin: "20px 0 8px" }}>
        Stripe Reconciliation
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: 400, textTransform: "none", marginLeft: 8 }}>
          (matches your Stripe dashboard)
        </span>
      </p>
      <div style={{ maxWidth: 560 }}>
        <div style={{ ...rowStyle, borderBottom: "2px solid rgba(208,194,144,0.3)" }}>
          <span style={{ ...labelStyle, fontWeight: 700 }}>Gross (Stripe Collected)</span>
          <span style={{ ...valStyle, color: "var(--admin-primary, #d0c290)" }}>
            {fmt(totalCustomerPaid)}
          </span>
        </div>
        <div style={rowStyle}>
          <span style={{ ...labelStyle, paddingLeft: 12 }}>− Service Fees Collected</span>
          <span style={valStyle}>({fmt(ticketingFees)})</span>
        </div>
        <div style={rowStyle}>
          <span style={{ ...labelStyle, paddingLeft: 12 }}>− Facility Fees Collected</span>
          <span style={valStyle}>({fmt(facilityFees)})</span>
        </div>
        <div style={rowStyle}>
          <span style={{ ...labelStyle, paddingLeft: 12 }}>
            − Tax Collected ({(taxRate * 100).toFixed(2)}%
            {taxMethod === "divisor" ? ", divided out" : ", added on top"})
          </span>
          <span style={valStyle}>({fmt(taxes)})</span>
        </div>
        <div style={rowStyle}>
          <span style={{ ...labelStyle, paddingLeft: 12 }}>− CC / Processing Fees</span>
          <span style={valStyle}>({fmt(ccFees)})</span>
        </div>
        <div style={{ ...rowStyle, borderBottom: "2px solid rgba(208,194,144,0.3)" }}>
          <span style={{ ...labelStyle, fontWeight: 700 }}>= Face Value Revenue</span>
          <span style={valStyle}>{fmt(totalGross)}</span>
        </div>
      </div>

      {/* ── Walk 2: Face → Net (artist split base) ───────────────── */}
      <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", margin: "20px 0 8px" }}>
        Artist Settlement Math
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: 400, textTransform: "none", marginLeft: 8 }}>
          (face-value anchor — feeds the artist split below)
        </span>
      </p>
      <div style={{ maxWidth: 560 }}>
        <div style={{ ...rowStyle, borderBottom: "2px solid rgba(208,194,144,0.3)" }}>
          <span style={{ ...labelStyle, fontWeight: 700 }}>Face Value Revenue</span>
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
            − Tax ({(taxRate * 100).toFixed(2)}%)
          </span>
          <span style={valStyle}>({fmt(taxes)})</span>
        </div>
        <div style={{ ...rowStyle, borderBottom: "3px solid var(--admin-primary, #d0c290)", paddingBottom: 10 }}>
          <span style={{ ...labelStyle, fontWeight: 700, fontSize: 16 }}>= Net Receipts (artist split base)</span>
          <span style={{ ...valStyle, fontSize: 18, color: "var(--admin-primary, #d0c290)" }}>
            {fmt(netReceipts)}
          </span>
        </div>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, margin: "8px 0 0", lineHeight: 1.5 }}>
          Service / Facility fees and tax are pass-throughs (collected from the customer once, shown above for transparency). They&rsquo;re subtracted from face value here because the artist deal is calculated on what&rsquo;s left after the venue has paid those out — standard industry convention.
        </p>
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
          §6.5  MERCH SETTLEMENT
      ════════════════════════════════════════════ */}
      <h2 style={sectionTitleStyle}>Merch Settlement</h2>
      <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: -8, marginBottom: 8 }}>
        Track merch sold at the show, the contracted split, and the cost of running merch.
        The venue&rsquo;s share is deducted from the artist&rsquo;s balance due below.
      </p>

      {/* Merch items table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: "#fff" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid rgba(208,194,144,0.3)", textAlign: "left" }}>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Item</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Units Sold</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Unit Price</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Gross (incl. tax if divisor)</th>
              <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}></th>
            </tr>
          </thead>
          <tbody>
            {merchItems.map((item, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={{ padding: "6px" }}>
                  <input
                    className="admin-form-input"
                    style={{ width: "100%", minWidth: 140 }}
                    value={item.name}
                    onChange={(e) => updateMerchItem(idx, { name: e.target.value })}
                    disabled={isFinalized}
                    placeholder="e.g. T-Shirt, Hoodie, Vinyl"
                  />
                </td>
                <td style={{ padding: "6px" }}>
                  <input
                    type="number"
                    className="admin-form-input"
                    style={{ width: 90, textAlign: "right" }}
                    value={item.units_sold}
                    onChange={(e) => updateMerchItem(idx, { units_sold: Number(e.target.value) })}
                    disabled={isFinalized}
                  />
                </td>
                <td style={{ padding: "6px" }}>
                  <input
                    type="number"
                    step="0.01"
                    className="admin-form-input"
                    style={{ width: 100, textAlign: "right" }}
                    value={item.unit_price}
                    onChange={(e) => updateMerchItem(idx, { unit_price: Number(e.target.value) })}
                    disabled={isFinalized}
                  />
                </td>
                <td style={{ padding: "6px" }}>
                  <input
                    type="number"
                    step="0.01"
                    className="admin-form-input"
                    style={{ width: 120, textAlign: "right" }}
                    value={item.gross}
                    onChange={(e) => updateMerchItem(idx, { gross: Number(e.target.value) })}
                    disabled={isFinalized}
                    title="Auto-calculated from units × price; edit to override (e.g. discounts, bundles)"
                  />
                </td>
                <td style={{ padding: "6px" }}>
                  {!isFinalized && (
                    <button
                      className="admin-sponsor-delete-btn"
                      onClick={() => removeMerchItem(idx)}
                      style={{ fontSize: 11 }}
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {merchItems.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 12, color: "rgba(255,255,255,0.3)" }}>
                  No merch sold. Click &ldquo;+ Add Merch Item&rdquo; to record sales.
                </td>
              </tr>
            )}
          </tbody>
          {merchItems.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: "2px solid rgba(208,194,144,0.3)" }}>
                <td colSpan={3} style={{ padding: "8px 6px", fontWeight: 700 }}>Total Gross Merch</td>
                <td style={{ padding: "8px 6px", fontWeight: 700 }}>{fmt(merchTotalGross)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!isFinalized && (
        <button className="admin-header-btn" style={{ marginTop: 8, fontSize: 13 }} onClick={addMerchItem}>
          + Add Merch Item
        </button>
      )}

      {/* Deal terms for merch */}
      <div className="admin-form-grid" style={{ marginTop: 16 }}>
        <div>
          <label className="admin-form-label">
            Venue Split % (decimal — e.g. 0.20 = 20%)
          </label>
          <input
            type="number"
            step="0.01"
            className="admin-form-input"
            value={merchSplitVenuePct}
            onChange={(e) => setMerchSplitVenuePct(Number(e.target.value))}
            disabled={isFinalized}
          />
        </div>
        <div>
          <label className="admin-form-label">Merch Sales Tax Rate (decimal)</label>
          <input
            type="number"
            step="0.001"
            className="admin-form-input"
            value={merchTaxRate}
            onChange={(e) => setMerchTaxRate(Number(e.target.value))}
            disabled={isFinalized}
            placeholder="0.095 = 9.5%"
          />
        </div>
        <div>
          <label className="admin-form-label">Tax Method</label>
          <select
            className="admin-form-input"
            value={merchTaxMethod}
            onChange={(e) => setMerchTaxMethod(e.target.value as TaxMethod)}
            disabled={isFinalized}
          >
            <option value="multiplier">Add on top (gross is pre-tax)</option>
            <option value="divisor">Divide out (gross is tax-incl.)</option>
          </select>
        </div>
        <div>
          <label className="admin-form-label">Merch Seller Fee ($)</label>
          <input
            type="number"
            step="0.01"
            className="admin-form-input"
            value={merchSellerFee}
            onChange={(e) => setMerchSellerFee(Number(e.target.value))}
            disabled={isFinalized}
            placeholder="Cost to hire merch seller for the night"
          />
        </div>
        <div>
          <label className="admin-form-label">Merch Seller Fee Paid By</label>
          <select
            className="admin-form-input"
            value={merchSellerFeePayer}
            onChange={(e) => setMerchSellerFeePayer(e.target.value as MerchSellerFeePayer)}
            disabled={isFinalized}
          >
            <option value="venue">Venue (counts as venue expense)</option>
            <option value="artist">Artist (deducted from balance due)</option>
          </select>
        </div>
      </div>

      {/* Merch math summary */}
      <div style={{ maxWidth: 540, marginTop: 16 }}>
        <div style={rowStyle}>
          <span style={labelStyle}>Total Gross Merch</span>
          <span style={valStyle}>{fmt(merchTotalGross)}</span>
        </div>
        <div style={rowStyle}>
          <span style={{ ...labelStyle, paddingLeft: 12 }}>
            − Sales Tax ({(merchTaxRate * 100).toFixed(2)}%
            {merchTaxMethod === "divisor" ? ", divided out" : ", added on top"})
          </span>
          <span style={valStyle}>({fmt(merchTotalTax)})</span>
        </div>
        <div style={{ ...rowStyle, borderBottom: "2px solid rgba(208,194,144,0.3)" }}>
          <span style={{ ...labelStyle, fontWeight: 700 }}>= Net Merch Sales</span>
          <span style={valStyle}>{fmt(merchTotalNet)}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>
            Venue Share ({(merchSplitVenuePct * 100).toFixed(1)}% of net)
          </span>
          <span style={{ ...valStyle, color: "var(--admin-primary, #d0c290)" }}>
            {fmt(merchVenueShare)}
          </span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Artist Share</span>
          <span style={valStyle}>{fmt(merchArtistShare)}</span>
        </div>
        {merchSellerFee > 0 && (
          <div style={rowStyle}>
            <span style={labelStyle}>
              Merch Seller Fee (paid by {merchSellerFeePayer})
            </span>
            <span style={valStyle}>{fmt(merchSellerFee)}</span>
          </div>
        )}
        <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(208,194,144,0.08)", borderRadius: 4, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
          <strong style={{ color: "#d0c290" }}>Owed to venue from artist:</strong>
          {" "}{fmt(merchVenueShare + artistPaidMerchSellerFee)}
          {artistPaidMerchSellerFee > 0 && (
            <> ({fmt(merchVenueShare)} venue share + {fmt(artistPaidMerchSellerFee)} seller fee)</>
          )}
          {" — deducted from Balance Due below."}
        </div>
      </div>

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
        {merchVenueShare > 0 && (
          <div style={rowStyle}>
            <span style={labelStyle}>– Venue Merch Share</span>
            <span style={valStyle}>{fmt(merchVenueShare)}</span>
          </div>
        )}
        {artistPaidMerchSellerFee > 0 && (
          <div style={rowStyle}>
            <span style={labelStyle}>– Merch Seller Fee (artist-paid)</span>
            <span style={valStyle}>{fmt(artistPaidMerchSellerFee)}</span>
          </div>
        )}
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
