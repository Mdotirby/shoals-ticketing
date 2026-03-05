# Meta API Setup Guide for VenueCore

## Prerequisites
- Meta Business Account (you already have this)
- Meta Ads Manager access (you already have this)
- Admin access to the Facebook Page for your venue

---

## Part 1: Create a Meta App (5 minutes)

### Step 1: Go to Meta Developer Portal
1. Open: https://developers.facebook.com
2. Click **"My Apps"** in the top right
3. Click **"Create App"**

### Step 2: Choose App Type
1. Select **"Other"** for the use case
2. Click **"Next"**
3. Select app type: **"Business"**
4. Click **"Next"**

### Step 3: Name Your App
1. App name: **"VenueCore Marketing"**
2. App contact email: your email
3. Business Account: select your business account from the dropdown
4. Click **"Create App"**

### Step 4: Add Marketing API Product
1. On the app dashboard, scroll to **"Add Products to Your App"**
2. Find **"Marketing API"** and click **"Set Up"**
3. That's it — the Marketing API is now enabled

---

## Part 2: Create a System User & Token (10 minutes)

### Step 1: Go to Business Settings
1. Open: https://business.facebook.com/settings
2. Left sidebar → **"Users"** → **"System Users"**

### Step 2: Create System User
1. Click **"Add"** button
2. System User Name: **"VenueCore Sync"**
3. System User Role: **"Admin"**
4. Click **"Create System User"**

### Step 3: Assign Assets
1. Click on **"VenueCore Sync"** (the system user you just created)
2. Click **"Add Assets"**
3. Select **"Ad Accounts"** tab
4. Check your ad account
5. Toggle on **"Full Control"** (or at minimum "View Performance")
6. Click **"Save Changes"**
7. Also add your **Facebook Page** as an asset with "Full Control"

### Step 4: Generate Token
1. Click **"Generate New Token"**
2. Select the app you created: **"VenueCore Marketing"**
3. Check these permissions:
   - ✅ `ads_read`
   - ✅ `read_insights`
   - ✅ `pages_read_engagement`
   - ✅ `pages_show_list`
   - ✅ `instagram_basic`
   - ✅ `instagram_manage_insights`
   - ✅ `business_management`
4. Click **"Generate Token"**
5. **COPY THE TOKEN NOW** — you won't see it again!
6. Save it somewhere safe temporarily

---

## Part 3: Get Your Ad Account ID

1. Open: https://adsmanager.facebook.com
2. Look at the URL — your ad account ID is in the URL: `act_XXXXXXXXX`
3. Or: Click the account dropdown at the top → your account ID is shown
4. Format: `act_` followed by numbers (e.g., `act_123456789`)
5. **Copy just the numbers** (without `act_`) — we'll add the prefix in code

---

## Part 4: Add to Vercel Environment Variables

1. Open your Vercel project dashboard
2. Go to **Settings** → **Environment Variables**
3. Add these:

| Name | Value | Environment |
|------|-------|-------------|
| `META_SYSTEM_TOKEN` | The token you copied in Part 2, Step 4 | Production, Preview, Development |
| `META_AD_ACCOUNT_ID` | Your ad account numbers (e.g., `123456789`) | Production, Preview, Development |

4. Click **"Save"** for each
5. **Redeploy** your project for the variables to take effect

---

## Part 5: Test the Connection

1. After deploy, go to your VenueCore admin
2. Navigate to **Marketing Hub** → **Ad Spend**
3. Or manually call: `POST /api/marketing/meta-sync`
4. You should see your campaign data populate

---

## Part 6: Submit for App Review (Required for Production)

Your app starts in **Development Mode** which only works for people with roles on the app. For production use:

1. Go to: https://developers.facebook.com → Your App → **"App Review"**
2. Click **"Request Permissions"**
3. Request these:
   - `ads_read` — Reason: "We sync ad campaign performance metrics to our venue management dashboard for ROI tracking"
   - `pages_read_engagement` — Reason: "We display social media engagement metrics in our venue marketing dashboard"
   - `instagram_manage_insights` — Reason: "We track Instagram post performance for our venue marketing analytics"
4. Provide:
   - Screenshots of your Marketing Hub dashboard
   - Description of how data is used
   - Privacy policy URL (your /privacy page)
5. Submit — typically approved in 1-5 business days

**Note:** While in Development Mode, the API works for your account but not for other users. Since you're the only user, this is fine for now. You can submit for review later.

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| "Invalid OAuth access token" | Token expired or was revoked. Regenerate in Business Settings → System Users |
| "Permissions error" | System user doesn't have the required permissions. Re-check asset assignments |
| "Application does not have the capability" | Need to submit for App Review for that permission |
| "(#100) Invalid parameter" | Check ad account ID format — should be numbers only |
| "Rate limit reached" | Wait 5 minutes and try again. VenueCore only syncs once per day |

---

## Campaign Naming Convention (Important!)

For VenueCore to link ad spend to specific events, name your Meta ad campaigns like this:

```
VC-{event_id}-{description}
```

Example: `VC-abc123def-Spring-Concert-Tyler-Childers`

Where `abc123def` is the event ID from VenueCore (visible in the URL when editing an event).

If you don't use this naming convention, ad spend data will still sync but won't be linked to specific events.
