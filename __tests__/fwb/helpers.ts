// ============================================================================
// FWB Test Helpers — Mock Supabase Client & Test Factories
// ============================================================================

import type { FWBConfig, FWBWallet, FWBReward, FWBTier } from '@/lib/types/fwb';

// ── Mock Supabase Query Builder ─────────────────────────────────────────────

type MockResult = { data: unknown; error: unknown };

/**
 * Fluent query builder mock that chains `.from().select().eq().single()` etc.
 * Each chain method returns `this` so calls can be composed in any order.
 * Terminal methods (.single(), the builder itself when awaited) resolve the
 * configured result.
 */
class MockQueryBuilder {
  private result: MockResult = { data: null, error: null };

  constructor(result?: MockResult) {
    if (result) this.result = result;
  }

  /** Set the result that terminal methods will return */
  setResult(result: MockResult) {
    this.result = result;
    return this;
  }

  // ── Chainable filter / modifier methods ──────────────────────────────
  select(_columns?: string) { return this; }
  insert(_rows: unknown) { return this; }
  update(_values: unknown) { return this; }
  delete() { return this; }
  eq(_col: string, _val: unknown) { return this; }
  neq(_col: string, _val: unknown) { return this; }
  gt(_col: string, _val: unknown) { return this; }
  lt(_col: string, _val: unknown) { return this; }
  gte(_col: string, _val: unknown) { return this; }
  lte(_col: string, _val: unknown) { return this; }
  or(_filter: string) { return this; }
  order(_col: string, _opts?: unknown) { return this; }
  limit(_count: number) { return this; }
  is(_col: string, _val: unknown) { return this; }

  // ── Terminal methods ─────────────────────────────────────────────────
  single() { return this.result; }

  /** Allow `await builder` to resolve the result directly */
  then(resolve: (value: MockResult) => void) {
    resolve(this.result);
  }
}

// ── Supabase Client Factory ─────────────────────────────────────────────────

export interface MockTableConfig {
  [tableName: string]: MockResult | MockResult[];
}

/**
 * Create a mock SupabaseClient. Pass a table config map to control what each
 * `.from(tableName)` chain will return.
 *
 * If a table's value is an array of MockResult, they are consumed in order
 * (first call gets index 0, second gets index 1, etc.).
 */
export function createMockSupabase(tableConfig: MockTableConfig = {}) {
  const callCounters: Record<string, number> = {};

  const supabase = {
    from: jest.fn((tableName: string) => {
      const cfg = tableConfig[tableName];
      if (!cfg) {
        return new MockQueryBuilder({ data: null, error: null });
      }

      if (Array.isArray(cfg)) {
        const idx = callCounters[tableName] || 0;
        callCounters[tableName] = idx + 1;
        const result = cfg[idx] ?? cfg[cfg.length - 1];
        return new MockQueryBuilder(result);
      }

      return new MockQueryBuilder(cfg);
    }),
  };

  return supabase as unknown as ReturnType<typeof createMockSupabase> & { from: jest.Mock };
}

// ── Test Data Factories ─────────────────────────────────────────────────────

export function createTestConfig(overrides: Partial<FWBConfig> = {}): FWBConfig {
  return {
    id: 'config-1',
    venue_id: 'venue-1',
    earn_rate_per_dollar: 1.0,
    streak_3_multiplier: 1.5,
    streak_5_multiplier: 2.0,
    tier_casual_max: 999,
    tier_close_max: 4999,
    tier_inner_max: 9999,
    tier_after_hours_max: 19999,
    expiration_months: 12,
    streak_reset_days: 60,
    double_benefits_active: false,
    double_benefits_event_ids: [],
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function createTestWallet(overrides: Partial<FWBWallet> = {}): FWBWallet {
  const future = new Date();
  future.setMonth(future.getMonth() + 12);
  return {
    id: 'wallet-1',
    user_id: 'user-1',
    venue_id: 'venue-1',
    current_benefits_balance: 0,
    lifetime_benefits_earned: 0,
    current_tier: 'casual_friend' as FWBTier,
    current_streak_count: 0,
    last_event_attended_date: null,
    benefits_expiration_date: future.toISOString(),
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function createTestReward(overrides: Partial<FWBReward> = {}): FWBReward {
  return {
    id: 'reward-1',
    venue_id: 'venue-1',
    reward_name: 'Free Drink',
    description: 'One complimentary drink at the bar',
    reward_cost_in_benefits: 100,
    reward_type: 'bar_tab',
    inventory_limit: 50,
    inventory_remaining: 10,
    min_tier: 'casual_friend',
    expiration_date: null,
    image_url: null,
    is_active: true,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}
