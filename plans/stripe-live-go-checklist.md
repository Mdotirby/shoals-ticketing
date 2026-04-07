# Stripe Live Mode — Go-Live Diagnostic Checklist

The customer completed checkout (Stripe collected payment) but **no order was created** in Supabase. This means the webhook at `/api/webhooks/stripe` either never fired, failed signature verification, or errored during processing.

---

## 🔴 Most Likely Root Cause

**Stripe live-mode webhook endpoint was never created (or uses wrong signing secret).**

Test-mode and live-mode webhooks are **completely separate** in Stripe. You created a test webhook when building in sandbox — but going live requires a **new** webhook endpoint under the live-mode dashboard.

---

## Checklist

### 1. Stripe Dashboard — Live Webhook Endpoint

- [ ] Go to **Stripe Dashboard → Developers → Webhooks** (make sure the **Test mode** toggle is **OFF** — you need to be in live mode)
- [ ] Confirm there is an endpoint pointing to: `https://<your-domain>/api/webhooks/stripe`
  - If it's **missing**, click **Add endpoint** and create it now
- [ ] The endpoint must listen for these events at minimum:
  - `checkout.session.completed`
  - `charge.refunded`
  - `charge.dispute.created`
- [ ] Copy the **Signing secret** (starts with `whsec_...`) from the live webhook endpoint

### 2. Vercel Environment Variables

- [ ] Go to **Vercel Dashboard → Project → Settings → Environment Variables**
- [ ] Confirm `STRIPE_SECRET_KEY` starts with `sk_live_...` (not `sk_test_`)
- [ ] Confirm `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` starts with `pk_live_...` (not `pk_test_`)
- [ ] **CRITICAL:** Confirm `STRIPE_WEBHOOK_SECRET` is the signing secret from the **live** webhook endpoint (step 1 above), NOT the test/CLI secret
  - Test secrets start with `whsec_` but are tied to the test endpoint — they won't verify live events
- [ ] After updating any variables, **redeploy** the Vercel project (env vars are baked in at build time)

### 3. Verify Webhook Is Reachable

- [ ] In Stripe Dashboard (live mode) → Webhooks → click the endpoint → check **Recent deliveries**
  - If the checkout event appears with a ❌ (failed), click it to see the error
  - `400` = signature verification failed → wrong `STRIPE_WEBHOOK_SECRET`
  - `500` = server error in webhook handler → check Vercel function logs
  - No event at all = endpoint URL is wrong or doesn't exist
- [ ] Manually send a test event from Stripe: on the webhook endpoint page, click **Send test webhook** → `checkout.session.completed`

### 4. Vercel Function Logs

- [ ] Go to **Vercel Dashboard → Project → Deployments → (latest) → Functions tab**
- [ ] Or use **Vercel Dashboard → Logs** and filter for `/api/webhooks/stripe`
- [ ] Look for these log messages:
  - `"Missing signature or secret"` → `STRIPE_WEBHOOK_SECRET` env var is not set
  - `"Webhook signature verification failed"` → secret is wrong (test vs live mismatch)
  - `"No event_id in session metadata"` → checkout session was created without metadata
  - `"Failed to create order:"` → Supabase insert failed (RLS, schema, etc.)
  - `"Failed to create tickets:"` → ticket insert issue

### 5. Supabase — Verify Tables & RLS

- [ ] Confirm the `orders` table exists and accepts inserts from the service role key
- [ ] Confirm the `tickets` table exists and accepts inserts from the service role key
- [ ] Confirm the `stripe_events` table exists (used for idempotency)
- [ ] Confirm the `settlement_ledger` table exists
- [ ] The webhook uses `createAdminClient()` (service role) — RLS should not block it, but verify

### 6. Recover the Missed Order

Once the webhook is working, recover the missed transaction:

- [ ] Go to **Stripe Dashboard (live) → Payments** and find the successful payment
- [ ] Note the Checkout Session ID (`cs_live_...`)
- [ ] On the webhook endpoint page, find the `checkout.session.completed` event for that session
- [ ] Click **Resend** to re-deliver it — the webhook's idempotency check (via `stripe_events`) will allow it through since it was never processed
- [ ] Verify the order now appears in Supabase

### 7. Domain & CORS (Secondary Checks)

- [ ] The `return_url` in checkout uses `origin` header — verify it resolves to the correct live domain
- [ ] If using a custom domain, ensure it's properly configured in Vercel

---

## Summary of What Likely Happened

```
Customer → /api/checkout → Stripe Session created (✅ works — keys updated)
Customer → Stripe Checkout → Payment succeeds (✅ money collected)
Stripe → POST /api/webhooks/stripe → ❌ NEVER FIRES (no live webhook endpoint)
                                   or ❌ 400 (wrong STRIPE_WEBHOOK_SECRET)
→ No order created in Supabase
→ No tickets generated
→ No confirmation email sent
```

The fix is almost certainly: **create the live webhook endpoint in Stripe and set the correct `STRIPE_WEBHOOK_SECRET` in Vercel**.
