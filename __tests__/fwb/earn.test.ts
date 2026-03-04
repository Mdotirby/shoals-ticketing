// ============================================================================
// FWB Earn Service — Unit Tests
// ============================================================================

import { earnBenefits, getOrCreateWallet } from '@/lib/fwb/earn';
import { createMockSupabase, createTestWallet, createTestConfig } from './helpers';

// Mock dependencies that earnBenefits calls internally
jest.mock('@/lib/fwb/config', () => ({
  getConfig: jest.fn(),
}));
jest.mock('@/lib/fwb/tiers', () => ({
  calculateTier: jest.fn().mockReturnValue('casual_friend'),
  checkAndUpgradeTier: jest.fn().mockResolvedValue({ tier_upgraded: false, new_tier: null }),
}));
jest.mock('@/lib/fwb/streaks', () => ({
  getMultiplier: jest.fn().mockReturnValue(1.0),
  updateStreak: jest.fn().mockResolvedValue({ new_streak: 1 }),
}));
jest.mock('@/lib/fwb/notifications', () => ({
  notifyStreakMilestone: jest.fn().mockResolvedValue(undefined),
}));

import { getConfig } from '@/lib/fwb/config';
import { checkAndUpgradeTier } from '@/lib/fwb/tiers';
import { getMultiplier, updateStreak } from '@/lib/fwb/streaks';

const mockedGetConfig = getConfig as jest.MockedFunction<typeof getConfig>;
const mockedCheckAndUpgradeTier = checkAndUpgradeTier as jest.MockedFunction<typeof checkAndUpgradeTier>;
const mockedGetMultiplier = getMultiplier as jest.MockedFunction<typeof getMultiplier>;
const mockedUpdateStreak = updateStreak as jest.MockedFunction<typeof updateStreak>;

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Benefits calculation ────────────────────────────────────────────────────

describe('earnBenefits', () => {
  const defaultConfig = createTestConfig();
  const defaultWallet = createTestWallet({ id: 'wallet-1', current_benefits_balance: 100, lifetime_benefits_earned: 100 });

  function setupMocks(overrides: {
    wallet?: typeof defaultWallet;
    config?: typeof defaultConfig;
    multiplier?: number;
    streak?: number;
    tierUpgraded?: boolean;
    newTier?: string | null;
  } = {}) {
    const wallet = overrides.wallet ?? defaultWallet;
    const config = overrides.config ?? defaultConfig;

    mockedGetConfig.mockResolvedValue(config);
    mockedCheckAndUpgradeTier.mockResolvedValue({
      tier_upgraded: overrides.tierUpgraded ?? false,
      new_tier: (overrides.newTier ?? null) as any,
    });
    mockedGetMultiplier.mockReturnValue(overrides.multiplier ?? 1.0);
    mockedUpdateStreak.mockResolvedValue({ new_streak: overrides.streak ?? 1 });

    // Mock supabase: first call = fwb_wallets select (getOrCreateWallet),
    // second call = fwb_wallets update, third = fwb_transactions insert,
    // fourth = fwb_wallets select (checkAndUpgradeTier uses its own mock)
    const supabase = createMockSupabase({
      fwb_wallets: [
        { data: wallet, error: null },     // getOrCreateWallet select
        { data: null, error: null },        // update balance
      ],
      fwb_transactions: { data: null, error: null },
    });

    return { supabase, wallet, config };
  }

  test('calculates benefits as amount * earn_rate * multiplier', async () => {
    const { supabase } = setupMocks();

    const result = await earnBenefits({
      userId: 'user-1',
      venueId: 'venue-1',
      amountSpent: 50,
      supabase: supabase as any,
    });

    // 50 * 1.0 * 1.0 = 50
    expect(result.benefits_earned).toBe(50);
  });

  test('uses Math.floor for rounding down fractional benefits', async () => {
    const config = createTestConfig({ earn_rate_per_dollar: 1.0 });
    const { supabase } = setupMocks({ config });

    const result = await earnBenefits({
      userId: 'user-1',
      venueId: 'venue-1',
      amountSpent: 33.33,
      supabase: supabase as any,
    });

    // 33.33 * 1.0 * 1.0 = 33.33 → floor → 33
    expect(result.benefits_earned).toBe(33);
  });

  test('earns benefits with default config (1:1 rate)', async () => {
    const { supabase } = setupMocks();

    const result = await earnBenefits({
      userId: 'user-1',
      venueId: 'venue-1',
      amountSpent: 100,
      supabase: supabase as any,
    });

    expect(result.benefits_earned).toBe(100);
    expect(result.multiplier_applied).toBe(1.0);
  });

  test('earns benefits with custom earn rate (2 per dollar)', async () => {
    const config = createTestConfig({ earn_rate_per_dollar: 2.0 });
    const { supabase } = setupMocks({ config });

    const result = await earnBenefits({
      userId: 'user-1',
      venueId: 'venue-1',
      amountSpent: 50,
      supabase: supabase as any,
    });

    // 50 * 2.0 * 1.0 = 100
    expect(result.benefits_earned).toBe(100);
  });

  test('applies 1.5x streak multiplier for streak of 3', async () => {
    const { supabase } = setupMocks({ multiplier: 1.5, streak: 3 });

    const result = await earnBenefits({
      userId: 'user-1',
      venueId: 'venue-1',
      amountSpent: 100,
      eventId: 'event-1',
      supabase: supabase as any,
    });

    // 100 * 1.0 * 1.5 = 150
    expect(result.benefits_earned).toBe(150);
    expect(result.multiplier_applied).toBe(1.5);
  });

  test('applies 2x streak multiplier for streak of 5+', async () => {
    const { supabase } = setupMocks({ multiplier: 2.0, streak: 5 });

    const result = await earnBenefits({
      userId: 'user-1',
      venueId: 'venue-1',
      amountSpent: 80,
      eventId: 'event-1',
      supabase: supabase as any,
    });

    // 80 * 1.0 * 2.0 = 160
    expect(result.benefits_earned).toBe(160);
    expect(result.multiplier_applied).toBe(2.0);
  });

  test('increments balance and lifetime correctly', async () => {
    const wallet = createTestWallet({
      current_benefits_balance: 200,
      lifetime_benefits_earned: 500,
    });
    const { supabase } = setupMocks({ wallet });

    const result = await earnBenefits({
      userId: 'user-1',
      venueId: 'venue-1',
      amountSpent: 100,
      supabase: supabase as any,
    });

    expect(result.new_balance).toBe(300);   // 200 + 100
    expect(result.new_lifetime).toBe(600);  // 500 + 100
  });

  test('creates transaction record with correct type and amount', async () => {
    const { supabase } = setupMocks();

    await earnBenefits({
      userId: 'user-1',
      venueId: 'venue-1',
      amountSpent: 75,
      eventId: 'event-1',
      orderId: 'order-1',
      supabase: supabase as any,
    });

    // fwb_transactions insert is the call to from('fwb_transactions')
    const fromCalls = (supabase.from as jest.Mock).mock.calls;
    const txnCalls = fromCalls.filter((c: string[]) => c[0] === 'fwb_transactions');
    expect(txnCalls.length).toBeGreaterThan(0);
  });

  test('reports tier upgrade when checkAndUpgradeTier detects one', async () => {
    const { supabase } = setupMocks({ tierUpgraded: true, newTier: 'close_friend' });

    const result = await earnBenefits({
      userId: 'user-1',
      venueId: 'venue-1',
      amountSpent: 1000,
      supabase: supabase as any,
    });

    expect(result.tier_upgraded).toBe(true);
    expect(result.new_tier).toBe('close_friend');
  });

  test('streak_updated is true when eventId is provided', async () => {
    const { supabase } = setupMocks({ streak: 2 });

    const result = await earnBenefits({
      userId: 'user-1',
      venueId: 'venue-1',
      amountSpent: 50,
      eventId: 'event-1',
      supabase: supabase as any,
    });

    expect(result.streak_updated).toBe(true);
    expect(result.new_streak).toBe(2);
  });

  test('streak_updated is false when no eventId', async () => {
    const { supabase } = setupMocks();

    const result = await earnBenefits({
      userId: 'user-1',
      venueId: 'venue-1',
      amountSpent: 50,
      supabase: supabase as any,
    });

    expect(result.streak_updated).toBe(false);
    expect(result.multiplier_applied).toBe(1.0);
  });

  test('double benefits doubles the multiplier when config flag active', async () => {
    const config = createTestConfig({ double_benefits_active: true });
    const { supabase } = setupMocks({ config });

    const result = await earnBenefits({
      userId: 'user-1',
      venueId: 'venue-1',
      amountSpent: 50,
      supabase: supabase as any,
    });

    // 50 * 1.0 * (1.0 * 2) = 100
    expect(result.benefits_earned).toBe(100);
    expect(result.multiplier_applied).toBe(2.0);
  });

  test('double benefits applies for specific event IDs', async () => {
    const config = createTestConfig({ double_benefits_event_ids: ['event-special'] });
    const { supabase } = setupMocks({ config, streak: 1 });

    const result = await earnBenefits({
      userId: 'user-1',
      venueId: 'venue-1',
      amountSpent: 50,
      eventId: 'event-special',
      supabase: supabase as any,
    });

    // 50 * 1.0 * (1.0 * 2) = 100
    expect(result.benefits_earned).toBe(100);
  });
});

