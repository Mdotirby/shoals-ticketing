/**
 * modules/deal-lab/client.ts
 *
 * CLIENT-SAFE Deal Lab entry point — for use inside the live Offer form.
 *
 * Unlike the server `simulate()` which reads from Supabase, this version
 * takes pre-computed, in-memory numbers (exactly the values the offer
 * page already computes in useMemo). No fetch / no DB. Pure functions
 * only. Re-runs synchronously on every input change.
 *
 * Produces the same shape as the server bundle so the UI panel can be
 * shared between live-form simulation and (future) stored-offer views.
 */
import { SCENARIOS } from "./constants";
import { TALENT_LINE_REGEX } from "./constants";
import { calcPayout, computeBreakEven } from "./services/dealStructures";
import { assessRisk } from "./services/riskScoring";
import type {
  DealInputs,
  DealStructureKey,
  ScenarioKey,
  SimulationOutput,
} from "./types";

/* ──────────────────────────────────────────────────────────── */
/*  Inline inputs — what the offer form page already has        */
/* ──────────────────────────────────────────────────────────── */

export type InlineInputs = {
  /** Offer totals at 100 % sell-through. */
  gross_potential_full: number;
  adj_gross_full: number;
  net_potential_full: number;
  /** Total sellable capacity (sum of tiers' sellable_cap). */
  total_capacity: number;
  /** Persisted fixed expense line items. */
  fixed_expenses: Array<{ name: string; amount: number }>;
  /** Persisted variable expense rates (rate × gross). */
  variable_expense_rates: Array<{ name: string; rate: number }>;
  /** Offer-side deal terms, shown as defaults. Optional. */
  offer_guarantee?: number;
  offer_deal_type?: "FLAT" | "VS" | "PLUS" | "BONUS" | null;
  offer_backend_percentage?: number | null;
};

/* ──────────────────────────────────────────────────────────── */
/*  Scaled financials — local, mirrors ScaledFinancials but     */
/*  without the server-side type dependencies.                   */
/* ──────────────────────────────────────────────────────────── */

