/**
 * modules/ad-engine/constants.ts — tunable safety + optimization knobs.
 * Keep small, explicit, and ONE source of truth for thresholds.
 */

export const AD_ENGINE = {
  /** Minimum asset/hook counts required before launch. Matches spec. */
  MIN_CREATIVES: 3,
  MIN_VIDEOS: 1,
  MIN_HOOKS: 2,

  /** Freshness gate — metrics older than this block optimization. */
  METRICS_MAX_AGE_HOURS: 12,

  /** Cooldown windows (hours). */
  LAUNCH_COOLDOWN_HOURS: 6,                // no changes within 6h of launch (low)
  LAUNCH_COOLDOWN_HARD_HOURS: 12,          // no HIGH-risk changes within 12h of launch
  BUDGET_ADJ_COOLDOWN_HOURS: 24,           // max 1 budget adjustment per 24h

  /** Scaling guardrails. */
  MAX_SCALE_UP_STEP_PCT: 0.20,             // never raise daily budget > +20%
  MAX_SCALE_DOWN_STEP_PCT: 0.30,           // never drop daily budget > -30%
  DEFAULT_SCALING_STEP_PCT: 0.15,          // default single-step

  /** Mode thresholds. */
  EFFICIENCY: {
    MIN_ROAS_TO_SCALE: 2.0,                // scale up when ROAS >= 2.0
    MAX_CPC_TO_SCALE: 1.5,                 // and CPC under $1.50
    ROAS_FLOOR_TO_PAUSE: 0.8,              // pause creative when ROAS < 0.8
  },
  VOLUME: {
    MIN_CTR_TO_SCALE: 0.012,               // 1.2% CTR
    MAX_CPM_TO_SCALE: 25.0,                // under $25 CPM
    CTR_FLOOR_TO_PAUSE: 0.003,             // 0.3% — probably broken
  },

  /** Confidence → minimum sample sizes. */
  SAMPLE: {
    HIGH_MIN_IMPRESSIONS: 5000,
    HIGH_MIN_CLICKS: 50,
    MED_MIN_IMPRESSIONS: 1500,
    MED_MIN_CLICKS: 15,
  },

  /** Default daily cap if none set (safe starter). */
  DEFAULT_DAILY_CAP: 50,
  DEFAULT_TOTAL_CAP: 2000,
} as const;
