# FWB Loyalty vs Newsletter Subscribers — Architecture Options

> **Status:** Decision Needed  
> **Last Updated:** 2026-04-13  
> **Context:** FWB loyalty members (`fwb_wallets`) and newsletter/marketing subscribers (`newsletter_subscribers`) are currently two separate systems. This doc outlines options for how they should relate.

---

## Current State

### Two Separate Tables

| System | Table | What It Stores | Entry Points |
|--------|-------|----------------|--------------|
| Newsletter | `newsletter_subscribers` | first_name, last_name, email, venue_id, source | Homepage signup (`NewsletterSignup`), exit-intent popup (`ExitIntentPopup`), **NEW** `/fwb` landing page |
| FWB Loyalty | `fwb_wallets` | user_id (Supabase auth), venue_id, benefits balance, tier, streak | Requires a Supabase auth account + admin import or checkout with `fwb_opt_in` |

### The Gap
- Newsletter subscribers are **anonymous** (no auth account) — just a name + email
- FWB wallets require a **Supabase auth `user_id`** — they must have a login
- The admin "FWB Import" tool (`/admin/marketing/fwb-import`) bridges the gap by creating `fwb_wallets` for newsletter subscribers, but it requires an admin to manually trigger it
- When a user signs up on the new `/fwb` page, they land in `newsletter_subscribers` — NOT `fwb_wallets`

### The Problem
"FWB" is used as branding for **both** the newsletter (marketing emails, presale access) and the loyalty engine (points, tiers, rewards). This creates confusion:
- A user who signs up on `/fwb` thinks they're in the loyalty program, but they're actually just a newsletter subscriber
- A ticket buyer who opts in via checkout (`fwb_opt_in: true`) might or might not get a wallet
- The admin FWB Hub shows loyalty members, but not all "FWB" subscribers

---

## Option A: Keep Them Separate (Recommended for Now)

### Concept
Newsletter = marketing/communications list. FWB = loyalty engine (points, tiers, rewards). Different purposes, different tables.

### How It Works
1. **Newsletter subscribers** = anyone who gives us their email (homepage, exit-intent, `/fwb` page, checkout opt-in)
2. **FWB wallet members** = subset who have earned points through ticket purchases
3. FWB wallets are created **automatically** when a ticket is purchased (via the checkout webhook), not when someone signs up for the newsletter
4. The `/fwb` page and newsletter signups are the **top of funnel** — marketing opt-in
5. The loyalty engine kicks in **after first purchase**

### Schema Change Needed
Add a `is_fwb_subscriber` boolean column to `newsletter_subscribers`:
```sql
ALTER TABLE newsletter_subscribers 
  ADD COLUMN IF NOT EXISTS is_fwb_subscriber BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE newsletter_subscribers 
  ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE newsletter_subscribers 
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'homepage';
```

### Tagging Logic
- Homepage newsletter signup → `is_fwb_subscriber = false`, `source = 'homepage'`
- Exit-intent popup → `is_fwb_subscriber = false`, `source = 'exit_intent'`
- `/fwb` landing page signup → `is_fwb_subscriber = true`, `source = 'fwb_landing'`
- Checkout `fwb_opt_in` → `is_fwb_subscriber = true`, `source = 'checkout'`

