// ============================================================================
// FWB Streak & Multiplier Engine — Unit Tests
// ============================================================================

import { getMultiplier, updateStreak, checkStreakReset, getStreakInfo } from '@/lib/fwb/streaks';
import { createTestConfig, createTestWallet, createMockSupabase } from './helpers';

const config = createTestConfig();

// ── getMultiplier ───────────────────────────────────────────────────────────

describe('getMultiplier', () => {
  test('returns 1.0 for streak 0', () => {
    expect(getMultiplier(0, config)).toBe(1.0);
  });

  test('returns 1.0 for streak 1', () => {
    expect(getMultiplier(1, config)).toBe(1.0);
  });

  test('returns 1.0 for streak 2', () => {
    expect(getMultiplier(2, config)).toBe(1.0);
  });

  test('returns streak_3_multiplier (1.5) for streak 3', () => {
    expect(getMultiplier(3, config)).toBe(1.5);
  });

  test('returns streak_3_multiplier (1.5) for streak 4', () => {
    expect(getMultiplier(4, config)).toBe(1.5);
  });

  test('returns streak_5_multiplier (2.0) for streak 5', () => {
    expect(getMultiplier(5, config)).toBe(2.0);
  });

  test('returns streak_5_multiplier (2.0) for streak 10', () => {
    expect(getMultiplier(10, config)).toBe(2.0);
  });

  test('returns streak_5_multiplier (2.0) for streak 100', () => {
    expect(getMultiplier(100, config)).toBe(2.0);
  });

  test('works with custom config multipliers', () => {
    const customConfig = createTestConfig({
      streak_3_multiplier: 1.25,
      streak_5_multiplier: 3.0,
    });

    expect(getMultiplier(0, customConfig)).toBe(1.0);
    expect(getMultiplier(3, customConfig)).toBe(1.25);
    expect(getMultiplier(5, customConfig)).toBe(3.0);
    expect(getMultiplier(8, customConfig)).toBe(3.0);
  });
});

// ── updateStreak ────────────────────────────────────────────────────────────

describe('updateStreak', () => {
  test('increments streak when within streak_reset_days', async () => {
    const lastEvent = new Date();
    lastEvent.setDate(lastEvent.getDate() - 14); // 14 days ago
    const wallet = createTestWallet({
      id: 'wallet-1',
      current_streak_count: 3,
      last_event_attended_date: lastEvent.toISOString(),
    });

    const supabase = createMockSupabase({
      fwb_wallets: [
        { data: wallet, error: null },  // fetch
        { data: null, error: null },    // update
      ],
    });

    const result = await updateStreak('wallet-1', new Date(), config, supabase as any);
    expect(result.new_streak).toBe(4); // 3 + 1
  });

  test('resets streak to 1 when gap exceeds streak_reset_days', async () => {
    const lastEvent = new Date();
    lastEvent.setDate(lastEvent.getDate() - 90); // 90 days ago, reset_days = 60
    const wallet = createTestWallet({
      id: 'wallet-1',
      current_streak_count: 5,
      last_event_attended_date: lastEvent.toISOString(),
    });

    const supabase = createMockSupabase({
      fwb_wallets: [
        { data: wallet, error: null },
        { data: null, error: null },
      ],
    });

    const result = await updateStreak('wallet-1', new Date(), config, supabase as any);
    expect(result.new_streak).toBe(1);
  });

  test('sets streak to 1 when no previous event date', async () => {
    const wallet = createTestWallet({
      id: 'wallet-1',
      current_streak_count: 0,
      last_event_attended_date: null,
    });

    const supabase = createMockSupabase({
      fwb_wallets: [
        { data: wallet, error: null },
        { data: null, error: null },
      ],
    });

    const result = await updateStreak('wallet-1', new Date(), config, supabase as any);
    expect(result.new_streak).toBe(1);
  });

  test('streak does NOT reset if exactly at streak_reset_days boundary', async () => {
    const lastEvent = new Date();
    lastEvent.setDate(lastEvent.getDate() - 60); // exactly 60 days, reset_days = 60
    const wallet = createTestWallet({
      id: 'wallet-1',
      current_streak_count: 4,
      last_event_attended_date: lastEvent.toISOString(),
    });

    const supabase = createMockSupabase({
      fwb_wallets: [
        { data: wallet, error: null },
        { data: null, error: null },
      ],
    });

    const result = await updateStreak('wallet-1', new Date(), config, supabase as any);
    // daysSinceLast = 60, config.streak_reset_days = 60
    // Condition is > (strict), so 60 is NOT > 60, so streak continues
    expect(result.new_streak).toBe(5); // 4 + 1
  });

  test('throws when wallet not found', async () => {
    const supabase = createMockSupabase({
      fwb_wallets: { data: null, error: { message: 'not found' } },
    });

    await expect(updateStreak('bad-id', new Date(), config, supabase as any)).rejects.toThrow(
      'Failed to fetch wallet'
    );
  });

  test('throws when update fails', async () => {
    const wallet = createTestWallet({ last_event_attended_date: null });
    const supabase = createMockSupabase({
      fwb_wallets: [
        { data: wallet, error: null },
        { data: null, error: { message: 'update failed' } },
      ],
    });

    await expect(updateStreak('wallet-1', new Date(), config, supabase as any)).rejects.toThrow(
      'Failed to update streak'
    );
  });
});

