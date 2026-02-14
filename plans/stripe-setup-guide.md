# Stripe Integration Setup — Step-by-Step Guide

## Step 1: Create a Stripe Account

1. Go to [stripe.com](https://stripe.com) and sign up (or sign in)
2. You'll start in **Test Mode** (toggle in top-right) — stay in test mode while developing

---

## Step 2: Get Your API Keys

1. Go to **Developers → API Keys** in the Stripe Dashboard
2. You need two keys:
   - **Publishable key** (starts with `pk_test_...`) — used in the browser
   - **Secret key** (starts with `sk_test_...`) — used only on the server

3. Add them to your `.env.local` file:

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE
```

---

## Step 3: Install Stripe Libraries

Run in your project terminal:

```bash
npm install stripe @stripe/stripe-js
```

- `stripe` — Server-side SDK (for creating checkout sessions, handling webhooks)
- `@stripe/stripe-js` — Client-side SDK (for redirecting to checkout)

---

## Step 4: Create Stripe Server Config

Create a file at `lib/stripe.ts`:

```typescript
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
  typescript: true,
});
```

---

## Step 5: Set Up Stripe Webhook

Webhooks let Stripe notify your app when a payment succeeds (or fails).

### For Local Development:

1. Install the Stripe CLI: https://stripe.com/docs/stripe-cli
   ```bash
   brew install stripe/stripe-cli/stripe
   ```

2. Login to Stripe CLI:
   ```bash
   stripe login
   ```

3. Forward webhooks to your local server:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

4. The CLI will output a **webhook signing secret** (starts with `whsec_...`)
5. Add it to `.env.local`:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE
   ```

### For Production (after deploying):

1. Go to **Stripe Dashboard → Developers → Webhooks**
2. Click **Add endpoint**
3. URL: `https://your-domain.com/api/webhooks/stripe`
4. Select events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`
5. Copy the signing secret to your production environment variables

---

## Step 6: How Checkout Will Work

The flow we'll build:

1. **Customer selects tickets** on `/events/[id]`
2. **Client calls** `POST /api/checkout` with event ID, ticket type, quantity
3. **Server creates a Stripe Checkout Session** with line items and redirects
4. **Customer pays** on Stripe's hosted checkout page
5. **Stripe sends webhook** to `/api/webhooks/stripe`
6. **Webhook handler creates** order + tickets in Supabase
7. **Customer redirected** to `/checkout/success?session_id=...`

### Why Stripe Checkout (hosted page)?
- PCI compliant out of the box — no credit card data touches your server
- Mobile-optimized payment form
- Supports Apple Pay, Google Pay, Link automatically
- Less code to maintain than a custom payment form

---

## Step 7: Test Cards

Use these test card numbers while in test mode:

| Card | Number | Result |
|---|---|---|
| Visa (success) | `4242 4242 4242 4242` | Payment succeeds |
| Visa (decline) | `4000 0000 0000 0002` | Payment is declined |
| Visa (3D Secure) | `4000 0025 0000 3155` | Requires authentication |

Use any future expiry date, any 3-digit CVC, and any ZIP code.

---

## Step 8: Go Live Checklist

When ready for real payments:

1. Complete Stripe account verification (business details, bank account)
2. Switch from **Test Mode** to **Live Mode** in Stripe Dashboard
3. Replace `pk_test_` and `sk_test_` keys with `pk_live_` and `sk_live_` keys
4. Create a production webhook endpoint with the live URL
5. Update all environment variables in your Vercel deployment

---

## Environment Variables Summary

Add all of these to your `.env.local` (and later to Vercel):

```env
# Supabase (you already have these)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Stripe
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (Phase 4)
RESEND_API_KEY=re_...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```
