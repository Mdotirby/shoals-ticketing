// ============================================================================
// FWB Benefits Expiration Logic
// ============================================================================

import type { FWBWallet } from '@/lib/types/fwb';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Return true if the wallet's benefits have expired.
 */
export function checkExpiration(wallet: FWBWallet): boolean {
  if (!wallet.benefits_expiration_date) return false;
  return new Date(wallet.benefits_expiration_date) < new Date();
}

/**
 * Expire a single wallet's benefits: zero the balance, create an 'expire' transaction.
 */
export async function expireBenefits(walletId: string, supabase: SupabaseClient): Promise<void> {
  const { data: wallet, error: fetchError } = await supabase
    .from('fwb_wallets')
    .select('*')
    .eq('id', walletId)
    .single();

  if (fetchError || !wallet) {
    throw new Error(`Failed to fetch wallet ${walletId}: ${fetchError?.message}`);
  }

  if (wallet.current_benefits_balance <= 0) return;

  const expiredAmount = wallet.current_benefits_balance;

  // Zero the balance
  const { error: updateError } = await supabase
    .from('fwb_wallets')
    .update({
      current_benefits_balance: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', walletId);

  if (updateError) {
    throw new Error(`Failed to expire benefits for wallet ${walletId}: ${updateError.message}`);
  }

  // Create expire transaction (negative amount)
  const { error: txnError } = await supabase.from('fwb_transactions').insert({
    wallet_id: walletId,
    transaction_type: 'expire',
    amount: -expiredAmount,
    balance_after: 0,
    description: `${expiredAmount} benefits expired due to inactivity`,
    event_id: null,
    order_id: null,
    reward_id: null,
    multiplier_applied: 1.0,
  });

  if (txnError) {
    throw new Error(`Failed to create expire transaction: ${txnError.message}`);
  }
}

/**
 * Bulk process expirations for a venue: find all wallets with expired benefits
 * and positive balance, expire them all. Returns count of wallets processed.
 */
export async function processExpirations(
  venueId: string,
  supabase: SupabaseClient
): Promise<number> {
  const now = new Date().toISOString();

  const { data: expiredWallets, error } = await supabase
    .from('fwb_wallets')
    .select('id')
    .eq('venue_id', venueId)
    .lt('benefits_expiration_date', now)
    .gt('current_benefits_balance', 0);

  if (error) {
    throw new Error(`Failed to fetch expired wallets for venue ${venueId}: ${error.message}`);
  }

  if (!expiredWallets || expiredWallets.length === 0) return 0;

  for (const wallet of expiredWallets) {
    await expireBenefits(wallet.id, supabase);
  }

  return expiredWallets.length;
}
