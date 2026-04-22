/**
 * Deal Lab — public module surface. All outputs are labeled simulated=true.
 */
export * from "./types";
export { SCENARIOS, RISK } from "./constants";
export { simulate, persistSession } from "./services/simulationEngine";
export { recommend } from "./services/recommendationEngine";
export { assessRisk } from "./services/riskScoring";
export { scaleFinancials } from "./services/scenarioEngine";
export {
  calcPayout,
  calcGuarantee,
  calcGuaranteePlusBackend,
  calcDoorSplit,
  calcTieredBonus,
  computeBreakEven,
} from "./services/dealStructures";
