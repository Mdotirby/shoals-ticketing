// ============================================================================
// FWB Loyalty Engine — Type Definitions
// ============================================================================

// ── Enums ───────────────────────────────────────────────────────────────────

export type FWBTier =
  | 'casual_friend'
  | 'close_friend'
  | 'inner_circle'
  | 'after_hours'
  | 'ride_or_die';

export type FWBTransactionType = 'earn' | 'redeem' | 'expire' | 'admin_adjust';

export type FWBRewardType = 'ticket' | 'bar_tab' | 'hotel' | 'merch' | 'experience';

export type FWBRedemptionStatus = 'pending' | 'fulfilled' | 'cancelled';

export type FWBNotificationType =
  | 'tier_upgrade'
  | 'streak_milestone'
  | 'reward_drop'
  | 'double_benefits'
  | 'benefits_earned'
  | 'benefits_expiring'
  | 'redemption_fulfilled';

// ── Database Row Types ──────────────────────────────────────────────────────

export interface FWBConfig {
  id: string;
  venue_id: string;
  earn_rate_per_dollar: number;
  streak_3_multiplier: number;
  streak_5_multiplier: number;
  tier_casual_max: number;
  tier_close_max: number;
  tier_inner_max: number;
  tier_after_hours_max: number;
  expiration_months: number;
  streak_reset_days: number;
  double_benefits_active: boolean;
  double_benefits_event_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface FWBWallet {
  id: string;
  user_id: string;
  venue_id: string;
  current_benefits_balance: number;
  lifetime_benefits_earned: number;
  current_tier: FWBTier;
  current_streak_count: number;
  last_event_attended_date: string | null;
  benefits_expiration_date: string;
  created_at: string;
  updated_at: string;
}

export interface FWBTransaction {
  id: string;
  wallet_id: string;
  transaction_type: FWBTransactionType;
  amount: number;
  balance_after: number;
  description: string;
  event_id: string | null;
  order_id: string | null;
  reward_id: string | null;
  multiplier_applied: number;
  created_at: string;
}

export interface FWBReward {
  id: string;
  venue_id: string;
  reward_name: string;
  description: string | null;
  reward_cost_in_benefits: number;
  reward_type: FWBRewardType;
  inventory_limit: number | null;
  inventory_remaining: number | null;
  min_tier: FWBTier;
  expiration_date: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FWBRedemption {
  id: string;
  wallet_id: string;
  reward_id: string;
  benefits_spent: number;
  status: FWBRedemptionStatus;
  redeemed_at: string;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  notes: string | null;
}

export interface FWBNotification {
  id: string;
  wallet_id: string;
  notification_type: FWBNotificationType;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

export interface FWBTierPerk {
  id: string;
  venue_id: string;
  tier: FWBTier;
  perk_name: string;
  perk_description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── API Response Types ──────────────────────────────────────────────────────

export interface FWBWalletSummary {
  wallet: FWBWallet;
  tier_progress: {
    current_tier: FWBTier;
    current_tier_label: string;
    next_tier: FWBTier | null;
    next_tier_label: string | null;
    current_threshold: number;
    next_threshold: number | null;
    progress_percentage: number;
    benefits_to_next_tier: number | null;
  };
  streak_info: {
    current_streak: number;
    current_multiplier: number;
    next_multiplier_at: number | null;
    streak_active: boolean;
    days_until_reset: number | null;
  };
  perks: FWBTierPerk[];
  notifications_unread: number;
}

export interface FWBEarnResult {
  benefits_earned: number;
  multiplier_applied: number;
  new_balance: number;
  new_lifetime: number;
  tier_upgraded: boolean;
  new_tier: FWBTier | null;
  streak_updated: boolean;
  new_streak: number;
}

export interface FWBRedeemResult {
  success: boolean;
  redemption_id: string;
  benefits_spent: number;
  new_balance: number;
  reward: FWBReward;
}

export interface FWBAnalytics {
  total_members: number;
  active_members: number;
  avg_events_per_member: number;
  avg_spend_per_member: number;
  redemption_rate: number;
  breakage_rate: number;
  tier_distribution: Record<FWBTier, number>;
  total_benefits_outstanding: number;
  total_benefits_redeemed: number;
  total_benefits_expired: number;
  monthly_earn_trend: { month: string; benefits_earned: number }[];
  popular_rewards: { reward_id: string; reward_name: string; redemption_count: number }[];
}

// ── Constants ───────────────────────────────────────────────────────────────

export const TIER_LABELS: Record<FWBTier, string> = {
  casual_friend: 'Casual Friend',
  close_friend: 'Close Friend',
  inner_circle: 'Inner Circle',
  after_hours: 'After Hours',
  ride_or_die: 'Ride or Die',
};

export const TIER_ORDER: FWBTier[] = [
  'casual_friend',
  'close_friend',
  'inner_circle',
  'after_hours',
  'ride_or_die',
];
