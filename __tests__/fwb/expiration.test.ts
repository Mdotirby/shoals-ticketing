// ============================================================================
// FWB Expiration Logic — Unit Tests
// ============================================================================

import { checkExpiration, expireBenefits, processExpirations } from '@/lib/fwb/expiration';
import { createMockSupabase, createTestWallet } from './helpers';

// ── checkExpiration ─────────────────────────────────────────────────────────

describe('checkExpiration', () => {
  test('returns true when expiration_date is in the past', () => {
    const pastDate = new Date();
    pastDate.setFullYear(pastDate.getFullYear() - 1);
    const wallet = createTestWallet({ benefits_expiration_date: pastDate.toISOString() });
    expect(checkExpiration(wallet)).toBe(true);
  });

  test('returns false when expiration_date is in the future', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const wallet = createTestWallet({ benefits_expiration_date: futureDate.toISOString() });
    expect(checkExpiration(wallet)).toBe(false);
  });

  test('returns false when expiration_date is null/undefined', () => {
    // The type says string but the function guards against falsy values
    const wallet = createTestWallet({ benefits_expiration_date: null as any });
    expect(checkExpiration(wallet)).toBe(false);

    const wallet2 = createTestWallet({ benefits_expiration_date: undefined as any });
    expect(checkExpiration(wallet2)).toBe(false);
  });

  test('returns false when expiration_date is empty string', () => {
    const wallet = createTestWallet({ benefits_expiration_date: '' });
    // new Date('') is Invalid Date, which is NaN, so < new Date() is false
    expect(checkExpiration(wallet)).toBe(false);
  });
});

// ── expireBenefits ──────────────────────────────────────────────────────────

describe('expireBenefits', () => {
  test('zeros out balance for wallet with positive balance', async () => {
    const wallet = createTestWallet({ id: 'wallet-1', current_benefits_balance: 500 });
    const supabase = createMockSupabase({
      fwb_wallets: [
        { data: wallet, error: null },  // fetch
        { data: null, error: null },    // update
      ],
      fwb_transactions: { data: null, error: null },
    });

    await expireBenefits('wallet-1', supabase as any);

    // Verify update was called on fwb_wallets
    const fromCalls = (supabase.from as jest.Mock).mock.calls;
    const walletCalls = fromCalls.filter((c: string[]) => c[0] === 'fwb_wallets');
    expect(walletCalls.length).toBe(2); // fetch + update
  });

  test('creates expire transaction with negative amount equal to balance', async () => {
    const wallet = createTestWallet({ id: 'wallet-1', current_benefits_balance: 350 });
    const supabase = createMockSupabase({
      fwb_wallets: [
        { data: wallet, error: null },
        { data: null, error: null },
      ],
      fwb_transactions: { data: null, error: null },
    });

    await expireBenefits('wallet-1', supabase as any);

    // Verify transaction table was called
    const fromCalls = (supabase.from as jest.Mock).mock.calls;
    const txnCalls = fromCalls.filter((c: string[]) => c[0] === 'fwb_transactions');
    expect(txnCalls.length).toBe(1);
  });

  test('does not create expire transaction when balance is 0', async () => {
    const wallet = createTestWallet({ id: 'wallet-1', current_benefits_balance: 0 });
    const supabase = createMockSupabase({
      fwb_wallets: { data: wallet, error: null },
      fwb_transactions: { data: null, error: null },
    });

    await expireBenefits('wallet-1', supabase as any);

    // Should only fetch wallet, not update or insert transaction
    const fromCalls = (supabase.from as jest.Mock).mock.calls;
    const txnCalls = fromCalls.filter((c: string[]) => c[0] === 'fwb_transactions');
    expect(txnCalls.length).toBe(0);
  });

  test('does not create expire transaction when balance is negative', async () => {
    const wallet = createTestWallet({ id: 'wallet-1', current_benefits_balance: -10 });
    const supabase = createMockSupabase({
      fwb_wallets: { data: wallet, error: null },
    });

    await expireBenefits('wallet-1', supabase as any);

    const fromCalls = (supabase.from as jest.Mock).mock.calls;
    const txnCalls = fromCalls.filter((c: string[]) => c[0] === 'fwb_transactions');
    expect(txnCalls.length).toBe(0);
  });

  test('throws when wallet fetch fails', async () => {
    const supabase = createMockSupabase({
      fwb_wallets: { data: null, error: { message: 'not found' } },
    });

    await expect(expireBenefits('bad-wallet', supabase as any)).rejects.toThrow(
      'Failed to fetch wallet'
    );
  });

  test('throws when wallet update fails', async () => {
    const wallet = createTestWallet({ current_benefits_balance: 100 });
    const supabase = createMockSupabase({
      fwb_wallets: [
        { data: wallet, error: null },
        { data: null, error: { message: 'update failed' } },
      ],
    });

    await expect(expireBenefits('wallet-1', supabase as any)).rejects.toThrow(
      'Failed to expire benefits'
    );
  });
});

// ── processExpirations ──────────────────────────────────────────────────────

describe('processExpirations', () => {
  test('processes multiple expired wallets and returns count', async () => {
    // processExpirations calls from('fwb_wallets') first to get expired list,
    // then calls expireBenefits for each one which also calls from('fwb_wallets')
    // and from('fwb_transactions').
    // We need the first fwb_wallets call to return the list, then subsequent
    // calls to serve expireBenefits.
    const supabase = createMockSupabase({
      fwb_wallets: [
        // processExpirations: select expired wallets
        { data: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }], error: null },
        // expireBenefits(w1): fetch wallet
        { data: createTestWallet({ id: 'w1', current_benefits_balance: 100 }), error: null },
        // expireBenefits(w1): update wallet
        { data: null, error: null },
        // expireBenefits(w2): fetch wallet
        { data: createTestWallet({ id: 'w2', current_benefits_balance: 200 }), error: null },
        // expireBenefits(w2): update wallet
        { data: null, error: null },
        // expireBenefits(w3): fetch wallet
        { data: createTestWallet({ id: 'w3', current_benefits_balance: 50 }), error: null },
        // expireBenefits(w3): update wallet
        { data: null, error: null },
      ],
      fwb_transactions: { data: null, error: null },
    });

    const count = await processExpirations('venue-1', supabase as any);
    expect(count).toBe(3);
  });

  test('returns 0 when no wallets are expired', async () => {
    const supabase = createMockSupabase({
      fwb_wallets: { data: [], error: null },
    });

    const count = await processExpirations('venue-1', supabase as any);
    expect(count).toBe(0);
  });

  test('returns 0 when data is null', async () => {
    const supabase = createMockSupabase({
      fwb_wallets: { data: null, error: null },
    });

    const count = await processExpirations('venue-1', supabase as any);
    expect(count).toBe(0);
  });

  test('throws when fetch fails', async () => {
    const supabase = createMockSupabase({
      fwb_wallets: { data: null, error: { message: 'db error' } },
    });

    await expect(processExpirations('venue-1', supabase as any)).rejects.toThrow(
      'Failed to fetch expired wallets'
    );
  });
});
