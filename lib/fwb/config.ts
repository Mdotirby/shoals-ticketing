// ============================================================================
// FWB Configuration Service
// ============================================================================

import type { FWBConfig } from '@/lib/types/fwb';
import type { SupabaseClient } from '@supabase/supabase-js';

// ── In-memory cache with 5-minute TTL ──────────────────────────────────────

interface CacheEntry {
  config: FWBConfig;
  fetchedAt: number;
}

const CONFIG_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Default config values ──────────────────────────────────────────────────

const DEFAULT_CONFIG: Omit<FWBConfig, 'id' | 'venue_id' | 'created_at' | 'updated_at'> = {
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
};

/**
 * Fetch FWB config for a venue. Caches in memory with 5-minute TTL.
 * Falls back to default config if no row exists.
 */
export async function getConfig(venueId: string, supabase: SupabaseClient): Promise<FWBConfig> {
  const cached = CONFIG_CACHE.get(venueId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.config;
  }

  const { data, error } = await supabase
    .from('fwb_config')
    .select('*')
    .eq('venue_id', venueId)
    .single();

  if (error || !data) {
    return getDefaultConfig(venueId);
  }

  const config = data as FWBConfig;
  CONFIG_CACHE.set(venueId, { config, fetchedAt: Date.now() });
  return config;
}

/**
 * Return default config values as a fallback for a given venue.
 */
export function getDefaultConfig(venueId: string): FWBConfig {
  return {
    ...DEFAULT_CONFIG,
    id: '',
    venue_id: venueId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Invalidate the cached config for a venue.
 */
export function invalidateConfigCache(venueId: string): void {
  CONFIG_CACHE.delete(venueId);
}

export type { FWBConfig };
