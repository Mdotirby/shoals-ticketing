/**
 * modules/deal-lab/constants.ts — scenario + risk thresholds.
 */
import type { ScenarioKey } from "./types";

export const SCENARIOS: Record<ScenarioKey, number> = {
  conservative: 0.5,
  expected: 0.7,
  optimistic: 0.9,
};

export const RISK = {
  /** Break-even at or above this % of capacity is flagged. */
  BREAK_EVEN_HIGH_PCT: 0.80,
  /** Guarantee above this share of optimistic-net is flagged. */
  GUARANTEE_EXPOSURE_PCT: 0.65,
  /** Margin below this % of net is flagged. */
  LOW_MARGIN_PCT: 0.10,
} as const;

/** Regex used to detect a Talent / Artist / Guarantee line item
 *  in existing fixed expenses so Deal Lab doesn't double-count it. */
export const TALENT_LINE_REGEX = /(talent|artist|guarantee|headliner|act(\s+fee)?)/i;