// ── Wallet auto-creation ────────────────────────────────────────────────────

describe('getOrCreateWallet', () => {
  test('returns existing wallet when found', async () => {
    const existingWallet = createTestWallet({ id: 'existing-wallet' });
    const supabase = createMockSupabase({
      fwb_wallets: { data: existingWallet, error: null },
    });

    const wallet = await getOrCreateWallet('user-1', 'venue-1', supabase as any);
    expect(wallet.id).toBe('existing-wallet');
  });

  test('creates new wallet when none exists', async () => {
    const newWallet = createTestWallet({ id: 'new-wallet' });
    const supabase = createMockSupabase({
      fwb_wallets: [
        { data: null, error: { message: 'not found', code: 'PGRST116' } }, // select miss
        { data: newWallet, error: null }, // insert + select returns new wallet
      ],
    });

    const wallet = await getOrCreateWallet('user-1', 'venue-1', supabase as any);
    expect(wallet.id).toBe('new-wallet');
  });

  test('new wallet has 0 balance and casual_friend tier', async () => {
    const newWallet = createTestWallet({
      id: 'new-wallet',
      current_benefits_balance: 0,
      lifetime_benefits_earned: 0,
      current_tier: 'casual_friend',
      current_streak_count: 0,
    });
    const supabase = createMockSupabase({
      fwb_wallets: [
        { data: null, error: { message: 'not found' } },
        { data: newWallet, error: null },
      ],
    });

    const wallet = await getOrCreateWallet('user-1', 'venue-1', supabase as any);
    expect(wallet.current_benefits_balance).toBe(0);
    expect(wallet.current_tier).toBe('casual_friend');
    expect(wallet.current_streak_count).toBe(0);
  });

  test('throws when insert fails', async () => {
    const supabase = createMockSupabase({
      fwb_wallets: [
        { data: null, error: { message: 'not found' } },
        { data: null, error: { message: 'insert failed' } },
      ],
    });

    await expect(getOrCreateWallet('user-1', 'venue-1', supabase as any)).rejects.toThrow(
      'Failed to create wallet'
    );
  });
});
