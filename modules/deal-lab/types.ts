/**
 * modules/deal-lab/types.ts — shared Deal Lab types.
 *
 * All outputs are labeled `simulated: true`. They are NEVER a
 * factual revenue source.
 */

export type ScenarioKey = "conservative" | "expected" | "optimistic";

export type DealStructureKey =
  | "guarantee"
  | "guarantee_plus_backend"
  | "door_split"
  | "tiered_bonus";

export type DealInputs = {
  /** Guarantee in dollars */
  guarantee?: number;
  /** Backend percentage 0..100 (used for guarantee+backend + vs) */
  backend_percentage?: number;
  /** Door split percentage to artist, 0..100 (after approved expenses) */
  door_split_artist_pct?: number;
  /** Tiered bonus thresholds: [{ units_sold_at_or_above, bonus_amount }, ...] */
  tiers?: Array<{ units: number; bonus: number }>;
};

export type SimulationOutput = {
  scenario: ScenarioKey;
  sell_through_pct: number;
  deal_structure: DealStructureKey;
  inputs: DealInputs;
  projected_gross: number;
  projected_net: number;
  projected_expenses: number;
  artist_payout: number;
  promoter_profit: number;
  break_even_units: number | null;
  break_even_gross: number | null;
  break_even_pct: number | null;
  risk_score: number;
  risk_flags: string[];
  simulated: true; // permanent marker
};

export type SimulationBundle = {
  session_id: string | null;       // null until persisted
  event_id: string;
  core_snapshot: import("@/services/core-data").CoreFinancials;
  pricing: import("@/services/core-data").CoreTicketPricing;
  results: SimulationOutput[];
  blockers: string[];              // reasons simulation was refused
  simulated: true;
};

export type Recommendation = {
  best: SimulationOutput | null;
  alternatives: Array<{ sim: SimulationOutput; score: number; rationale: string }>;
  rationale: string;
  simulated: true;
};
