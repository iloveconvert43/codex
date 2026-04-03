# Creating Test Users in Supabase

## Method 1: Supabase Dashboard (Easiest)

1. Go to https://supabase.com → your project
2. Click **Authentication** → **Users** → **Add User**
3. Create these 5 users:

| Email | Password | Name |
|---|---|---|
| test1@tryhushly.com | Test@1234 | Priya Sharma |
| test2@tryhushly.com | Test@1234 | Rahul Dev |
| test3@tryhushly.com | Test@1234 | Aisha Khan |
| test4@tryhushly.com | Test@1234 | Vikram Nair |
| test5@tryhushly.com | Test@1234 | Sneha Patel |

4. After creating each user, note their **UUID** from the dashboard
5. Open `seed-data.sql` and replace the placeholder UUIDs:
   ```
   uid1 := 'YOUR-REAL-UUID-FROM-SUPABASE';
   ```
6. Run `seed-data.sql` in SQL Editor

## Method 2: Sign Up Normally (Recommended)

After your app is live on Vercel:
1. Go to your app URL
2. Click "Create Account"
3. Sign up with real email/phone — OTP will be sent
4. Done! Real account, real data.

You and your friends can just sign up normally — 
the app handles everything automatically.

## What the seed data creates:

- ✅ 5 test users with profiles
- ✅ Points and badges for each
- ✅ Sample posts (text, anonymous, mystery)
- ✅ Follow relationships
- ✅ Room memberships
- ✅ Active stories
- ✅ Anonymous questions
- ✅ Today's daily challenge
- ✅ Post reactions

## Testing Each Feature:

| Feature | How to test |
|---|---|
| Feed | Log in → see global feed with sample posts |
| Nearby | Enable location → see posts near you |
| Mystery | Tap "Tap to reveal" on mystery posts |
| Stories | Circular avatars at top of feed |
| Reactions | Tap 🤩😂🌊🤔 on any post |
| Q&A | Go to /profile/[id] → ask anonymous question |
| Rooms | /rooms → join a room → see room feed |
| Messages | Click message icon on a profile |
| Leaderboard | /leaderboard → see weekly rankings |
| Create Post | + button → text/photo/anonymous/mystery |
