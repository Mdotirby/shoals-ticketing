/**
 * Recommendation Engine — selects the "best" simulated deal per the spec:
 *
 *   • lowest downside risk
 *   • acceptable artist payout
 *   • strong upside
 *
 * Scoring (higher = better):
 *   score = 0.40 × downside_safety
 *         + 0.25 × upside_strength
 *         + 0.15 × artist_acceptability
 *         + 0.20 × (1 − risk_score)
 *
 * Where:
 *   downside_safety    = promoter_profit @ conservative / |projected_net @ conservative|
 *                        (clamped ≥ 0)
 *   upside_strength    = promoter_profit @ optimistic / projected_net @ optimistic
 *   artist_acceptability = min(1, artist_payout @ expected / target_artist)
 *       target_artist  = max(inputs.guarantee, 0) OR the offer's guarantee
 *                        (whichever is higher). If both 0, term is 1.0.
 */
import type {
  DealStructureKey,
  Recommendation,
  SimulationBundle,
  SimulationOutput,
} from "../types";

function bucket(
  results: SimulationOutput[]
): Record<string, { conservative?: SimulationOutput; expected?: SimulationOutput; optimistic?: SimulationOutput }> {
  const out: Record<
    string,
    { conservative?: SimulationOutput; expected?: SimulationOutput; optimistic?: SimulationOutput }
  > = {};
  for (const r of results) {
    const key = dealKey(r.deal_structure, r.inputs);
    out[key] = out[key] ?? {};
    out[key][r.scenario] = r;
  }
  return out;
}

function dealKey(structure: DealStructureKey, inputs: Record<string, unknown>): string {
  return `${structure}|${JSON.stringify(inputs)}`;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

function scoreDeal(
  conservative: SimulationOutput | undefined,
  expected: SimulationOutput | undefined,
  optimistic: SimulationOutput | undefined,
  offerGuarantee: number
): number {
  if (!conservative || !expected || !optimistic) return 0;

  const downsideSafety = conservative.projected_net > 0
    ? clamp01(conservative.promoter_profit / conservative.projected_net)
    : conservative.promoter_profit >= 0 ? 0.5 : 0;

  const upsideStrength = optimistic.projected_net > 0
    ? clamp01(optimistic.promoter_profit / optimistic.projected_net)
    : 0;

  const targetArtist = Math.max(Number(expected.inputs.guarantee ?? 0), offerGuarantee);
  const artistAcceptability = targetArtist > 0
    ? clamp01(expected.artist_payout / targetArtist)
    : 1.0;

  const riskTerm = 1 - expected.risk_score;

  return (
    0.40 * downsideSafety +
    0.25 * upsideStrength +
    0.15 * artistAcceptability +
    0.20 * riskTerm
  );
}

export function recommend(bundle: SimulationBundle): Recommendation {
  if (bundle.results.length === 0) {
    return { best: null, alternatives: [], rationale: "no simulations available", simulated: true };
  }

  const offerGuarantee = Number(bundle.core_snapshot.guarantee ?? 0);
  const grouped = bucket(bundle.results);

  const scored = Object.entries(grouped).map(([key, g]) => {
    const score = scoreDeal(g.conservative, g.expected, g.optimistic, offerGuarantee);
    const rep = g.expected ?? g.optimistic ?? g.conservative!;
    const parts: string[] = [];
    if (g.conservative && g.conservative.promoter_profit >= 0) parts.push("profitable at 50%");
    else if (g.conservative) parts.push("loses money at 50%");
    if (g.expected) parts.push(`$${Math.round(g.expected.promoter_profit)} promoter @ 70%`);
    if (g.optimistic) parts.push(`$${Math.round(g.optimistic.promoter_profit)} upside @ 90%`);
    if (rep.risk_flags.length > 0) parts.push(`risk flags: ${rep.risk_flags.join(", ")}`);
    return { key, rep, score: Math.round(score * 10000) / 10000, rationale: parts.join("; ") };
  });

  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score <= 0) {
    return {
      best: null,
      alternatives: scored.slice(0, 3).map((s) => ({ sim: s.rep, score: s.score, rationale: s.rationale })),
      rationale:
        "no deal structure scores positively under current inputs (consider lowering guarantee or adjusting pricing)",
      simulated: true,
    };
  }

  return {
    best: best.rep,
    alternatives: scored.slice(1, 4).map((s) => ({ sim: s.rep, score: s.score, rationale: s.rationale })),
    rationale: `picked ${best.rep.deal_structure} — ${best.rationale}`,
    simulated: true,
  };
}
