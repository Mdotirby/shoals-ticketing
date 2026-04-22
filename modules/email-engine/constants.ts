/**
 * Email Engine — constants.
 * All thresholds, enum whitelists, and wire-protocol names live here.
 * Pure data. No side effects. Safe to import from anywhere.
 */

export const EMAIL_ENGINE = {
  /** UTM campaign prefix stamped on every outbound link. */
  UTM_SOURCE: "email-engine",
  UTM_CAMPAIGN_PREFIX: "ee:", // final form: "ee:<campaign_id>"

  /** Dispatch cron drain limits (per invocation). */
  DISPATCH_BATCH_SIZE: 100,
  DISPATCH_MAX_ATTEMPTS: 5,
  DISPATCH_BACKOFF_MIN_MS: 60_000,     // 1 min
  DISPATCH_BACKOFF_MAX_MS: 3_600_000,  // 1 hour

  /** Resend rate limit: 2 req/s on free plan — keep to 5/s even on paid. */
  DISPATCH_INTER_SEND_MS: 220,

  /** Attribution window for email → order conversion. */
  CONVERSION_WINDOW_DAYS: 7,

  /** Optimization thresholds — rule-based, no AI. */
  THRESHOLDS: {
    LOW_OPEN_RATE: 0.15,       // < 15% unique opens / delivered
    HIGH_OPEN_RATE: 0.45,
    LOW_CLICK_RATE: 0.015,     // < 1.5%
    HIGH_CLICK_RATE: 0.05,
    LOW_CONVERSION_RATE: 0.005,
    HIGH_CONVERSION_RATE: 0.02,
    HIGH_BOUNCE_RATE: 0.05,
    HIGH_COMPLAINT_RATE: 0.001,
  },

  /** Canonical automation trigger names (matches ee_automation_flows.trigger_type). */
  TRIGGERS: {
    NEW_EVENT_ANNOUNCEMENT: "new_event_announcement",
    CART_ABANDONMENT: "cart_abandonment",
    POST_EVENT_FOLLOWUP: "post_event_followup",
    REPEAT_BUYER_NURTURE: "repeat_buyer_nurture",
    WELCOME_SERIES: "welcome_series",
    REENGAGEMENT: "reengagement",
  } as const,
} as const;

export type EmailEngineTrigger =
  (typeof EMAIL_ENGINE.TRIGGERS)[keyof typeof EMAIL_ENGINE.TRIGGERS];

/** Segment rule operator whitelist. Anything outside this is rejected. */
export const SEGMENT_OPERATORS = [
  "eq", "neq", "gt", "gte", "lt", "lte",
  "in", "not_in",
  "contains", "not_contains",
  "is_null", "is_not_null",
  "within_last_days", "older_than_days",
] as const;
export type SegmentOperator = (typeof SEGMENT_OPERATORS)[number];

/**
 * Whitelist of segmentable fields → column in the `ee_contact_full` view.
 * Any field not in this map is rejected at compile time — prevents injection.
 * The `type` hint drives operator compatibility and value coercion.
 */
export const SEGMENT_FIELDS = {
  // Purchase rollup
  total_events_attended: { column: "total_events_attended", type: "number" },
  total_orders:          { column: "total_orders",          type: "number" },
  total_spent:           { column: "total_spent",           type: "number" },
  favorite_event_type:   { column: "favorite_event_type",   type: "string" },
  favorite_venue_id:     { column: "favorite_venue_id",     type: "uuid"   },
  last_event_date:       { column: "last_event_date",       type: "date"   },
  last_order_at:         { column: "last_order_at",         type: "date"   },
  first_order_at:        { column: "first_order_at",        type: "date"   },

  // Engagement rollup
  last_email_sent_at:    { column: "last_email_sent_at",    type: "date"   },
  last_email_opened_at:  { column: "last_email_opened_at",  type: "date"   },
  last_email_clicked_at: { column: "last_email_clicked_at", type: "date"   },
  emails_received:       { column: "emails_received",       type: "number" },
  emails_opened:         { column: "emails_opened",         type: "number" },
  emails_clicked:        { column: "emails_clicked",        type: "number" },
  open_rate:             { column: "open_rate",             type: "number" },
  click_rate:            { column: "click_rate",            type: "number" },

  // Flags
  lfv_segment:           { column: "lfv_segment",           type: "string" },
  is_fwb_subscriber:     { column: "is_fwb_subscriber",     type: "boolean" },
  has_cart_abandonment:  { column: "has_cart_abandonment",  type: "boolean" },

  // Contact identity
  zip_code:              { column: "zip_code",              type: "string" },
  venue_id:              { column: "venue_id",              type: "uuid"   },
  primary_source:        { column: "primary_source",        type: "string" },
  created_at:            { column: "created_at",            type: "date"   },
} as const;

export type SegmentField = keyof typeof SEGMENT_FIELDS;
