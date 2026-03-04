// ============================================================================
// FWB Streak Engine
// ============================================================================

import type { FWBConfig, FWBWallet } from '@/lib/types/fwb';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Return the streak multiplier based on current streak count.
 * 5+ consecutive = streak_5_multiplier, 3-4 = streak_3_multiplier, else 1.0
 */
export function getMultiplier(streakCount: number, config: FWBConfig): number {
  if (streakCount >= 5) return config.streak_5_multiplier;
  if (streakCount >= 3) return config.streak_3_multiplier;
  return 1.0;
}

/**
 * Update streak for a wallet after attending an event.
 * Increments streak count and updates last_event_attended_date.
 * If more than streak_reset_days since last event, resets streak to 1.
 */
export async function updateStreak(
  walletId: string,
  eventDate: Date,
  config: FWBConfig,
  supabase: SupabaseClient
): Promise<{ new_streak: number }> {
  const { data: wallet, error } = await supabase
    .from('fwb_wallets')
    .select('*')
    .eq('id', walletId)
    .single();

  if (error || !wallet) {
    throw new Error(`Failed to fetch wallet ${walletId}: ${error?.message}`);
  }

  let newStreak: number;

  if (wallet.last_event_attended_date) {
    const lastDate = new Date(wallet.last_event_attended_date);
    const daysSinceLast = Math.floor(
      (eventDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceLast > config.streak_reset_days) {
      newStreak = 1;
    } else {
      newStreak = (wallet.current_streak_count || 0) + 1;
    }
  } else {
    newStreak = 1;
  }

  const { error: updateError } = await supabase
    .from('fwb_wallets')
    .update({
      current_streak_count: newStreak,
      last_event_attended_date: eventDate.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', walletId);

  if (updateError) {
    throw new Error(`Failed to update streak for wallet ${walletId}: ${updateError.message}`);
  }

  return { new_streak: newStreak };
}

/**
 * Check if a streak should be reset based on days since last event.
 */
export function checkStreakReset(wallet: FWBWallet, config: FWBConfig): boolean {
  if (!wallet.last_event_attended_date) return false;
  if (wallet.current_streak_count === 0) return false;

  const lastDate = new Date(wallet.last_event_attended_date);
  const now = new Date();
  const daysSinceLast = Math.floor(
    (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return daysSinceLast > config.streak_reset_days;
}

/**
 * Return streak info for a wallet.
 */
export function getStreakInfo(wallet: FWBWallet, config: FWBConfig) {
  const shouldReset = checkStreakReset(wallet, config);
  const effectiveStreak = shouldReset ? 0 : wallet.current_streak_count;
  const currentMultiplier = getMultiplier(effectiveStreak, config);

  let nextMultiplierAt: number | null = null;
  if (effectiveStreak < 3) {
    nextMultiplierAt = 3;
  } else if (effectiveStreak < 5) {
    nextMultiplierAt = 5;
  }

  let daysUntilReset: number | null = null;
  let streakActive = false;

  if (wallet.last_event_attended_date && effectiveStreak > 0) {
    const lastDate = new Date(wallet.last_event_attended_date);
    const now = new Date();
    const daysSinceLast = Math.floor(
      (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    daysUntilReset = Math.max(0, config.streak_reset_days - daysSinceLast);
    streakActive = daysUntilReset > 0;
  }

  return {
    current_streak: effectiveStreak,
    current_multiplier: currentMultiplier,
    next_multiplier_at: nextMultiplierAt,
    streak_active: streakActive,
    days_until_reset: daysUntilReset,
  };
}
