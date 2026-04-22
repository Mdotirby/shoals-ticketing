/**
 * Simulation Engine — orchestrates Deal Lab.
 *
 * Pulls everything from core-data. Never computes revenue.
 * Always emits `simulated: true`. If core financials are incomplete,
 * refuses to simulate and returns `blockers[]`.
 */
import {
  getCostStructure,
  getEventFinancials,
  getRevenueProjections,
  getTicketPricing,
} from "@/services/core-data";
import type {
  CoreCostStructure,
  CoreFinancials,
  CoreRevenueProjections,
  CoreTicketPricing,
} from "@/services/core-data";
import { createAdminClient } from "@/lib/supabase-server";
import { SCENARIOS } from "../constants";
import type {
  DealInputs,
  DealStructureKey,
  ScenarioKey,
  SimulationBundle,
  SimulationOutput,
} from "../types";
import { calcPayout, computeBreakEven } from "./dealStructures";
import { assessRisk } from "./riskScoring";
import { scaleFinancials } from "./scenarioEngine";

export type SimulationInput = {
  event_id: string;
  structures: Array<{ structure: DealStructureKey; inputs: DealInputs }>;
  scenarios?: ScenarioKey[]; // default all 3
};

export async function simulate(
  opts: SimulationInput
): Promise<SimulationBundle> {
  const [core, pricing, projections, costs] = await Promise.all([
    getEventFinancials(opts.event_id),
    getTicketPricing(opts.event_id),
    getRevenueProjections(opts.event_id),
    getCostStructure(opts.event_id),
  ]);

  const blockers: string[] = [];
  if (!core.complete)
    blockers.push(
      `core financials incomplete: ${core.missing.join(", ") || "no offer"}`
    );
  if (!projections.available)
    blockers.push(projections.reason ?? "projections unavailable");

  if (blockers.length > 0) {
    return {
      session_id: null,
      event_id: opts.event_id,
      core_snapshot: core,
      pricing,
      results: [],
      blockers,
      simulated: true,
    };
  }

  const scenarios = opts.scenarios ?? (["conservative", "expected", "optimistic"] as ScenarioKey[]);
  const results: SimulationOutput[] = [];
  const optimistic = scaleFinancials(SCENARIOS.optimistic, core, projections, pricing, costs);

  for (const scenario of scenarios) {
    const pct = SCENARIOS[scenario];
    const sf = scaleFinancials(pct, core, projections, pricing, costs);

    for (const { structure, inputs } of opts.structures) {
      const payout = calcPayout(structure, inputs, sf);
      const be = computeBreakEven({
        structure,
        inputs,
        scale: (st) => scaleFinancials(st, core, projections, pricing, costs),
      });
      const risk = assessRisk({
        structure,
        inputs,
        scaled: sf,
        scaledOptimistic: optimistic,
        breakEvenPct: be.pct,
        core,
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

  return {
    session_id: null,
    event_id: opts.event_id,
    core_snapshot: core,
    pricing,
    results,
    blockers: [],
    simulated: true,
  };
}

/* ──────────────────────────────────────────────────────────── */
/*  Persist a simulation bundle as a Deal Lab "session"          */
/* ──────────────────────────────────────────────────────────── */

export async function persistSession(
  bundle: SimulationBundle,
  meta: { label?: string | null; created_by?: string | null; venue_id?: string | null }
): Promise<{ session_id: string | null }> {
  if (bundle.blockers.length > 0) return { session_id: null };
  const db = createAdminClient();

  const { data: sess, error } = await db
    .from("deal_lab_sessions")
    .insert({
      event_id: bundle.event_id,
      venue_id: meta.venue_id ?? null,
      offer_id: bundle.core_snapshot.offer_id,
      label: meta.label ?? null,
      core_snapshot: bundle.core_snapshot as unknown as Record<string, unknown>,
      created_by: meta.created_by ?? null,
    })
    .select()
    .single();
  if (error || !sess) return { session_id: null };

  const sessionRow = sess as { id: string };
  const simRows = bundle.results.map((r) => ({
    session_id: sessionRow.id,
    event_id: bundle.event_id,
    scenario: r.scenario,
    sell_through_pct: r.sell_through_pct,
    deal_structure: r.deal_structure,
    inputs: r.inputs,
    projected_gross: r.projected_gross,
    projected_net: r.projected_net,
    projected_expenses: r.projected_expenses,
    artist_payout: r.artist_payout,
    promoter_profit: r.promoter_profit,
    break_even_units: r.break_even_units,
    break_even_gross: r.break_even_gross,
    break_even_pct: r.break_even_pct,
    risk_score: r.risk_score,
    risk_flags: r.risk_flags,
    simulated: true,
  }));
  if (simRows.length > 0) {
    await db.from("deal_lab_simulations").insert(simRows);
  }
  return { session_id: sessionRow.id };
}

/* Re-export helpers so consumers can obtain raw core data if needed. */
export { getEventFinancials, getCostStructure, getTicketPricing, getRevenueProjections };
export type { CoreFinancials, CoreCostStructure, CoreTicketPricing, CoreRevenueProjections };
