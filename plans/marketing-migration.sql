-- ═══════════════════════════════════════════════════════════════
-- MARKETING & PARTNER PORTAL MIGRATION — VenueCore
-- Run this in Supabase SQL Editor. Fully idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════
-- 1. ADMIN_USERS — Add 'partner' role
-- ═══════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check
  CHECK (role IN (
    'owner','super_admin','venue_admin','promoter',
    'full_admin','box_office','read_only','door_greeter','artist','partner'
  ));

-- ═══════════════════════════════════════════
-- 2. ORDERS — Add marketing attribution columns
-- ═══════════════════════════════════════════
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_zip TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fwb_opt_in BOOLEAN DEFAULT false;

-- ═══════════════════════════════════════════
-- 3. NEWSLETTER_SUBSCRIBERS — Add source + venue tracking
-- ═══════════════════════════════════════════
ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'homepage';
ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════
-- 4. EVENT_VIEWS — Add referrer + UTM tracking
-- ═══════════════════════════════════════════
ALTER TABLE event_views ADD COLUMN IF NOT EXISTS referrer_url TEXT;
ALTER TABLE event_views ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE event_views ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE event_views ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

-- ═══════════════════════════════════════════
-- 5. VENUES — Add pixel + exit-intent settings
-- ═══════════════════════════════════════════
ALTER TABLE venues ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS google_ads_tag_id TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS exit_intent_enabled BOOLEAN DEFAULT false;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS exit_intent_headline TEXT DEFAULT 'Get Early Access to Tickets';

-- ═══════════════════════════════════════════
-- 6. EMAIL_TEMPLATES
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_json JSONB,
  category TEXT DEFAULT 'custom' CHECK (category IN (
    'welcome','know_before_show','post_show_survey',
    'we_hope_you_enjoyed','last_chance','event_announcement','custom'
  )),
  is_system BOOLEAN DEFAULT false,
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_templates_venue ON email_templates(venue_id);

-- ═══════════════════════════════════════════
-- 7. EMAIL_CAMPAIGNS
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  subject_override TEXT,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  audience_type TEXT NOT NULL CHECK (audience_type IN (
    'event_buyers','fwb_subscribers','custom_list','all_customers'
  )),
  audience_filter JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','cancelled')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  total_recipients INTEGER DEFAULT 0,
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_venue ON email_campaigns(venue_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_event ON email_campaigns(event_id);

-- ═══════════════════════════════════════════
-- 8. EMAIL_SENDS
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  resend_message_id TEXT,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  status TEXT DEFAULT 'queued' CHECK (status IN (
    'queued','sent','delivered','opened','clicked','bounced','complained','failed'
  )),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_sends_campaign ON email_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_resend ON email_sends(resend_message_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_recipient ON email_sends(recipient_email);

-- ═══════════════════════════════════════════
-- 9. AUTOMATED_EMAIL_RULES
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS automated_email_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  template_id UUID REFERENCES email_templates(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('before_event','after_event')),
  days_offset INTEGER NOT NULL DEFAULT 1,
  send_time TIME NOT NULL DEFAULT '10:00',
  is_active BOOLEAN DEFAULT true,
  applies_to TEXT DEFAULT 'all_events' CHECK (applies_to IN ('all_events','specific_event')),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auto_email_rules_venue ON automated_email_rules(venue_id);

-- ═══════════════════════════════════════════
-- 10. AD_CAMPAIGNS
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('meta','google','tiktok','snapchat','spotify','other')),
  campaign_name TEXT,
  spend NUMERIC(10,2) NOT NULL DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_event ON ad_campaigns(event_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_venue ON ad_campaigns(venue_id);

-- ═══════════════════════════════════════════
-- 11. SOCIAL_METRICS
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS social_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram','tiktok','twitter','facebook','youtube','other')),
  hashtag TEXT,
  impressions INTEGER DEFAULT 0,
  engagements INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  mentions INTEGER DEFAULT 0,
  recorded_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_social_metrics_event ON social_metrics(event_id);

-- ═══════════════════════════════════════════
-- 12. POST_SHOW_SURVEYS
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS post_show_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_email TEXT,
  overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
  would_return BOOLEAN,
  feedback TEXT,
  age_range TEXT CHECK (age_range IN ('18-24','25-34','35-44','45-54','55-64','65+')),
  gender TEXT CHECK (gender IN ('male','female','non_binary','prefer_not_to_say')),
  submitted_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_surveys_event ON post_show_surveys(event_id);

-- ═══════════════════════════════════════════
-- 13. CUSTOMER_PROFILES
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS customer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  zip_code TEXT,
  age_range TEXT,
  gender TEXT,
  enrichment_source TEXT,
  enriched_at TIMESTAMPTZ,
  total_orders INTEGER DEFAULT 0,
  total_spend NUMERIC(10,2) DEFAULT 0,
  first_order_at TIMESTAMPTZ,
  last_order_at TIMESTAMPTZ,
  events_attended INTEGER DEFAULT 0,
  lfv_segment TEXT CHECK (lfv_segment IN ('one_timer','repeat','loyalist','whale')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_email ON customer_profiles(email);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_zip ON customer_profiles(zip_code);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_segment ON customer_profiles(lfv_segment);

-- ═══════════════════════════════════════════
-- 14. PARTNER_EVENT_ASSIGNMENTS
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS partner_event_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (partner_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_partner_event ON partner_event_assignments(partner_id, event_id);

-- ═══════════════════════════════════════════
-- 15. CART_ABANDONMENT
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cart_abandonment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  quantity INTEGER DEFAULT 1,
  ticket_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  recovered BOOLEAN DEFAULT false,
  recovery_email_sent BOOLEAN DEFAULT false,
  recovery_sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cart_abandonment_email ON cart_abandonment(customer_email);
CREATE INDEX IF NOT EXISTS idx_cart_abandonment_event ON cart_abandonment(event_id);
CREATE INDEX IF NOT EXISTS idx_cart_abandonment_pending ON cart_abandonment(recovered, recovery_email_sent);

-- ═══════════════════════════════════════════
-- 16. RLS POLICIES FOR NEW TABLES
-- ═══════════════════════════════════════════

-- email_templates
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_manage_email_templates" ON email_templates;
CREATE POLICY "admin_manage_email_templates" ON email_templates
  FOR ALL USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid()
    AND (au.role IN ('owner','super_admin') OR (au.role IN ('venue_admin','full_admin') AND au.venue_id = email_templates.venue_id))));

-- email_campaigns
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_manage_email_campaigns" ON email_campaigns;
CREATE POLICY "admin_manage_email_campaigns" ON email_campaigns
  FOR ALL USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid()
    AND (au.role IN ('owner','super_admin') OR (au.role IN ('venue_admin','full_admin') AND au.venue_id = email_campaigns.venue_id))));

