# Adding `payment_intent.succeeded` to Your Stripe Webhook

## Why This Is Needed

Your site now supports an **inline checkout** experience on event landing pages (the `/e/[slug]` pages). Instead of redirecting customers to a separate Stripe Checkout page, they enter their card details directly on the landing page.

Behind the scenes, this inline checkout uses a **Stripe PaymentIntent** rather than a Stripe Checkout Session. That means Stripe sends a different event type when the payment succeeds:

| Checkout Flow | Stripe Event |
|---|---|
| Regular checkout (redirect to Stripe) | `checkout.session.completed` |
| Inline checkout on landing pages | `payment_intent.succeeded` |

Your webhook code already knows how to handle both event types. However, **Stripe will only send events that you've subscribed to**. If `payment_intent.succeeded` isn't in your webhook's event list, Stripe won't send it — and orders from inline checkout won't be created.

---

## Step-by-Step: Add the Event in Stripe Dashboard

### 1. Log into Stripe

Go to [dashboard.stripe.com](https://dashboard.stripe.com) and sign in.

### 2. Switch to the correct mode

Look at the top-right corner of the dashboard. You'll see a toggle for **Test mode**.

- If you're setting this up for your **test/staging** environment, make sure Test mode is **ON** (the toggle will be highlighted).
- If you're setting this up for your **live/production** environment, make sure Test mode is **OFF**.

> **Important:** You'll need to repeat these steps for both test mode and live mode if you have separate webhook endpoints for each.

### 3. Go to the Webhooks page

In the left sidebar, click **Developers**, then click **Webhooks**.

You'll see a list of your webhook endpoints. Look for the one pointing to your site:

```
https://<your-domain>/api/webhooks/stripe
```

### 4. Click on your existing webhook endpoint

Click on the endpoint URL to open its detail page. You'll see information about the endpoint, including a list of events it's currently listening to (you should see `checkout.session.completed` already listed).

### 5. Add the new event

1. Look for a button or link that says **Update** or **Edit** near the "Events" section (the exact label may vary slightly depending on Stripe's current dashboard design).
2. You'll see a list of event types with checkboxes. Use the search bar to quickly find `payment_intent.succeeded`.
3. Check the box next to **`payment_intent.succeeded`**.
4. Click **Update endpoint** (or **Save**) to confirm.

### 6. Confirm the event was added

Back on the endpoint detail page, you should now see both events listed:

- `checkout.session.completed`
- `payment_intent.succeeded`

(You may also have other events like `charge.refunded` or `charge.dispute.created` — that's fine, leave those as they are.)

---

## Repeat for Both Modes

If you have **separate webhook endpoints** for test mode and live mode (which is typical), you need to add `payment_intent.succeeded` to **both** endpoints:

1. **Test mode:** Toggle Test mode ON in the dashboard, go to Developers > Webhooks, and add the event to your test endpoint.
2. **Live mode:** Toggle Test mode OFF, go to Developers > Webhooks, and add the event to your live endpoint.

---

## Verification: How to Confirm It's Working

After adding the event, test it by making a purchase on one of your event landing pages:

### Step 1: Make a test purchase

Go to one of your landing pages (e.g., `https://<your-domain>/e/<event-slug>`) and complete a purchase using the inline card form. If you're in test mode, use the Stripe test card number `4242 4242 4242 4242` with any future expiration date and any CVC.

### Step 2: Check Stripe Events

1. Go to **Stripe Dashboard > Developers > Events**
2. Look for a `payment_intent.succeeded` event near the top of the list
3. Click on it — you should see your endpoint listed under "Webhook attempts"
4. The delivery status should show a green checkmark with a **200** response code

### Step 3: Verify the order was created

Check your database (Supabase) to confirm a new order was created in the `orders` table for the purchase you just made. The order should have:

- The correct customer name and email
- A `stripe_payment_intent_id` value (starts with `pi_`)
- The correct ticket quantity and total amount

---

## Troubleshooting

### Events show as "Failed" in Stripe

If the `payment_intent.succeeded` event was sent but shows a failed delivery (red X), check the HTTP status code:

- **400 error** — The webhook signature verification failed. This usually means the `STRIPE_WEBHOOK_SECRET` environment variable on your server doesn't match the signing secret for this webhook endpoint. Go to the endpoint detail page in Stripe, copy the **Signing secret**, and make sure it matches the `STRIPE_WEBHOOK_SECRET` value in your hosting environment (e.g., Vercel).

- **500 error** — Something went wrong in the webhook handler code. Check your server/function logs (e.g., Vercel Dashboard > Logs) and filter for `/api/webhooks/stripe` to see the error message.

### No event appears at all

If you completed a purchase but don't see a `payment_intent.succeeded` event in the Stripe Events log:

- Double-check that you added the event type to the correct webhook endpoint (the one matching your domain).
- Make sure you're looking at events in the correct mode (test vs. live) — toggle the mode in the top-right corner of the Stripe dashboard.

### Order not created despite a 200 response

If Stripe shows a successful 200 delivery but no order was created, the most common cause is that the PaymentIntent didn't have the expected metadata. The inline checkout on landing pages sets `metadata.source = "inline_checkout"` on the PaymentIntent — the webhook handler only processes PaymentIntents with this metadata to avoid interfering with other payment flows. Check your server logs for any messages like `"No event_id in PaymentIntent metadata"`.

### Test mode vs. Live mode signing secret mismatch

Each webhook endpoint has its own unique **signing secret**. A common mistake is using the test-mode signing secret in a live-mode environment (or vice versa). Make sure:

- Your **test/development** environment uses the signing secret from the **test-mode** webhook endpoint
- Your **production** environment uses the signing secret from the **live-mode** webhook endpoint

---

## Quick Reference

| Item | Value |
|---|---|
| Webhook endpoint URL | `https://<your-domain>/api/webhooks/stripe` |
| New event to add | `payment_intent.succeeded` |
| Existing event (keep it) | `checkout.session.completed` |
| Environment variable for signing secret | `STRIPE_WEBHOOK_SECRET` |
| Where the handler lives in code | `app/api/webhooks/stripe/route.ts` |
