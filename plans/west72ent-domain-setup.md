# West72ent.com Domain Setup Guide
## Moving from GoDaddy Website Builder → Vercel (VenueCore)

---

## Overview

You currently have a GoDaddy Website Builder site publishing to `west72ent.com`.
Goal: disconnect the GoDaddy site and point the domain to your Vercel deployment.

**You do NOT need to transfer the domain away from GoDaddy.** You just need to:
1. Delete/unpublish the GoDaddy Website Builder site
2. Change the DNS records in GoDaddy to point to Vercel
3. Add `west72ent.com` as a custom domain in Vercel

---

## Step 1 — Delete the GoDaddy Website Builder Site

> This removes the GoDaddy site without canceling domain registration.

1. Log into **GoDaddy** → go to **My Products**
2. Find **Websites + Marketing** (the website builder product)
3. Click **Manage** next to your West72 site
4. Go to **Settings** → scroll to the bottom
5. Click **Delete Website** (or "Cancel Plan" if it's a paid plan)
6. Confirm deletion

> ⚠️ **The domain registration stays intact.** You're only removing the website,
> not the domain. GoDaddy will still hold `west72ent.com` — that's fine.

---

## Step 2 — Get Your Vercel DNS Values

1. Go to [vercel.com](https://vercel.com) → open your **shoals-ticketing** project
2. Click **Settings** → **Domains**
3. Click **Add Domain** → type `west72ent.com` → click **Add**
4. Vercel will show you DNS records to add. They will look like one of these:

**Option A — if Vercel gives you an A record:**
```
Type:  A
Name:  @  (or leave blank — means root domain)
Value: 76.76.21.21
```

**Option B — if Vercel gives you a CNAME:**
```
Type:  CNAME
Name:  www
Value: cname.vercel-dns.com
```

> Vercel typically gives both — an A record for the apex (`west72ent.com`) and a
> CNAME for `www.west72ent.com`. Add both.

Also add `www` as a domain in Vercel (`www.west72ent.com`) and set it to redirect to `west72ent.com`.

---

## Step 3 — Update DNS Records in GoDaddy

1. Log into **GoDaddy** → **My Products** → find `west72ent.com`
2. Click **DNS** (or "Manage DNS")
3. You'll see existing records. **Delete or edit** the ones pointing to GoDaddy's servers.

   Look for and **remove**:
   - Any `A` record pointing to GoDaddy IP addresses (typically `192.168.x.x` or Parked Page IPs)
   - Any `CNAME` for `www` pointing to `@` or GoDaddy hosting

4. **Add the new Vercel records:**

   | Type  | Name | Value                  | TTL  |
   |-------|------|------------------------|------|
   | A     | @    | `76.76.21.21`          | 600  |
   | CNAME | www  | `cname.vercel-dns.com` | 600  |

   > Use the exact values Vercel showed you in Step 2 — they can vary slightly.

5. Click **Save**

---

## Step 4 — Wait for DNS Propagation

DNS changes take **5 minutes to 48 hours** to fully propagate worldwide.
Typically it's done within **30 minutes**.

You can check propagation status at: https://dnschecker.org/#A/west72ent.com

Once it shows Vercel's IP (`76.76.21.21`) globally, you're live.

---

## Step 5 — Verify in Vercel

1. Go back to Vercel → **Settings** → **Domains**
2. `west72ent.com` should show a green **Valid Configuration** checkmark
3. Vercel automatically provisions an **SSL certificate** (HTTPS) via Let's Encrypt — this
   happens within a few minutes of DNS resolving correctly

---

## Step 6 — Test the Deployment

Visit `https://west72ent.com` — you should see:
- ✅ West 72 logo in the header (not VenueCore)
- ✅ West 72 footer branding
- ✅ West72 About page content ("Creating Memories, One Night at a Time")
- ✅ HTTPS green lock in the browser

Visit `https://venuecore.live` — you should see:
- ✅ VenueCore logo in the header
- ✅ VenueCore About page content ("We Didn't Invent Live Music...")
- ✅ VenueCore footer branding

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Still seeing GoDaddy site | DNS hasn't propagated yet. Wait and retry. Clear browser cache. |
| SSL certificate error | Wait 10–15 min after DNS resolves. Vercel provisions SSL automatically. |
| Vercel shows "Invalid Configuration" | Double-check the A record value matches exactly what Vercel showed. |
| `www.west72ent.com` doesn't work | Make sure you added the CNAME for `www` as well as the A record for `@`. |
| Both domains show the same branding | The `operatorSlug` cookie isn't being set. Check that middleware is deployed and `OPERATOR_DOMAIN_MAP` in `lib/operators.ts` includes `"west72ent.com"`. |

---

## Summary of What Changes Per Domain

| URL | Operator | Logo | About Page | Footer |
|-----|----------|------|------------|--------|
| `venuecore.live` | VenueCore | VenueCore full logo | SaaS pitch, Chevy Chase edition | VenueCore brand |
| `west72ent.com` | West72 | West 72 logo | West72 story, fan-first philosophy | West 72 Entertainment |
| `shoals.venuecore.live` | VenueCore | Shoals venue logo | — | Shoals social links |

---

## No Extra Cost on Vercel

Adding a custom domain to an existing Vercel project is **free on all plans**.
You're not spinning up a second deployment — same build, same database, same everything.
The middleware handles the branding switch at the edge before any page renders.