// ── checkStreakReset ─────────────────────────────────────────────────────────

describe('checkStreakReset', () => {
  test('returns true when days since last event exceeds streak_reset_days', () => {
    const lastEvent = new Date();
    lastEvent.setDate(lastEvent.getDate() - 90);
    const wallet = createTestWallet({
      current_streak_count: 3,
      last_event_attended_date: lastEvent.toISOString(),
    });

    expect(checkStreakReset(wallet, config)).toBe(true);
  });

  test('returns false when within streak_reset_days', () => {
    const lastEvent = new Date();
    lastEvent.setDate(lastEvent.getDate() - 30);
    const wallet = createTestWallet({
      current_streak_count: 3,
      last_event_attended_date: lastEvent.toISOString(),
    });

    expect(checkStreakReset(wallet, config)).toBe(false);
  });

  test('returns false when no last_event_attended_date', () => {
    const wallet = createTestWallet({
      current_streak_count: 0,
      last_event_attended_date: null,
    });

    expect(checkStreakReset(wallet, config)).toBe(false);
  });

  test('returns false when streak count is 0', () => {
    const lastEvent = new Date();
    lastEvent.setDate(lastEvent.getDate() - 90);
    const wallet = createTestWallet({
      current_streak_count: 0,
      last_event_attended_date: lastEvent.toISOString(),
    });

    expect(checkStreakReset(wallet, config)).toBe(false);
  });
});

// ── getStreakInfo ────────────────────────────────────────────────────────────

describe('getStreakInfo', () => {
  test('returns correct multiplier for active streak of 3', () => {
    const lastEvent = new Date();
    lastEvent.setDate(lastEvent.getDate() - 10);
    const wallet = createTestWallet({
      current_streak_count: 3,
      last_event_attended_date: lastEvent.toISOString(),
    });

    const info = getStreakInfo(wallet, config);
    expect(info.current_streak).toBe(3);
    expect(info.current_multiplier).toBe(1.5);
    expect(info.next_multiplier_at).toBe(5);
    expect(info.streak_active).toBe(true);
  });

  test('returns correct days_until_reset', () => {
    const lastEvent = new Date();
    lastEvent.setDate(lastEvent.getDate() - 20);
    const wallet = createTestWallet({
      current_streak_count: 2,
      last_event_attended_date: lastEvent.toISOString(),
    });

    const info = getStreakInfo(wallet, config);
    expect(info.days_until_reset).toBe(40); // 60 - 20
    expect(info.streak_active).toBe(true);
  });

  test('streak_active is false when streak should reset', () => {
    const lastEvent = new Date();
    lastEvent.setDate(lastEvent.getDate() - 90); // way past 60-day reset
    const wallet = createTestWallet({
      current_streak_count: 5,
      last_event_attended_date: lastEvent.toISOString(),
    });

    const info = getStreakInfo(wallet, config);
    expect(info.streak_active).toBe(false);
    expect(info.current_streak).toBe(0);
    expect(info.current_multiplier).toBe(1.0);
  });

  test('returns null days_until_reset when no event attended', () => {
    const wallet = createTestWallet({
      current_streak_count: 0,
      last_event_attended_date: null,
    });

    const info = getStreakInfo(wallet, config);
    expect(info.days_until_reset).toBeNull();
    expect(info.streak_active).toBe(false);
    expect(info.current_streak).toBe(0);
  });

  test('next_multiplier_at is 3 when streak < 3', () => {
    const wallet = createTestWallet({
      current_streak_count: 1,
      last_event_attended_date: new Date().toISOString(),
    });

    const info = getStreakInfo(wallet, config);
    expect(info.next_multiplier_at).toBe(3);
  });

  test('next_multiplier_at is 5 when streak is 3-4', () => {
    const wallet = createTestWallet({
      current_streak_count: 4,
      last_event_attended_date: new Date().toISOString(),
    });

    const info = getStreakInfo(wallet, config);
    expect(info.next_multiplier_at).toBe(5);
  });

  test('next_multiplier_at is null when streak >= 5', () => {
    const wallet = createTestWallet({
      current_streak_count: 7,
      last_event_attended_date: new Date().toISOString(),
    });

    const info = getStreakInfo(wallet, config);
    expect(info.next_multiplier_at).toBeNull();
  });
});
