import { withoutCardExpense, cardExpenseAtSellout, CARD_EXPENSE_NAME } from "./cardExpense";

/**
 * An offer's derived money — gross and net potential, tax, expense totals,
 * the split point and the artist's walkout — from its terms. Moved out of
 * the offer builder so the event hub's Deal section saves exactly what the
 * builder saves: an offer's stored totals are always this function's answer
 * for its stored terms, whichever screen wrote them.
 */
export function offerTotals(form: Record<string, unknown>) {
  const scaling = Array.isArray(form.ticket_scaling) ? form.ticket_scaling as Array<Record<string, number>> : [];
  const fixedExp = Array.isArray(form.fixed_expenses) ? form.fixed_expenses as Array<{ amount: number }> : [];
  const varExp = Array.isArray(form.variable_expenses) ? form.variable_expenses as Array<{ rate: number; amount: number }> : [];

  // grossPotential = face + fees (base for PRO/variable expense % calc)
  const grossPotential = scaling.reduce((s, r) => s + (Number(r.sellable_cap) || 0) * (Number(r.price) || 0), 0);
  const totalFees = scaling.reduce((s, r) => s + ((Number(r.ticketing_fee) || 0) + (Number(r.facility_fee) || 0)) * (Number(r.sellable_cap) || 0), 0);
  const adjGross = grossPotential - totalFees; // = face × sellable; drives net/splitpoint

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
    netPotential = adjGross; // = face × sellable; taxes collected from customers and remitted
  }

  // displayGross, totalCC, preCCGross and displayAdjGross used to be
  // computed here. Nothing read any of them, and a second copy of the
  // surcharge arithmetic sitting next to the real one is exactly how the
  // two versions drift apart. The surcharge now has one home:
  // lib/offers/cardExpense.ts.

  const totalFixed = fixedExp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  // The card surcharge is a show cost, not a typed-in rate. Any legacy
  // hand-entered card row is dropped first -- 13 offers carry one at a flat
  // 3% of gross -- so the derived line replaces it rather than stacking on
  // top of it. See lib/offers/cardExpense.ts.
  const ownVarExp = withoutCardExpense(varExp as Array<{ name?: string; rate: number; amount: number }>);
  const cardExpense = cardExpenseAtSellout(scaling, {
    taxMethod: form.tax_method as string,
    taxRate: form.tax_rate as number,
  });
  const totalVariable =
    ownVarExp.reduce((s, e) => s + ((Number(e.rate) || 0) * grossPotential), 0) + cardExpense.amount;
  const totalExpenses = totalFixed + totalVariable;

  // Artist payment model — identical to the create page and to the
  // settlement page. "Splitpoint" is the pool the backend percentage is
  // measured against — net receipts/potential minus expenses. Always
  // netAfterExpenses, regardless of deal type; it's a factual "what's left
  // after expenses" figure, not the guarantee. The guarantee is the
  // threshold the pool gets measured against to compute overage below.
  const netAfterExpenses = netPotential - totalExpenses;
  const guaranteeNum = Number(form.guarantee || 0);
  const backendPctDecimal = Number(form.backend_percentage || 0) / 100;
  const dealTypeNow = String(form.deal_type || "");
  const splitpoint = netAfterExpenses;
  // (pool × backend%) − guarantee, i.e. max(guarantee, pool × backend%).
  const overage = netAfterExpenses * backendPctDecimal - guaranteeNum;
  const artistBackend =
    dealTypeNow === "FLAT" || overage <= 0 ? 0 : overage;
  const artistTotal = guaranteeNum + artistBackend;
  const potWalkout = netAfterExpenses - artistTotal;

  return {
    grossPotential,
    adjGross,
    totalFees,
    taxRatePct,
    taxAmount,
    netPotential,
    totalFixed,
    totalVariable,
    totalExpenses,
    cardExpense,
    ownVarExp,
    // The variable-expense list every document and the record itself get:
    // the offer's own rate lines with their amounts re-synced, plus the
    // derived card line. Built here so the save payload and the PDF cannot
    // hand out different lists -- the PDF used to receive the raw form
    // value, which still held the legacy hand-entered card row, while its
    // totals came from this computation.
    variableExpensesOut: [
      ...ownVarExp.map((e) => ({
        ...e,
        amount: Math.round((Number(e.rate) || 0) * grossPotential * 100) / 100,
      })),
      { name: CARD_EXPENSE_NAME, rate: 0, amount: cardExpense.amount, locked: true },
    ],
    netAfterExpenses,
    splitpoint,
    overage,
    artistBackend,
    artistTotal,
    potWalkout,
  };
}
