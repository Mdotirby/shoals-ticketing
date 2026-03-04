// ============================================================================
// FWB Analytics Engine
// ============================================================================

import type { FWBAnalytics, FWBTier } from '@/lib/types/fwb';
import { TIER_ORDER } from '@/lib/types/fwb';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Calculate and return comprehensive analytics for a venue's FWB program.
 */
export async function getAnalytics(
  venueId: string,
  supabase: SupabaseClient
): Promise<FWBAnalytics> {
  // Fetch all wallets for the venue
  const { data: wallets, error: walletsError } = await supabase
    .from('fwb_wallets')
    .select('id, current_benefits_balance, lifetime_benefits_earned, current_tier, current_streak_count')
    .eq('venue_id', venueId);

  if (walletsError) {
    throw new Error(`Failed to fetch wallets for analytics: ${walletsError.message}`);
  }

  const allWallets = wallets || [];
  const totalMembers = allWallets.length;

  if (totalMembers === 0) {
    return buildEmptyAnalytics();
  }

  const walletIds = allWallets.map((w: { id: string }) => w.id);

  // Fetch all transactions for these wallets
  const { data: transactions, error: txnError } = await supabase
    .from('fwb_transactions')
    .select('wallet_id, transaction_type, amount, event_id')
    .in('wallet_id', walletIds);

  if (txnError) {
    throw new Error(`Failed to fetch transactions for analytics: ${txnError.message}`);
  }

  const allTxns = transactions || [];

  // Fetch redemption counts per wallet
  const { data: redemptions, error: redemptionError } = await supabase
    .from('fwb_redemptions')
    .select('wallet_id')
    .in('wallet_id', walletIds);

  if (redemptionError) {
    throw new Error(`Failed to fetch redemptions for analytics: ${redemptionError.message}`);
  }

  const allRedemptions = redemptions || [];

  // ── Calculate metrics ─────────────────────────────────────────────────

  // Earn transactions with event_id (event attendance)
  const earnWithEvent = allTxns.filter(
    (t: { transaction_type: string; event_id: string | null }) =>
      t.transaction_type === 'earn' && t.event_id
  );
  const avgEventsPerMember = earnWithEvent.length / totalMembers;

  // Average spend per member (sum of earn amounts / earn_rate gives original spend)
  const earnTxns = allTxns.filter((t: { transaction_type: string }) => t.transaction_type === 'earn');
  const totalEarnAmount = earnTxns.reduce(
    (sum: number, t: { amount: number }) => sum + Math.abs(t.amount), 0
  );
  const avgSpendPerMember = totalEarnAmount / totalMembers;

  // Redemption rate: wallets with at least one redemption / total wallets
  const walletsWithRedemption = new Set(
    allRedemptions.map((r: { wallet_id: string }) => r.wallet_id)
  );
  const redemptionRate = walletsWithRedemption.size / totalMembers;

  // Breakage rate: expired / (expired + redeemed)
  const expireTxns = allTxns.filter(
    (t: { transaction_type: string }) => t.transaction_type === 'expire'
  );
  const redeemTxns = allTxns.filter(
    (t: { transaction_type: string }) => t.transaction_type === 'redeem'
  );
  const totalExpired = expireTxns.reduce(
    (sum: number, t: { amount: number }) => sum + Math.abs(t.amount), 0
  );
  const totalRedeemed = redeemTxns.reduce(
    (sum: number, t: { amount: number }) => sum + Math.abs(t.amount), 0
  );
  const breakageRate = totalExpired + totalRedeemed > 0
    ? totalExpired / (totalExpired + totalRedeemed)
    : 0;

  // Tier distribution
  const tierDistribution = {} as Record<FWBTier, number>;
  for (const tier of TIER_ORDER) {
    tierDistribution[tier] = 0;
  }
  for (const w of allWallets) {
    const tier = w.current_tier as FWBTier;
    if (tierDistribution[tier] !== undefined) {
      tierDistribution[tier]++;
    }
  }

  // Total benefits outstanding
  const totalBenefitsOutstanding = allWallets.reduce(
    (sum: number, w: { current_benefits_balance: number }) => sum + w.current_benefits_balance, 0
  );

  // Active members: wallets with balance > 0 or streak > 0
  const activeMembers = allWallets.filter(
    (w: { current_benefits_balance: number; current_streak_count: number }) =>
      w.current_benefits_balance > 0 || w.current_streak_count > 0
  ).length;

  // Monthly earn trend (last 12 months)
  const monthlyEarnTrend = calculateMonthlyEarnTrend(earnTxns);

  // Popular rewards
  const popularRewards = await getPopularRewards(venueId, supabase);

  return {
    total_members: totalMembers,
    active_members: activeMembers,
    avg_events_per_member: Math.round(avgEventsPerMember * 100) / 100,
    avg_spend_per_member: Math.round(avgSpendPerMember * 100) / 100,
    redemption_rate: Math.round(redemptionRate * 1000) / 1000,
    breakage_rate: Math.round(breakageRate * 1000) / 1000,
    tier_distribution: tierDistribution,
    total_benefits_outstanding: totalBenefitsOutstanding,
    total_benefits_redeemed: totalRedeemed,
    total_benefits_expired: totalExpired,
    monthly_earn_trend: monthlyEarnTrend,
    popular_rewards: popularRewards,
  };
}

function buildEmptyAnalytics(): FWBAnalytics {
  const tierDistribution = {} as Record<FWBTier, number>;
  for (const tier of TIER_ORDER) {
    tierDistribution[tier] = 0;
  }

  return {
    total_members: 0,
    active_members: 0,
    avg_events_per_member: 0,
    avg_spend_per_member: 0,
    redemption_rate: 0,
    breakage_rate: 0,
    tier_distribution: tierDistribution,
    total_benefits_outstanding: 0,
    total_benefits_redeemed: 0,
    total_benefits_expired: 0,
    monthly_earn_trend: [],
    popular_rewards: [],
  };
}

function calculateMonthlyEarnTrend(
  earnTxns: { amount: number; created_at?: string }[]
): { month: string; benefits_earned: number }[] {
  const monthMap = new Map<string, number>();

  // Initialize last 12 months
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthMap.set(key, 0);
  }

  for (const txn of earnTxns) {
    if (!txn.created_at) continue;
    const d = new Date(txn.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthMap.has(key)) {
      monthMap.set(key, (monthMap.get(key) || 0) + Math.abs(txn.amount));
    }
  }

  return Array.from(monthMap.entries()).map(([month, benefits_earned]) => ({
    month,
    benefits_earned: Math.round(benefits_earned * 100) / 100,
  }));
}

async function getPopularRewards(
  venueId: string,
  supabase: SupabaseClient
): Promise<{ reward_id: string; reward_name: string; redemption_count: number }[]> {
  // Get redemption counts grouped by reward via a join query
  const { data: rewards, error } = await supabase
    .from('fwb_rewards')
    .select('id, reward_name')
    .eq('venue_id', venueId);

  if (error || !rewards) return [];

  const results: { reward_id: string; reward_name: string; redemption_count: number }[] = [];

  for (const reward of rewards) {
    const { count, error: countError } = await supabase
      .from('fwb_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('reward_id', reward.id);

    if (!countError) {
      results.push({
        reward_id: reward.id,
        reward_name: reward.reward_name,
        redemption_count: count || 0,
      });
    }
  }

  return results
    .filter((r) => r.redemption_count > 0)
    .sort((a, b) => b.redemption_count - a.redemption_count)
    .slice(0, 10);
}
