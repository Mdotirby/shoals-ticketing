/**
 * Email Engine — public module surface.
 * External callers should only import from this file.
 *
 * Scope (Phases 1–8):
 *   • Phase 1: handled in /plans/email-engine-analysis.md
 *   • Phase 2: schema in /plans/email-engine-migration.sql
 *   • Phase 3: segmentation engine
 *   • Phase 4: campaign builder + renderer + dispatcher
 *   • Phase 5: automation engine
 *   • Phase 6: metrics tracker
 *   • Phase 7: optimization layer
 *   • Phase 8: Ad Engine + Deal Lab integrations
 *
 * No side effects at import time.
 */

export * from "./types";
export {
  EMAIL_ENGINE,
  SEGMENT_OPERATORS,
  SEGMENT_FIELDS,
  type SegmentOperator,
  type SegmentField,
  type EmailEngineTrigger,
} from "./constants";

// Phase 3 — segmentation
export {
  compileRules,
  previewRules,
  evaluateSegment,
  listRecipients,
  PRESETS,
  type CompiledSegment,
  type SegmentEvalResult,
} from "./services/segmentation";

// Phase 4 — campaign builder & dispatch
export {
  createCampaign,
  updateCampaign,
  previewCampaign,
  sendCampaignNow,
  scheduleCampaign,
  enqueueCampaign,
  finalizeCampaignIfDrained,
  getCampaignMetrics,
  type CreateCampaignInput,
} from "./services/campaignBuilder";

export { renderEmail, replaceVars, stampUtmOnLinks } from "./services/renderer";
export { processQueue, type DispatchResult } from "./services/dispatcher";

// Phase 5 — automation engine
export { runAutomationTick, type AutomationTickResult } from "./services/automations";

// Phase 6 — metrics
export {
  recomputeAllMetrics,
  recomputeForCampaign,
  type MetricsResult,
} from "./services/metricsTracker";

// Phase 7 — optimization
export {
  evaluateCampaign as evaluateCampaignOptimizations,
  evaluateAllCampaigns,
  type OptimizeResult,
  type CampaignEvaluation,
} from "./services/optimization";

// Phase 8 — cross-module integrations
export {
  STANDARD_COHORTS,
  buildCohort,
  buildAllStandardCohorts,
  buildSegmentPerformanceFeed,
  getSegmentEventOverlap,
  type CohortSpec,
} from "./services/integrations";

// Phase 6 support — attribute refresher (cron)
export {
  refreshAllAttributes,
} from "./services/attributeRefresher";

// Starter template library — consumed by the UI campaign-builder
export {
  EMAIL_TEMPLATES,
  getTemplate,
  type EmailTemplate,
} from "./templates";
