// ============================================================================
// FWB Reward Redemption Service
// ============================================================================

import type { FWBRedeemResult, FWBReward, FWBWallet, FWBTier } from '@/lib/types/fwb';
import { TIER_ORDER } from '@/lib/types/fwb';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Redeem a reward from the Benefits Vault.
 *
 * 1. Fetch wallet and reward in parallel
 * 2. Validate eligibility
 * 3. Deduct benefits, decrement inventory, create records
 * 4. Return result
 */
export async function redeemReward(params: {
  walletId: string;
  rewardId: string;
  supabase: SupabaseClient;
}): Promise<FWBRedeemResult> {
  const { walletId, rewardId, supabase } = params;

  // 1. Fetch wallet and reward in parallel
  const [walletResult, rewardResult] = await Promise.all([
    supabase.from('fwb_wallets').select('*').eq('id', walletId).single(),
    supabase.from('fwb_rewards').select('*').eq('id', rewardId).single(),
  ]);

  if (walletResult.error || !walletResult.data) {
    throw new Error(`Wallet not found: ${walletResult.error?.message}`);
  }
  if (rewardResult.error || !rewardResult.data) {
    throw new Error(`Reward not found: ${rewardResult.error?.message}`);
  }

  const wallet = walletResult.data as FWBWallet;
  const reward = rewardResult.data as FWBReward;

  // 2. Validate
  if (!reward.is_active) {
    throw new Error('This reward is no longer active');
  }

  if (reward.expiration_date && new Date(reward.expiration_date) < new Date()) {
    throw new Error('This reward has expired');
  }

  if (reward.inventory_remaining !== null && reward.inventory_remaining <= 0) {
    throw new Error('This reward is out of stock');
  }

  if (wallet.current_benefits_balance < reward.reward_cost_in_benefits) {
    throw new Error(
      `Insufficient benefits. Need ${reward.reward_cost_in_benefits}, have ${wallet.current_benefits_balance}`
    );
  }

  // Check tier eligibility
  const walletTierIndex = TIER_ORDER.indexOf(wallet.current_tier);
  const rewardTierIndex = TIER_ORDER.indexOf(reward.min_tier);
  if (walletTierIndex < rewardTierIndex) {
    throw new Error(
      `This reward requires ${reward.min_tier} tier or higher`
    );
  }

  // 3. Execute redemption (sequential updates for transaction safety)
  const newBalance = wallet.current_benefits_balance - reward.reward_cost_in_benefits;

  // Deduct benefits from wallet
  const { error: walletUpdateError } = await supabase
    .from('fwb_wallets')
    .update({
      current_benefits_balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq('id', walletId);

  if (walletUpdateError) {
    throw new Error(`Failed to deduct benefits: ${walletUpdateError.message}`);
  }

  // Decrement inventory if tracked
  if (reward.inventory_remaining !== null) {
    const { error: inventoryError } = await supabase
      .from('fwb_rewards')
      .update({
        inventory_remaining: reward.inventory_remaining - 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rewardId);

    if (inventoryError) {
      throw new Error(`Failed to update reward inventory: ${inventoryError.message}`);
    }
  }

  // Create redemption record
  const { data: redemption, error: redemptionError } = await supabase
    .from('fwb_redemptions')
    .insert({
      wallet_id: walletId,
      reward_id: rewardId,
      benefits_spent: reward.reward_cost_in_benefits,
      status: 'pending',
    })
    .select('id')
    .single();

  if (redemptionError || !redemption) {
    throw new Error(`Failed to create redemption record: ${redemptionError?.message}`);
  }

  // Create redeem transaction (negative amount)
  const { error: txnError } = await supabase.from('fwb_transactions').insert({
    wallet_id: walletId,
    transaction_type: 'redeem',
    amount: -reward.reward_cost_in_benefits,
    balance_after: newBalance,
    description: `Redeemed "${reward.reward_name}" for ${reward.reward_cost_in_benefits} benefits`,
    event_id: null,
    order_id: null,
    reward_id: rewardId,
    multiplier_applied: 1.0,
  });

  if (txnError) {
    throw new Error(`Failed to create redeem transaction: ${txnError.message}`);
  }

  // 4. Return result
  return {
    success: true,
    redemption_id: redemption.id,
    benefits_spent: reward.reward_cost_in_benefits,
    new_balance: newBalance,
    reward,
  };
}

/**
 * Get active, non-expired rewards with remaining inventory for a venue.
 */
export async function getAvailableRewards(
  venueId: string,
  supabase: SupabaseClient
): Promise<FWBReward[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('fwb_rewards')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .or(`expiration_date.is.null,expiration_date.gt.${now}`)
    .or('inventory_remaining.is.null,inventory_remaining.gt.0')
    .order('reward_cost_in_benefits', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch rewards for venue ${venueId}: ${error.message}`);
  }

  return (data || []) as FWBReward[];
}

/**
 * Get redemption history for a wallet with reward details.
 */
export async function getRedemptionHistory(
  walletId: string,
  supabase: SupabaseClient,
  limit: number = 50
) {
  const { data, error } = await supabase
    .from('fwb_redemptions')
    .select('*, fwb_rewards(*)')
    .eq('wallet_id', walletId)
    .order('redeemed_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch redemption history for wallet ${walletId}: ${error.message}`);
  }

  return data || [];
}
