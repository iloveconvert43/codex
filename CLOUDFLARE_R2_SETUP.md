# ☁️ Cloudflare R2 Setup Guide

## Why R2?
- **10GB free storage/month** (vs Supabase 1GB free)
- **1M free Class A operations** (uploads)
- **10M free Class B operations** (downloads)
- **Zero egress fees** (downloading is FREE — unlike AWS S3)
- CDN-backed global delivery

---

## Step 1: Create R2 Bucket

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2**
2. Click **Create bucket** → Name it: `tryhushly-media`
3. Leave settings default → Create

---

## Step 2: Enable Public Access

1. Open your bucket → **Settings** tab
2. Under **Public access** → Click **Allow Access**
3. You'll get a public URL: `https://pub-XXXXXXXX.r2.dev`
4. Copy this URL — this is your `NEXT_PUBLIC_R2_PUBLIC_URL`

**Optional: Custom domain (recommended for production)**
- Add a custom domain like `media.tryhushly.app`
- Settings → Custom Domains → Add domain

---

## Step 3: Configure CORS

In your bucket → **Settings** → **CORS Policy** → Add:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://your-app.vercel.app",
      "https://tryhushly.app"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Content-Length", "Cache-Control"],
    "MaxAgeSeconds": 86400
  }
]
```

---

## Step 4: Create API Token

1. R2 → **Manage R2 API Tokens** → Create API token
2. Permissions:
   - **Object Read** ✅
   - **Object Write** ✅
3. Bucket: Select `tryhushly-media`
4. Save **Access Key ID** and **Secret Access Key**

---

## Step 5: Get Account ID

- Cloudflare Dashboard → right sidebar → **Account ID** (32-character string)

---

## Step 6: Add to .env.local

```env
CLOUDFLARE_ACCOUNT_ID=abc123def456789...
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET_NAME=tryhushly-media
NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-XXXXXXXX.r2.dev
```

---

## Step 7: Add to Vercel Environment Variables

In Vercel Dashboard → Project → Settings → Environment Variables:
Add all 5 variables above (mark R2_SECRET_ACCESS_KEY as **Sensitive**)

---

## How it works

```
User selects file
     ↓
Browser compresses image (Canvas API) — up to 70% smaller
     ↓
Browser validates video (duration ≤ 40s, size ≤ 100MB)
     ↓
POST /api/upload/presign → Server generates signed R2 URL (5 min)
     ↓
Browser PUTs file directly to R2 (no Vercel bandwidth used!)
     ↓
R2 serves file via CDN globally
     ↓
CDN URL saved in Supabase posts.image_url / posts.video_url
```

---

## File Limits

| Type | Formats | Max Size | Auto-compress |
|------|---------|----------|---------------|
| Image | JPG, PNG, WebP, GIF | 7MB | ✅ WebP, max 1920px |
| Video | MP4, WebM, MOV | 100MB | ❌ (browser can't) |
| Video duration | — | 40 seconds | — |

---

## Cost Estimate

| Usage | Monthly Cost |
|-------|-------------|
| 10GB storage | **Free** |
| 1M uploads | **Free** |
| 10M downloads | **Free** |
| Over 10GB storage | $0.015/GB |

A typical social media app with 10,000 users would likely stay within the free tier for the first few months.

---

## Troubleshooting

**Upload fails with CORS error:**
→ Check CORS policy in R2 settings, add your exact domain

**"Failed to generate upload URL":**
→ Check CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in env

**Images not loading:**
→ Check NEXT_PUBLIC_R2_PUBLIC_URL is correct (no trailing slash)
→ Check public access is enabled on the bucket

**Video too long error:**
→ Max 40 seconds. Trim before uploading.