export type InlineScaled = {
  sell_through_pct: number;
  units_sold: number;
  projected_gross: number;
  projected_adj_gross: number;
  projected_net: number;
  projected_fixed: number;
  projected_variable: number;
  projected_expenses: number;
  detected_talent_lines_total: number;
  projected_expenses_ex_talent: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function scaleInline(pct: number, i: InlineInputs): InlineScaled {
  const gross = i.gross_potential_full * pct;
  const adjGross = i.adj_gross_full * pct;
  const net = i.net_potential_full * pct;
  const projected_fixed = i.fixed_expenses.reduce(
    (s, f) => s + Number(f.amount || 0),
    0
  );
  const projected_variable = i.variable_expense_rates.reduce(
    (s, v) => s + Number(v.rate || 0) * gross,
    0
  );
  const projected_expenses = projected_fixed + projected_variable;
  const talentTotal = i.fixed_expenses
    .filter((f) => TALENT_LINE_REGEX.test(f.name))
    .reduce((s, f) => s + Number(f.amount || 0), 0);
  return {
    sell_through_pct: pct,
    units_sold: Math.round(i.total_capacity * pct),
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

/* ──────────────────────────────────────────────────────────── */
/*  simulateInline — pure, synchronous, client-safe              */
/* ──────────────────────────────────────────────────────────── */

export type InlineBundle = {
  inputs: InlineInputs;
  results: SimulationOutput[];
  /** Reasons simulation cannot run (missing inputs, etc). */
  blockers: string[];
  simulated: true;
};

export function simulateInline(opts: {
  inputs: InlineInputs;
  structures: Array<{ structure: DealStructureKey; inputs: DealInputs }>;
  scenarios?: ScenarioKey[];
}): InlineBundle {
  const i = opts.inputs;
  const blockers: string[] = [];
  if (!(i.gross_potential_full > 0)) blockers.push("gross_potential is 0 — add tiers first");
  if (!(i.net_potential_full > 0)) blockers.push("net_potential is 0 — set tax rate");
  if (!(i.total_capacity > 0)) blockers.push("total_capacity is 0 — add ticket scaling");
  if (opts.structures.length === 0) blockers.push("no deal structures selected");

  if (blockers.length > 0) {
    return { inputs: i, results: [], blockers, simulated: true };
  }

  const scenarios = opts.scenarios ?? (["conservative", "expected", "optimistic"] as ScenarioKey[]);
  const optimisticScaled = scaleInline(SCENARIOS.optimistic, i);
  const results: SimulationOutput[] = [];

  // Build a minimal core-shim for assessRisk — only the fields it consults.
  const coreShim = {
    complete: true,
    missing: [] as string[],
  } as unknown as import("@/services/core-data").CoreFinancials;

  for (const scenario of scenarios) {
    const pct = SCENARIOS[scenario];
    const sf = scaleInline(pct, i);
    for (const { structure, inputs } of opts.structures) {
      const payout = calcPayout(structure, inputs, sf);
      const be = computeBreakEven({
        structure,
        inputs,
        scale: (st: number) => scaleInline(st, i),
      });
      const risk = assessRisk({
        structure,
        inputs,
        scaled: sf,
        scaledOptimistic: optimisticScaled,
        breakEvenPct: be.pct,
        core: coreShim,
      });
      results.push({
        scenario,
        sell_through_pct: pct,
        deal_structure: structure,
        inputs,
        projected_gross: sf.projected_gross,
        projected_net: sf.projected_net,
        projected_expenses: sf.projected_expenses,
        artist_payout: payout.artist_payout,
        promoter_profit: payout.promoter_profit,
        break_even_units: be.units,
        break_even_gross: be.gross,
        break_even_pct: be.pct,
        risk_score: risk.score,
        risk_flags: risk.flags,
        simulated: true,
      });
    }
  }

  return { inputs: i, results, blockers: [], simulated: true };
}

/* ──────────────────────────────────────────────────────────── */
/*  Client-safe recommendation                                   */
/*  (identical signature to the server version but typed for    */
/*  InlineBundle)                                                */
/* ──────────────────────────────────────────────────────────── */

function dealKey(
  structure: DealStructureKey,
  inputs: Record<string, unknown>
): string {
  return `${structure}|${JSON.stringify(inputs)}`;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

export type ClientRecommendation = {
  best: SimulationOutput | null;
  alternatives: Array<{ sim: SimulationOutput; score: number; rationale: string }>;
  rationale: string;
  simulated: true;
};

export function recommendInline(
  bundle: InlineBundle,
  offerGuarantee = 0
): ClientRecommendation {
  if (bundle.results.length === 0) {
    return { best: null, alternatives: [], rationale: "no simulations available", simulated: true };
  }

  type Group = {
    key: string;
    structure: DealStructureKey;
    inputs: DealInputs;
    conservative?: SimulationOutput;
    expected?: SimulationOutput;
    optimistic?: SimulationOutput;
  };
  const groups = new Map<string, Group>();

  for (const r of bundle.results) {
    const k = dealKey(r.deal_structure, r.inputs as Record<string, unknown>);
    let g = groups.get(k);
    if (!g) {
      g = { key: k, structure: r.deal_structure, inputs: r.inputs };
      groups.set(k, g);
    }
    g[r.scenario] = r;
  }

  const scored = Array.from(groups.values()).map((g) => {
    if (!g.conservative || !g.expected || !g.optimistic) {
      return { g, rep: g.expected ?? g.optimistic ?? g.conservative!, score: 0, rationale: "incomplete scenarios" };
    }
    const downsideSafety = g.conservative.projected_net > 0
      ? clamp01(g.conservative.promoter_profit / g.conservative.projected_net)
      : g.conservative.promoter_profit >= 0 ? 0.5 : 0;
    const upsideStrength = g.optimistic.projected_net > 0
      ? clamp01(g.optimistic.promoter_profit / g.optimistic.projected_net)
      : 0;
    const targetArtist = Math.max(Number(g.expected.inputs.guarantee ?? 0), offerGuarantee);
    const artistAcceptability = targetArtist > 0
      ? clamp01(g.expected.artist_payout / targetArtist)
      : 1.0;
    const riskTerm = 1 - g.expected.risk_score;
    const score =
      0.40 * downsideSafety +
      0.25 * upsideStrength +
      0.15 * artistAcceptability +
      0.20 * riskTerm;

    const parts: string[] = [];
    if (g.conservative.promoter_profit >= 0) parts.push("profitable at 50%");
    else parts.push("loses money at 50%");
    parts.push(`$${Math.round(g.expected.promoter_profit)} promoter @ 70%`);
    parts.push(`$${Math.round(g.optimistic.promoter_profit)} upside @ 90%`);
    if (g.expected.risk_flags.length > 0) parts.push(`risk: ${g.expected.risk_flags.join(", ")}`);

    return { g, rep: g.expected, score: Math.round(score * 10000) / 10000, rationale: parts.join("; ") };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score <= 0) {
    return {
      best: null,
      alternatives: scored.slice(0, 3).map((s) => ({ sim: s.rep, score: s.score, rationale: s.rationale })),
      rationale: "no structure scores positively under current inputs",
      simulated: true,
    };
  }
  return {
    best: best.rep,
    alternatives: scored.slice(1, 4).map((s) => ({ sim: s.rep, score: s.score, rationale: s.rationale })),
    rationale: `best: ${best.g.structure} — ${best.rationale}`,
    simulated: true,
  };
}

export { SCENARIOS } from "./constants";
export type { DealInputs, DealStructureKey, ScenarioKey, SimulationOutput };
