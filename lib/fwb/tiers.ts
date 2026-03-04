// ============================================================================
// FWB Tier Calculation Service
// ============================================================================

import type { FWBConfig, FWBTier, FWBWallet } from '@/lib/types/fwb';
import { TIER_ORDER, TIER_LABELS } from '@/lib/types/fwb';
import { notifyTierUpgrade } from '@/lib/fwb/notifications';
import type { SupabaseClient } from '@supabase/supabase-js';

// ── Tier thresholds mapped from config ─────────────────────────────────────

interface TierThreshold {
  tier: FWBTier;
  min: number;
  max: number | null; // null = no upper limit (top tier)
}

function getTierThresholds(config: FWBConfig): TierThreshold[] {
  return [
    { tier: 'casual_friend', min: 0, max: config.tier_casual_max },
    { tier: 'close_friend', min: config.tier_casual_max + 1, max: config.tier_close_max },
    { tier: 'inner_circle', min: config.tier_close_max + 1, max: config.tier_inner_max },
    { tier: 'after_hours', min: config.tier_inner_max + 1, max: config.tier_after_hours_max },
    { tier: 'ride_or_die', min: config.tier_after_hours_max + 1, max: null },
  ];
}

/**
 * Determine tier based on lifetime benefits and config thresholds.
 */
export function calculateTier(lifetimeBenefits: number, config: FWBConfig): FWBTier {
  if (lifetimeBenefits > config.tier_after_hours_max) return 'ride_or_die';
  if (lifetimeBenefits > config.tier_inner_max) return 'after_hours';
  if (lifetimeBenefits > config.tier_close_max) return 'inner_circle';
  if (lifetimeBenefits > config.tier_casual_max) return 'close_friend';
  return 'casual_friend';
}

/**
 * Return tier progress info: current tier, next tier, progress percentage, etc.
 */
export function getTierProgress(lifetimeBenefits: number, config: FWBConfig) {
  const thresholds = getTierThresholds(config);
  const currentTier = calculateTier(lifetimeBenefits, config);
  const currentIndex = TIER_ORDER.indexOf(currentTier);
  const isMaxTier = currentIndex === TIER_ORDER.length - 1;

  const currentThresholdEntry = thresholds[currentIndex];
  const nextThresholdEntry = isMaxTier ? null : thresholds[currentIndex + 1];

  const currentThreshold = currentThresholdEntry.min;
  const nextThreshold = nextThresholdEntry ? nextThresholdEntry.min : null;

  let progressPercentage: number;
  let benefitsToNextTier: number | null;

  if (isMaxTier) {
    progressPercentage = 100;
    benefitsToNextTier = null;
  } else {
    const tierRangeStart = currentThreshold;
    const tierRangeEnd = nextThreshold!;
    const progressInTier = lifetimeBenefits - tierRangeStart;
    const tierRange = tierRangeEnd - tierRangeStart;
    progressPercentage = Math.min(100, Math.max(0, Math.floor((progressInTier / tierRange) * 100)));
    benefitsToNextTier = tierRangeEnd - lifetimeBenefits;
  }

  return {
    current_tier: currentTier,
    current_tier_label: TIER_LABELS[currentTier],
    next_tier: isMaxTier ? null : TIER_ORDER[currentIndex + 1],
    next_tier_label: isMaxTier ? null : TIER_LABELS[TIER_ORDER[currentIndex + 1]],
    progress_percentage: progressPercentage,
    benefits_to_next_tier: benefitsToNextTier,
    current_threshold: currentThreshold,
    next_threshold: nextThreshold,
  };
}

/**
 * Check if wallet's lifetime benefits qualify for tier upgrade.
 * If so, update the wallet and create a notification.
 */
export async function checkAndUpgradeTier(
  walletId: string,
  config: FWBConfig,
  supabase: SupabaseClient
): Promise<{ tier_upgraded: boolean; new_tier: FWBTier | null }> {
  const { data: wallet, error: walletError } = await supabase
    .from('fwb_wallets')
    .select('*')
    .eq('id', walletId)
    .single();

  if (walletError || !wallet) {
    throw new Error(`Failed to fetch wallet ${walletId}: ${walletError?.message}`);
  }

  const newTier = calculateTier(wallet.lifetime_benefits_earned, config);

  if (newTier === wallet.current_tier) {
    return { tier_upgraded: false, new_tier: null };
  }

  // Only upgrade, never downgrade
  const currentIndex = TIER_ORDER.indexOf(wallet.current_tier as FWBTier);
  const newIndex = TIER_ORDER.indexOf(newTier);
  if (newIndex <= currentIndex) {
    return { tier_upgraded: false, new_tier: null };
  }

  const { error: updateError } = await supabase
    .from('fwb_wallets')
    .update({ current_tier: newTier, updated_at: new Date().toISOString() })
    .eq('id', walletId);

  if (updateError) {
    throw new Error(`Failed to upgrade tier for wallet ${walletId}: ${updateError.message}`);
  }

  await notifyTierUpgrade(walletId, newTier, supabase);

  return { tier_upgraded: true, new_tier: newTier };
}
