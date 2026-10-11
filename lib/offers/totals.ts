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

  const rawTaxRate = Number(form.tax_rate) || 0;
  const taxRatePct = rawTaxRate > 0 && rawTaxRate < 1 ? rawTaxRate * 100 : rawTaxRate;
  const taxRateDecimal = taxRatePct / 100;
  const taxMethod = (form.tax_method as string) || "multiplier";

  /** Face value only — what the artist's split is ultimately measured on. */
  const faceTotal = scaling.reduce((s, r) => s + (Number(r.sellable_cap) || 0) * (Number(r.net_price) || 0), 0);
  /** Face + the two fees. NOT the all-in: this is the base the PRO rates run on. */
  const subtotalGross = scaling.reduce((s, r) => s + (Number(r.sellable_cap) || 0) * (Number(r.price) || 0), 0);
  const totalFees = scaling.reduce((s, r) => s + ((Number(r.ticketing_fee) || 0) + (Number(r.facility_fee) || 0)) * (Number(r.sellable_cap) || 0), 0);

  // The card surcharge, needed before gross because it is part of it.
  const cardExpense = cardExpenseAtSellout(scaling, {
    taxMethod: form.tax_method as string,
    taxRate: form.tax_rate as number,
  });

  /**
   * Gross is everything the buyer pays — card fee included.
   *
   * It used to be the sub-total, which left the surcharge out of gross while
   * the expense list charged it: subtracting money that was never added. On
   * Sunny Sweeney the buyer pays $13,015.60, gross read $12,480.00, and
   * $535.60 of card fee then came off as a cost — $535.60 of pool, about
   * $348 of artist money at a 65% backend, against what settlement actually
   * produces. Settlement carries the surcharge through NBOR so the expense
   * removes it once (lib/settlement/model.ts); this now matches.
   *
   * A multiplier tax is charged on top of the face at checkout, so the buyer
   * pays it and it belongs in gross too. Under divisor it is already inside
   * the face.
   */
  const multiplierTax = taxMethod === "divisor" ? 0 : faceTotal * taxRateDecimal;
  const grossPotential = Math.round((subtotalGross + multiplierTax + cardExpense.amount) * 100) / 100;

  // Gross less the two fees that are not the show's money. The card fee is
  // not one of them — it stays in, and leaves once as an expense below.
  const adjGross = Math.round((grossPotential - totalFees) * 100) / 100;

  /**
   * Tax is on FACE, and comes out under both methods.
   *
   * Computed from faceTotal rather than from adjGross, which now carries the
   * card fee: the surcharge is not taxable and must not be taxed. And it is
   * subtracted either way now, because gross is the all-in — a multiplier
   * tax sits inside it instead of outside.
   */
  const taxAmount = Math.round(
    (taxMethod === "divisor" ? faceTotal - faceTotal / (1 + taxRateDecimal) : faceTotal * taxRateDecimal) * 100,
  ) / 100;
  const netPotential = Math.round((adjGross - taxAmount) * 100) / 100;

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
  // PRO rates run on the SUB-TOTAL, not the all-in. ASCAP is a percentage of
  // ticket receipts; the card surcharge is not ticket revenue, and folding it
  // into the base would quietly raise every rate line.
  const totalVariable =
    ownVarExp.reduce((s, e) => s + ((Number(e.rate) || 0) * subtotalGross), 0) + cardExpense.amount;
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
    /** Face + fees. The base every percentage expense runs on. */
    subtotalGross,
    /** Face value alone — what tax and the artist's split are measured on. */
    faceTotal,
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
        amount: Math.round((Number(e.rate) || 0) * subtotalGross * 100) / 100,
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
