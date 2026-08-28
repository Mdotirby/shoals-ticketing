import type { Settlement, TaxMethod } from "@/lib/types/settlement";

type ExpenseInput = { name: string; category: string; actual_amount: number };
type DepositInput = { type: string; amount: number; date?: string; notes?: string };

type TicketAuditRowOut = {
  tier: string;
  capacity: number;
  sold: number;
  comps: number;
  unsold: number;
  price: number;
  svc: number;
  fac: number;
  tax: number;
  cc: number;
  gross: number;
};

export type SettlementReportData = {
  artist_name: string;
  event_date_label: string;
  created_on_label: string;
  deal_type: string;
  guarantee: number;
  backend_percentage_label: string;

  ticket_audit: TicketAuditRowOut[];
  ticket_totals_capacity: number;
  ticket_totals_sold: number;
  ticket_totals_comps: number;
  ticket_totals_unsold: number;
  ticket_totals_svc: number;
  ticket_totals_fac: number;
  ticket_totals_tax: number;
  ticket_totals_cc: number;
  ticket_totals_gross: number;

  gross_receipts: number;
  ticketing_fees: number;
  facility_fees: number;
  tax_label: string;
  taxes: number;
  cc_fees: number;
  net_receipts: number;

  expenses_fixed: { name: string; amount: number }[];
  expenses_fixed_total: number;
  expenses_variable: { name: string; amount: number }[];
  expenses_variable_total: number;
  total_expenses: number;

  merch_total_gross: number;
  merch_tax_label: string;
  merch_total_tax: number;
  merch_total_net: number;
  merch_venue_take_label: string;
  merch_venue_share: number;
  merch_venue_take_deduction: number;
  merch_artist_share: number;

  artist_deduction_lines: { label: string; value: number }[];
  artist_backend: number;
  balance_due: number;
};

function pct(rate: number, digits = 2): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

function taxMethodLabel(method: TaxMethod | undefined): string {
  return method === "divisor" ? "Divisor" : "Multiplier";
}

/**
 * Settlement (+ its expenses/deposits) -> the flat shape
 * lib/pdf-templates/settlement-report/manifest.json's fields expect.
 *
 * Every formula here is copied from the existing jsPDF renderer
 * (lib/pdf/settlement-pdf.ts) so the new design shows the exact same
 * numbers as the old one -- this function does not introduce any new
 * business logic, only reformats already-computed values (and the one
 * field, `unsold`, that's genuinely new to this design).
 */
