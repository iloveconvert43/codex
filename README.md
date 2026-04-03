# tryHushly 🤫

> Say what you can't say anywhere else.

A social media app with anonymous posting, mystery reveals, stories, hyperlocal feeds, topic rooms, gamification, and real-time messaging.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, TailwindCSS
- **Backend**: Supabase (PostgreSQL + PostGIS + Realtime)
- **Media**: Cloudflare R2 (add later)
- **SMS OTP**: Fast2SMS
- **State**: Zustand + SWR
- **PWA**: @ducanh2912/next-pwa

## Features

- 📱 PWA (installable on mobile)
- 🔐 Email/Phone signup with OTP verification
- 📰 Smart feed with ranking algorithm
- 📖 24-hour Stories
- 🎭 Mystery posts (blur until revealed)
- 💬 Topic Rooms with moderators + challenges
- 🤫 Anonymous Q&A
- 👥 Follow/Unfollow with Friends feed
- 🏆 Leaderboard + Curiosity Points
- 💌 Real-time messaging + typing indicator
- 🔔 Push notifications
- 📍 Nearby posts (PostGIS geolocation)

## Quick Deploy

See **DEPLOY.md** for complete step-by-step instructions.

### 1-minute summary:
```bash
git init && git add . && git commit -m "deploy"
git remote add origin YOUR_GITHUB_URL
git push -u origin main
# Import on vercel.com → add environment variables → deploy
```

## Environment Variables

Copy `.env.example` and fill in:
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase Dashboard → Settings → API
- All others are already filled or pre-generated in `.env.example`

## Database Setup

Run `schema.sql` in Supabase SQL Editor (complete schema with all tables, functions, RLS).

## Development

```bash
npm install
cp .env.example .env.local
# Fill in SUPABASE_SERVICE_ROLE_KEY in .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Security

- XSS prevention via input sanitization
- CSRF protection via origin validation  
- Rate limiting on all write endpoints
- UUID validation on all ID parameters
- Security headers (CSP, X-Frame-Options, etc.)
- Bcrypt password hashing (Supabase)
- Account lockout after failed attempts
