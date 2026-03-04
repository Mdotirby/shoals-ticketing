// ============================================================================
// FWB Benefits Earning Service
// ============================================================================

import type { FWBEarnResult, FWBWallet } from '@/lib/types/fwb';
import { getConfig } from '@/lib/fwb/config';
import { calculateTier, checkAndUpgradeTier } from '@/lib/fwb/tiers';
import { getMultiplier, updateStreak } from '@/lib/fwb/streaks';
import { notifyStreakMilestone } from '@/lib/fwb/notifications';
import type { SupabaseClient } from '@supabase/supabase-js';

interface EarnParams {
  userId: string;
  venueId: string;
  amountSpent: number;
  eventId?: string;
  orderId?: string;
  supabase: SupabaseClient;
}

/**
 * Main earn function — awards benefits for a purchase.
 *
 * 1. Get or create wallet
 * 2. Get config for venue
 * 3. Check and update streak (if eventId provided)
 * 4. Calculate multiplier from streak
 * 5. Calculate benefits earned
 * 6. Update wallet balances
 * 7. Create transaction record
 * 8. Check and handle tier upgrade
 * 9. Return result
 */
export async function earnBenefits(params: EarnParams): Promise<FWBEarnResult> {
  const { userId, venueId, amountSpent, eventId, orderId, supabase } = params;

  // 1. Get or create wallet
  const wallet = await getOrCreateWallet(userId, venueId, supabase);

  // 2. Get config
  const config = await getConfig(venueId, supabase);

  // 3 & 4. Handle streak and multiplier
  let streakUpdated = false;
  let newStreak = wallet.current_streak_count;
  let multiplier = 1.0;

  if (eventId) {
    const streakResult = await updateStreak(wallet.id, new Date(), config, supabase);
    newStreak = streakResult.new_streak;
    streakUpdated = true;
    multiplier = getMultiplier(newStreak, config);

    // Notify on streak milestones
    await notifyStreakMilestone(wallet.id, newStreak, supabase);
  }

  // Apply double benefits if active
  if (config.double_benefits_active || (eventId && config.double_benefits_event_ids.includes(eventId))) {
    multiplier *= 2;
  }

  // 5. Calculate benefits
  const benefitsEarned = Math.floor(amountSpent * config.earn_rate_per_dollar * multiplier);

  // 6. Update wallet
  const newBalance = wallet.current_benefits_balance + benefitsEarned;
  const newLifetime = wallet.lifetime_benefits_earned + benefitsEarned;

  const expirationDate = new Date();
  expirationDate.setMonth(expirationDate.getMonth() + config.expiration_months);

  const { error: updateError } = await supabase
    .from('fwb_wallets')
    .update({
      current_benefits_balance: newBalance,
      lifetime_benefits_earned: newLifetime,
      benefits_expiration_date: expirationDate.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', wallet.id);

  if (updateError) {
    throw new Error(`Failed to update wallet ${wallet.id}: ${updateError.message}`);
  }

  // 7. Create transaction record
  const { error: txnError } = await supabase.from('fwb_transactions').insert({
    wallet_id: wallet.id,
    transaction_type: 'earn',
    amount: benefitsEarned,
    balance_after: newBalance,
    description: `Earned ${benefitsEarned} benefits from $${amountSpent.toFixed(2)} purchase`,
    event_id: eventId || null,
    order_id: orderId || null,
    reward_id: null,
    multiplier_applied: multiplier,
  });

  if (txnError) {
    throw new Error(`Failed to create earn transaction: ${txnError.message}`);
  }

  // 8. Check tier upgrade
  const tierResult = await checkAndUpgradeTier(wallet.id, config, supabase);

  // 9. Return result
  return {
    benefits_earned: benefitsEarned,
    multiplier_applied: multiplier,
    new_balance: newBalance,
    new_lifetime: newLifetime,
    tier_upgraded: tierResult.tier_upgraded,
    new_tier: tierResult.new_tier,
    streak_updated: streakUpdated,
    new_streak: newStreak,
  };
}

/**
 * Find existing wallet or create a new one for user+venue.
 */
export async function getOrCreateWallet(
  userId: string,
  venueId: string,
  supabase: SupabaseClient
): Promise<FWBWallet> {
  // Try to find existing wallet
  const { data: existing, error: fetchError } = await supabase
    .from('fwb_wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('venue_id', venueId)
    .single();

  if (existing && !fetchError) {
    return existing as FWBWallet;
  }

  // Create new wallet
  const expirationDate = new Date();
  expirationDate.setMonth(expirationDate.getMonth() + 12);

  const { data: newWallet, error: insertError } = await supabase
    .from('fwb_wallets')
    .insert({
      user_id: userId,
      venue_id: venueId,
      current_benefits_balance: 0,
      lifetime_benefits_earned: 0,
      current_tier: 'casual_friend',
      current_streak_count: 0,
      last_event_attended_date: null,
      benefits_expiration_date: expirationDate.toISOString(),
    })
    .select('*')
    .single();

  if (insertError || !newWallet) {
    throw new Error(
      `Failed to create wallet for user ${userId} at venue ${venueId}: ${insertError?.message}`
    );
  }

  return newWallet as FWBWallet;
}
