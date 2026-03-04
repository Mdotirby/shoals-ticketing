// ============================================================================
// FWB Redemption Service — Unit Tests
// ============================================================================

import { redeemReward, getAvailableRewards } from '@/lib/fwb/redemption';
import { createMockSupabase, createTestWallet, createTestReward } from './helpers';

// ── redeemReward ────────────────────────────────────────────────────────────

describe('redeemReward', () => {
  function setupRedemption(overrides: {
    walletBalance?: number;
    walletTier?: string;
    rewardCost?: number;
    rewardActive?: boolean;
    rewardExpiration?: string | null;
    rewardInventory?: number | null;
    rewardMinTier?: string;
  } = {}) {
    const wallet = createTestWallet({
      id: 'wallet-1',
      current_benefits_balance: overrides.walletBalance ?? 500,
      current_tier: (overrides.walletTier ?? 'close_friend') as any,
    });
    const reward = createTestReward({
      id: 'reward-1',
      reward_cost_in_benefits: overrides.rewardCost ?? 100,
      is_active: overrides.rewardActive ?? true,
      expiration_date: overrides.rewardExpiration ?? null,
      inventory_remaining: overrides.rewardInventory ?? 10,
      min_tier: (overrides.rewardMinTier ?? 'casual_friend') as any,
    });

    // redeemReward fetches wallet and reward in parallel (both from first call),
    // then updates wallet, optionally updates reward inventory,
    // inserts redemption, inserts transaction.
    const supabase = createMockSupabase({
      fwb_wallets: { data: wallet, error: null },
      fwb_rewards: [
        { data: reward, error: null },  // fetch
        { data: null, error: null },    // inventory update
      ],
      fwb_redemptions: { data: { id: 'redemption-1' }, error: null },
      fwb_transactions: { data: null, error: null },
    });

    return { supabase, wallet, reward };
  }

  test('successful redemption deducts correct balance', async () => {
    const { supabase } = setupRedemption({ walletBalance: 500, rewardCost: 150 });

    const result = await redeemReward({
      walletId: 'wallet-1',
      rewardId: 'reward-1',
      supabase: supabase as any,
    });

    expect(result.success).toBe(true);
    expect(result.benefits_spent).toBe(150);
    expect(result.new_balance).toBe(350); // 500 - 150
    expect(result.redemption_id).toBe('redemption-1');
  });

  test('fails when balance is insufficient', async () => {
    const { supabase } = setupRedemption({ walletBalance: 50, rewardCost: 100 });

    await expect(
      redeemReward({ walletId: 'wallet-1', rewardId: 'reward-1', supabase: supabase as any })
    ).rejects.toThrow('Insufficient benefits');
  });

  test('fails when reward is inactive', async () => {
    const { supabase } = setupRedemption({ rewardActive: false });

    await expect(
      redeemReward({ walletId: 'wallet-1', rewardId: 'reward-1', supabase: supabase as any })
    ).rejects.toThrow('no longer active');
  });

  test('fails when reward is expired', async () => {
    const pastDate = new Date();
    pastDate.setFullYear(pastDate.getFullYear() - 1);
    const { supabase } = setupRedemption({ rewardExpiration: pastDate.toISOString() });

    await expect(
      redeemReward({ walletId: 'wallet-1', rewardId: 'reward-1', supabase: supabase as any })
    ).rejects.toThrow('reward has expired');
  });

  test('fails when reward inventory is 0', async () => {
    const { supabase } = setupRedemption({ rewardInventory: 0 });

    await expect(
      redeemReward({ walletId: 'wallet-1', rewardId: 'reward-1', supabase: supabase as any })
    ).rejects.toThrow('out of stock');
  });

  test('fails when wallet tier is below reward min_tier', async () => {
    const { supabase } = setupRedemption({
      walletTier: 'casual_friend',
      rewardMinTier: 'inner_circle',
    });

    await expect(
      redeemReward({ walletId: 'wallet-1', rewardId: 'reward-1', supabase: supabase as any })
    ).rejects.toThrow('requires inner_circle tier or higher');
  });

  test('inventory decrements by 1 after redemption', async () => {
    const { supabase } = setupRedemption({ rewardInventory: 5 });

    await redeemReward({
      walletId: 'wallet-1',
      rewardId: 'reward-1',
      supabase: supabase as any,
    });

    // Verify fwb_rewards was called (for fetch and update)
    const fromCalls = (supabase.from as jest.Mock).mock.calls;
    const rewardCalls = fromCalls.filter((c: string[]) => c[0] === 'fwb_rewards');
    expect(rewardCalls.length).toBe(2); // fetch + inventory update
  });

  test('does not update inventory when inventory_remaining is null (unlimited)', async () => {
    const wallet = createTestWallet({
      id: 'wallet-1',
      current_benefits_balance: 500,
      current_tier: 'close_friend',
    });
    const reward = createTestReward({
      id: 'reward-1',
      reward_cost_in_benefits: 100,
      inventory_remaining: null,
      inventory_limit: null,
    });

    const supabase = createMockSupabase({
      fwb_wallets: { data: wallet, error: null },
      fwb_rewards: { data: reward, error: null },
      fwb_redemptions: { data: { id: 'redemption-1' }, error: null },
      fwb_transactions: { data: null, error: null },
    });

    await redeemReward({
      walletId: 'wallet-1',
      rewardId: 'reward-1',
      supabase: supabase as any,
    });

    // Only 1 call to fwb_rewards (fetch), no inventory update
    const fromCalls = (supabase.from as jest.Mock).mock.calls;
    const rewardCalls = fromCalls.filter((c: string[]) => c[0] === 'fwb_rewards');
    expect(rewardCalls.length).toBe(1);
  });

  test('creates correct transaction record', async () => {
    const { supabase } = setupRedemption();

    await redeemReward({
      walletId: 'wallet-1',
      rewardId: 'reward-1',
      supabase: supabase as any,
    });

    const fromCalls = (supabase.from as jest.Mock).mock.calls;
    const txnCalls = fromCalls.filter((c: string[]) => c[0] === 'fwb_transactions');
    expect(txnCalls.length).toBe(1);
  });

  test('creates redemption record with pending status', async () => {
    const { supabase } = setupRedemption();

    await redeemReward({
      walletId: 'wallet-1',
      rewardId: 'reward-1',
      supabase: supabase as any,
    });

    const fromCalls = (supabase.from as jest.Mock).mock.calls;
    const redemptionCalls = fromCalls.filter((c: string[]) => c[0] === 'fwb_redemptions');
    expect(redemptionCalls.length).toBe(1);
  });

  test('returns the reward object in result', async () => {
    const { supabase, reward } = setupRedemption();

    const result = await redeemReward({
      walletId: 'wallet-1',
      rewardId: 'reward-1',
      supabase: supabase as any,
    });

    expect(result.reward.id).toBe(reward.id);
    expect(result.reward.reward_name).toBe(reward.reward_name);
  });

  test('throws when wallet not found', async () => {
    const supabase = createMockSupabase({
      fwb_wallets: { data: null, error: { message: 'not found' } },
      fwb_rewards: { data: createTestReward(), error: null },
    });

    await expect(
      redeemReward({ walletId: 'bad-id', rewardId: 'reward-1', supabase: supabase as any })
    ).rejects.toThrow('Wallet not found');
  });

  test('throws when reward not found', async () => {
    const supabase = createMockSupabase({
      fwb_wallets: { data: createTestWallet(), error: null },
      fwb_rewards: { data: null, error: { message: 'not found' } },
    });

    await expect(
      redeemReward({ walletId: 'wallet-1', rewardId: 'bad-id', supabase: supabase as any })
    ).rejects.toThrow('Reward not found');
  });

  test('succeeds with exact balance matching reward cost', async () => {
    const { supabase } = setupRedemption({ walletBalance: 100, rewardCost: 100 });

    const result = await redeemReward({
      walletId: 'wallet-1',
      rewardId: 'reward-1',
      supabase: supabase as any,
    });

    expect(result.success).toBe(true);
    expect(result.new_balance).toBe(0);
  });

  test('allows redemption when reward has no expiration date', async () => {
    const { supabase } = setupRedemption({ rewardExpiration: null });

    const result = await redeemReward({
      walletId: 'wallet-1',
      rewardId: 'reward-1',
      supabase: supabase as any,
    });

    expect(result.success).toBe(true);
  });

  test('allows redemption when reward expiration is in the future', async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const { supabase } = setupRedemption({ rewardExpiration: futureDate.toISOString() });

    const result = await redeemReward({
      walletId: 'wallet-1',
      rewardId: 'reward-1',
      supabase: supabase as any,
    });

    expect(result.success).toBe(true);
  });
});

