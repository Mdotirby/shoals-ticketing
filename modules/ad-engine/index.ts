/**
 * Ad Engine — public module surface.
 * External callers should only import from this file.
 */
export * from "./types";
export { AD_ENGINE } from "./constants";
export { listAssets, createAsset, updateAsset, deactivateAsset } from "./services/assetService";
export { generateCreatives, listCreatives, comboHash } from "./services/creativeGenerator";
export { validatePreLaunch } from "./services/preLaunch";
export { buildCampaign } from "./services/campaignBuilder";
export { syncDailyMetrics, getEventPerformance } from "./services/performanceTracker";
export {
  runOptimizationJob,
  evaluateCampaign,
} from "./services/optimizationEngine";
export {
  getActiveOverrides,
  getMetricsAgeHours,
  hoursSinceLaunch,
  hasRecentBudgetAdjustment,
  checkBudgetWalls,
  scoreConfidence,
  logDecision,
} from "./services/safety";
export { getAdapter, metaAdapter, snapchatAdapter } from "./integrations";
