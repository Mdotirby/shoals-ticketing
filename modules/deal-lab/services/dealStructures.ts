/**
 * Deal structure math — pure functions.
 *
 * Reasoning:
 *   venueCostsExTalent = total_expenses_ex_talent (from scenarioEngine)
 *     i.e. every approved expense EXCEPT any existing talent/guarantee
 *     line items detected on the offer. Deal Lab introduces the deal
 *     structure's own guarantee atop this base so we never double-count.
 *
 *   net              = core.net_potential × sell_through  (already scaled)
 *
 * Each function returns:
 *   { artist_payout, promoter_profit }
 *
 * Break-even is computed separately in `computeBreakEven()`.
 */
import type { DealInputs, DealStructureKey } from "../types";
import type { ScaledFinancials } from "./scenarioEngine";

export type PayoutResult = {
  artist_payout: number;
  promoter_profit: number;
  /** Sanity note explaining how values were derived (useful for UI). */
  note: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcGuarantee(inputs: DealInputs, sf: ScaledFinancials): PayoutResult {
  const g = Number(inputs.guarantee ?? 0);
  const artist = g;
  const promoter = round2(sf.projected_net - sf.projected_expenses_ex_talent - artist);
  return { artist_payout: round2(artist), promoter_profit: promoter, note: "flat guarantee" };
}

/**
 * VS — Artist gets MAX(guarantee, splitpoint × backend%).
 * Matches the existing Offers Engine VS formula in
 * app/admin/offers/new/page.tsx and app/admin/offers/[id]/page.tsx.
 */
export function calcGuaranteeVsBackend(
  inputs: DealInputs,
  sf: ScaledFinancials
): PayoutResult {
  const g = Number(inputs.guarantee ?? 0);
  const backendPct = Math.max(0, Math.min(100, Number(inputs.backend_percentage ?? 0))) / 100;
  // splitpoint = net - expenses (no talent double-count)
  const splitpoint = Math.max(sf.projected_net - sf.projected_expenses_ex_talent, 0);
  const artistBackend = splitpoint * backendPct;
  const artist = round2(Math.max(g, artistBackend));
  const promoter = round2(splitpoint - artist);
  return {
    artist_payout: artist,
    promoter_profit: promoter,
    note: `max(G $${g}, ${backendPct * 100}% of splitpoint $${Math.round(splitpoint)})`,
  };
}

/**
 * PLUS — Artist gets guarantee + splitpoint × backend%.
 * Matches the existing PLUS/BONUS deal types in the Offers Engine.
 */
export function calcGuaranteePlusBackend(
  inputs: DealInputs,
  sf: ScaledFinancials
): PayoutResult {
  const g = Number(inputs.guarantee ?? 0);
  const backendPct = Math.max(0, Math.min(100, Number(inputs.backend_percentage ?? 0))) / 100;
  // splitpoint = net - expenses (the existing Offers Engine does NOT subtract
  // G before computing backend for PLUS; artist is guaranteed + a share on top).
  const splitpoint = Math.max(sf.projected_net - sf.projected_expenses_ex_talent, 0);
  const backend = splitpoint * backendPct;
  const artist = round2(g + backend);
  const promoter = round2(splitpoint - artist);
  return {
    artist_payout: artist,
    promoter_profit: promoter,
    note: `G $${g} + ${backendPct * 100}% of splitpoint $${Math.round(splitpoint)}`,
  };
}

export function calcDoorSplit(inputs: DealInputs, sf: ScaledFinancials): PayoutResult {
  const artistPct = Math.max(0, Math.min(100, Number(inputs.door_split_artist_pct ?? 0))) / 100;
  // Door split applies to NET after approved expenses (industry standard)
  const splitBase = Math.max(sf.projected_net - sf.projected_expenses_ex_talent, 0);
  const artist = round2(splitBase * artistPct);
  const promoter = round2(splitBase - artist);
  return {
    artist_payout: artist,
    promoter_profit: promoter,
    note: `${artistPct * 100}% / ${(1 - artistPct) * 100}% door split of post-expense net`,
  };
}

export function calcTieredBonus(
  inputs: DealInputs,
  sf: ScaledFinancials
): PayoutResult {
  const g = Number(inputs.guarantee ?? 0);
  const tiers = (inputs.tiers ?? []).slice().sort((a, b) => a.units - b.units);
  // Cumulative bonus: all tiers whose threshold is met pay out (not just top).
  const bonus = tiers
    .filter((t) => sf.units_sold >= t.units)
    .reduce((s, t) => s + Number(t.bonus || 0), 0);
  const artist = round2(g + bonus);
  const promoter = round2(sf.projected_net - sf.projected_expenses_ex_talent - artist);
  return {
    artist_payout: artist,
    promoter_profit: promoter,
    note: `G $${g} + tiered bonuses totaling $${bonus} at ${sf.units_sold} units`,
  };
}

export function calcPayout(
  structure: DealStructureKey,
  inputs: DealInputs,
  sf: ScaledFinancials
): PayoutResult {
  switch (structure) {
    case "guarantee":
      return calcGuarantee(inputs, sf);
    case "guarantee_vs_backend":
      return calcGuaranteeVsBackend(inputs, sf);
    case "guarantee_plus_backend":
      return calcGuaranteePlusBackend(inputs, sf);
    case "door_split":
      return calcDoorSplit(inputs, sf);
    case "tiered_bonus":
      return calcTieredBonus(inputs, sf);
  }
}

/* ──────────────────────────────────────────────────────────── */
/*  Break-even — solve for sell-through where promoter_profit=0 */
/*  Monotonic search over sell-through ∈ [0,1].                 */
/* ──────────────────────────────────────────────────────────── */

export type BreakEvenInput = {
  structure: DealStructureKey;
  inputs: DealInputs;
  scale: (st: number) => ScaledFinancials;
};

export function computeBreakEven(
  be: BreakEvenInput
): { units: number | null; gross: number | null; pct: number | null } {
  // Sweep in 1% steps — good enough for MVP; deterministic.
  let found: { pct: number; sf: ScaledFinancials } | null = null;
  for (let i = 1; i <= 100; i++) {
    const pct = i / 100;
    let sf: ScaledFinancials;
    try {
      sf = be.scale(pct);
    } catch {
      return { units: null, gross: null, pct: null };
    }
    const p = calcPayout(be.structure, be.inputs, sf);
    if (p.promoter_profit >= 0) {
      found = { pct, sf };
      break;
    }
  }
  if (!found) return { units: null, gross: null, pct: null };
  return {
    units: found.sf.units_sold,
    gross: Math.round(found.sf.projected_gross * 100) / 100,
    pct: Math.round(found.pct * 10000) / 10000,
  };
}