-- email_sends
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_email_sends" ON email_sends;
CREATE POLICY "admin_read_email_sends" ON email_sends
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid()
    AND au.role IN ('owner','super_admin','venue_admin','full_admin','partner')));

-- automated_email_rules
ALTER TABLE automated_email_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_manage_auto_rules" ON automated_email_rules;
CREATE POLICY "admin_manage_auto_rules" ON automated_email_rules
  FOR ALL USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid()
    AND (au.role IN ('owner','super_admin') OR (au.role IN ('venue_admin','full_admin') AND au.venue_id = automated_email_rules.venue_id))));

-- ad_campaigns
ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_manage_ad_campaigns" ON ad_campaigns;
CREATE POLICY "admin_manage_ad_campaigns" ON ad_campaigns
  FOR ALL USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid()
    AND (au.role IN ('owner','super_admin') OR (au.role IN ('venue_admin','full_admin') AND au.venue_id = ad_campaigns.venue_id))));

-- social_metrics
ALTER TABLE social_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_manage_social_metrics" ON social_metrics;
CREATE POLICY "admin_manage_social_metrics" ON social_metrics
  FOR ALL USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid()
    AND (au.role IN ('owner','super_admin') OR (au.role IN ('venue_admin','full_admin') AND au.venue_id = social_metrics.venue_id))));

-- post_show_surveys (public insert for survey responses, admin read)
ALTER TABLE post_show_surveys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_submit_surveys" ON post_show_surveys;
CREATE POLICY "public_submit_surveys" ON post_show_surveys
  FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "admin_read_surveys" ON post_show_surveys;
CREATE POLICY "admin_read_surveys" ON post_show_surveys
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid()
    AND au.role IN ('owner','super_admin','venue_admin','full_admin','partner')));

-- customer_profiles
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_manage_customer_profiles" ON customer_profiles;
CREATE POLICY "admin_manage_customer_profiles" ON customer_profiles
  FOR ALL USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid()
    AND au.role IN ('owner','super_admin','venue_admin','full_admin')));
DROP POLICY IF EXISTS "partner_read_customer_profiles" ON customer_profiles;
CREATE POLICY "partner_read_customer_profiles" ON customer_profiles
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid() AND au.role = 'partner'));

-- partner_event_assignments
ALTER TABLE partner_event_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_manage_partner_assignments" ON partner_event_assignments;
CREATE POLICY "owner_manage_partner_assignments" ON partner_event_assignments
  FOR ALL USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid() AND au.role IN ('owner','super_admin')));
DROP POLICY IF EXISTS "partner_read_own_assignments" ON partner_event_assignments;
CREATE POLICY "partner_read_own_assignments" ON partner_event_assignments
  FOR SELECT USING (partner_id = auth.uid());

-- cart_abandonment
ALTER TABLE cart_abandonment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_manage_cart_abandonment" ON cart_abandonment;
CREATE POLICY "service_manage_cart_abandonment" ON cart_abandonment
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "admin_read_cart_abandonment" ON cart_abandonment;
CREATE POLICY "admin_read_cart_abandonment" ON cart_abandonment
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.id = auth.uid()
    AND au.role IN ('owner','super_admin','venue_admin','full_admin')));

-- ═══════════════════════════════════════════
-- DONE. Marketing tables and policies are up to date.
-- ═══════════════════════════════════════════