### Admin Experience
- Marketing Hub → shows all newsletter subscribers
- FWB Loyalty Hub → shows only `fwb_wallets` (people who've actually earned points)
- Campaigns can target: "All subscribers", "FWB subscribers only", "Non-FWB subscribers"

### Pros
- Clean separation of concerns
- Newsletter is lightweight (no auth required)
- Loyalty engine stays transactional and trustworthy (only real purchasers)
- Easy to understand: "newsletter = marketing", "FWB wallet = earned loyalty"

### Cons
- Users who sign up on `/fwb` might expect to see a points balance immediately
- Two concepts share the "FWB" brand name, which can confuse

---

## Option B: Unified "FWB Members" Table

### Concept
Merge both into a single `fwb_members` table that starts as a lightweight marketing record and upgrades to a full loyalty wallet when the user makes a purchase.

### How It Works
1. Any signup (homepage, exit-intent, `/fwb` page, checkout) creates a row in `fwb_members`
2. Initially: just `name`, `email`, `phone`, `tier = 'casual_friend'`, `benefits_balance = 0`
3. No auth required for the initial record
4. When they buy a ticket, the checkout webhook links the record to `user_id` (if they create an account) and starts earning points
5. The `fwb_members` table replaces both `newsletter_subscribers` and `fwb_wallets`

### New Schema
```sql
CREATE TABLE fwb_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES venues(id),
  user_id UUID REFERENCES auth.users(id),  -- NULL until they purchase/create account
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  source TEXT DEFAULT 'homepage',  -- homepage, exit_intent, fwb_landing, checkout
  
  -- Loyalty fields (all default to zero/base)
  current_benefits_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  lifetime_benefits_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_tier TEXT NOT NULL DEFAULT 'casual_friend',
  current_streak_count INTEGER NOT NULL DEFAULT 0,
  last_event_attended_date TIMESTAMPTZ,
  benefits_expiration_date TIMESTAMPTZ,
  
  -- Marketing fields
  marketing_opt_in BOOLEAN NOT NULL DEFAULT true,
  unsubscribed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(email, venue_id)
);
```

### Pros
- Single source of truth — "FWB member" means one thing
- User signs up on `/fwb` page → immediately sees themselves as a Casual Friend with 0 points
- No import step needed — everyone's already in the same table
- Campaigns target one table with filters (`lifetime_benefits_earned > 0` for active loyalty, `marketing_opt_in = true` for newsletters)

### Cons
- **Breaking change** — requires migrating both tables and updating all existing APIs
- Mixes marketing (email list) with transactional (loyalty accounting) in one table
- The `fwb_wallets` table has `user_id` as a hard requirement for RLS policies — making it optional is a security model change
- More complex: a single table doing two jobs can become a god table

---

## Option C: Linked Tables with Auto-Promotion

### Concept
Keep both tables but add an automatic bridge: when a newsletter subscriber makes their first purchase, auto-create their `fwb_wallet` and link the records.

### How It Works
1. `newsletter_subscribers` stays as-is (lightweight marketing list)
2. `fwb_wallets` stays as-is (auth-required loyalty wallets)
3. New linking column: `newsletter_subscribers.fwb_wallet_id` (nullable FK)
4. Checkout webhook logic:
   - After successful purchase, check if `buyer_email` exists in `newsletter_subscribers`
   - If yes and they have no wallet → create `fwb_wallet`, link it
   - If no newsletter record → create both
5. Admin "FWB Members" view joins both tables for a complete picture

### Schema Addition
```sql
ALTER TABLE newsletter_subscribers 
  ADD COLUMN IF NOT EXISTS fwb_wallet_id UUID REFERENCES fwb_wallets(id);
ALTER TABLE newsletter_subscribers 
  ADD COLUMN IF NOT EXISTS phone TEXT;
```

### Pros
- Minimal schema changes
- Both tables keep their purpose
- Auto-promotion feels seamless to the user
- Admin can see the full journey: subscriber → loyalty member

### Cons
- Requires webhook logic changes
- Two tables to query for a "complete member" view
- Still have the branding confusion (newsletter subscribers called "FWB" on the landing page)

---

## Recommendation

**Start with Option A** (keep separate, add `is_fwb_subscriber` flag) because:

1. It's the **smallest change** — just add a column and tag subscribers by source
2. It doesn't break any existing APIs or RLS policies
3. It lets you **segment campaigns** immediately (FWB subscribers vs general newsletter)
4. The `/fwb` landing page is already built and posting to `newsletter_subscribers`
5. You can **always upgrade to Option B or C later** once you see usage patterns

**Future upgrade path:** If you see that 80%+ of newsletter subscribers eventually buy tickets, Option B (unified table) becomes worth the migration effort. If the loyalty engine stays niche, Option A is the right call.

---

## Next Steps (After Decision)

1. Run the `ALTER TABLE` migration to add `is_fwb_subscriber`, `phone`, and `source` columns
2. Update `POST /api/newsletter` to accept and store `phone` and properly set `is_fwb_subscriber` based on `source`
3. Update checkout webhook to insert into `newsletter_subscribers` with `source = 'checkout'` when `fwb_opt_in = true`
4. Update campaign targeting UI to filter by `is_fwb_subscriber`
5. Consider renaming the homepage newsletter section from "Friends With Benefits" to something like "Stay in the Loop" to reduce brand confusion
