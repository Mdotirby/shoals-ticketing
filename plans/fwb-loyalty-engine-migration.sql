-- ============================================================================
-- FWB Loyalty Engine Migration
-- Friends With Benefits loyalty program: wallets, transactions, rewards,
-- redemptions, notifications, tier perks, and venue config.
-- ============================================================================

-- ── Helper: updated_at trigger function (reuse if exists) ───────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. fwb_config — Admin settings per venue
-- ============================================================================

CREATE TABLE IF NOT EXISTS fwb_config (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                  uuid        NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  earn_rate_per_dollar      numeric(6,2)  NOT NULL DEFAULT 1.0,
  streak_3_multiplier       numeric(4,2)  NOT NULL DEFAULT 1.5,
  streak_5_multiplier       numeric(4,2)  NOT NULL DEFAULT 2.0,
  tier_casual_max           integer     NOT NULL DEFAULT 999,
  tier_close_max            integer     NOT NULL DEFAULT 4999,
  tier_inner_max            integer     NOT NULL DEFAULT 9999,
  tier_after_hours_max      integer     NOT NULL DEFAULT 19999,
  expiration_months         integer     NOT NULL DEFAULT 12,
  streak_reset_days         integer     NOT NULL DEFAULT 60,
  double_benefits_active    boolean     NOT NULL DEFAULT false,
  double_benefits_event_ids uuid[]      NOT NULL DEFAULT '{}',
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_fwb_config_venue UNIQUE (venue_id)
);

CREATE TRIGGER trg_fwb_config_updated_at
  BEFORE UPDATE ON fwb_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 2. fwb_wallets — User benefit wallets
-- ============================================================================

CREATE TABLE IF NOT EXISTS fwb_wallets (
  id                          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id                    uuid          NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  current_benefits_balance    numeric(12,2) NOT NULL DEFAULT 0,
  lifetime_benefits_earned    numeric(12,2) NOT NULL DEFAULT 0,
  current_tier                text          NOT NULL DEFAULT 'casual_friend',
  current_streak_count        integer       NOT NULL DEFAULT 0,
  last_event_attended_date    timestamptz,
  benefits_expiration_date    timestamptz   NOT NULL DEFAULT (now() + interval '12 months'),
  created_at                  timestamptz   NOT NULL DEFAULT now(),
  updated_at                  timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT chk_fwb_wallets_tier CHECK (
    current_tier IN ('casual_friend', 'close_friend', 'inner_circle', 'after_hours', 'ride_or_die')
  ),
  CONSTRAINT uq_fwb_wallets_user_venue UNIQUE (user_id, venue_id)
);

CREATE TRIGGER trg_fwb_wallets_updated_at
  BEFORE UPDATE ON fwb_wallets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fwb_wallets_venue
  ON fwb_wallets (venue_id);

CREATE INDEX IF NOT EXISTS idx_fwb_wallets_expiration
  ON fwb_wallets (benefits_expiration_date)
  WHERE current_benefits_balance > 0;