export function buildSettlementReportData(
  settlement: Settlement,
  expenses: ExpenseInput[],
  _deposits: DepositInput[] // accepted for parity with the old export signature; unused -- deposit_paid/cash_advance already arrive pre-aggregated on `settlement`
): SettlementReportData {
  // ---- Ticket audit rows: exact formula from settlement-pdf.ts:170-202 ----
  const rows = settlement.ticket_audit || [];
  const totalSoldAll = rows.reduce((s, r) => s + (r.sold || 0), 0) || 1;
  const taxRate = settlement.tax_rate || 0;
  const taxMethod = settlement.tax_method;
  const ccFeesTotal = settlement.cc_fees || 0;

  let tCap = 0, tSold = 0, tComps = 0, tUnsold = 0, tSvc = 0, tFac = 0, tTax = 0, tCc = 0, tGross = 0;
  const ticket_audit: TicketAuditRowOut[] = rows.map((r) => {
    const capacity = r.capacity || 0;
    const sold = r.sold || 0;
    const comps = r.comps || 0;
    const unsold = Math.max(0, capacity - sold - comps);
    const gross = r.gross || 0;
    const svc = (r.ticketing_fee || 0) * sold;
    const fac = (r.facility_fee || 0) * sold;
    const tax =
      taxMethod === "divisor" && taxRate > 0
        ? gross - gross / (1 + taxRate)
        : gross * taxRate;
    const cc = ccFeesTotal * (sold / totalSoldAll);
    const rowGross = gross + svc + fac + tax + cc;

    tCap += capacity;
    tSold += sold;
    tComps += comps;
    tUnsold += unsold;
    tSvc += svc;
    tFac += fac;
    tTax += tax;
    tCc += cc;
    tGross += rowGross;

    return { tier: r.tier, capacity, sold, comps, unsold, price: r.price || 0, svc, fac, tax, cc, gross: rowGross };
  });

  // ---- Expenses: split by category, matches settlement-pdf.ts:289-306 ----
  const expenses_fixed = expenses
    .filter((e) => e.category === "fixed")
    .map((e) => ({ name: e.name, amount: e.actual_amount || 0 }));
  const expenses_variable = expenses
    .filter((e) => e.category === "variable")
    .map((e) => ({ name: e.name, amount: e.actual_amount || 0 }));
  const expenses_fixed_total = expenses_fixed.reduce((s, e) => s + e.amount, 0);
  const expenses_variable_total = expenses_variable.reduce((s, e) => s + e.amount, 0);

  // ---- Conditional deduction lines: matches settlement-pdf.ts:415-418 ----
  const artist_deduction_lines: { label: string; value: number }[] = [];
  if ((settlement.deposit_paid || 0) > 0) {
    artist_deduction_lines.push({ label: "Deposits Paid", value: settlement.deposit_paid });
  }
  if ((settlement.cash_advance || 0) > 0) {
    artist_deduction_lines.push({ label: "Cash Advances", value: settlement.cash_advance });
  }

  // ---- Header / deal terms ----
  // Matches settlement-pdf.ts:484-488 exactly, including the T12:00:00 anchor
  // -- parsing a bare "YYYY-MM-DD" as local midnight can display the wrong
  // day in negative-UTC-offset timezones; noon sidesteps that.
  const event_date_label = settlement.event_date
    ? new Date(String(settlement.event_date).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
  const created_on_label = `Created on: ${new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })}`;

  // "Gross Receipts": settlement-pdf.ts:269-271
  const grossReceipts =
    (settlement.total_gross || 0) +
    (settlement.ticketing_fees || 0) +
    (settlement.facility_fees || 0) +
    (settlement.cc_fees || 0) +
    (settlement.taxes || 0);

  return {
    artist_name: settlement.artist_name || "",
    event_date_label,
    created_on_label,
    deal_type: settlement.deal_type || "FLAT",
    guarantee: settlement.guarantee || 0,
    backend_percentage_label: pct(settlement.backend_percentage || 0),

    ticket_audit,
    ticket_totals_capacity: tCap,
    ticket_totals_sold: tSold,
    ticket_totals_comps: tComps,
    ticket_totals_unsold: tUnsold,
    ticket_totals_svc: tSvc,
    ticket_totals_fac: tFac,
    ticket_totals_tax: tTax,
    ticket_totals_cc: tCc,
    ticket_totals_gross: tGross,

    gross_receipts: grossReceipts,
    ticketing_fees: settlement.ticketing_fees || 0,
    facility_fees: settlement.facility_fees || 0,
    tax_label: `Taxes (${pct(taxRate)}, ${taxMethodLabel(taxMethod)})`,
    taxes: settlement.taxes || 0,
    cc_fees: settlement.cc_fees || 0,
    net_receipts: settlement.net_receipts || 0,

    expenses_fixed,
    expenses_fixed_total,
    expenses_variable,
    expenses_variable_total,
    total_expenses: expenses_fixed_total + expenses_variable_total,

    merch_total_gross: settlement.merch_total_gross || 0,
    merch_tax_label: `Sales Tax (${pct(settlement.merch_tax_rate || 0)}, ${taxMethodLabel(settlement.merch_tax_method)})`,
    merch_total_tax: settlement.merch_total_tax || 0,
    merch_total_net: settlement.merch_total_net || 0,
    merch_venue_take_label: `Venue Take (${pct(settlement.merch_split_venue_pct || 0, 1)} of Net)`,
    merch_venue_share: settlement.merch_venue_share || 0,
    merch_venue_take_deduction: settlement.merch_venue_share || 0,
    merch_artist_share: settlement.merch_artist_share || 0,

    artist_deduction_lines,
    artist_backend: settlement.artist_backend || 0,
    balance_due: settlement.balance_due || 0,
  };
}
