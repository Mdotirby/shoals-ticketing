/**
 * Risk Scoring — deterministic flags + a 0..1 composite score.
 *
 * Flags:
 *   • break_even_gt_80  — break-even ≥ 80 % of capacity
 *   • high_guarantee    — guarantee > 65 % of optimistic-scenario net
 *   • low_margin        — promoter margin < 10 % of net
 *   • incomplete_inputs — some core financials missing (simulation ran with fallbacks)
 *   • talent_double_count_risk — existing fixed expenses contain a talent line
 *                                 AND structure adds another guarantee
 */
import type { CoreFinancials } from "@/services/core-data";
import { RISK } from "../constants";
import type { DealInputs, DealStructureKey } from "../types";
import type { ScaledFinancials } from "./scenarioEngine";

export type RiskAssessment = {
  flags: string[];
  score: number; // 0..1 (higher = riskier)
};

export function assessRisk(opts: {
  structure: DealStructureKey;
  inputs: DealInputs;
  scaled: ScaledFinancials;
  scaledOptimistic: ScaledFinancials | null;
  breakEvenPct: number | null;
  core: CoreFinancials;
}): RiskAssessment {
  const flags: string[] = [];

  // 1. Break-even
  if (opts.breakEvenPct !== null && opts.breakEvenPct >= RISK.BREAK_EVEN_HIGH_PCT) {
    flags.push("break_even_gt_80");
  }

  // 2. Guarantee exposure vs optimistic net
  const g = Number(opts.inputs.guarantee ?? 0);
  if (g > 0 && opts.scaledOptimistic) {
    const optNet = opts.scaledOptimistic.projected_net;
    if (optNet > 0 && g / optNet >= RISK.GUARANTEE_EXPOSURE_PCT) {
      flags.push("high_guarantee");
    }
  }

  // 3. Low margin — promoter profit vs net
  const margin =
    opts.scaled.projected_net > 0
      ? Math.max(
          opts.scaled.projected_net -
            opts.scaled.projected_expenses_ex_talent -
            g,
          0
        ) / opts.scaled.projected_net
      : 0;
  if (margin < RISK.LOW_MARGIN_PCT) flags.push("low_margin");

  // 4. Incomplete inputs
  if (!opts.core.complete) flags.push("incomplete_inputs");

  // 5. Talent double count risk
  if (
    opts.scaled.detected_talent_lines_total > 0 &&
    (opts.structure === "guarantee" ||
      opts.structure === "guarantee_plus_backend" ||
      opts.structure === "tiered_bonus")
  ) {
    flags.push("talent_double_count_risk");
  }

  // Composite score
  let score = 0;
  if (flags.includes("break_even_gt_80")) score += 0.35;
  if (flags.includes("high_guarantee")) score += 0.30;
  if (flags.includes("low_margin")) score += 0.20;
  if (flags.includes("incomplete_inputs")) score += 0.10;
  if (flags.includes("talent_double_count_risk")) score += 0.10;
  score = Math.min(1, Math.round(score * 100) / 100);

  return { flags, score };
}
