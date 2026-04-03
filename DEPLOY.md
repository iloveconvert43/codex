# tryHushly — Step-by-Step Deployment Guide

## Prerequisites
- GitHub account
- Vercel account (free tier OK)
- Supabase project (already created)
- Fast2SMS account with API key

---

## STEP 1: Prepare Supabase

### 1a. Run the Database Schema

1. Go to [supabase.com](https://supabase.com) → Your Project
2. Click **SQL Editor** (left sidebar)
3. Click **"New query"**
4. Open `schema.sql` from this project
5. Copy ALL contents and paste into SQL Editor
6. Click **"Run"** button

**Expected:** ~40+ tables created, no errors.

> If you see "relation already exists" errors, that's OK — means some tables already exist.

### 1b. Enable Required Auth Features

1. Go to **Authentication** → **Providers**
2. Make sure **Email** is enabled
3. Optionally enable **Phone** (but we use Fast2SMS directly, not Supabase SMS)
4. Go to **Authentication** → **Settings**:
   - **Site URL**: `https://your-app.vercel.app` (update after deploying)
   - **Redirect URLs**: Add `https://your-app.vercel.app/**`

### 1c. Get Your Supabase Keys

Go to **Settings** → **API**:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ Keep this SECRET

### 1d. Generate VAPID Keys for Push Notifications

Run in your terminal:
```bash
npx web-push generate-vapid-keys
```
This gives you:
- **Public Key** → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- **Private Key** → `VAPID_PRIVATE_KEY`

---

## STEP 2: Push to GitHub

```bash
# In your terminal, navigate to the project folder
cd curiocity-app

# Initialize git
git init
git add .
git commit -m "🚀 tryHushly initial production deploy"

# Create a new repository on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/tryhushly.git
git branch -M main
git push -u origin main
```

---

## STEP 3: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Click **"Import Git Repository"**
3. Select your `tryhushly` repository
4. Vercel auto-detects Next.js — no framework config needed

### Add Environment Variables

In Vercel project settings, add ALL of these:

| Variable | Value | Where to get |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://sxquzrgwnmhczgpqvyrt.supabase.co` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_FL0r...` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Supabase → Settings → API (service_role) |
| `FAST2SMS_API_KEY` | `KvyTWBX...` | fast2sms.com → Dashboard |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | Your Vercel URL |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `BG...` | From Step 1d |
| `VAPID_PRIVATE_KEY` | `...` | From Step 1d |
| `VAPID_EMAIL` | `mailto:hello@tryhushly.com` | Your email |
| `ADMIN_SECRET` | `openssl rand -hex 32` | Generate yourself |

> **Cloudflare R2** vars — add these later when you set up R2:
> - `CLOUDFLARE_ACCOUNT_ID`
> - `R2_ACCESS_KEY_ID`  
> - `R2_SECRET_ACCESS_KEY`
> - `R2_BUCKET_NAME` = `tryhushly-media`
> - `NEXT_PUBLIC_R2_PUBLIC_URL` = `https://pub-xxx.r2.dev`

5. Click **"Deploy"** → wait 2-3 minutes

---

## STEP 4: Post-Deploy Configuration

### Update Supabase Auth URLs

1. Supabase → **Authentication** → **URL Configuration**
2. **Site URL**: `https://your-actual-vercel-url.vercel.app`
3. **Redirect URLs**: Add `https://your-actual-vercel-url.vercel.app/**`
4. Click **Save**

### Update Vercel env var

Update `NEXT_PUBLIC_APP_URL` to your actual Vercel URL:
1. Vercel → Project → Settings → Environment Variables
2. Edit `NEXT_PUBLIC_APP_URL` → set to actual URL
3. Redeploy: Vercel → Deployments → click "..." → Redeploy

---

## STEP 5: Test the Live App

### Test Auth Flow:
1. Go to your live URL
2. Click "Create New Account"
3. Fill form with your phone number
4. Check SMS for OTP (Fast2SMS)
5. Enter OTP → account should be created
6. Try login with email + password

### Test Feed:
1. Create a post with text
2. Create an anonymous post
3. Create a mystery post
4. See it in the feed

### Test Nearby (needs location):
1. Click "Nearby" filter
2. Allow location permission
3. Should see nearby posts (create one first with location)

---

## STEP 6: Custom Domain (Optional)

1. Vercel → Project → Settings → Domains
2. Add your domain (e.g., `tryhushly.com`)
3. Update DNS records as Vercel shows
4. Update `NEXT_PUBLIC_APP_URL` to `https://tryhushly.com`
5. Update Supabase Auth URLs to new domain

---

## Cloudflare R2 (Add Later for Media Uploads)

Until R2 is configured:
- ✅ Text posts work
- ✅ All features work
- ❌ Photo/Video uploads will fail

See `CLOUDFLARE_R2_SETUP.md` for full R2 setup steps.

---

## Troubleshooting

| Error | Fix |
|---|---|
| "Invalid API key" | Check SUPABASE_SERVICE_ROLE_KEY in Vercel |
| OTP not arriving | Check FAST2SMS_API_KEY, verify phone format (10 digits) |
| Login fails | Run schema.sql again in Supabase SQL Editor |
| "relation does not exist" | Run full schema.sql in Supabase |
| Images not loading | R2 not configured yet (expected) |
| Push notifications not working | Check VAPID keys are correct |

---

## Monitoring

- **Vercel Dashboard**: Real-time function logs
- **Supabase Dashboard**: Database queries, auth logs
- **Analytics**: `/api/analytics/events` table in Supabase