-- ============================================================================
-- 3. fwb_transactions — All benefit movements (immutable ledger)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fwb_transactions (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id           uuid          NOT NULL REFERENCES fwb_wallets(id) ON DELETE CASCADE,
  transaction_type    text          NOT NULL,
  amount              numeric(12,2) NOT NULL,
  balance_after       numeric(12,2) NOT NULL,
  description         text          NOT NULL DEFAULT '',
  event_id            uuid,
  order_id            uuid,
  reward_id           uuid,
  multiplier_applied  numeric(4,2)  NOT NULL DEFAULT 1.0,
  created_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT chk_fwb_transactions_type CHECK (
    transaction_type IN ('earn', 'redeem', 'expire', 'admin_adjust')
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fwb_transactions_wallet
  ON fwb_transactions (wallet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fwb_transactions_order
  ON fwb_transactions (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fwb_transactions_type
  ON fwb_transactions (wallet_id, transaction_type);

-- ============================================================================
-- 4. fwb_rewards — Benefits Vault rewards
-- ============================================================================

CREATE TABLE IF NOT EXISTS fwb_rewards (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                uuid          NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  reward_name             text          NOT NULL,
  description             text,
  reward_cost_in_benefits numeric(12,2) NOT NULL,
  reward_type             text          NOT NULL,
  inventory_limit         integer,
  inventory_remaining     integer,
  min_tier                text          NOT NULL DEFAULT 'casual_friend',
  expiration_date         timestamptz,
  image_url               text,
  is_active               boolean       NOT NULL DEFAULT true,
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT chk_fwb_rewards_type CHECK (
    reward_type IN ('ticket', 'bar_tab', 'hotel', 'merch', 'experience')
  ),
  CONSTRAINT chk_fwb_rewards_min_tier CHECK (
    min_tier IN ('casual_friend', 'close_friend', 'inner_circle', 'after_hours', 'ride_or_die')
  )
);

CREATE TRIGGER trg_fwb_rewards_updated_at
  BEFORE UPDATE ON fwb_rewards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fwb_rewards_venue_active
  ON fwb_rewards (venue_id)
  WHERE is_active = true;

-- ============================================================================
-- 5. fwb_redemptions — Redemption history
-- ============================================================================

CREATE TABLE IF NOT EXISTS fwb_redemptions (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id       uuid          NOT NULL REFERENCES fwb_wallets(id) ON DELETE CASCADE,
  reward_id       uuid          NOT NULL REFERENCES fwb_rewards(id) ON DELETE CASCADE,
  benefits_spent  numeric(12,2) NOT NULL,
  status          text          NOT NULL DEFAULT 'pending',
  redeemed_at     timestamptz   NOT NULL DEFAULT now(),
  fulfilled_at    timestamptz,
  cancelled_at    timestamptz,
  notes           text,

  CONSTRAINT chk_fwb_redemptions_status CHECK (
    status IN ('pending', 'fulfilled', 'cancelled')
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fwb_redemptions_wallet
  ON fwb_redemptions (wallet_id, redeemed_at DESC);

CREATE INDEX IF NOT EXISTS idx_fwb_redemptions_status
  ON fwb_redemptions (status)
  WHERE status = 'pending';

-- ============================================================================
-- 6. fwb_notifications — User notifications
-- ============================================================================

CREATE TABLE IF NOT EXISTS fwb_notifications (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id         uuid        NOT NULL REFERENCES fwb_wallets(id) ON DELETE CASCADE,
  notification_type text        NOT NULL,
  title             text        NOT NULL,
  message           text        NOT NULL,
  metadata          jsonb,
  is_read           boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_fwb_notifications_type CHECK (
    notification_type IN (
      'tier_upgrade', 'streak_milestone', 'reward_drop', 'double_benefits',
      'benefits_earned', 'benefits_expiring', 'redemption_fulfilled'
    )
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fwb_notifications_wallet_unread
  ON fwb_notifications (wallet_id, created_at DESC)
  WHERE is_read = false;

-- ============================================================================
-- 7. fwb_tier_perks — Configurable perks per tier
-- ============================================================================

CREATE TABLE IF NOT EXISTS fwb_tier_perks (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         uuid        NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  tier             text        NOT NULL,
  perk_name        text        NOT NULL,
  perk_description text,
  sort_order       integer     NOT NULL DEFAULT 0,
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_fwb_tier_perks_tier CHECK (
    tier IN ('casual_friend', 'close_friend', 'inner_circle', 'after_hours', 'ride_or_die')
  )
);

CREATE TRIGGER trg_fwb_tier_perks_updated_at
  BEFORE UPDATE ON fwb_tier_perks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fwb_tier_perks_venue_tier
  ON fwb_tier_perks (venue_id, tier)
  WHERE is_active = true;

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE fwb_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE fwb_wallets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fwb_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fwb_rewards       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fwb_redemptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE fwb_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE fwb_tier_perks    ENABLE ROW LEVEL SECURITY;

-- ── fwb_config ──────────────────────────────────────────────────────────────

CREATE POLICY "Anyone can view config"
  ON fwb_config FOR SELECT
  USING (true);

CREATE POLICY "Service role manages config"
  ON fwb_config FOR ALL
  USING (auth.role() = 'service_role');

-- ── fwb_wallets ─────────────────────────────────────────────────────────────

CREATE POLICY "Users can view own wallet"
  ON fwb_wallets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages wallets"
  ON fwb_wallets FOR ALL
  USING (auth.role() = 'service_role');

-- ── fwb_transactions ────────────────────────────────────────────────────────

CREATE POLICY "Users can view own transactions"
  ON fwb_transactions FOR SELECT
  USING (
    wallet_id IN (SELECT id FROM fwb_wallets WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role manages transactions"
  ON fwb_transactions FOR ALL
  USING (auth.role() = 'service_role');

-- ── fwb_rewards ─────────────────────────────────────────────────────────────

CREATE POLICY "Anyone can view active rewards"
  ON fwb_rewards FOR SELECT
  USING (is_active = true);

CREATE POLICY "Service role manages rewards"
  ON fwb_rewards FOR ALL
  USING (auth.role() = 'service_role');

-- ── fwb_redemptions ─────────────────────────────────────────────────────────

CREATE POLICY "Users can view own redemptions"
  ON fwb_redemptions FOR SELECT
  USING (
    wallet_id IN (SELECT id FROM fwb_wallets WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role manages redemptions"
  ON fwb_redemptions FOR ALL
  USING (auth.role() = 'service_role');

-- ── fwb_notifications ───────────────────────────────────────────────────────

CREATE POLICY "Users can view own notifications"
  ON fwb_notifications FOR SELECT
  USING (
    wallet_id IN (SELECT id FROM fwb_wallets WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can mark own notifications read"
  ON fwb_notifications FOR UPDATE
  USING (
    wallet_id IN (SELECT id FROM fwb_wallets WHERE user_id = auth.uid())
  )
  WITH CHECK (
    wallet_id IN (SELECT id FROM fwb_wallets WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role manages notifications"
  ON fwb_notifications FOR ALL
  USING (auth.role() = 'service_role');

-- ── fwb_tier_perks ──────────────────────────────────────────────────────────

CREATE POLICY "Anyone can view active tier perks"
  ON fwb_tier_perks FOR SELECT
  USING (is_active = true);

CREATE POLICY "Service role manages tier perks"
  ON fwb_tier_perks FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- Seed default fwb_config for each existing venue (if not already present)
-- ============================================================================

INSERT INTO fwb_config (venue_id)
SELECT id FROM venues
WHERE id NOT IN (SELECT venue_id FROM fwb_config)
ON CONFLICT (venue_id) DO NOTHING;
