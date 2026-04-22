/**
 * Scenario Engine — scales core-data financials by sell-through %.
 *
 * DOES NOT recompute gross/net. It takes the offer's persisted values
 * (at 100% sellthrough) and linearly scales them by the scenario target.
 *
 * This is mathematically identical to the existing offer page formula:
 *   gross_at_X  = grossPotential × X
 *   adj_at_X    = adj_gross × X        (same per-ticket fees apply)
 *   net_at_X    = net_potential × X    (same tax ratio)
 *   variable    = Σ rate × gross_at_X  (same as offer's recalcVariables)
 *   total_exp   = fixed + variable
 */
import type {
  CoreFinancials,
  CoreRevenueProjections,
  CoreTicketPricing,
} from "@/services/core-data";

export type ScaledFinancials = {
  sell_through_pct: number;
  units_sold: number;
  projected_gross: number;
  projected_adj_gross: number;
  projected_net: number;
  projected_fixed: number;
  projected_variable: number;
  projected_expenses: number;
  /** Breakdown of talent-like fixed lines we detected — used to avoid
   *  double-counting guarantee in Deal Lab deal structures. */
  detected_talent_lines_total: number;
  /** Expenses with talent lines removed (for deal-structure math). */
  projected_expenses_ex_talent: number;
};

import { TALENT_LINE_REGEX } from "../constants";

export function scaleFinancials(
  sellThroughPct: number,
  core: CoreFinancials,
  projections: CoreRevenueProjections,
  pricing: CoreTicketPricing,
  costStructure: {
    fixed_expenses: Array<{ name: string; amount: number }>;
  }
): ScaledFinancials {
  if (!core.complete || !projections.available || !projections.at_full_sellthrough) {
    throw new Error(
      "core financials incomplete — cannot simulate (" +
        core.missing.join(", ") +
        ")"
    );
  }
  const p = projections.at_full_sellthrough;
  const gross = (p.gross_potential ?? 0) * sellThroughPct;
  const adjGross = ((core.adj_gross ?? 0) as number) * sellThroughPct;
  const net = ((core.net_potential ?? 0) as number) * sellThroughPct;

  // fixed does not scale
  const projected_fixed = projections.fixed_expenses_total;
  // variable scales with gross (matches offer page recalc)
  const projected_variable = projections.variable_expense_rates.reduce(
    (s, v) => s + v.rate * gross,
    0
  );
  const projected_expenses = projected_fixed + projected_variable;

  // Talent detection
  const talentTotal = costStructure.fixed_expenses
    .filter((f) => TALENT_LINE_REGEX.test(f.name))
    .reduce((s, f) => s + Number(f.amount || 0), 0);

  // Units sold approximation — cap at total_capacity, proportional
  const units_sold = Math.round(
    (pricing.total_capacity || 0) * sellThroughPct
  );

  return {
    sell_through_pct: sellThroughPct,
    units_sold,
    projected_gross: round2(gross),
    projected_adj_gross: round2(adjGross),
    projected_net: round2(net),
    projected_fixed: round2(projected_fixed),
    projected_variable: round2(projected_variable),
    projected_expenses: round2(projected_expenses),
    detected_talent_lines_total: round2(talentTotal),
    projected_expenses_ex_talent: round2(projected_expenses - talentTotal),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
