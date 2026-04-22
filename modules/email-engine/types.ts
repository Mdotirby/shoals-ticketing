/**
 * Email Engine — shared types.
 * All DB writes happen through services/*; this file is pure types only.
 */

import type { SegmentField, SegmentOperator, EmailEngineTrigger } from "./constants";

// ────────────────────────────────────────────────────────────────────
//  Core entities (DB row shapes)
// ────────────────────────────────────────────────────────────────────

export type EeContact = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  zip_code: string | null;
  venue_id: string | null;
  primary_source: "customer_profile" | "newsletter" | "order";
  created_at: string;
};

export type EeContactAttributes = {
  id: string;
  email: string;
  total_events_attended: number;
  total_orders: number;
  total_spent: number;
  first_order_at: string | null;
  last_event_date: string | null;
  last_order_at: string | null;
  favorite_event_type: string | null;
  favorite_venue_id: string | null;
  emails_received: number;
  emails_opened: number;
  emails_clicked: number;
  last_email_sent_at: string | null;
  last_email_opened_at: string | null;
  last_email_clicked_at: string | null;
  open_rate: number | null;
  click_rate: number | null;
  is_fwb_subscriber: boolean;
  is_unsubscribed: boolean;
  is_suppressed: boolean;
  has_cart_abandonment: boolean;
  lfv_segment: string | null;
  tags: string[];
  computed_at: string;
  created_at: string;
  updated_at: string;
};

export type EeSegment = {
  id: string;
  venue_id: string | null;
  name: string;
  description: string | null;
  rules: SegmentRuleGroup;
  last_count: number | null;
  last_evaluated: string | null;
  is_system: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EeCampaignStatus =
  | "draft" | "scheduled" | "sending" | "sent"
  | "paused" | "failed" | "cancelled";

export type EeCampaign = {
  id: string;
  venue_id: string | null;
  segment_id: string | null;
  event_id: string | null;
  name: string;
  subject: string;
  preview_text: string | null;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  status: EeCampaignStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  total_recipients: number;
  total_sent: number;
  total_failed: number;
  performance_tier: "high_performer" | "normal" | "low_engagement" | "low_conversion" | null;
  flags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EeCampaignMessage = {
  id: string;
  campaign_id: string;
  content_html: string;
  content_text: string | null;
  body_json: unknown;
  template_key: string | null;
  created_at: string;
  updated_at: string;
};

export type EeCampaignMetrics = {
  id: string;
  campaign_id: string;
  recipients: number;
  delivered: number;
  opens: number;
  unique_opens: number;
  clicks: number;
  unique_clicks: number;
  bounces: number;
  complaints: number;
  unsubscribes: number;
  conversions: number;
  revenue: number;
  open_rate: number | null;
  click_rate: number | null;
  click_to_open: number | null;
  conversion_rate: number | null;
  revenue_per_email: number | null;
  computed_at: string;
};

export type EeSendLogStatus =
  | "queued" | "sent" | "delivered" | "opened" | "clicked"
  | "bounced" | "complained" | "failed" | "unsubscribed" | "suppressed";

export type EeSendLog = {
  id: string;
  campaign_id: string | null;
  automation_run_id: string | null;
  resend_message_id: string | null;
  recipient_email: string;
  recipient_name: string | null;
  status: EeSendLogStatus;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  failed_at: string | null;
  open_count: number;
  click_count: number;
  utm_campaign: string | null;
  conversion_order_id: string | null;
  converted_at: string | null;
  revenue: number | null;
  error: string | null;
  created_at: string;
};

export type EeAutomationFlow = {
  id: string;
  venue_id: string | null;
  name: string;
  description: string | null;
  trigger_type: EmailEngineTrigger | string;
  segment_id: string | null;
  steps: EeAutomationStep[];
  config: Record<string, unknown>;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EeAutomationStep = {
  /** Minutes to wait after previous step (or trigger) before sending this step. */
  delay_minutes: number;
  /** Optional key for templates/*.ts re-render. */
  template_key?: string;
  subject: string;
  content_html: string;
  content_text?: string;
  /** Optional override of from/reply addresses. */
  from_email?: string;
  from_name?: string;
  reply_to?: string;
};

export type EeAutomationRunStatus =
  | "pending" | "running" | "completed" | "cancelled" | "failed";

export type EeAutomationRun = {
  id: string;
  flow_id: string;
  recipient_email: string;
  trigger_ref: Record<string, unknown>;
  current_step: number;
  status: EeAutomationRunStatus;
  next_run_at: string;
  started_at: string;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type EeOptimizationFlagKind =
  | "low_open_rate" | "low_click_rate" | "high_performer"
  | "low_conversion" | "suggest_subject" | "suggest_content"
  | "suppression_spike" | "high_bounce";

export type EeOptimizationFlag = {
  id: string;
  campaign_id: string;
  kind: EeOptimizationFlagKind;
  severity: "info" | "warn" | "critical";
  details: Record<string, unknown>;
  suggestions: string[];
  resolved_at: string | null;
  created_at: string;
};

// ────────────────────────────────────────────────────────────────────
//  Segmentation rule tree
// ────────────────────────────────────────────────────────────────────

export type SegmentRuleCondition = {
  field: SegmentField;
  op: SegmentOperator;
  value?: unknown;
};

export type SegmentRuleGroup = {
  op: "AND" | "OR";
  conditions: (SegmentRuleCondition | SegmentRuleGroup)[];
};

export function isGroup(
  node: SegmentRuleCondition | SegmentRuleGroup,
): node is SegmentRuleGroup {
  return (node as SegmentRuleGroup).conditions !== undefined;
}

// ────────────────────────────────────────────────────────────────────
//  Render + dispatch payloads
// ────────────────────────────────────────────────────────────────────

export type RenderContext = {
  first_name?: string;
  last_name?: string;
  email: string;
  event_name?: string;
  event_date?: string;
  event_image?: string;
  venue_name?: string;
  unsubscribe_url?: string;
  [key: string]: string | undefined;
};

export type DispatchPayload = {
  campaign_id?: string | null;
  automation_run_id?: string | null;
  send_log_id: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  content_html: string;
  content_text: string | null;
  from_email: string;
  from_name: string | null;
  reply_to: string | null;
};

// ────────────────────────────────────────────────────────────────────
//  Integration hand-off shapes (Phase 8)
// ────────────────────────────────────────────────────────────────────

export type EngagementCohort = {
  /** Stable identifier (e.g. "engaged-last-30d") for downstream modules. */
  key: string;
  label: string;
  /** Hashed emails (SHA-256 lowercase hex) — Meta/Snap custom audience format. */
  hashed_emails: string[];
  /** Plain count — never leak raw emails to logs. */
  size: number;
};

export type SegmentPerformanceFeed = {
  segment_id: string;
  segment_name: string;
  recipients: number;
  conversions: number;
  conversion_rate: number;
  revenue: number;
  revenue_per_email: number;
};
