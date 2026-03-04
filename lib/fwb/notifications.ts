// ============================================================================
// FWB Notification Triggers
// ============================================================================

import type { FWBNotificationType, FWBTier } from '@/lib/types/fwb';
import { TIER_LABELS } from '@/lib/types/fwb';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Insert a notification record for a wallet.
 */
export async function createNotification(params: {
  walletId: string;
  type: FWBNotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  supabase: SupabaseClient;
}): Promise<void> {
  const { walletId, type, title, message, metadata, supabase } = params;

  const { error } = await supabase.from('fwb_notifications').insert({
    wallet_id: walletId,
    notification_type: type,
    title,
    message,
    metadata: metadata || null,
    is_read: false,
  });

  if (error) {
    throw new Error(`Failed to create notification for wallet ${walletId}: ${error.message}`);
  }
}

/**
 * Create a tier upgrade notification.
 */
export async function notifyTierUpgrade(
  walletId: string,
  newTier: FWBTier,
  supabase: SupabaseClient
): Promise<void> {
  const label = TIER_LABELS[newTier];
  await createNotification({
    walletId,
    type: 'tier_upgrade',
    title: `You've reached ${label}!`,
    message: `Congratulations! You've been upgraded to the ${label} tier. Enjoy your new perks and benefits.`,
    metadata: { new_tier: newTier },
    supabase,
  });
}

/**
 * Create a streak milestone notification at key milestones.
 */
export async function notifyStreakMilestone(
  walletId: string,
  streakCount: number,
  supabase: SupabaseClient
): Promise<void> {
  const milestones = [3, 5, 10, 25, 50, 100];
  if (!milestones.includes(streakCount)) return;

  await createNotification({
    walletId,
    type: 'streak_milestone',
    title: `${streakCount}-Event Streak! 🔥`,
    message: `You've attended ${streakCount} events in a row! Keep it going for even bigger rewards.`,
    metadata: { streak_count: streakCount },
    supabase,
  });
}

/**
 * Notify all wallets in a venue about a new reward drop.
 */
export async function notifyRewardDrop(
  venueId: string,
  rewardName: string,
  supabase: SupabaseClient
): Promise<void> {
  const { data: wallets, error } = await supabase
    .from('fwb_wallets')
    .select('id')
    .eq('venue_id', venueId);

  if (error) {
    throw new Error(`Failed to fetch wallets for venue ${venueId}: ${error.message}`);
  }

  if (!wallets || wallets.length === 0) return;

  const notifications = wallets.map((w: { id: string }) => ({
    wallet_id: w.id,
    notification_type: 'reward_drop' as FWBNotificationType,
    title: 'New Reward Available!',
    message: `"${rewardName}" just dropped in the Benefits Vault. Check it out before it's gone!`,
    metadata: { reward_name: rewardName },
    is_read: false,
  }));

  const { error: insertError } = await supabase
    .from('fwb_notifications')
    .insert(notifications);

  if (insertError) {
    throw new Error(`Failed to create reward drop notifications: ${insertError.message}`);
  }
}

/**
 * Get unread notifications for a wallet.
 */
export async function getUnreadNotifications(walletId: string, supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('fwb_notifications')
    .select('*')
    .eq('wallet_id', walletId)
    .eq('is_read', false)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch notifications for wallet ${walletId}: ${error.message}`);
  }

  return data;
}

/**
 * Mark specific notifications as read.
 */
export async function markNotificationsRead(
  walletId: string,
  notificationIds: string[],
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('fwb_notifications')
    .update({ is_read: true })
    .eq('wallet_id', walletId)
    .in('id', notificationIds);

  if (error) {
    throw new Error(`Failed to mark notifications as read: ${error.message}`);
  }
}