// ── getAvailableRewards ─────────────────────────────────────────────────────

describe('getAvailableRewards', () => {
  test('returns active rewards with inventory', async () => {
    const rewards = [
      createTestReward({ id: 'r1', is_active: true, inventory_remaining: 5 }),
      createTestReward({ id: 'r2', is_active: true, inventory_remaining: 1 }),
    ];
    const supabase = createMockSupabase({
      fwb_rewards: { data: rewards, error: null },
    });

    const result = await getAvailableRewards('venue-1', supabase as any);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('r1');
  });

  test('returns empty array when no rewards exist', async () => {
    const supabase = createMockSupabase({
      fwb_rewards: { data: [], error: null },
    });

    const result = await getAvailableRewards('venue-1', supabase as any);
    expect(result).toHaveLength(0);
  });

  test('returns empty array when data is null', async () => {
    const supabase = createMockSupabase({
      fwb_rewards: { data: null, error: null },
    });

    const result = await getAvailableRewards('venue-1', supabase as any);
    expect(result).toHaveLength(0);
  });

  test('throws when query fails', async () => {
    const supabase = createMockSupabase({
      fwb_rewards: { data: null, error: { message: 'db error' } },
    });

    await expect(getAvailableRewards('venue-1', supabase as any)).rejects.toThrow(
      'Failed to fetch rewards'
    );
  });
});
