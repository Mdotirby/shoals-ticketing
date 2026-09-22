/**
 * What the buyer was charged, broken into lines that actually add up.
 *
 * The settlement_ledger sale row is not a clean breakdown, because
 * `ticket_revenue` means different things depending on how the ticket was
 * sold:
 *
 *   online / cash        ticket_revenue is the face value, and
 *                        face + fees + tax == gross exactly.
 *   inline checkout      same, plus a card surcharge the buyer paid on top,
 *                        which is whatever is left over.
 *   box office (terminal) the buyer service fee is priced INTO the ticket, so
 *                        ticket_revenue ALREADY CONTAINS it.
 *
 * That last case is why this helper exists. Listing `ticket_revenue` and
 * `ticketing_fee` as separate rows counts the fee twice, and the breakdown
 * overshoots what was really charged by exactly the fee. The order panel used
 * to hide the evidence by clamping the leftover with Math.max(0, …), so the
 * rows simply didn't sum and nothing said why.
 *
 * The overshoot is the tell: if the parts exceed the whole, the fee is inside
 * the face value, so the face is shown net of it. Nothing else is adjusted —
 * the three well-behaved sources come out unchanged.
 */

export type LedgerSale = {
  gross_amount: number;
  ticket_revenue: number;
  ticketing_fee: number;
  facility_fee: number;
  tax_collected: number;
};

export type BreakdownLine = { label: string; amount: number };

/** Cents, to keep float noise out of the comparison and the leftover. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * True when the ledger's parts exceed the whole — which only happens because
 * the service fee is already inside `ticket_revenue`.
 */
export function feeIsInsideFace(sale: LedgerSale): boolean {
  const leftover = sale.gross_amount - sale.ticket_revenue - sale.ticketing_fee - sale.facility_fee - sale.tax_collected;
  return leftover < -0.005;
}

/**
 * The lines to show under "Money", in order. Zero lines are kept here and
 * filtered by the caller, so a caller can choose to show an explicit $0.00.
 *
 * Guarantee: the returned amounts always sum to `sale.gross_amount`.
 */
export function orderBreakdown(sale: LedgerSale): BreakdownLine[] {
  const face = round2(sale.ticket_revenue - (feeIsInsideFace(sale) ? sale.ticketing_fee : 0));
  const surcharge = round2(
    sale.gross_amount - face - sale.ticketing_fee - sale.facility_fee - sale.tax_collected,
  );
  return [
    { label: "Face value", amount: face },
    { label: "Service fee", amount: sale.ticketing_fee },
    { label: "Facility fee", amount: sale.facility_fee },
    { label: "Sales tax", amount: sale.tax_collected },
    { label: "Card surcharge", amount: surcharge },
  ];
}
