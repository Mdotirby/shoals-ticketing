// ============================================================================
// FWB Tier Calculation — Unit Tests
// ============================================================================

import { calculateTier, getTierProgress, checkAndUpgradeTier } from '@/lib/fwb/tiers';
import { createTestConfig, createMockSupabase, createTestWallet } from './helpers';

// Mock notifications so checkAndUpgradeTier doesn't hit real side effects
jest.mock('@/lib/fwb/notifications', () => ({
  notifyTierUpgrade: jest.fn().mockResolvedValue(undefined),
}));

const config = createTestConfig();

// ── calculateTier ───────────────────────────────────────────────────────────

describe('calculateTier', () => {
  test.each([
    [0, 'casual_friend'],
    [500, 'casual_friend'],
    [999, 'casual_friend'],
    [1000, 'close_friend'],
    [2500, 'close_friend'],
    [4999, 'close_friend'],
    [5000, 'inner_circle'],
    [7500, 'inner_circle'],
    [9999, 'inner_circle'],
    [10000, 'after_hours'],
    [15000, 'after_hours'],
    [19999, 'after_hours'],
    [20000, 'ride_or_die'],
    [50000, 'ride_or_die'],
    [100000, 'ride_or_die'],
  ])('lifetime %d → %s', (lifetime, expectedTier) => {
    expect(calculateTier(lifetime, config)).toBe(expectedTier);
  });

  test('works with custom thresholds', () => {
    const customConfig = createTestConfig({
      tier_casual_max: 499,
      tier_close_max: 1999,
      tier_inner_max: 4999,
      tier_after_hours_max: 9999,
    });

    expect(calculateTier(400, customConfig)).toBe('casual_friend');
    expect(calculateTier(500, customConfig)).toBe('close_friend');
    expect(calculateTier(2000, customConfig)).toBe('inner_circle');
    expect(calculateTier(5000, customConfig)).toBe('after_hours');
    expect(calculateTier(10000, customConfig)).toBe('ride_or_die');
  });
});

// ── getTierProgress ─────────────────────────────────────────────────────────

describe('getTierProgress', () => {
  test('500 lifetime → 50% through casual_friend', () => {
    const progress = getTierProgress(500, config);
    expect(progress.current_tier).toBe('casual_friend');
    expect(progress.progress_percentage).toBe(50);
    expect(progress.next_tier).toBe('close_friend');
    expect(progress.benefits_to_next_tier).toBe(500); // 1000 - 500
  });

  test('0 lifetime → 0% casual_friend', () => {
    const progress = getTierProgress(0, config);
    expect(progress.current_tier).toBe('casual_friend');
    expect(progress.progress_percentage).toBe(0);
    expect(progress.next_tier).toBe('close_friend');
  });

  test('3000 lifetime → progress through close_friend', () => {
    // close_friend range: 1000–5000 (range = 4000), 3000 is at position 2000
    // 2000/4000 = 50%
    const progress = getTierProgress(3000, config);
    expect(progress.current_tier).toBe('close_friend');
    expect(progress.progress_percentage).toBe(50);
    expect(progress.next_tier).toBe('inner_circle');
    expect(progress.benefits_to_next_tier).toBe(2000); // 5000 - 3000
  });

  test('20000+ lifetime → 100% ride_or_die (max tier)', () => {
    const progress = getTierProgress(20000, config);
    expect(progress.current_tier).toBe('ride_or_die');
    expect(progress.progress_percentage).toBe(100);
    expect(progress.next_tier).toBeNull();
    expect(progress.benefits_to_next_tier).toBeNull();
  });

  test('50000 lifetime → still 100% ride_or_die', () => {
    const progress = getTierProgress(50000, config);
    expect(progress.current_tier).toBe('ride_or_die');
    expect(progress.progress_percentage).toBe(100);
    expect(progress.next_tier).toBeNull();
    expect(progress.next_tier_label).toBeNull();
    expect(progress.benefits_to_next_tier).toBeNull();
  });

  test('returns correct next_tier and labels', () => {
    const progress = getTierProgress(6000, config);
    expect(progress.current_tier).toBe('inner_circle');
    expect(progress.current_tier_label).toBe('Inner Circle');
    expect(progress.next_tier).toBe('after_hours');
    expect(progress.next_tier_label).toBe('After Hours');
  });

  test('casual_friend at boundary (999)', () => {
    const progress = getTierProgress(999, config);
    expect(progress.current_tier).toBe('casual_friend');
    // 999/1000 = 99%
    expect(progress.progress_percentage).toBe(99);
    expect(progress.benefits_to_next_tier).toBe(1); // 1000 - 999
  });

  test('returns current_threshold and next_threshold', () => {
    const progress = getTierProgress(2000, config);
    expect(progress.current_threshold).toBe(1000); // close_friend starts at 1000
    expect(progress.next_threshold).toBe(5000);     // inner_circle starts at 5000
  });
});

// ── checkAndUpgradeTier ─────────────────────────────────────────────────────

describe('checkAndUpgradeTier', () => {
  test('detects tier upgrade from casual_friend to close_friend', async () => {
    const wallet = createTestWallet({
      current_tier: 'casual_friend',
      lifetime_benefits_earned: 1500,
    });
    const supabase = createMockSupabase({
      fwb_wallets: [
        { data: wallet, error: null },  // fetch
        { data: null, error: null },    // update
      ],
    });

    const result = await checkAndUpgradeTier('wallet-1', config, supabase as any);
    expect(result.tier_upgraded).toBe(true);
    expect(result.new_tier).toBe('close_friend');
  });

  test('no upgrade when already at correct tier', async () => {
    const wallet = createTestWallet({
      current_tier: 'close_friend',
      lifetime_benefits_earned: 2000,
    });
    const supabase = createMockSupabase({
      fwb_wallets: { data: wallet, error: null },
    });

    const result = await checkAndUpgradeTier('wallet-1', config, supabase as any);
    expect(result.tier_upgraded).toBe(false);
    expect(result.new_tier).toBeNull();
  });

  test('never downgrades tier', async () => {
    // Wallet is inner_circle but lifetime only qualifies for close_friend
    const wallet = createTestWallet({
      current_tier: 'inner_circle',
      lifetime_benefits_earned: 2000,
    });
    const supabase = createMockSupabase({
      fwb_wallets: { data: wallet, error: null },
    });

    const result = await checkAndUpgradeTier('wallet-1', config, supabase as any);
    expect(result.tier_upgraded).toBe(false);
    expect(result.new_tier).toBeNull();
  });

  test('throws when wallet not found', async () => {
    const supabase = createMockSupabase({
      fwb_wallets: { data: null, error: { message: 'not found' } },
    });

    await expect(checkAndUpgradeTier('bad-id', config, supabase as any)).rejects.toThrow(
      'Failed to fetch wallet'
    );
  });
});
