-- ============================================================
-- tryHushly — Full Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- USERS
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id           UUID UNIQUE NOT NULL,
  -- Identity
  full_name         TEXT NOT NULL,
  username          TEXT UNIQUE,
  display_name      TEXT,
  bio               TEXT CHECK (char_length(bio) <= 160),
  avatar_url        TEXT,
  -- Auth identifiers (at least one required)
  email             TEXT UNIQUE,
  phone             TEXT UNIQUE,
  -- Extended profile
  gender            TEXT CHECK (gender IN ('male','female','non_binary','prefer_not_to_say')),
  dob               DATE,
  nationality       TEXT,
  address           TEXT,
  -- Privacy (Facebook-style field visibility)
  privacy_settings  JSONB NOT NULL DEFAULT '{"show_gender":"public","show_dob":"private","show_phone":"private","show_nationality":"public","show_address":"private"}'::jsonb,
  -- Location
  latitude          DOUBLE PRECISION,
  longitude         DOUBLE PRECISION,
  city              TEXT,
  country           TEXT,
  location          GEOGRAPHY(POINT, 4326),
  -- Account status
  is_anonymous      BOOLEAN NOT NULL DEFAULT FALSE,
  is_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  is_banned         BOOLEAN NOT NULL DEFAULT FALSE,
  account_locked    BOOLEAN NOT NULL DEFAULT FALSE,
  locked_until      TIMESTAMPTZ,
  -- Activity
  last_login_at     TIMESTAMPTZ,
  last_login_ip     TEXT,
  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookups on auth identifiers
CREATE UNIQUE INDEX idx_users_email ON users (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_users_phone ON users (phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_users_auth_id ON users (auth_id);
CREATE INDEX idx_users_username ON users (lower(username)) WHERE username IS NOT NULL;


CREATE OR REPLACE FUNCTION sync_user_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::GEOGRAPHY;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_location
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION sync_user_location();

-- POSTS
CREATE TYPE reaction_type AS ENUM ('interesting', 'funny', 'deep', 'curious');

CREATE TABLE posts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  content      TEXT CHECK (content IS NULL OR char_length(content) BETWEEN 1 AND 2000),
  image_url              TEXT,
  video_url              TEXT,
  video_thumbnail_url    TEXT,
  is_anonymous BOOLEAN DEFAULT FALSE,
  is_mystery   BOOLEAN DEFAULT FALSE,
  latitude     DOUBLE PRECISION,
  longitude    DOUBLE PRECISION,
  city         TEXT,
  location     GEOGRAPHY(POINT, 4326),
  tags         TEXT[] DEFAULT '{}',
  reveal_count INTEGER DEFAULT 0,
  view_count   INTEGER DEFAULT 0,
  is_deleted   BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION sync_post_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::GEOGRAPHY;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_post_location
  BEFORE INSERT OR UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION sync_post_location();

CREATE INDEX idx_posts_location    ON posts USING GIST (location);
CREATE INDEX idx_posts_user_id     ON posts (user_id);
CREATE INDEX idx_posts_created_at  ON posts (created_at DESC);
CREATE INDEX idx_posts_tags        ON posts USING GIN (tags);

-- REACTIONS
CREATE TABLE reactions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  type       reaction_type NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);
CREATE INDEX idx_reactions_post ON reactions (post_id);

-- COMMENTS
CREATE TABLE comments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id      UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  parent_id    UUID REFERENCES comments(id) ON DELETE CASCADE,
  content      TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  is_anonymous BOOLEAN DEFAULT FALSE,
  is_deleted   BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_comments_post   ON comments (post_id);
CREATE INDEX idx_comments_parent ON comments (parent_id);

-- MYSTERY REVEALS
CREATE TABLE mystery_reveals (
  post_id     UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  revealed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- DAILY CHALLENGES
CREATE TABLE daily_challenges (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  emoji          TEXT DEFAULT '🔥',
  challenge_date DATE UNIQUE NOT NULL,
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE challenge_posts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  challenge_id UUID REFERENCES daily_challenges(id) ON DELETE CASCADE,
  post_id      UUID REFERENCES posts(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, challenge_id)
);

-- STREAKS
CREATE TABLE user_streaks (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_streak   INTEGER DEFAULT 0,
  longest_streak   INTEGER DEFAULT 0,
  last_active_date DATE,
  total_posts      INTEGER DEFAULT 0,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- BADGES
CREATE TYPE badge_type AS ENUM (
  'streak_7','streak_30','streak_100',
  'top_local','mystery_master','challenge_champion',
  'early_adopter','verified_creator'
);

CREATE TABLE user_badges (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  badge      badge_type NOT NULL,
  awarded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, badge)
);

-- NOTIFICATIONS
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  type       TEXT NOT NULL,
  post_id    UUID REFERENCES posts(id) ON DELETE CASCADE,
  message    TEXT,
  is_read    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notif_user ON notifications (user_id, created_at DESC);

-- FOLLOWS
CREATE TABLE follows (
  follower_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- POST REPORTS
CREATE TABLE post_reports (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  details     TEXT,
  is_reviewed BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);

-- PUSH SUBSCRIPTIONS
CREATE TABLE push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);



-- ============================================================
-- ============================================================
-- OTP VERIFICATIONS (unified for email + phone)
-- ============================================================
CREATE TABLE otp_verifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier      TEXT NOT NULL,              -- email or phone number
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('email','phone')),
  otp_hash        TEXT NOT NULL,              -- SHA-256(otp + identifier + SECRET)
  purpose         TEXT NOT NULL DEFAULT 'signup'
                  CHECK (purpose IN ('signup','reset_password','verify_phone')),
  expires_at      TIMESTAMPTZ NOT NULL,       -- 5 minutes from creation
  verified        BOOLEAN NOT NULL DEFAULT FALSE,
  attempts        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (identifier, purpose)
);

CREATE INDEX idx_otp_identifier ON otp_verifications (identifier, purpose);
CREATE INDEX idx_otp_expires ON otp_verifications (expires_at);

ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;
-- Service role only — never expose OTPs to client
CREATE POLICY "otp_service_only" ON otp_verifications USING (false);

-- ============================================================
-- LOGIN ATTEMPTS (brute-force protection)
-- ============================================================
CREATE TABLE login_attempts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier   TEXT NOT NULL,      -- email or phone attempted
  ip_address   TEXT,
  user_agent   TEXT,
  success      BOOLEAN NOT NULL DEFAULT FALSE,
  failure_reason TEXT,             -- 'wrong_password', 'user_not_found', 'account_locked'
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_identifier ON login_attempts (identifier, attempted_at DESC);
CREATE INDEX idx_login_ip ON login_attempts (ip_address, attempted_at DESC);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "login_attempts_service_only" ON login_attempts USING (false);

-- ============================================================
-- EMAIL OTP LEGACY TABLE (kept for backwards compat, new code uses otp_verifications)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_otps (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email        TEXT NOT NULL,
  otp_hash     TEXT NOT NULL,
  purpose      TEXT NOT NULL DEFAULT 'signup',
  expires_at   TIMESTAMPTZ NOT NULL,
  verified     BOOLEAN DEFAULT FALSE,
  attempts     INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (email, purpose)
);
ALTER TABLE IF EXISTS email_otps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_otps_service_only" ON email_otps USING (false);


-- PHONE OTP VERIFICATION
-- ============================================================

-- Cleanup expired OTPs automatically (optional cron job)
CREATE INDEX idx_otp_phone ON otp_verifications (phone);
CREATE INDEX idx_otp_expires ON otp_verifications (expires_at);

ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;
-- Only service role (our API) can read/write OTPs — never expose to client
CREATE POLICY "Service role only" ON otp_verifications
  USING (false);  -- No direct client access



-- ============================================================
-- ANALYTICS EVENTS (lightweight tracking)
-- ============================================================
CREATE TABLE analytics_events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type   TEXT NOT NULL,
  properties   JSONB DEFAULT '{}',
  ip_address   TEXT,
  user_agent   TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analytics_user ON analytics_events (user_id, occurred_at DESC);
CREATE INDEX idx_analytics_event ON analytics_events (event_type, occurred_at DESC);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics_service_only" ON analytics_events USING (false);

-- ============================================================
-- HELPER: increment post view counts in batch
-- ============================================================
CREATE OR REPLACE FUNCTION increment_post_views(post_ids UUID[])
RETURNS void AS $$
BEGIN
  UPDATE posts
  SET view_count = view_count + 1
  WHERE id = ANY(post_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Nearby posts via PostGIS
CREATE OR REPLACE FUNCTION get_nearby_posts(
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  radius_km  INTEGER DEFAULT 5,
  lim        INTEGER DEFAULT 15,
  off        INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID, user_id UUID, content TEXT, image_url TEXT,
  is_anonymous BOOLEAN, is_mystery BOOLEAN, city TEXT,
  distance_km DOUBLE PRECISION, tags TEXT[],
  reveal_count INTEGER, view_count INTEGER, created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.user_id, p.content, p.image_url,
    p.is_anonymous, p.is_mystery, p.city,
    ROUND((ST_Distance(
      p.location,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::GEOGRAPHY
    ) / 1000)::NUMERIC, 1)::DOUBLE PRECISION,
    p.tags, p.reveal_count, p.view_count, p.created_at
  FROM posts p
  WHERE p.is_deleted = FALSE
    AND p.location IS NOT NULL
    AND ST_DWithin(
      p.location,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::GEOGRAPHY,
      radius_km * 1000
    )
  ORDER BY p.created_at DESC
  LIMIT lim OFFSET off;
END;
$$ LANGUAGE plpgsql;

-- Increment reveal count
CREATE OR REPLACE FUNCTION increment_reveal_count(p_post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE posts SET reveal_count = reveal_count + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql;

-- Update streak
CREATE OR REPLACE FUNCTION update_user_streak(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  today DATE := CURRENT_DATE;
  rec   user_streaks%ROWTYPE;
BEGIN
  SELECT * INTO rec FROM user_streaks WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    INSERT INTO user_streaks(user_id,current_streak,longest_streak,last_active_date,total_posts)
    VALUES (p_user_id,1,1,today,1);
  ELSIF rec.last_active_date = today THEN
    UPDATE user_streaks SET total_posts=total_posts+1 WHERE user_id=p_user_id;
  ELSIF rec.last_active_date = today - INTERVAL '1 day' THEN
    UPDATE user_streaks SET
      current_streak=current_streak+1,
      longest_streak=GREATEST(longest_streak,current_streak+1),
      last_active_date=today, total_posts=total_posts+1, updated_at=NOW()
    WHERE user_id=p_user_id;
  ELSE
    UPDATE user_streaks SET
      current_streak=1, last_active_date=today,
      total_posts=total_posts+1, updated_at=NOW()
    WHERE user_id=p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE mystery_reveals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_challenges   ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_streaks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows            ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users
CREATE POLICY "Public read users"       ON users FOR SELECT USING (true);
CREATE POLICY "Own update users"        ON users FOR UPDATE USING (auth.uid() = auth_id);
CREATE POLICY "Own insert users"        ON users FOR INSERT WITH CHECK (auth.uid() = auth_id);

-- Posts
CREATE POLICY "Public read posts"       ON posts FOR SELECT USING (is_deleted = FALSE);
CREATE POLICY "Auth insert posts"       ON posts FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Own update posts"        ON posts FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE auth_id=auth.uid() AND id=posts.user_id)
);

-- Reactions
CREATE POLICY "Public read reactions"   ON reactions FOR SELECT USING (true);
CREATE POLICY "Auth insert reactions"   ON reactions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Own delete reactions"    ON reactions FOR DELETE USING (
  EXISTS (SELECT 1 FROM users WHERE auth_id=auth.uid() AND id=reactions.user_id)
);
CREATE POLICY "Own update reactions"    ON reactions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE auth_id=auth.uid() AND id=reactions.user_id)
);

-- Comments
CREATE POLICY "Public read comments"    ON comments FOR SELECT USING (is_deleted = FALSE);
CREATE POLICY "Auth insert comments"    ON comments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Own update comments"     ON comments FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE auth_id=auth.uid() AND id=comments.user_id)
);

-- Notifications
CREATE POLICY "Own read notifications"  ON notifications FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE auth_id=auth.uid() AND id=notifications.user_id)
);
CREATE POLICY "System insert notifs"    ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Own update notifs"       ON notifications FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE auth_id=auth.uid() AND id=notifications.user_id)
);

-- Daily challenges (public read)
CREATE POLICY "Public read challenges"  ON daily_challenges FOR SELECT USING (true);
CREATE POLICY "Public read ch_posts"    ON challenge_posts FOR SELECT USING (true);
CREATE POLICY "Auth insert ch_posts"    ON challenge_posts FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Streaks & badges (public read)
CREATE POLICY "Public read streaks"     ON user_streaks FOR SELECT USING (true);
CREATE POLICY "Public read badges"      ON user_badges  FOR SELECT USING (true);

-- Mystery reveals
CREATE POLICY "Auth insert reveals"     ON mystery_reveals FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Own read reveals"        ON mystery_reveals FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE auth_id=auth.uid() AND id=mystery_reveals.user_id)
);

-- Push subscriptions
CREATE POLICY "Own push subs"           ON push_subscriptions FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE auth_id=auth.uid() AND id=push_subscriptions.user_id)
);

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO daily_challenges (title, description, emoji, challenge_date) VALUES
  ('Post Something Blue',    'Share a photo or thought about something blue in your world.', '💙', CURRENT_DATE),
  ('5-Word Day',             'Describe your entire day in exactly 5 words.',                '✍️', CURRENT_DATE+1),
  ('Hidden Gem',             'Share a place in your city most people don''t know about.',   '💎', CURRENT_DATE+2),
  ('Mood Weather',           'What weather matches your current mood?',                     '🌤️', CURRENT_DATE+3),
  ('Grateful For',           'Share one small thing you''re grateful for today.',           '🙏', CURRENT_DATE+4),
  ('Stranger Kindness',      'Describe a moment of unexpected kindness you witnessed.',     '💛', CURRENT_DATE+5),
  ('Your Unpopular Opinion', 'Share an opinion you hold that most people around you don''t.','🔥', CURRENT_DATE+6)
ON CONFLICT (challenge_date) DO NOTHING;

-- ============================================================
-- DIRECT MESSAGES (added in v2)
-- ============================================================
CREATE TABLE direct_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  is_read     BOOLEAN DEFAULT FALSE,
  is_deleted  BOOLEAN DEFAULT FALSE,
  image_url   TEXT,
  reaction    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CHECK (sender_id != receiver_id)
);

CREATE INDEX idx_dm_sender   ON direct_messages (sender_id, created_at DESC);
CREATE INDEX idx_dm_receiver ON direct_messages (receiver_id, created_at DESC);
CREATE INDEX idx_dm_thread   ON direct_messages (sender_id, receiver_id, created_at DESC);

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- Users can only see their own messages
CREATE POLICY "Own messages only" ON direct_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND (id = sender_id OR id = receiver_id))
  );

CREATE POLICY "Auth users can send" ON direct_messages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND id = sender_id)
  );

CREATE POLICY "Own message soft delete" ON direct_messages
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND id = sender_id)
  );

-- ============================================================

-- DAILY QUESTIONS (for the Questions feature)
CREATE TABLE questions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_text TEXT NOT NULL,
  category      TEXT DEFAULT 'general',
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read questions" ON questions FOR SELECT USING (true);

-- Seed data
INSERT INTO questions (question_text, category) VALUES
  ('What''s one thing you wish more people knew about your city?', 'local'),
  ('Describe your morning routine in 3 words.', 'lifestyle'),
  ('What''s a skill you''ve been meaning to learn?', 'goals'),
  ('What''s the most underrated place in your neighborhood?', 'local'),
  ('If you could change one thing about your city, what would it be?', 'community'),
  ('What''s a local food everyone should try?', 'food'),
  ('What made you smile today?', 'mood');

-- QUESTION RESPONSES (added in v2)
-- ============================================================
CREATE TABLE question_responses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id  UUID REFERENCES questions(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  is_anonymous BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_qr_question ON question_responses (question_id, created_at DESC);

ALTER TABLE question_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read question_responses" ON question_responses FOR SELECT USING (true);
CREATE POLICY "Auth insert question_responses" ON question_responses FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- PREVENT DUPLICATE ACCOUNTS (same email, same Google account)
-- ============================================================
-- Supabase Auth already prevents duplicate emails at the auth layer.
-- This trigger additionally prevents duplicate profiles per auth_id.
-- The UNIQUE constraint on users.auth_id already handles this.

-- Add unique constraint on email for extra safety (if storing email)
-- Note: email is managed by Supabase Auth, not stored in users table.
-- Duplicate prevention is handled natively by Supabase Auth.

-- ============================================================
-- SCHEMA V3 — Additional indexes and fixes
-- ============================================================

-- Index for feed performance
CREATE INDEX IF NOT EXISTS idx_posts_city ON posts (city, created_at DESC) WHERE is_deleted = FALSE;

-- Index for challenge posts feed
CREATE INDEX IF NOT EXISTS idx_challenge_posts_post ON challenge_posts (post_id);

-- Index for direct messages thread query
CREATE INDEX IF NOT EXISTS idx_dm_conversation ON direct_messages 
  (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id), created_at DESC);

-- Partial index for unread messages
CREATE INDEX IF NOT EXISTS idx_dm_unread ON direct_messages (receiver_id, is_read) 
  WHERE is_read = FALSE AND is_deleted = FALSE;

-- Notification delivery index
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications (user_id, is_read, created_at DESC)
  WHERE is_read = FALSE;

-- RLS for direct messages (already added in v2, this ensures it exists)
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- RLS for question responses
ALTER TABLE question_responses ENABLE ROW LEVEL SECURITY;

-- Follows RLS
CREATE POLICY "Public read follows" ON follows FOR SELECT USING (true);
CREATE POLICY "Auth insert follows" ON follows FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND id = follower_id)
);
CREATE POLICY "Own delete follows" ON follows FOR DELETE USING (
  EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND id = follower_id)
);

-- ============================================================
-- SCHEMA V4 — Video support
-- ============================================================

-- Add video_url to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Index for posts with media
CREATE INDEX IF NOT EXISTS idx_posts_has_image ON posts (user_id) WHERE image_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_has_video ON posts (user_id) WHERE video_url IS NOT NULL;

-- Video storage bucket (run in Supabase SQL Editor)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('post-videos', 'post-videos', true)
-- ON CONFLICT DO NOTHING;

-- Storage policies for videos
-- CREATE POLICY "Auth users upload videos"
-- ON storage.objects FOR INSERT
-- WITH CHECK (bucket_id = 'post-videos' AND auth.role() = 'authenticated');

-- CREATE POLICY "Public read videos"
-- ON storage.objects FOR SELECT
-- USING (bucket_id = 'post-videos');

-- ============================================================
-- SCHEMA V5 — Cloudflare R2 media columns
-- ============================================================

-- Add video thumbnail URL column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_thumbnail_url TEXT;

-- NOTE: image_url and video_url now store Cloudflare R2 CDN URLs
-- Format: https://pub-XXXXX.r2.dev/images/{userId}/{timestamp}.webp
-- Old Supabase storage URLs still work if you migrated

-- Cloudflare R2 bucket setup (run in Cloudflare Dashboard):
-- 1. Create bucket: tryhushly-media
-- 2. Enable public access → copy public URL (https://pub-xxx.r2.dev)
-- 3. Add CORS policy (see README)
-- 4. Create API token with r2:read + r2:write permissions
-- 5. Add to .env.local: CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY

-- ============================================================
-- PHASE 2 FEATURES: All new tables
-- ============================================================

-- ── STORIES (24h ephemeral posts) ──────────────────────────
CREATE TABLE stories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content       TEXT CHECK (char_length(content) <= 500),
  image_url     TEXT,
  video_url     TEXT,
  bg_color      TEXT DEFAULT '#6C63FF',  -- gradient bg when no media
  is_anonymous  BOOLEAN NOT NULL DEFAULT FALSE,
  is_mystery    BOOLEAN NOT NULL DEFAULT FALSE, -- blur until X views
  mystery_reveal_threshold INTEGER DEFAULT 10,
  view_count    INTEGER NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE story_views (
  story_id    UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, viewer_id)
);

CREATE INDEX idx_stories_user ON stories(user_id, expires_at DESC);
CREATE INDEX idx_stories_expires ON stories(expires_at);
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stories_read" ON stories FOR SELECT USING (expires_at > NOW());
CREATE POLICY "stories_insert" ON stories FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "stories_delete" ON stories FOR DELETE USING (
  user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
);
ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "story_views_all" ON story_views FOR ALL USING (true);

-- ── CURIOSITY POINTS & LEVELS ──────────────────────────────
CREATE TABLE user_points (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_points    INTEGER NOT NULL DEFAULT 0,
  weekly_points   INTEGER NOT NULL DEFAULT 0,   -- reset every Monday
  level           TEXT NOT NULL DEFAULT 'curious_newcomer',
  week_start      DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE points_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points      INTEGER NOT NULL,
  reason      TEXT NOT NULL,   -- 'post_created','reaction_received','mystery_revealed', etc.
  ref_id      UUID,            -- post_id or comment_id
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_points_user ON points_log(user_id, created_at DESC);
CREATE INDEX idx_points_weekly ON user_points(weekly_points DESC);
ALTER TABLE user_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "points_read" ON user_points FOR SELECT USING (true);
CREATE POLICY "points_service" ON user_points FOR ALL USING (false);
ALTER TABLE points_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "points_log_service" ON points_log FOR ALL USING (false);

-- ── TOPIC ROOMS / INTEREST CHANNELS ────────────────────────
CREATE TABLE topic_rooms (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        TEXT UNIQUE NOT NULL,         -- 'midnight-thoughts'
  name        TEXT NOT NULL,               -- 'Midnight Thoughts'
  description TEXT,
  emoji       TEXT DEFAULT '💬',
  post_count  INTEGER NOT NULL DEFAULT 0,
  member_count INTEGER NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE room_memberships (
  room_id   UUID NOT NULL REFERENCES topic_rooms(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

-- Link posts to rooms
ALTER TABLE posts ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES topic_rooms(id) ON DELETE SET NULL;
CREATE INDEX idx_posts_room ON posts(room_id, created_at DESC);

ALTER TABLE topic_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms_read" ON topic_rooms FOR SELECT USING (true);
CREATE POLICY "rooms_service" ON topic_rooms FOR INSERT WITH CHECK (false); -- admin only

ALTER TABLE room_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memberships_read" ON room_memberships FOR SELECT USING (true);
CREATE POLICY "memberships_write" ON room_memberships FOR ALL 
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ── COMMENT LIKES ──────────────────────────────────────────
CREATE TABLE comment_likes (
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);
ALTER TABLE comments ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS mentions TEXT[] DEFAULT '{}'; -- user_ids mentioned
CREATE INDEX idx_comment_likes ON comment_likes(comment_id);
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comment_likes_all" ON comment_likes FOR ALL 
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ── ANONYMOUS Q&A ──────────────────────────────────────────
CREATE TABLE anonymous_questions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_text  TEXT NOT NULL CHECK (char_length(question_text) BETWEEN 1 AND 280),
  is_answered    BOOLEAN NOT NULL DEFAULT FALSE,
  answer_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  -- Never store asker identity — true anonymous
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_anon_q_target ON anonymous_questions(target_user_id, is_answered, created_at DESC);
ALTER TABLE anonymous_questions ENABLE ROW LEVEL SECURITY;
-- Anyone can ask (no auth required for anonymous feel)
CREATE POLICY "anon_q_insert" ON anonymous_questions FOR INSERT WITH CHECK (true);
-- Only target user can see their questions
CREATE POLICY "anon_q_select" ON anonymous_questions FOR SELECT
  USING (target_user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));
-- Only target user can update (mark answered)
CREATE POLICY "anon_q_update" ON anonymous_questions FOR UPDATE
  USING (target_user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ── RESHARES ───────────────────────────────────────────────
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reshared_from_id UUID REFERENCES posts(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reshare_comment TEXT CHECK (char_length(reshare_comment) <= 500);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reshare_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_posts_reshare ON posts(reshared_from_id) WHERE reshared_from_id IS NOT NULL;

-- ── NEIGHBORHOOD (hyperlocal communities) ──────────────────
CREATE TABLE neighborhoods (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  city        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  latitude    DOUBLE PRECISION,
  longitude   DOUBLE PRECISION,
  radius_km   DOUBLE PRECISION DEFAULT 2.0,
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS neighborhood_id UUID REFERENCES neighborhoods(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS neighborhood_id UUID REFERENCES neighborhoods(id) ON DELETE SET NULL;

CREATE INDEX idx_posts_neighborhood ON posts(neighborhood_id, created_at DESC);
ALTER TABLE neighborhoods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "neighborhoods_read" ON neighborhoods FOR SELECT USING (true);

-- ── PUSH NOTIFICATION QUEUE ────────────────────────────────
-- Already have push_subscriptions, add delivery queue
CREATE TABLE push_queue (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  url          TEXT,
  data         JSONB DEFAULT '{}',
  delivered    BOOLEAN NOT NULL DEFAULT FALSE,
  attempts     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_push_queue ON push_queue(user_id, delivered, created_at DESC);
ALTER TABLE push_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_queue_service" ON push_queue FOR ALL USING (false);

-- ── NOTIFICATION: Add grouped_count ────────────────────────
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS grouped_count INTEGER DEFAULT 1;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS comment_id UUID REFERENCES comments(id) ON DELETE SET NULL;

-- ── SEED TOPIC ROOMS ───────────────────────────────────────
INSERT INTO topic_rooms (slug, name, description, emoji, is_featured) VALUES
  ('midnight-thoughts', 'Midnight Thoughts', 'What you think about at 3am', '🌙', true),
  ('local-secrets', 'Local Secrets', 'Hidden gems in your city', '🗺️', true),
  ('career-rants', 'Career Rants', 'Work life unfiltered', '💼', true),
  ('relationship-chronicles', 'Relationship Chronicles', 'Love, heartbreak, everything in between', '💔', true),
  ('foodie-confessions', 'Foodie Confessions', 'Secret food obsessions', '🍜', true),
  ('mental-health-space', 'Mental Health Space', 'Safe space to talk openly', '🧠', true),
  ('student-life', 'Student Life', 'Campus stories and stress', '📚', true),
  ('unpopular-opinions', 'Unpopular Opinions', 'Say it, we won''t judge', '🔥', true),
  ('city-discoveries', 'City Discoveries', 'What you found exploring today', '🏙️', false),
  ('tech-thoughts', 'Tech Thoughts', 'Dev stories, startup dreams', '💻', false)
ON CONFLICT (slug) DO NOTHING;

-- ── HELPER: Award points ───────────────────────────────────
CREATE OR REPLACE FUNCTION award_points(
  p_user_id UUID,
  p_points  INTEGER,
  p_reason  TEXT,
  p_ref_id  UUID DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_total INTEGER;
  v_level TEXT;
BEGIN
  -- Insert log
  INSERT INTO points_log(user_id, points, reason, ref_id)
  VALUES (p_user_id, p_points, p_reason, p_ref_id);

  -- Upsert user_points
  INSERT INTO user_points(user_id, total_points, weekly_points)
  VALUES (p_user_id, p_points, p_points)
  ON CONFLICT (user_id) DO UPDATE SET
    total_points  = user_points.total_points + p_points,
    weekly_points = CASE
      WHEN user_points.week_start < date_trunc('week', CURRENT_DATE)::DATE
      THEN p_points  -- reset weekly
      ELSE user_points.weekly_points + p_points
    END,
    week_start = date_trunc('week', CURRENT_DATE)::DATE,
    updated_at = NOW();

  -- Recalculate level
  SELECT total_points INTO v_total FROM user_points WHERE user_id = p_user_id;
  v_level := CASE
    WHEN v_total >= 2001 THEN 'hushly_legend'
    WHEN v_total >= 501  THEN 'mystery_maker'
    WHEN v_total >= 101  THEN 'story_seeker'
    ELSE 'curious_newcomer'
  END;

  UPDATE user_points SET level = v_level WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── HELPER: Increment reshare count ────────────────────────
CREATE OR REPLACE FUNCTION increment_reshare_count(p_post_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE posts SET reshare_count = reshare_count + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── HELPER: Increment story view count ─────────────────────
CREATE OR REPLACE FUNCTION increment_story_views(p_story_id UUID, p_viewer_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO story_views(story_id, viewer_id)
  VALUES (p_story_id, p_viewer_id)
  ON CONFLICT DO NOTHING;

  UPDATE stories
  SET view_count = (SELECT COUNT(*) FROM story_views WHERE story_id = p_story_id)
  WHERE id = p_story_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── HELPER: Comment like toggle ─────────────────────────────
CREATE OR REPLACE FUNCTION toggle_comment_like(p_comment_id UUID, p_user_id UUID)
RETURNS TABLE(liked BOOLEAN, like_count INTEGER) AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM comment_likes WHERE comment_id = p_comment_id AND user_id = p_user_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM comment_likes WHERE comment_id = p_comment_id AND user_id = p_user_id;
    UPDATE comments SET like_count = GREATEST(0, like_count - 1) WHERE id = p_comment_id;
    liked := FALSE;
  ELSE
    INSERT INTO comment_likes(comment_id, user_id) VALUES (p_comment_id, p_user_id);
    UPDATE comments SET like_count = like_count + 1 WHERE id = p_comment_id;
    liked := TRUE;
  END IF;

  SELECT c.like_count INTO like_count FROM comments c WHERE c.id = p_comment_id;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- ROOMS: FUTURE SCOPE FEATURES
-- ============================================================

-- Room moderators
CREATE TABLE room_moderators (
  room_id     UUID NOT NULL REFERENCES topic_rooms(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'moderator' CHECK (role IN ('moderator', 'admin')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (room_id, user_id)
);

ALTER TABLE room_moderators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "room_mods_read" ON room_moderators FOR SELECT USING (true);
CREATE POLICY "room_mods_service" ON room_moderators FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Private rooms support
ALTER TABLE topic_rooms ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE topic_rooms ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;  -- for private room invites
ALTER TABLE topic_rooms ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE topic_rooms ADD COLUMN IF NOT EXISTS rules TEXT;  -- room rules text
ALTER TABLE topic_rooms ADD COLUMN IF NOT EXISTS banner_url TEXT;  -- room cover image

-- Room invites (for private rooms)
CREATE TABLE room_invites (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id     UUID NOT NULL REFERENCES topic_rooms(id) ON DELETE CASCADE,
  invited_by  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_user UUID REFERENCES users(id) ON DELETE CASCADE,  -- null = open invite link
  code        TEXT UNIQUE NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE room_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "room_invites_read" ON room_invites FOR SELECT USING (true);

-- Room-specific challenges
CREATE TABLE room_challenges (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id        UUID NOT NULL REFERENCES topic_rooms(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  emoji          TEXT DEFAULT '🔥',
  challenge_date DATE NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_room_challenges ON room_challenges(room_id, challenge_date DESC);
ALTER TABLE room_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "room_challenges_read" ON room_challenges FOR SELECT USING (true);

-- Link room challenge participation to posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS room_challenge_id UUID REFERENCES room_challenges(id) ON DELETE SET NULL;

-- Room notifications setting (user can toggle per-room)
CREATE TABLE room_notification_prefs (
  room_id    UUID NOT NULL REFERENCES topic_rooms(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notify_new_post BOOLEAN NOT NULL DEFAULT TRUE,
  notify_challenge BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (room_id, user_id)
);

ALTER TABLE room_notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "room_notif_prefs_all" ON room_notification_prefs FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Add notification support for rooms
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES topic_rooms(id) ON DELETE SET NULL;

-- ── HELPER: Get room leaderboard ───────────────────────────
CREATE OR REPLACE FUNCTION get_room_leaderboard(p_room_id UUID, p_limit INTEGER DEFAULT 20)
RETURNS TABLE(
  user_id UUID,
  post_count BIGINT,
  reaction_count BIGINT,
  score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.user_id,
    COUNT(DISTINCT p.id) AS post_count,
    COALESCE(SUM(p.reveal_count + p.view_count / 10), 0) AS reaction_count,
    COUNT(DISTINCT p.id) * 10 + COALESCE(SUM(p.view_count / 10), 0) AS score
  FROM posts p
  WHERE p.room_id = p_room_id
    AND p.is_deleted = FALSE
    AND p.is_anonymous = FALSE
    AND p.created_at > NOW() - INTERVAL '7 days'
  GROUP BY p.user_id
  ORDER BY score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── HELPER: Generate secure invite code ────────────────────
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ADDITIONAL PERFORMANCE INDEXES (Phase 3)
-- ============================================================

-- Feed performance: most common query pattern
CREATE INDEX IF NOT EXISTS idx_posts_feed_global
  ON posts(created_at DESC, is_deleted)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_posts_feed_city
  ON posts(city, created_at DESC)
  WHERE is_deleted = FALSE AND city IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_room_feed
  ON posts(room_id, created_at DESC)
  WHERE is_deleted = FALSE AND room_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_user_public
  ON posts(user_id, created_at DESC)
  WHERE is_deleted = FALSE AND is_anonymous = FALSE;

-- Social graph lookups
CREATE INDEX IF NOT EXISTS idx_follows_following
  ON follows(following_id, follower_id);

CREATE INDEX IF NOT EXISTS idx_follows_follower
  ON follows(follower_id, following_id);

-- Notification performance
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(user_id, is_read, created_at DESC)
  WHERE is_read = FALSE;

-- Message thread performance
CREATE INDEX IF NOT EXISTS idx_dm_thread
  ON direct_messages(sender_id, receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_receiver_unread
  ON direct_messages(receiver_id, is_read, created_at DESC)
  WHERE is_read = FALSE;

-- Reactions aggregate
CREATE INDEX IF NOT EXISTS idx_reactions_post
  ON reactions(post_id, type);

-- Stories expiry cleanup
CREATE INDEX IF NOT EXISTS idx_stories_active
  ON stories(expires_at, created_at DESC)
  WHERE expires_at > NOW();

-- Search performance
CREATE INDEX IF NOT EXISTS idx_posts_content_search
  ON posts USING gin(to_tsvector('english', coalesce(content, '')));

CREATE INDEX IF NOT EXISTS idx_users_search
  ON users USING gin(to_tsvector('english',
    coalesce(full_name, '') || ' ' || coalesce(username, '') || ' ' || coalesce(display_name, '')
  ));

-- Leaderboard
CREATE INDEX IF NOT EXISTS idx_user_points_weekly
  ON user_points(weekly_points DESC)
  WHERE weekly_points > 0;

CREATE INDEX IF NOT EXISTS idx_user_points_total
  ON user_points(total_points DESC)
  WHERE total_points > 0;

-- Anonymous questions
CREATE INDEX IF NOT EXISTS idx_anon_q_unanswered
  ON anonymous_questions(target_user_id, created_at DESC)
  WHERE is_answered = FALSE;


-- ============================================================
-- ACTIVITY LOGS (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,   -- 'post_created', 'comment_posted', 'user_followed', etc.
  target_id   UUID,            -- the resource acted on
  target_type TEXT,            -- 'post', 'user', 'room', etc.
  ip_address  TEXT,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_logs(action, created_at DESC);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
-- Only admins can read activity logs
CREATE POLICY "activity_logs_admin" ON activity_logs FOR SELECT USING (false);
CREATE POLICY "activity_logs_insert" ON activity_logs FOR INSERT WITH CHECK (true);

-- Helper function to log activity
CREATE OR REPLACE FUNCTION log_activity(
  p_user_id UUID,
  p_action TEXT,
  p_target_id UUID DEFAULT NULL,
  p_target_type TEXT DEFAULT NULL,
  p_ip TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS void AS $$
BEGIN
  INSERT INTO activity_logs(user_id, action, target_id, target_type, ip_address, metadata)
  VALUES (p_user_id, p_action, p_target_id, p_target_type, p_ip, p_metadata);
EXCEPTION WHEN OTHERS THEN
  -- Never fail main transaction due to logging failure
  NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- TIME-AWARE CHALLENGE SYSTEM
-- Each day has 4 time slots: night, morning, afternoon, evening
-- Challenges are served based on user's local time
-- ============================================================

-- Add time slot to daily_challenges
ALTER TABLE daily_challenges
  ADD COLUMN IF NOT EXISTS time_slot TEXT
    CHECK (time_slot IN ('night','morning','afternoon','evening','allday'))
    DEFAULT 'allday';

-- Add active time window columns
ALTER TABLE daily_challenges
  ADD COLUMN IF NOT EXISTS active_from  TIME DEFAULT '00:00:00',  -- local time window start
  ADD COLUMN IF NOT EXISTS active_until TIME DEFAULT '23:59:59';  -- local time window end

-- Challenge library: evergreen challenges by time slot
-- Used as fallback when no admin-created challenge exists
CREATE TABLE IF NOT EXISTS challenge_library (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '🔥',
  time_slot   TEXT NOT NULL CHECK (time_slot IN ('night','morning','afternoon','evening','allday')),
  tags        TEXT[] DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  use_count   INTEGER NOT NULL DEFAULT 0,    -- how many times shown
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lib_slot ON challenge_library(time_slot, is_active);

ALTER TABLE challenge_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lib_read" ON challenge_library FOR SELECT USING (true);
CREATE POLICY "lib_service" ON challenge_library FOR ALL USING (false);

-- ── Seed the challenge library ─────────────────────────────
INSERT INTO challenge_library (title, description, emoji, time_slot, tags) VALUES

-- NIGHT (10pm - 5am)
('Midnight Confession',     'Share something you''ve been thinking about but never said out loud. Anonymous is fine.', '🌙', 'night', ARRAY['midnight','thoughts','honest']),
('3am Thought',             'What''s the one thing your mind goes to when you can''t sleep?', '🌌', 'night', ARRAY['thoughts','insomnia','deep']),
('Can''t Sleep Because...',  'What''s keeping you up tonight? Share it here.', '😶', 'night', ARRAY['honest','feelings','night']),
('Secret You''ve Never Told', 'Share something anonymously that you''ve never told anyone. No judgment.', '🤐', 'night', ARRAY['secret','anonymous','confession']),
('What Scares You at Night', 'Not ghosts — real fears. What do you think about in the dark?', '🌑', 'night', ARRAY['fear','honest','deep']),
('Midnight Gratitude',      'Name one thing from today you''re genuinely grateful for. Even something tiny.', '🙏', 'night', ARRAY['gratitude','reflection','positive']),
('The Text You''ll Never Send', 'Write the message you''ve been wanting to send but haven''t. Post it here instead.', '📱', 'night', ARRAY['feelings','unsent','honest']),

-- MORNING (5am - 11am)
('Today I Will...',         'What is the one thing you are determined to do today? Share your intention.', '☀️', 'morning', ARRAY['goals','morning','motivation']),
('Morning Mood',            'How are you actually feeling this morning? No filter.', '🌅', 'morning', ARRAY['mood','honest','morning']),
('First Thought Today',     'What was the very first thing that crossed your mind when you woke up?', '🛏️', 'morning', ARRAY['thoughts','morning','honest']),
('Coffee or No Coffee?',    'Describe your morning routine in 3 words. Bonus: share why it works (or doesn''t).', '☕', 'morning', ARRAY['routine','morning','lifestyle']),
('One Thing to Let Go',     'What''s one thing from yesterday you are choosing to leave behind today?', '🌱', 'morning', ARRAY['growth','morning','mindset']),
('Morning Unpopular Opinion', 'Share an opinion most people in your life would disagree with. Morning energy only.', '🔥', 'morning', ARRAY['opinion','morning','bold']),

-- AFTERNOON (11am - 5pm)
('Hidden Gem Near You',     'Share a place in your city most people walk right past. Give us the secret.', '💎', 'afternoon', ARRAY['local','secret','city']),
('Lunch Confession',        'What did you actually eat for lunch vs what you told yourself you''d eat?', '🍜', 'afternoon', ARRAY['food','honest','funny']),
('Afternoon Slump',         'It''s that time of the day. What''s your honest energy level and what are you doing about it?', '😴', 'afternoon', ARRAY['relatable','work','honest']),
('5 Words for Your Day',    'Describe your entire day so far in exactly 5 words. No more, no less.', '✍️', 'afternoon', ARRAY['creative','challenge','day']),
('The Meeting That Should Have Been an Email', 'Describe your most pointless meeting ever. Keep it anonymous.', '💼', 'afternoon', ARRAY['work','relatable','funny']),
('Local Secret',            'What does your city/neighbourhood have that outsiders never find out about?', '🗺️', 'afternoon', ARRAY['local','community','discovery']),
('Mood Weather Right Now',  'If your current mood were weather, what would it be? Describe it vividly.', '🌤️', 'afternoon', ARRAY['creative','mood','metaphor']),

-- EVENING (5pm - 10pm)
('Day in One Word',         'Just one word to describe how your day actually went. Explain if you want.', '🌆', 'evening', ARRAY['reflection','day','honest']),
('Win or Loss?',            'Share something from today that counts as a win. Even the smallest ones count.', '🏆', 'evening', ARRAY['positive','day','gratitude']),
('Stranger Story',          'Tell us about an interesting stranger you saw or spoke to today.', '👤', 'evening', ARRAY['people','story','connection']),
('Evening Unpopular Opinion', 'What is something true that most people are afraid to say? Evening edition.', '💭', 'evening', ARRAY['opinion','honest','bold']),
('What I Wish I Said',      'Something you wanted to say today but didn''t. This is your chance.', '💬', 'evening', ARRAY['feelings','honest','unsaid']),
('Today''s Small Discovery', 'Share something tiny but interesting you noticed or learned today.', '🔍', 'evening', ARRAY['curious','learning','day']),
('Dinner Table Confession', 'If your family/friends could hear your actual thoughts at dinner, what would they hear?', '🍽️', 'evening', ARRAY['funny','honest','family'])

ON CONFLICT DO NOTHING;


-- ============================================================
-- USER-CREATED CHALLENGES (community challenges)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_challenges (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 100),
  description   TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 300),
  emoji         TEXT DEFAULT '🔥',
  time_slot     TEXT CHECK (time_slot IN ('night','morning','afternoon','evening','allday')) DEFAULT 'allday',
  is_anonymous  BOOLEAN NOT NULL DEFAULT FALSE,
  participant_count INTEGER NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_challenges_active
  ON user_challenges(expires_at DESC)
  WHERE expires_at > NOW();

CREATE INDEX IF NOT EXISTS idx_user_challenges_slot
  ON user_challenges(time_slot, created_at DESC);

ALTER TABLE user_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uc_read" ON user_challenges FOR SELECT USING (expires_at > NOW());
CREATE POLICY "uc_insert" ON user_challenges FOR INSERT
  WITH CHECK (creator_id = (SELECT id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY "uc_delete" ON user_challenges FOR DELETE
  USING (creator_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Participation in user-created challenges
CREATE TABLE IF NOT EXISTS user_challenge_posts (
  user_challenge_id UUID NOT NULL REFERENCES user_challenges(id) ON DELETE CASCADE,
  post_id           UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_challenge_id, user_id)
);

ALTER TABLE user_challenge_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ucp_read" ON user_challenge_posts FOR SELECT USING (true);
CREATE POLICY "ucp_write" ON user_challenge_posts FOR INSERT
  WITH CHECK (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Track user interactions for personalization
CREATE TABLE IF NOT EXISTS user_tag_interests (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag        TEXT NOT NULL,
  score      INTEGER NOT NULL DEFAULT 1,  -- increases with each interaction
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_tag_interests
  ON user_tag_interests(user_id, score DESC);

ALTER TABLE user_tag_interests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "interests_own" ON user_tag_interests FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Track post views (for "don't show again" logic)
CREATE TABLE IF NOT EXISTS post_views (
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_views_user ON post_views(user_id, viewed_at DESC);

ALTER TABLE post_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "post_views_own" ON post_views FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Function: update tag interest score
CREATE OR REPLACE FUNCTION update_tag_interest(
  p_user_id UUID,
  p_tags    TEXT[],
  p_delta   INTEGER DEFAULT 1
) RETURNS void AS $$
DECLARE
  tag TEXT;
BEGIN
  FOREACH tag IN ARRAY p_tags LOOP
    INSERT INTO user_tag_interests(user_id, tag, score, updated_at)
    VALUES (p_user_id, tag, p_delta, NOW())
    ON CONFLICT (user_id, tag) DO UPDATE SET
      score = GREATEST(0, user_tag_interests.score + p_delta),
      updated_at = NOW();
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- PASSIVE LOCATION SYSTEM
-- Tracks user's current real-time location (updated from app)
-- Separate from profile "city" — this is live GPS location
-- ============================================================

CREATE TABLE IF NOT EXISTS user_locations (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  latitude     DOUBLE PRECISION NOT NULL,
  longitude    DOUBLE PRECISION NOT NULL,
  location     GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
                 ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::GEOGRAPHY
               ) STORED,
  accuracy_m   DOUBLE PRECISION,                        -- GPS accuracy in meters
  city         TEXT,                                    -- reverse-geocoded city
  locality     TEXT,                                    -- neighborhood/area name
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours')
);

CREATE INDEX IF NOT EXISTS idx_user_locations_geo
  ON user_locations USING GIST(location);

CREATE INDEX IF NOT EXISTS idx_user_locations_active
  ON user_locations(expires_at)
  WHERE expires_at > NOW();

ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY;
-- User can only see/update their own location
CREATE POLICY "location_own" ON user_locations FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ── UPGRADED: Smart nearby feed with social graph + engagement ────
-- Algorithm:
--   total_score = social_bonus + engagement_score + location_precision + recency_bonus
--
-- social_bonus:
--   50 pts  → user follows this poster
--   30 pts  → mutual follow
--   10 pts  → same neighborhood (locality)
--    0 pts  → stranger
--
-- engagement_score:
--   (reactions*3 + comments*2 + reveals*4) / age_hours^1.5
--   Capped at 100 pts
--
-- location_precision (inverse distance):
--   <500m  → 20 pts
--   <1km   → 15 pts
--   <3km   → 10 pts
--   <5km   → 5 pts
--
-- recency_bonus:
--   <1h    → 15 pts
--   <6h    → 10 pts
--   <24h   → 5 pts
--   older  → 0 pts

CREATE OR REPLACE FUNCTION get_nearby_posts_smart(
  p_lat           DOUBLE PRECISION,
  p_lng           DOUBLE PRECISION,
  p_radius_km     DOUBLE PRECISION DEFAULT 5.0,
  p_lim           INTEGER DEFAULT 20,
  p_user_id       UUID DEFAULT NULL,
  p_cursor_time   TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id                    UUID,
  user_id               UUID,
  content               TEXT,
  image_url             TEXT,
  video_url             TEXT,
  video_thumbnail_url   TEXT,
  is_anonymous          BOOLEAN,
  is_mystery            BOOLEAN,
  city                  TEXT,
  tags                  TEXT[],
  reveal_count          INTEGER,
  view_count            INTEGER,
  reshare_count         INTEGER,
  reshared_from_id      UUID,
  room_id               UUID,
  created_at            TIMESTAMPTZ,
  distance_km           DOUBLE PRECISION,
  total_score           DOUBLE PRECISION,
  -- Enrichment data
  reaction_counts       JSONB,
  comment_count         BIGINT,
  user_reaction         TEXT,
  has_revealed          BOOLEAN,
  social_context        TEXT     -- 'following', 'mutual', 'local', 'stranger'
) AS $$
DECLARE
  viewer_point GEOGRAPHY;
BEGIN
  viewer_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY;

  RETURN QUERY
  WITH

  -- All posts within radius
  nearby AS (
    SELECT
      p.*,
      ROUND((ST_Distance(p.location, viewer_point) / 1000)::NUMERIC, 2)::DOUBLE PRECISION AS dist_km
    FROM posts p
    WHERE p.is_deleted = FALSE
      AND p.location IS NOT NULL
      AND ST_DWithin(p.location, viewer_point, p_radius_km * 1000)
      AND (p_cursor_time IS NULL OR p.created_at < p_cursor_time)
    LIMIT 200  -- fetch wide, score, then limit
  ),

  -- Social relationship to each poster (if user is logged in)
  social AS (
    SELECT
      n.id AS post_id,
      CASE
        WHEN p_user_id IS NULL THEN 'stranger'
        WHEN n.user_id = p_user_id THEN 'self'
        WHEN EXISTS(
          SELECT 1 FROM follows f1
          WHERE f1.follower_id = p_user_id AND f1.following_id = n.user_id
        ) AND EXISTS(
          SELECT 1 FROM follows f2
          WHERE f2.follower_id = n.user_id AND f2.following_id = p_user_id
        ) THEN 'mutual'
        WHEN EXISTS(
          SELECT 1 FROM follows f
          WHERE f.follower_id = p_user_id AND f.following_id = n.user_id
        ) THEN 'following'
        ELSE 'stranger'
      END AS relationship
    FROM nearby n
    WHERE NOT n.is_anonymous  -- anonymous posts have no social context
  ),

  -- Reaction counts per post
  rxn AS (
    SELECT
      r.post_id,
      JSONB_BUILD_OBJECT(
        'interesting', COUNT(*) FILTER (WHERE r.type = 'interesting'),
        'funny',       COUNT(*) FILTER (WHERE r.type = 'funny'),
        'deep',        COUNT(*) FILTER (WHERE r.type = 'deep'),
        'curious',     COUNT(*) FILTER (WHERE r.type = 'curious')
      ) AS counts,
      COUNT(*) AS total
    FROM reactions r
    WHERE r.post_id IN (SELECT id FROM nearby)
    GROUP BY r.post_id
  ),

  -- Comment counts
  cmt AS (
    SELECT post_id, COUNT(*) AS cnt
    FROM comments
    WHERE post_id IN (SELECT id FROM nearby) AND is_deleted = FALSE
    GROUP BY post_id
  ),

  -- User's own reactions
  my_rxn AS (
    SELECT post_id, type
    FROM reactions
    WHERE p_user_id IS NOT NULL
      AND user_id = p_user_id
      AND post_id IN (SELECT id FROM nearby)
  ),

  -- User's reveals
  my_reveal AS (
    SELECT post_id
    FROM mystery_reveals
    WHERE p_user_id IS NOT NULL
      AND user_id = p_user_id
      AND post_id IN (SELECT id FROM nearby WHERE is_mystery = TRUE)
  ),

  -- Calculate scores
  scored AS (
    SELECT
      n.id, n.user_id, n.content, n.image_url, n.video_url,
      n.video_thumbnail_url, n.is_anonymous, n.is_mystery,
      n.city, n.tags, n.reveal_count, n.view_count,
      COALESCE(n.reshare_count, 0) AS reshare_count,
      n.reshared_from_id, n.room_id, n.created_at, n.dist_km,

      -- Reaction & comment data
      COALESCE(rxn.counts, '{"interesting":0,"funny":0,"deep":0,"curious":0}'::JSONB) AS reaction_counts,
      COALESCE(cmt.cnt, 0) AS comment_count,
      my_rxn.type AS user_reaction,
      (my_reveal.post_id IS NOT NULL) AS has_revealed,

      -- Social context
      COALESCE(social.relationship, 'stranger') AS social_context,

      -- ── Score calculation ──────────────────────────────
      (
        -- 1. Social bonus
        CASE COALESCE(social.relationship, 'stranger')
          WHEN 'self'      THEN 0    -- own posts at bottom
          WHEN 'mutual'    THEN 50
          WHEN 'following' THEN 35
          ELSE 0
        END
        +
        -- 2. Engagement score (capped at 80)
        LEAST(
          (COALESCE(rxn.total, 0) * 3 + COALESCE(cmt.cnt, 0) * 2 + COALESCE(n.reveal_count, 0) * 4)::FLOAT
          / GREATEST(
              EXTRACT(EPOCH FROM (NOW() - n.created_at)) / 3600.0,
              0.1
            ) ^ 1.5,
          80.0
        )
        +
        -- 3. Location precision bonus (closer = better)
        CASE
          WHEN n.dist_km < 0.5 THEN 20
          WHEN n.dist_km < 1.0 THEN 15
          WHEN n.dist_km < 3.0 THEN 10
          WHEN n.dist_km < 5.0 THEN 5
          ELSE 0
        END
        +
        -- 3b. Scope bonus: posts explicitly targeted to nearby get +30
        CASE WHEN n.scope = 'nearby' THEN 30 ELSE 0 END
        +
        -- 4. Recency bonus
        CASE
          WHEN n.created_at > NOW() - INTERVAL '1 hour'  THEN 15
          WHEN n.created_at > NOW() - INTERVAL '6 hours' THEN 10
          WHEN n.created_at > NOW() - INTERVAL '24 hours' THEN 5
          ELSE 0
        END
      )::DOUBLE PRECISION AS total_score

    FROM nearby n
    LEFT JOIN social    ON social.post_id   = n.id
    LEFT JOIN rxn       ON rxn.post_id      = n.id
    LEFT JOIN cmt       ON cmt.post_id      = n.id
    LEFT JOIN my_rxn    ON my_rxn.post_id   = n.id
    LEFT JOIN my_reveal ON my_reveal.post_id = n.id
  )

  SELECT
    s.id, s.user_id, s.content, s.image_url, s.video_url,
    s.video_thumbnail_url, s.is_anonymous, s.is_mystery,
    s.city, s.tags, s.reveal_count, s.view_count,
    s.reshare_count, s.reshared_from_id, s.room_id, s.created_at,
    s.dist_km, s.total_score, s.reaction_counts, s.comment_count,
    s.user_reaction, s.has_revealed, s.social_context
  FROM scored s
  ORDER BY s.total_score DESC, s.created_at DESC
  LIMIT p_lim;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ============================================================
-- NEARBY FEED SCORE BREAKDOWN (for transparency/debugging)
-- Shows exactly why a post was ranked where it was
-- ============================================================
-- Score components per post:
-- social_score:    50 (mutual friend) / 35 (following) / 0 (stranger)
-- engagement:      (reactions*3 + comments*2 + reveals*4) / age^1.5  [capped 80]
-- distance_bonus:  20/15/10/5/0 based on km
-- recency_bonus:   15/10/5/0 based on age
-- total = sum of above

-- Rahul in Howrah scenario walkthrough:
-- rina + disa posted in Howrah in last 24h
-- rahul follows neither (stranger → social_score = 0)
-- BUT rina's post has 89 reactions in 2h → engagement = (89*3)/2^1.5 = 94.7 → capped 80
-- disa's post has 12 reactions, 200m away → engagement = low, distance_bonus = 20
-- Result: rina's post ranks #1 (high engagement), disa's #2 (close distance)
--
-- If rahul later follows rina → rina's posts get +35 social bonus → always near top
-- If mutual follow develops → +50 social bonus → always #1 for rahul in that area


-- ============================================================
-- SCENARIO 4: Post scope/audience selector
-- ============================================================
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS scope TEXT
    CHECK (scope IN ('global', 'nearby', 'city'))
    DEFAULT 'global';

CREATE INDEX IF NOT EXISTS idx_posts_scope
  ON posts(scope, city, created_at DESC)
  WHERE is_deleted = FALSE;

-- ============================================================
-- PRIVATE PROFILES + FOLLOW REQUESTS (Instagram logic)
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS follow_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(requester_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_fr_target
  ON follow_requests(target_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fr_requester
  ON follow_requests(requester_id, status);

ALTER TABLE follow_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fr_own" ON follow_requests FOR ALL
  USING (
    requester_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    OR
    target_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- ============================================================
-- CITY FEED: City + sub-areas mapping
-- ============================================================
CREATE TABLE IF NOT EXISTS city_areas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  city        TEXT NOT NULL,        -- parent city e.g. 'Howrah'
  area        TEXT NOT NULL,        -- sub-area e.g. 'Domjur', 'Andul', 'Sankrail'
  state       TEXT,                 -- 'West Bengal'
  country     TEXT DEFAULT 'India',
  center_lat  DOUBLE PRECISION,
  center_lng  DOUBLE PRECISION,
  radius_km   DOUBLE PRECISION DEFAULT 5.0,
  aliases     TEXT[] DEFAULT '{}',  -- alternate spellings
  UNIQUE(city, area)
);

CREATE INDEX IF NOT EXISTS idx_city_areas_city ON city_areas(city);

ALTER TABLE city_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "city_areas_read" ON city_areas FOR SELECT USING (true);

-- ============================================================
-- COMPLETE INDIA CITY AREAS (auto-generated from india-cities.ts)
-- 62 cities, 896 sub-areas
-- ============================================================
INSERT INTO city_areas (city, area, state, country, center_lat, center_lng, radius_km) VALUES
  ('Kolkata', 'Salt Lake', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'New Town', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Jadavpur', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Ballygunge', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Park Street', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Dumdum', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Behala', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Tollygunge', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Shyambazar', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Ultadanga', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Kasba', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Garia', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Baghajatin', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Regent Park', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Santoshpur', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Gariahat', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Golpark', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Jodhpur Park', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Lake Town', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'VIP Road', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'New Alipore', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Alipore', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Kalighat', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Rashbehari', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Dhakuria', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Sonarpur', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Narendrapur', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Patuli', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Mukundapur', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Teghoria', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Barasat', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Madhyamgram', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Dum Dum Cantonment', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Kankurgachi', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Shantinagar', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Phoolbagan', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Bagmari', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Maniktala', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Girish Park', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Bowbazar', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Burrabazar', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'College Street', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Sovabazar', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Kolkata', 'Hatibagan', 'West Bengal', 'India', 22.5726, 88.3639, 5.0),
  ('Howrah', 'Domjur', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Andul', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Sankrail', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Shibpur', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Bally', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Liluah', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Belur', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Uttarpara', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Konnagar', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Serampore', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Rishra', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Kadamtala', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Ghusuri', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Salkia', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Ramrajatala', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Santragachi', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Golabari', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Bamungachi', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Jagacha', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Panchla', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Bagnan', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Uluberia', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Amta', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Udaynarayanpur', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Howrah', 'Jagatballavpur', 'West Bengal', 'India', 22.5958, 88.2636, 5.0),
  ('Durgapur', 'Bidhannagar', 'West Bengal', 'India', 23.5204, 87.3119, 5.0),
  ('Durgapur', 'Benachity', 'West Bengal', 'India', 23.5204, 87.3119, 5.0),
  ('Durgapur', 'Bidhan Nagar', 'West Bengal', 'India', 23.5204, 87.3119, 5.0),
  ('Durgapur', 'City Centre', 'West Bengal', 'India', 23.5204, 87.3119, 5.0),
  ('Durgapur', 'Steel Township', 'West Bengal', 'India', 23.5204, 87.3119, 5.0),
  ('Durgapur', 'Andal', 'West Bengal', 'India', 23.5204, 87.3119, 5.0),
  ('Durgapur', 'Kanksa', 'West Bengal', 'India', 23.5204, 87.3119, 5.0),
  ('Durgapur', 'Raniganj', 'West Bengal', 'India', 23.5204, 87.3119, 5.0),
  ('Durgapur', 'Jamuria', 'West Bengal', 'India', 23.5204, 87.3119, 5.0),
  ('Durgapur', 'Pandabeswar', 'West Bengal', 'India', 23.5204, 87.3119, 5.0),
  ('Asansol', 'Burnpur', 'West Bengal', 'India', 23.6889, 86.9661, 5.0),
  ('Asansol', 'Kulti', 'West Bengal', 'India', 23.6889, 86.9661, 5.0),
  ('Asansol', 'Jamuria', 'West Bengal', 'India', 23.6889, 86.9661, 5.0),
  ('Asansol', 'Barakar', 'West Bengal', 'India', 23.6889, 86.9661, 5.0),
  ('Asansol', 'Chittaranjan', 'West Bengal', 'India', 23.6889, 86.9661, 5.0),
  ('Asansol', 'Raniganj', 'West Bengal', 'India', 23.6889, 86.9661, 5.0),
  ('Asansol', 'Salanpur', 'West Bengal', 'India', 23.6889, 86.9661, 5.0),
  ('Asansol', 'Hirapur', 'West Bengal', 'India', 23.6889, 86.9661, 5.0),
  ('Asansol', 'Dishergarh', 'West Bengal', 'India', 23.6889, 86.9661, 5.0),
  ('Siliguri', 'Bagdogra', 'West Bengal', 'India', 26.7271, 88.3953, 5.0),
  ('Siliguri', 'Matigara', 'West Bengal', 'India', 26.7271, 88.3953, 5.0),
  ('Siliguri', 'Naxalbari', 'West Bengal', 'India', 26.7271, 88.3953, 5.0),
  ('Siliguri', 'Phansidewa', 'West Bengal', 'India', 26.7271, 88.3953, 5.0),
  ('Siliguri', 'Jalpaiguri', 'West Bengal', 'India', 26.7271, 88.3953, 5.0),
  ('Siliguri', 'Pradhan Nagar', 'West Bengal', 'India', 26.7271, 88.3953, 5.0),
  ('Siliguri', 'Dabgram', 'West Bengal', 'India', 26.7271, 88.3953, 5.0),
  ('Siliguri', 'Fulbari', 'West Bengal', 'India', 26.7271, 88.3953, 5.0),
  ('Siliguri', 'Sevoke Road', 'West Bengal', 'India', 26.7271, 88.3953, 5.0),
  ('Mumbai', 'Bandra', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Andheri', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Dadar', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Juhu', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Powai', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Borivali', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Malad', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Kandivali', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Goregaon', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Jogeshwari', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Vile Parle', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Santacruz', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Khar', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Bandra Kurla Complex', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Kurla', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Ghatkopar', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Mulund', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Thane', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Vikhroli', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Chembur', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Mankhurd', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Govandi', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Dharavi', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Sion', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Wadala', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Parel', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Worli', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Lower Parel', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Elphinstone', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Mahim', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Byculla', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Mazgaon', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Dockyard Road', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Churchgate', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'CST', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Marine Lines', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Charni Road', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Grant Road', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Matunga', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Naigaon', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Vasai', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Virar', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Mira Road', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Bhayander', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Navi Mumbai', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Vashi', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Nerul', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Belapur', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Kharghar', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Panvel', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Colaba', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Fort', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Nariman Point', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Cuffe Parade', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Mumbai', 'Sion', 'Maharashtra', 'India', 19.0760, 72.8777, 5.0),
  ('Pune', 'Kothrud', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Hinjewadi', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Baner', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Viman Nagar', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Koregaon Park', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Kalyani Nagar', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Wakad', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Pimple Saudagar', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Pimple Nilakh', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Aundh', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Pashan', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Balewadi', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Bavdhan', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Sus', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Mahalunge', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Hadapsar', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Magarpatta', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Kharadi', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Wagholi', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Lohegaon', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Vishrantwadi', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Kalewadi', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Rahatani', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Chinchwad', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Pimpri', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Akurdi', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Nigdi', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Bhosari', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Chakan', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Talegaon', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Swargate', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Deccan', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Shivajinagar', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Pune Camp', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Kondhwa', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Undri', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Pisoli', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Wanowrie', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Bibwewadi', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Katraj', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Pune', 'Dhankawadi', 'Maharashtra', 'India', 18.5204, 73.8567, 5.0),
  ('Nagpur', 'Dharampeth', 'Maharashtra', 'India', 21.1458, 79.0882, 5.0),
  ('Nagpur', 'Sitabuldi', 'Maharashtra', 'India', 21.1458, 79.0882, 5.0),
  ('Nagpur', 'Sadar', 'Maharashtra', 'India', 21.1458, 79.0882, 5.0),
  ('Nagpur', 'Ramdaspeth', 'Maharashtra', 'India', 21.1458, 79.0882, 5.0),
  ('Nagpur', 'Bajaj Nagar', 'Maharashtra', 'India', 21.1458, 79.0882, 5.0),
  ('Nagpur', 'Pratap Nagar', 'Maharashtra', 'India', 21.1458, 79.0882, 5.0),
  ('Nagpur', 'Hingna', 'Maharashtra', 'India', 21.1458, 79.0882, 5.0),
  ('Nagpur', 'Kamptee', 'Maharashtra', 'India', 21.1458, 79.0882, 5.0),
  ('Nagpur', 'Butibori', 'Maharashtra', 'India', 21.1458, 79.0882, 5.0),
  ('Nagpur', 'Wardha Road', 'Maharashtra', 'India', 21.1458, 79.0882, 5.0),
  ('Nagpur', 'Civil Lines', 'Maharashtra', 'India', 21.1458, 79.0882, 5.0),
  ('Nagpur', 'Ambazari', 'Maharashtra', 'India', 21.1458, 79.0882, 5.0),
  ('Nagpur', 'Shankar Nagar', 'Maharashtra', 'India', 21.1458, 79.0882, 5.0),
  ('Nagpur', 'Trimurti Nagar', 'Maharashtra', 'India', 21.1458, 79.0882, 5.0),
  ('Nashik', 'Satpur', 'Maharashtra', 'India', 19.9975, 73.7898, 5.0),
  ('Nashik', 'Ambad', 'Maharashtra', 'India', 19.9975, 73.7898, 5.0),
  ('Nashik', 'Cidco', 'Maharashtra', 'India', 19.9975, 73.7898, 5.0),
  ('Nashik', 'Gangapur Road', 'Maharashtra', 'India', 19.9975, 73.7898, 5.0),
  ('Nashik', 'College Road', 'Maharashtra', 'India', 19.9975, 73.7898, 5.0),
  ('Nashik', 'Deolali', 'Maharashtra', 'India', 19.9975, 73.7898, 5.0),
  ('Nashik', 'Ozar', 'Maharashtra', 'India', 19.9975, 73.7898, 5.0),
  ('Nashik', 'Trimbak Road', 'Maharashtra', 'India', 19.9975, 73.7898, 5.0),
  ('Nashik', 'Panchvati', 'Maharashtra', 'India', 19.9975, 73.7898, 5.0),
  ('Nashik', 'Dwarka', 'Maharashtra', 'India', 19.9975, 73.7898, 5.0),
  ('Aurangabad', 'Cidco', 'Maharashtra', 'India', 19.8762, 75.3433, 5.0),
  ('Aurangabad', 'Waluj', 'Maharashtra', 'India', 19.8762, 75.3433, 5.0),
  ('Aurangabad', 'Chikalthana', 'Maharashtra', 'India', 19.8762, 75.3433, 5.0),
  ('Aurangabad', 'Paithan Road', 'Maharashtra', 'India', 19.8762, 75.3433, 5.0),
  ('Aurangabad', 'Garkheda', 'Maharashtra', 'India', 19.8762, 75.3433, 5.0),
  ('Aurangabad', 'Osmanpura', 'Maharashtra', 'India', 19.8762, 75.3433, 5.0),
  ('Aurangabad', 'Padampura', 'Maharashtra', 'India', 19.8762, 75.3433, 5.0),
  ('Aurangabad', 'Cantonment', 'Maharashtra', 'India', 19.8762, 75.3433, 5.0),
  ('Aurangabad', 'Satara', 'Maharashtra', 'India', 19.8762, 75.3433, 5.0),
  ('Aurangabad', 'Beed Bypass', 'Maharashtra', 'India', 19.8762, 75.3433, 5.0),
  ('Delhi', 'Connaught Place', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Lajpat Nagar', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Saket', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Dwarka', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Rohini', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Pitampura', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Janakpuri', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Uttam Nagar', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Vikaspuri', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Paschim Vihar', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Punjabi Bagh', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Model Town', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'GTB Nagar', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Mukherjee Nagar', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Civil Lines', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Kashmere Gate', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Old Delhi', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Chandni Chowk', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Karol Bagh', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Patel Nagar', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Rajendra Nagar', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Naraina', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Vasant Kunj', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Vasant Vihar', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Mehrauli', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Chattarpur', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Malviya Nagar', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Greater Kailash', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Kalkaji', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Govindpuri', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Sangam Vihar', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Badarpur', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Okhla', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Jasola', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Sarita Vihar', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Shahdara', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Preet Vihar', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Mayur Vihar', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Patparganj', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Laxmi Nagar', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Dilshad Garden', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Vivek Vihar', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Anand Vihar', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Ghaziabad', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Noida Sector 18', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Noida Sector 62', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Greater Noida', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Gurgaon', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Faridabad', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Bahadurgarh', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Dwarka Expressway', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Delhi', 'Sohna Road', 'Delhi', 'India', 28.6139, 77.2090, 5.0),
  ('Bangalore', 'Koramangala', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Indiranagar', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Whitefield', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'HSR Layout', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'JP Nagar', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Hebbal', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Yelahanka', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Marathahalli', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Sarjapur Road', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Electronic City', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Bannerghatta Road', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'BTM Layout', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Jayanagar', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Basavanagudi', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Rajajinagar', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Malleshwaram', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Seshadripuram', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Sadashivanagar', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'RT Nagar', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Banaswadi', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Horamavu', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Kammanahalli', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'CV Raman Nagar', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Domlur', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Ejipura', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Vivek Nagar', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Bellandur', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Kadugodi', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Varthur', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Mahadevapura', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'KR Puram', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Byndoor', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Begur', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Bommanahalli', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Hulimavu', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Arekere', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Gottigere', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Hongasandra', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Kengeri', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Rajarajeshwari Nagar', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Uttarahalli', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Nagarbhavi', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Vijayanagar', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Tumkur Road', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Peenya', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Yeshwantpur', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Majestic', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'MG Road', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Brigade Road', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'Commercial Street', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Bangalore', 'UB City', 'Karnataka', 'India', 12.9716, 77.5946, 5.0),
  ('Mysore', 'Jayalakshmipuram', 'Karnataka', 'India', 12.2958, 76.6394, 5.0),
  ('Mysore', 'Saraswathipuram', 'Karnataka', 'India', 12.2958, 76.6394, 5.0),
  ('Mysore', 'Kuvempunagar', 'Karnataka', 'India', 12.2958, 76.6394, 5.0),
  ('Mysore', 'Hebbal', 'Karnataka', 'India', 12.2958, 76.6394, 5.0),
  ('Mysore', 'Vijayanagar', 'Karnataka', 'India', 12.2958, 76.6394, 5.0),
  ('Mysore', 'Bannimantap', 'Karnataka', 'India', 12.2958, 76.6394, 5.0),
  ('Mysore', 'Dattagalli', 'Karnataka', 'India', 12.2958, 76.6394, 5.0),
  ('Mysore', 'Ramakrishmanagar', 'Karnataka', 'India', 12.2958, 76.6394, 5.0),
  ('Mangalore', 'Hampankatta', 'Karnataka', 'India', 12.8698, 74.8430, 5.0),
  ('Mangalore', 'Kadri', 'Karnataka', 'India', 12.8698, 74.8430, 5.0),
  ('Mangalore', 'Attavar', 'Karnataka', 'India', 12.8698, 74.8430, 5.0),
  ('Mangalore', 'Bejai', 'Karnataka', 'India', 12.8698, 74.8430, 5.0),
  ('Mangalore', 'Falnir', 'Karnataka', 'India', 12.8698, 74.8430, 5.0),
  ('Mangalore', 'Balmatta', 'Karnataka', 'India', 12.8698, 74.8430, 5.0),
  ('Mangalore', 'Kankanady', 'Karnataka', 'India', 12.8698, 74.8430, 5.0),
  ('Mangalore', 'Bondel', 'Karnataka', 'India', 12.8698, 74.8430, 5.0),
  ('Mangalore', 'Derebail', 'Karnataka', 'India', 12.8698, 74.8430, 5.0),
  ('Mangalore', 'Surathkal', 'Karnataka', 'India', 12.8698, 74.8430, 5.0),
  ('Chennai', 'T Nagar', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Adyar', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Anna Nagar', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Velachery', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Perungudi', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Sholinganallur', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Perambur', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Villivakkam', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Ambattur', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Avadi', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Thiruvottiyur', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Tondiarpet', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Washermanpet', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Royapuram', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Purasawalkam', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Egmore', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Nungambakkam', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Kilpauk', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Shenoy Nagar', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Aminjikarai', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Arumbakkam', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Koyambedu', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Vadapalani', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Kodambakkam', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Ashok Nagar', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'KK Nagar', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Virugambakkam', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Valasaravakkam', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Porur', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Tambaram', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Chrompet', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Pallavaram', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Sembakkam', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Medavakkam', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Madipakkam', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Guindy', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Ekkatuthangal', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Saidapet', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Kotturpuram', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Thiruvanmiyur', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Besant Nagar', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Chennai', 'Mylapore', 'Tamil Nadu', 'India', 13.0827, 80.2707, 5.0),
  ('Coimbatore', 'RS Puram', 'Tamil Nadu', 'India', 11.0168, 76.9558, 5.0),
  ('Coimbatore', 'Ganapathy', 'Tamil Nadu', 'India', 11.0168, 76.9558, 5.0),
  ('Coimbatore', 'Peelamedu', 'Tamil Nadu', 'India', 11.0168, 76.9558, 5.0),
  ('Coimbatore', 'Singanallur', 'Tamil Nadu', 'India', 11.0168, 76.9558, 5.0),
  ('Coimbatore', 'Kuniyamuthur', 'Tamil Nadu', 'India', 11.0168, 76.9558, 5.0),
  ('Coimbatore', 'Saibaba Colony', 'Tamil Nadu', 'India', 11.0168, 76.9558, 5.0),
  ('Coimbatore', 'Race Course', 'Tamil Nadu', 'India', 11.0168, 76.9558, 5.0),
  ('Coimbatore', 'Gandhipuram', 'Tamil Nadu', 'India', 11.0168, 76.9558, 5.0),
  ('Coimbatore', 'Ukkadam', 'Tamil Nadu', 'India', 11.0168, 76.9558, 5.0),
  ('Coimbatore', 'Uppilipalayam', 'Tamil Nadu', 'India', 11.0168, 76.9558, 5.0),
  ('Madurai', 'KK Nagar', 'Tamil Nadu', 'India', 9.9252, 78.1198, 5.0),
  ('Madurai', 'Anna Nagar', 'Tamil Nadu', 'India', 9.9252, 78.1198, 5.0),
  ('Madurai', 'Tallakulam', 'Tamil Nadu', 'India', 9.9252, 78.1198, 5.0),
  ('Madurai', 'Teppakulam', 'Tamil Nadu', 'India', 9.9252, 78.1198, 5.0),
  ('Madurai', 'Bypass Road', 'Tamil Nadu', 'India', 9.9252, 78.1198, 5.0),
  ('Madurai', 'Nagamalai', 'Tamil Nadu', 'India', 9.9252, 78.1198, 5.0),
  ('Madurai', 'Thirunagar', 'Tamil Nadu', 'India', 9.9252, 78.1198, 5.0),
  ('Madurai', 'Narimedu', 'Tamil Nadu', 'India', 9.9252, 78.1198, 5.0),
  ('Madurai', 'Goripalayam', 'Tamil Nadu', 'India', 9.9252, 78.1198, 5.0),
  ('Hyderabad', 'Hitech City', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Banjara Hills', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Gachibowli', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Jubilee Hills', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Madhapur', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Kondapur', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Kukatpally', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Miyapur', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Bachupally', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Kompally', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Secunderabad', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Begumpet', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Somajiguda', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Ameerpet', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'SR Nagar', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Yousufguda', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Mehdipatnam', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Tolichowki', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Masab Tank', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Attapur', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Rajendranagar', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Nanakramguda', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Financial District', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Narsingi', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Manikonda', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Puppalaguda', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Budvel', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Kokapet', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'LB Nagar', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Dilsukhnagar', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Vanasthalipuram', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Hayathnagar', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Uppal', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Nacharam', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Habsiguda', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Ramanthapur', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Malkajgiri', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Alwal', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Quthbullapur', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Dundigal', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Medchal', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Hyderabad', 'Shamshabad', 'Telangana', 'India', 17.3850, 78.4867, 5.0),
  ('Warangal', 'Hanamkonda', 'Telangana', 'India', 17.9784, 79.5941, 5.0),
  ('Warangal', 'Kazipet', 'Telangana', 'India', 17.9784, 79.5941, 5.0),
  ('Warangal', 'Hunter Road', 'Telangana', 'India', 17.9784, 79.5941, 5.0),
  ('Warangal', 'Subedari', 'Telangana', 'India', 17.9784, 79.5941, 5.0),
  ('Warangal', 'Mulugu Road', 'Telangana', 'India', 17.9784, 79.5941, 5.0),
  ('Visakhapatnam', 'MVP Colony', 'Andhra Pradesh', 'India', 17.6868, 83.2185, 5.0),
  ('Visakhapatnam', 'Madhurawada', 'Andhra Pradesh', 'India', 17.6868, 83.2185, 5.0),
  ('Visakhapatnam', 'Seethammadhara', 'Andhra Pradesh', 'India', 17.6868, 83.2185, 5.0),
  ('Visakhapatnam', 'Gajuwaka', 'Andhra Pradesh', 'India', 17.6868, 83.2185, 5.0),
  ('Visakhapatnam', 'Pendurthi', 'Andhra Pradesh', 'India', 17.6868, 83.2185, 5.0),
  ('Visakhapatnam', 'Bheemunipatnam', 'Andhra Pradesh', 'India', 17.6868, 83.2185, 5.0),
  ('Visakhapatnam', 'Rushikonda', 'Andhra Pradesh', 'India', 17.6868, 83.2185, 5.0),
  ('Visakhapatnam', 'Dwaraka Nagar', 'Andhra Pradesh', 'India', 17.6868, 83.2185, 5.0),
  ('Visakhapatnam', 'Ram Nagar', 'Andhra Pradesh', 'India', 17.6868, 83.2185, 5.0),
  ('Visakhapatnam', 'Steel Plant', 'Andhra Pradesh', 'India', 17.6868, 83.2185, 5.0),
  ('Vijayawada', 'Benz Circle', 'Andhra Pradesh', 'India', 16.5062, 80.6480, 5.0),
  ('Vijayawada', 'Governorpet', 'Andhra Pradesh', 'India', 16.5062, 80.6480, 5.0),
  ('Vijayawada', 'Labbipet', 'Andhra Pradesh', 'India', 16.5062, 80.6480, 5.0),
  ('Vijayawada', 'Moghalrajpuram', 'Andhra Pradesh', 'India', 16.5062, 80.6480, 5.0),
  ('Vijayawada', 'Patamata', 'Andhra Pradesh', 'India', 16.5062, 80.6480, 5.0),
  ('Vijayawada', 'Penamaluru', 'Andhra Pradesh', 'India', 16.5062, 80.6480, 5.0),
  ('Vijayawada', 'Ramavarappadu', 'Andhra Pradesh', 'India', 16.5062, 80.6480, 5.0),
  ('Vijayawada', 'Eluru Road', 'Andhra Pradesh', 'India', 16.5062, 80.6480, 5.0),
  ('Vijayawada', 'MG Road', 'Andhra Pradesh', 'India', 16.5062, 80.6480, 5.0),
  ('Ahmedabad', 'Satellite', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Navrangpura', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Bopal', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Prahlad Nagar', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'SG Highway', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Science City', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Thaltej', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Bodakdev', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Vastrapur', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Prahladnagar', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'CG Road', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Law Garden', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Ellis Bridge', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Usmanpura', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Memnagar', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Chandkheda', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Motera', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Ranip', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Sabarmati', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Naroda', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Vatva', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Odhav', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Bapunagar', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Maninagar', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Narol', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Isanpur', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Vastral', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Nikol', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'Gota', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Ahmedabad', 'New Ranip', 'Gujarat', 'India', 23.0225, 72.5714, 5.0),
  ('Surat', 'Adajan', 'Gujarat', 'India', 21.1702, 72.8311, 5.0),
  ('Surat', 'Pal', 'Gujarat', 'India', 21.1702, 72.8311, 5.0),
  ('Surat', 'Vesu', 'Gujarat', 'India', 21.1702, 72.8311, 5.0),
  ('Surat', 'Dumas Road', 'Gujarat', 'India', 21.1702, 72.8311, 5.0),
  ('Surat', 'Althan', 'Gujarat', 'India', 21.1702, 72.8311, 5.0),
  ('Surat', 'Katargam', 'Gujarat', 'India', 21.1702, 72.8311, 5.0),
  ('Surat', 'Varachha', 'Gujarat', 'India', 21.1702, 72.8311, 5.0),
  ('Surat', 'Udhna', 'Gujarat', 'India', 21.1702, 72.8311, 5.0),
  ('Surat', 'Amroli', 'Gujarat', 'India', 21.1702, 72.8311, 5.0),
  ('Surat', 'Piplod', 'Gujarat', 'India', 21.1702, 72.8311, 5.0),
  ('Surat', 'Bhatar', 'Gujarat', 'India', 21.1702, 72.8311, 5.0),
  ('Surat', 'City Light', 'Gujarat', 'India', 21.1702, 72.8311, 5.0),
  ('Vadodara', 'Alkapuri', 'Gujarat', 'India', 22.3072, 73.1812, 5.0),
  ('Vadodara', 'Fatehgunj', 'Gujarat', 'India', 22.3072, 73.1812, 5.0),
  ('Vadodara', 'Sayajigunj', 'Gujarat', 'India', 22.3072, 73.1812, 5.0),
  ('Vadodara', 'Akota', 'Gujarat', 'India', 22.3072, 73.1812, 5.0),
  ('Vadodara', 'Gotri', 'Gujarat', 'India', 22.3072, 73.1812, 5.0),
  ('Vadodara', 'Productivity Road', 'Gujarat', 'India', 22.3072, 73.1812, 5.0),
  ('Vadodara', 'Harni', 'Gujarat', 'India', 22.3072, 73.1812, 5.0),
  ('Vadodara', 'Waghodia Road', 'Gujarat', 'India', 22.3072, 73.1812, 5.0),
  ('Vadodara', 'Tarsali', 'Gujarat', 'India', 22.3072, 73.1812, 5.0),
  ('Vadodara', 'Manjalpur', 'Gujarat', 'India', 22.3072, 73.1812, 5.0),
  ('Rajkot', 'Race Course', 'Gujarat', 'India', 22.3039, 70.8022, 5.0),
  ('Rajkot', 'Kalawad Road', 'Gujarat', 'India', 22.3039, 70.8022, 5.0),
  ('Rajkot', 'Gondal Road', 'Gujarat', 'India', 22.3039, 70.8022, 5.0),
  ('Rajkot', 'University Road', 'Gujarat', 'India', 22.3039, 70.8022, 5.0),
  ('Rajkot', 'Aji Dam', 'Gujarat', 'India', 22.3039, 70.8022, 5.0),
  ('Rajkot', 'Mavdi', 'Gujarat', 'India', 22.3039, 70.8022, 5.0),
  ('Rajkot', 'Satellite', 'Gujarat', 'India', 22.3039, 70.8022, 5.0),
  ('Rajkot', 'Bhakti Nagar', 'Gujarat', 'India', 22.3039, 70.8022, 5.0),
  ('Rajkot', 'Kanak Road', 'Gujarat', 'India', 22.3039, 70.8022, 5.0),
  ('Jaipur', 'Malviya Nagar', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'Vaishali Nagar', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'Mansarovar', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'Jagatpura', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'Tonk Road', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'Ajmer Road', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'Sirsi Road', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'Pratap Nagar', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'Sanganer', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'Muhana', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'Sitapura', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'Durgapura', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'Sodala', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'Vidhyadhar Nagar', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'Shyam Nagar', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'Jhotwara', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'Bani Park', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'C Scheme', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'Civil Lines', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'Pink City', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'MI Road', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jaipur', 'Sindhi Camp', 'Rajasthan', 'India', 26.9124, 75.7873, 5.0),
  ('Jodhpur', 'Ratanada', 'Rajasthan', 'India', 26.2389, 73.0243, 5.0),
  ('Jodhpur', 'Sardarpura', 'Rajasthan', 'India', 26.2389, 73.0243, 5.0),
  ('Jodhpur', 'Shastri Nagar', 'Rajasthan', 'India', 26.2389, 73.0243, 5.0),
  ('Jodhpur', 'Basni', 'Rajasthan', 'India', 26.2389, 73.0243, 5.0),
  ('Jodhpur', 'Chopasni Housing Board', 'Rajasthan', 'India', 26.2389, 73.0243, 5.0),
  ('Jodhpur', 'Pal Road', 'Rajasthan', 'India', 26.2389, 73.0243, 5.0),
  ('Jodhpur', 'Mandore', 'Rajasthan', 'India', 26.2389, 73.0243, 5.0),
  ('Jodhpur', 'Paota', 'Rajasthan', 'India', 26.2389, 73.0243, 5.0),
  ('Jodhpur', 'Old City', 'Rajasthan', 'India', 26.2389, 73.0243, 5.0),
  ('Udaipur', 'Hiran Magri', 'Rajasthan', 'India', 24.5854, 73.7125, 5.0),
  ('Udaipur', 'Sector 11', 'Rajasthan', 'India', 24.5854, 73.7125, 5.0),
  ('Udaipur', 'Sector 14', 'Rajasthan', 'India', 24.5854, 73.7125, 5.0),
  ('Udaipur', 'Pratap Nagar', 'Rajasthan', 'India', 24.5854, 73.7125, 5.0),
  ('Udaipur', 'Sukhadia Circle', 'Rajasthan', 'India', 24.5854, 73.7125, 5.0),
  ('Udaipur', 'Lake Pichola', 'Rajasthan', 'India', 24.5854, 73.7125, 5.0),
  ('Udaipur', 'Old City', 'Rajasthan', 'India', 24.5854, 73.7125, 5.0),
  ('Udaipur', 'Fatehpura', 'Rajasthan', 'India', 24.5854, 73.7125, 5.0),
  ('Udaipur', 'Shobhagpura', 'Rajasthan', 'India', 24.5854, 73.7125, 5.0),
  ('Chandigarh', 'Sector 17', 'Punjab', 'India', 30.7333, 76.7794, 5.0),
  ('Chandigarh', 'Sector 22', 'Punjab', 'India', 30.7333, 76.7794, 5.0),
  ('Chandigarh', 'Sector 34', 'Punjab', 'India', 30.7333, 76.7794, 5.0),
  ('Chandigarh', 'Sector 35', 'Punjab', 'India', 30.7333, 76.7794, 5.0),
  ('Chandigarh', 'Sector 43', 'Punjab', 'India', 30.7333, 76.7794, 5.0),
  ('Chandigarh', 'Manimajra', 'Punjab', 'India', 30.7333, 76.7794, 5.0),
  ('Chandigarh', 'IT Park', 'Punjab', 'India', 30.7333, 76.7794, 5.0),
  ('Chandigarh', 'Panchkula', 'Punjab', 'India', 30.7333, 76.7794, 5.0),
  ('Chandigarh', 'Mohali', 'Punjab', 'India', 30.7333, 76.7794, 5.0),
  ('Chandigarh', 'Zirakpur', 'Punjab', 'India', 30.7333, 76.7794, 5.0),
  ('Chandigarh', 'Kharar', 'Punjab', 'India', 30.7333, 76.7794, 5.0),
  ('Chandigarh', 'Derabassi', 'Punjab', 'India', 30.7333, 76.7794, 5.0),
  ('Chandigarh', 'New Chandigarh', 'Punjab', 'India', 30.7333, 76.7794, 5.0),
  ('Chandigarh', 'Mullanpur', 'Punjab', 'India', 30.7333, 76.7794, 5.0),
  ('Ludhiana', 'Model Town', 'Punjab', 'India', 30.9010, 75.8573, 5.0),
  ('Ludhiana', 'Sarabha Nagar', 'Punjab', 'India', 30.9010, 75.8573, 5.0),
  ('Ludhiana', 'BRS Nagar', 'Punjab', 'India', 30.9010, 75.8573, 5.0),
  ('Ludhiana', 'Dugri', 'Punjab', 'India', 30.9010, 75.8573, 5.0),
  ('Ludhiana', 'Rajguru Nagar', 'Punjab', 'India', 30.9010, 75.8573, 5.0),
  ('Ludhiana', 'Pakhowal Road', 'Punjab', 'India', 30.9010, 75.8573, 5.0),
  ('Ludhiana', 'Ferozepur Road', 'Punjab', 'India', 30.9010, 75.8573, 5.0),
  ('Ludhiana', 'Hambran Road', 'Punjab', 'India', 30.9010, 75.8573, 5.0),
  ('Ludhiana', 'Samrala Chowk', 'Punjab', 'India', 30.9010, 75.8573, 5.0),
  ('Amritsar', 'Golden Temple Area', 'Punjab', 'India', 31.6340, 74.8723, 5.0),
  ('Amritsar', 'Ranjit Avenue', 'Punjab', 'India', 31.6340, 74.8723, 5.0),
  ('Amritsar', 'Green Avenue', 'Punjab', 'India', 31.6340, 74.8723, 5.0),
  ('Amritsar', 'Majitha Road', 'Punjab', 'India', 31.6340, 74.8723, 5.0),
  ('Amritsar', 'GT Road', 'Punjab', 'India', 31.6340, 74.8723, 5.0),
  ('Amritsar', 'Mall Road', 'Punjab', 'India', 31.6340, 74.8723, 5.0),
  ('Amritsar', 'Lawrence Road', 'Punjab', 'India', 31.6340, 74.8723, 5.0),
  ('Amritsar', 'Daburji', 'Punjab', 'India', 31.6340, 74.8723, 5.0),
  ('Amritsar', 'Chheharta', 'Punjab', 'India', 31.6340, 74.8723, 5.0),
  ('Lucknow', 'Hazratganj', 'Uttar Pradesh', 'India', 26.8467, 80.9462, 5.0),
  ('Lucknow', 'Gomti Nagar', 'Uttar Pradesh', 'India', 26.8467, 80.9462, 5.0),
  ('Lucknow', 'Aliganj', 'Uttar Pradesh', 'India', 26.8467, 80.9462, 5.0),
  ('Lucknow', 'Indira Nagar', 'Uttar Pradesh', 'India', 26.8467, 80.9462, 5.0),
  ('Lucknow', 'Mahanagar', 'Uttar Pradesh', 'India', 26.8467, 80.9462, 5.0),
  ('Lucknow', 'Vikas Nagar', 'Uttar Pradesh', 'India', 26.8467, 80.9462, 5.0),
  ('Lucknow', 'Rajajipuram', 'Uttar Pradesh', 'India', 26.8467, 80.9462, 5.0),
  ('Lucknow', 'Alambagh', 'Uttar Pradesh', 'India', 26.8467, 80.9462, 5.0),
  ('Lucknow', 'Chinhat', 'Uttar Pradesh', 'India', 26.8467, 80.9462, 5.0),
  ('Lucknow', 'Faizabad Road', 'Uttar Pradesh', 'India', 26.8467, 80.9462, 5.0),
  ('Lucknow', 'Sultanpur Road', 'Uttar Pradesh', 'India', 26.8467, 80.9462, 5.0),
  ('Lucknow', 'Raibareli Road', 'Uttar Pradesh', 'India', 26.8467, 80.9462, 5.0),
  ('Lucknow', 'Kanpur Road', 'Uttar Pradesh', 'India', 26.8467, 80.9462, 5.0),
  ('Lucknow', 'Kursi Road', 'Uttar Pradesh', 'India', 26.8467, 80.9462, 5.0),
  ('Lucknow', 'Vibhuti Khand', 'Uttar Pradesh', 'India', 26.8467, 80.9462, 5.0),
  ('Lucknow', 'Sector 7 Scheme', 'Uttar Pradesh', 'India', 26.8467, 80.9462, 5.0),
  ('Lucknow', 'Sushant Golf City', 'Uttar Pradesh', 'India', 26.8467, 80.9462, 5.0),
  ('Kanpur', 'Civil Lines', 'Uttar Pradesh', 'India', 26.4499, 80.3319, 5.0),
  ('Kanpur', 'Swaroop Nagar', 'Uttar Pradesh', 'India', 26.4499, 80.3319, 5.0),
  ('Kanpur', 'Kakadeo', 'Uttar Pradesh', 'India', 26.4499, 80.3319, 5.0),
  ('Kanpur', 'Kalyanpur', 'Uttar Pradesh', 'India', 26.4499, 80.3319, 5.0),
  ('Kanpur', 'Govind Nagar', 'Uttar Pradesh', 'India', 26.4499, 80.3319, 5.0),
  ('Kanpur', 'Panki', 'Uttar Pradesh', 'India', 26.4499, 80.3319, 5.0),
  ('Kanpur', 'Kidwai Nagar', 'Uttar Pradesh', 'India', 26.4499, 80.3319, 5.0),
  ('Kanpur', 'Armapur', 'Uttar Pradesh', 'India', 26.4499, 80.3319, 5.0),
  ('Kanpur', 'GT Road', 'Uttar Pradesh', 'India', 26.4499, 80.3319, 5.0),
  ('Kanpur', 'Shyam Nagar', 'Uttar Pradesh', 'India', 26.4499, 80.3319, 5.0),
  ('Agra', 'Taj Mahal Area', 'Uttar Pradesh', 'India', 27.1767, 78.0081, 5.0),
  ('Agra', 'Sadar Bazaar', 'Uttar Pradesh', 'India', 27.1767, 78.0081, 5.0),
  ('Agra', 'Sikandra', 'Uttar Pradesh', 'India', 27.1767, 78.0081, 5.0),
  ('Agra', 'Kalindi Vihar', 'Uttar Pradesh', 'India', 27.1767, 78.0081, 5.0),
  ('Agra', 'Bodla', 'Uttar Pradesh', 'India', 27.1767, 78.0081, 5.0),
  ('Agra', 'Belanganj', 'Uttar Pradesh', 'India', 27.1767, 78.0081, 5.0),
  ('Agra', 'Shahganj', 'Uttar Pradesh', 'India', 27.1767, 78.0081, 5.0),
  ('Agra', 'Kamla Nagar', 'Uttar Pradesh', 'India', 27.1767, 78.0081, 5.0),
  ('Agra', 'Wazirpura', 'Uttar Pradesh', 'India', 27.1767, 78.0081, 5.0),
  ('Varanasi', 'Ghats Area', 'Uttar Pradesh', 'India', 25.3176, 82.9739, 5.0),
  ('Varanasi', 'Sigra', 'Uttar Pradesh', 'India', 25.3176, 82.9739, 5.0),
  ('Varanasi', 'Lanka', 'Uttar Pradesh', 'India', 25.3176, 82.9739, 5.0),
  ('Varanasi', 'BHU Area', 'Uttar Pradesh', 'India', 25.3176, 82.9739, 5.0),
  ('Varanasi', 'Cantt', 'Uttar Pradesh', 'India', 25.3176, 82.9739, 5.0),
  ('Varanasi', 'Mahmoorganj', 'Uttar Pradesh', 'India', 25.3176, 82.9739, 5.0),
  ('Varanasi', 'Sarnath', 'Uttar Pradesh', 'India', 25.3176, 82.9739, 5.0),
  ('Varanasi', 'Orderly Bazaar', 'Uttar Pradesh', 'India', 25.3176, 82.9739, 5.0),
  ('Varanasi', 'Shivpur', 'Uttar Pradesh', 'India', 25.3176, 82.9739, 5.0),
  ('Allahabad', 'Civil Lines', 'Uttar Pradesh', 'India', 25.4358, 81.8463, 5.0),
  ('Allahabad', 'Triveni', 'Uttar Pradesh', 'India', 25.4358, 81.8463, 5.0),
  ('Allahabad', 'Lukerganj', 'Uttar Pradesh', 'India', 25.4358, 81.8463, 5.0),
  ('Allahabad', 'George Town', 'Uttar Pradesh', 'India', 25.4358, 81.8463, 5.0),
  ('Allahabad', 'Naini', 'Uttar Pradesh', 'India', 25.4358, 81.8463, 5.0),
  ('Allahabad', 'Jhusi', 'Uttar Pradesh', 'India', 25.4358, 81.8463, 5.0),
  ('Allahabad', 'Bamrauli', 'Uttar Pradesh', 'India', 25.4358, 81.8463, 5.0),
  ('Allahabad', 'Phaphamau', 'Uttar Pradesh', 'India', 25.4358, 81.8463, 5.0),
  ('Allahabad', 'Muthiganj', 'Uttar Pradesh', 'India', 25.4358, 81.8463, 5.0),
  ('Noida', 'Sector 18', 'Uttar Pradesh', 'India', 28.5355, 77.3910, 5.0),
  ('Noida', 'Sector 62', 'Uttar Pradesh', 'India', 28.5355, 77.3910, 5.0),
  ('Noida', 'Sector 63', 'Uttar Pradesh', 'India', 28.5355, 77.3910, 5.0),
  ('Noida', 'Sector 15', 'Uttar Pradesh', 'India', 28.5355, 77.3910, 5.0),
  ('Noida', 'Sector 44', 'Uttar Pradesh', 'India', 28.5355, 77.3910, 5.0),
  ('Noida', 'Sector 50', 'Uttar Pradesh', 'India', 28.5355, 77.3910, 5.0),
  ('Noida', 'Sector 76', 'Uttar Pradesh', 'India', 28.5355, 77.3910, 5.0),
  ('Noida', 'Sector 137', 'Uttar Pradesh', 'India', 28.5355, 77.3910, 5.0),
  ('Noida', 'Sector 150', 'Uttar Pradesh', 'India', 28.5355, 77.3910, 5.0),
  ('Noida', 'Greater Noida', 'Uttar Pradesh', 'India', 28.5355, 77.3910, 5.0),
  ('Noida', 'Greater Noida West', 'Uttar Pradesh', 'India', 28.5355, 77.3910, 5.0),
  ('Noida', 'Knowledge Park', 'Uttar Pradesh', 'India', 28.5355, 77.3910, 5.0),
  ('Noida', 'Alpha', 'Uttar Pradesh', 'India', 28.5355, 77.3910, 5.0),
  ('Noida', 'Beta', 'Uttar Pradesh', 'India', 28.5355, 77.3910, 5.0),
  ('Noida', 'Gamma', 'Uttar Pradesh', 'India', 28.5355, 77.3910, 5.0),
  ('Noida', 'Delta', 'Uttar Pradesh', 'India', 28.5355, 77.3910, 5.0),
  ('Noida', 'Zeta', 'Uttar Pradesh', 'India', 28.5355, 77.3910, 5.0),
  ('Noida', 'Chi Phi', 'Uttar Pradesh', 'India', 28.5355, 77.3910, 5.0),
  ('Ghaziabad', 'Vaishali', 'Uttar Pradesh', 'India', 28.6692, 77.4538, 5.0),
  ('Ghaziabad', 'Indirapuram', 'Uttar Pradesh', 'India', 28.6692, 77.4538, 5.0),
  ('Ghaziabad', 'Vasundhara', 'Uttar Pradesh', 'India', 28.6692, 77.4538, 5.0),
  ('Ghaziabad', 'Rajnagar Extension', 'Uttar Pradesh', 'India', 28.6692, 77.4538, 5.0),
  ('Ghaziabad', 'Crossings Republik', 'Uttar Pradesh', 'India', 28.6692, 77.4538, 5.0),
  ('Ghaziabad', 'Kaushambi', 'Uttar Pradesh', 'India', 28.6692, 77.4538, 5.0),
  ('Ghaziabad', 'Mohan Nagar', 'Uttar Pradesh', 'India', 28.6692, 77.4538, 5.0),
  ('Ghaziabad', 'Dilshad Garden', 'Uttar Pradesh', 'India', 28.6692, 77.4538, 5.0),
  ('Indore', 'Vijay Nagar', 'Madhya Pradesh', 'India', 22.7196, 75.8577, 5.0),
  ('Indore', 'Palasia', 'Madhya Pradesh', 'India', 22.7196, 75.8577, 5.0),
  ('Indore', 'Sapna Sangeeta', 'Madhya Pradesh', 'India', 22.7196, 75.8577, 5.0),
  ('Indore', 'MG Road', 'Madhya Pradesh', 'India', 22.7196, 75.8577, 5.0),
  ('Indore', 'Bhanwarkuan', 'Madhya Pradesh', 'India', 22.7196, 75.8577, 5.0),
  ('Indore', 'Scheme 78', 'Madhya Pradesh', 'India', 22.7196, 75.8577, 5.0),
  ('Indore', 'Scheme 140', 'Madhya Pradesh', 'India', 22.7196, 75.8577, 5.0),
  ('Indore', 'Mhow Naka', 'Madhya Pradesh', 'India', 22.7196, 75.8577, 5.0),
  ('Indore', 'Lasudia', 'Madhya Pradesh', 'India', 22.7196, 75.8577, 5.0),
  ('Indore', 'Rau', 'Madhya Pradesh', 'India', 22.7196, 75.8577, 5.0),
  ('Bhopal', 'MP Nagar', 'Madhya Pradesh', 'India', 23.2599, 77.4126, 5.0),
  ('Bhopal', 'Kolar Road', 'Madhya Pradesh', 'India', 23.2599, 77.4126, 5.0),
  ('Bhopal', 'Hoshangabad Road', 'Madhya Pradesh', 'India', 23.2599, 77.4126, 5.0),
  ('Bhopal', 'Arera Colony', 'Madhya Pradesh', 'India', 23.2599, 77.4126, 5.0),
  ('Bhopal', 'TT Nagar', 'Madhya Pradesh', 'India', 23.2599, 77.4126, 5.0),
  ('Bhopal', 'New Market', 'Madhya Pradesh', 'India', 23.2599, 77.4126, 5.0),
  ('Bhopal', 'Shyamla Hills', 'Madhya Pradesh', 'India', 23.2599, 77.4126, 5.0),
  ('Bhopal', 'Mansarovar Complex', 'Madhya Pradesh', 'India', 23.2599, 77.4126, 5.0),
  ('Bhopal', 'Misrod', 'Madhya Pradesh', 'India', 23.2599, 77.4126, 5.0),
  ('Bhopal', 'Bairagarh', 'Madhya Pradesh', 'India', 23.2599, 77.4126, 5.0),
  ('Bhopal', 'Berasia Road', 'Madhya Pradesh', 'India', 23.2599, 77.4126, 5.0),
  ('Jabalpur', 'Civil Lines', 'Madhya Pradesh', 'India', 23.1815, 79.9864, 5.0),
  ('Jabalpur', 'Napier Town', 'Madhya Pradesh', 'India', 23.1815, 79.9864, 5.0),
  ('Jabalpur', 'Gorakhpur', 'Madhya Pradesh', 'India', 23.1815, 79.9864, 5.0),
  ('Jabalpur', 'Adhartal', 'Madhya Pradesh', 'India', 23.1815, 79.9864, 5.0),
  ('Jabalpur', 'Panagar', 'Madhya Pradesh', 'India', 23.1815, 79.9864, 5.0),
  ('Jabalpur', 'Shahpura', 'Madhya Pradesh', 'India', 23.1815, 79.9864, 5.0),
  ('Jabalpur', 'Mandla Road', 'Madhya Pradesh', 'India', 23.1815, 79.9864, 5.0),
  ('Jabalpur', 'Damoh Naka', 'Madhya Pradesh', 'India', 23.1815, 79.9864, 5.0),
  ('Patna', 'Boring Road', 'Bihar', 'India', 25.5941, 85.1376, 5.0),
  ('Patna', 'Kankarbagh', 'Bihar', 'India', 25.5941, 85.1376, 5.0),
  ('Patna', 'Rajendra Nagar', 'Bihar', 'India', 25.5941, 85.1376, 5.0),
  ('Patna', 'Bailey Road', 'Bihar', 'India', 25.5941, 85.1376, 5.0),
  ('Patna', 'Patna Sahib', 'Bihar', 'India', 25.5941, 85.1376, 5.0),
  ('Patna', 'Digha', 'Bihar', 'India', 25.5941, 85.1376, 5.0),
  ('Patna', 'Danapur', 'Bihar', 'India', 25.5941, 85.1376, 5.0),
  ('Patna', 'Phulwarisharif', 'Bihar', 'India', 25.5941, 85.1376, 5.0),
  ('Patna', 'Khagaul', 'Bihar', 'India', 25.5941, 85.1376, 5.0),
  ('Patna', 'Kurji', 'Bihar', 'India', 25.5941, 85.1376, 5.0),
  ('Patna', 'Anisabad', 'Bihar', 'India', 25.5941, 85.1376, 5.0),
  ('Patna', 'Rukanpura', 'Bihar', 'India', 25.5941, 85.1376, 5.0),
  ('Patna', 'Saidpur', 'Bihar', 'India', 25.5941, 85.1376, 5.0),
  ('Patna', 'Gandhi Maidan Area', 'Bihar', 'India', 25.5941, 85.1376, 5.0),
  ('Gaya', 'Bodhgaya', 'Bihar', 'India', 24.7955, 84.9994, 5.0),
  ('Gaya', 'Civil Lines', 'Bihar', 'India', 24.7955, 84.9994, 5.0),
  ('Gaya', 'Sherghati', 'Bihar', 'India', 24.7955, 84.9994, 5.0),
  ('Gaya', 'Tekari', 'Bihar', 'India', 24.7955, 84.9994, 5.0),
  ('Gaya', 'Manpur', 'Bihar', 'India', 24.7955, 84.9994, 5.0),
  ('Bhubaneswar', 'Sahid Nagar', 'Odisha', 'India', 20.2961, 85.8245, 5.0),
  ('Bhubaneswar', 'Nayapalli', 'Odisha', 'India', 20.2961, 85.8245, 5.0),
  ('Bhubaneswar', 'Patia', 'Odisha', 'India', 20.2961, 85.8245, 5.0),
  ('Bhubaneswar', 'Chandrasekharpur', 'Odisha', 'India', 20.2961, 85.8245, 5.0),
  ('Bhubaneswar', 'Khandagiri', 'Odisha', 'India', 20.2961, 85.8245, 5.0),
  ('Bhubaneswar', 'Infocity', 'Odisha', 'India', 20.2961, 85.8245, 5.0),
  ('Bhubaneswar', 'Mancheswar', 'Odisha', 'India', 20.2961, 85.8245, 5.0),
  ('Bhubaneswar', 'Nalco Nagar', 'Odisha', 'India', 20.2961, 85.8245, 5.0),
  ('Bhubaneswar', 'Jayadev Vihar', 'Odisha', 'India', 20.2961, 85.8245, 5.0),
  ('Bhubaneswar', 'IRC Village', 'Odisha', 'India', 20.2961, 85.8245, 5.0),
  ('Bhubaneswar', 'Acharya Vihar', 'Odisha', 'India', 20.2961, 85.8245, 5.0),
  ('Bhubaneswar', 'Satya Nagar', 'Odisha', 'India', 20.2961, 85.8245, 5.0),
  ('Bhubaneswar', 'Baramunda', 'Odisha', 'India', 20.2961, 85.8245, 5.0),
  ('Cuttack', 'Buxi Bazaar', 'Odisha', 'India', 20.4625, 85.8828, 5.0),
  ('Cuttack', 'College Square', 'Odisha', 'India', 20.4625, 85.8828, 5.0),
  ('Cuttack', 'Badambadi', 'Odisha', 'India', 20.4625, 85.8828, 5.0),
  ('Cuttack', 'Madhupatna', 'Odisha', 'India', 20.4625, 85.8828, 5.0),
  ('Cuttack', 'Jagatpur', 'Odisha', 'India', 20.4625, 85.8828, 5.0),
  ('Guwahati', 'Dispur', 'Assam', 'India', 26.1445, 91.7362, 5.0),
  ('Guwahati', 'Paltan Bazaar', 'Assam', 'India', 26.1445, 91.7362, 5.0),
  ('Guwahati', 'Chandmari', 'Assam', 'India', 26.1445, 91.7362, 5.0),
  ('Guwahati', 'Ulubari', 'Assam', 'India', 26.1445, 91.7362, 5.0),
  ('Guwahati', 'Ganeshguri', 'Assam', 'India', 26.1445, 91.7362, 5.0),
  ('Guwahati', 'Six Mile', 'Assam', 'India', 26.1445, 91.7362, 5.0),
  ('Guwahati', 'Zoo Road', 'Assam', 'India', 26.1445, 91.7362, 5.0),
  ('Guwahati', 'Beltola', 'Assam', 'India', 26.1445, 91.7362, 5.0),
  ('Guwahati', 'Hatigaon', 'Assam', 'India', 26.1445, 91.7362, 5.0),
  ('Guwahati', 'Jalukbari', 'Assam', 'India', 26.1445, 91.7362, 5.0),
  ('Guwahati', 'Maligaon', 'Assam', 'India', 26.1445, 91.7362, 5.0),
  ('Guwahati', 'Adabari', 'Assam', 'India', 26.1445, 91.7362, 5.0),
  ('Guwahati', 'Bhangagarh', 'Assam', 'India', 26.1445, 91.7362, 5.0),
  ('Guwahati', 'Narengi', 'Assam', 'India', 26.1445, 91.7362, 5.0),
  ('Ranchi', 'Lalpur', 'Jharkhand', 'India', 23.3441, 85.3096, 5.0),
  ('Ranchi', 'Harmu', 'Jharkhand', 'India', 23.3441, 85.3096, 5.0),
  ('Ranchi', 'Bariatu', 'Jharkhand', 'India', 23.3441, 85.3096, 5.0),
  ('Ranchi', 'Doranda', 'Jharkhand', 'India', 23.3441, 85.3096, 5.0),
  ('Ranchi', 'Kanke Road', 'Jharkhand', 'India', 23.3441, 85.3096, 5.0),
  ('Ranchi', 'Ratu Road', 'Jharkhand', 'India', 23.3441, 85.3096, 5.0),
  ('Ranchi', 'Hinoo', 'Jharkhand', 'India', 23.3441, 85.3096, 5.0),
  ('Ranchi', 'Booty Road', 'Jharkhand', 'India', 23.3441, 85.3096, 5.0),
  ('Ranchi', 'Dipatoli', 'Jharkhand', 'India', 23.3441, 85.3096, 5.0),
  ('Jamshedpur', 'Bistupur', 'Jharkhand', 'India', 22.8046, 86.2029, 5.0),
  ('Jamshedpur', 'Sakchi', 'Jharkhand', 'India', 22.8046, 86.2029, 5.0),
  ('Jamshedpur', 'Telco', 'Jharkhand', 'India', 22.8046, 86.2029, 5.0),
  ('Jamshedpur', 'Adityapur', 'Jharkhand', 'India', 22.8046, 86.2029, 5.0),
  ('Jamshedpur', 'Mango', 'Jharkhand', 'India', 22.8046, 86.2029, 5.0),
  ('Jamshedpur', 'Jugsalai', 'Jharkhand', 'India', 22.8046, 86.2029, 5.0),
  ('Jamshedpur', 'Baridih', 'Jharkhand', 'India', 22.8046, 86.2029, 5.0),
  ('Jamshedpur', 'Kadma', 'Jharkhand', 'India', 22.8046, 86.2029, 5.0),
  ('Kochi', 'Ernakulam', 'Kerala', 'India', 9.9312, 76.2673, 5.0),
  ('Kochi', 'Fort Kochi', 'Kerala', 'India', 9.9312, 76.2673, 5.0),
  ('Kochi', 'Kakkanad', 'Kerala', 'India', 9.9312, 76.2673, 5.0),
  ('Kochi', 'Edappally', 'Kerala', 'India', 9.9312, 76.2673, 5.0),
  ('Kochi', 'Aluva', 'Kerala', 'India', 9.9312, 76.2673, 5.0),
  ('Kochi', 'Kaloor', 'Kerala', 'India', 9.9312, 76.2673, 5.0),
  ('Kochi', 'Panampilly Nagar', 'Kerala', 'India', 9.9312, 76.2673, 5.0),
  ('Kochi', 'Palarivattom', 'Kerala', 'India', 9.9312, 76.2673, 5.0),
  ('Kochi', 'Vyttila', 'Kerala', 'India', 9.9312, 76.2673, 5.0),
  ('Kochi', 'Tripunithura', 'Kerala', 'India', 9.9312, 76.2673, 5.0),
  ('Kochi', 'Thrikkakara', 'Kerala', 'India', 9.9312, 76.2673, 5.0),
  ('Kochi', 'Kalamassery', 'Kerala', 'India', 9.9312, 76.2673, 5.0),
  ('Kochi', 'Perumbavoor', 'Kerala', 'India', 9.9312, 76.2673, 5.0),
  ('Thiruvananthapuram', 'Kowdiar', 'Kerala', 'India', 8.5241, 76.9366, 5.0),
  ('Thiruvananthapuram', 'Pattom', 'Kerala', 'India', 8.5241, 76.9366, 5.0),
  ('Thiruvananthapuram', 'Karamana', 'Kerala', 'India', 8.5241, 76.9366, 5.0),
  ('Thiruvananthapuram', 'Sreekaryam', 'Kerala', 'India', 8.5241, 76.9366, 5.0),
  ('Thiruvananthapuram', 'Vellayambalam', 'Kerala', 'India', 8.5241, 76.9366, 5.0),
  ('Thiruvananthapuram', 'Kesavadasapuram', 'Kerala', 'India', 8.5241, 76.9366, 5.0),
  ('Thiruvananthapuram', 'Technopark', 'Kerala', 'India', 8.5241, 76.9366, 5.0),
  ('Thiruvananthapuram', 'Attipra', 'Kerala', 'India', 8.5241, 76.9366, 5.0),
  ('Thiruvananthapuram', 'Nemom', 'Kerala', 'India', 8.5241, 76.9366, 5.0),
  ('Kozhikode', 'Calicut Beach', 'Kerala', 'India', 11.2588, 75.7804, 5.0),
  ('Kozhikode', 'Palayam', 'Kerala', 'India', 11.2588, 75.7804, 5.0),
  ('Kozhikode', 'SM Street', 'Kerala', 'India', 11.2588, 75.7804, 5.0),
  ('Kozhikode', 'Nadakkave', 'Kerala', 'India', 11.2588, 75.7804, 5.0),
  ('Kozhikode', 'Chevayur', 'Kerala', 'India', 11.2588, 75.7804, 5.0),
  ('Kozhikode', 'Perinthalmanna', 'Kerala', 'India', 11.2588, 75.7804, 5.0),
  ('Kozhikode', 'Mavoor Road', 'Kerala', 'India', 11.2588, 75.7804, 5.0),
  ('Kozhikode', 'Medical College Area', 'Kerala', 'India', 11.2588, 75.7804, 5.0),
  ('Thrissur', 'Round South', 'Kerala', 'India', 10.5276, 76.2144, 5.0),
  ('Thrissur', 'Round North', 'Kerala', 'India', 10.5276, 76.2144, 5.0),
  ('Thrissur', 'MG Road', 'Kerala', 'India', 10.5276, 76.2144, 5.0),
  ('Thrissur', 'Ayyanthole', 'Kerala', 'India', 10.5276, 76.2144, 5.0),
  ('Thrissur', 'Punkunnam', 'Kerala', 'India', 10.5276, 76.2144, 5.0),
  ('Thrissur', 'Poothole', 'Kerala', 'India', 10.5276, 76.2144, 5.0),
  ('Thrissur', 'Ollur', 'Kerala', 'India', 10.5276, 76.2144, 5.0),
  ('Thrissur', 'Chalakudy', 'Kerala', 'India', 10.5276, 76.2144, 5.0),
  ('Shimla', 'Mall Road', 'Himachal Pradesh', 'India', 31.1048, 77.1734, 5.0),
  ('Shimla', 'Lakkar Bazaar', 'Himachal Pradesh', 'India', 31.1048, 77.1734, 5.0),
  ('Shimla', 'Sanjauli', 'Himachal Pradesh', 'India', 31.1048, 77.1734, 5.0),
  ('Shimla', 'Chotta Shimla', 'Himachal Pradesh', 'India', 31.1048, 77.1734, 5.0),
  ('Shimla', 'Vikasnagar', 'Himachal Pradesh', 'India', 31.1048, 77.1734, 5.0),
  ('Shimla', 'New Shimla', 'Himachal Pradesh', 'India', 31.1048, 77.1734, 5.0),
  ('Shimla', 'Rampur Bushahr', 'Himachal Pradesh', 'India', 31.1048, 77.1734, 5.0),
  ('Manali', 'Old Manali', 'Himachal Pradesh', 'India', 32.2396, 77.1887, 5.0),
  ('Manali', 'Vashisht', 'Himachal Pradesh', 'India', 32.2396, 77.1887, 5.0),
  ('Manali', 'Mall Road', 'Himachal Pradesh', 'India', 32.2396, 77.1887, 5.0),
  ('Manali', 'Naggar', 'Himachal Pradesh', 'India', 32.2396, 77.1887, 5.0),
  ('Manali', 'Solang Valley', 'Himachal Pradesh', 'India', 32.2396, 77.1887, 5.0),
  ('Manali', 'Rohtang', 'Himachal Pradesh', 'India', 32.2396, 77.1887, 5.0),
  ('Dehradun', 'Rajpur Road', 'Uttarakhand', 'India', 30.3165, 78.0322, 5.0),
  ('Dehradun', 'Vasant Vihar', 'Uttarakhand', 'India', 30.3165, 78.0322, 5.0),
  ('Dehradun', 'Saharanpur Road', 'Uttarakhand', 'India', 30.3165, 78.0322, 5.0),
  ('Dehradun', 'Rishikesh Road', 'Uttarakhand', 'India', 30.3165, 78.0322, 5.0),
  ('Dehradun', 'Mussoorie Road', 'Uttarakhand', 'India', 30.3165, 78.0322, 5.0),
  ('Dehradun', 'Ballupur', 'Uttarakhand', 'India', 30.3165, 78.0322, 5.0),
  ('Dehradun', 'Dalanwala', 'Uttarakhand', 'India', 30.3165, 78.0322, 5.0),
  ('Dehradun', 'Kanwali', 'Uttarakhand', 'India', 30.3165, 78.0322, 5.0),
  ('Dehradun', 'Jakhan', 'Uttarakhand', 'India', 30.3165, 78.0322, 5.0),
  ('Haridwar', 'Har Ki Pauri', 'Uttarakhand', 'India', 29.9457, 78.1642, 5.0),
  ('Haridwar', 'Jwalapur', 'Uttarakhand', 'India', 29.9457, 78.1642, 5.0),
  ('Haridwar', 'Shivalik Nagar', 'Uttarakhand', 'India', 29.9457, 78.1642, 5.0),
  ('Haridwar', 'SIDCUL', 'Uttarakhand', 'India', 29.9457, 78.1642, 5.0),
  ('Haridwar', 'Ranipur', 'Uttarakhand', 'India', 29.9457, 78.1642, 5.0),
  ('Haridwar', 'Bahadrabad', 'Uttarakhand', 'India', 29.9457, 78.1642, 5.0),
  ('Rishikesh', 'Laxman Jhula', 'Uttarakhand', 'India', 30.0869, 78.2676, 5.0),
  ('Rishikesh', 'Ram Jhula', 'Uttarakhand', 'India', 30.0869, 78.2676, 5.0),
  ('Rishikesh', 'Tapovan', 'Uttarakhand', 'India', 30.0869, 78.2676, 5.0),
  ('Rishikesh', 'Muni Ki Reti', 'Uttarakhand', 'India', 30.0869, 78.2676, 5.0),
  ('Rishikesh', 'Swargashram', 'Uttarakhand', 'India', 30.0869, 78.2676, 5.0),
  ('Gandhinagar', 'Sector 1', 'Gujarat', 'India', 23.2156, 72.6369, 5.0),
  ('Gandhinagar', 'Sector 7', 'Gujarat', 'India', 23.2156, 72.6369, 5.0),
  ('Gandhinagar', 'Sector 16', 'Gujarat', 'India', 23.2156, 72.6369, 5.0),
  ('Gandhinagar', 'Sector 21', 'Gujarat', 'India', 23.2156, 72.6369, 5.0),
  ('Gandhinagar', 'Sector 30', 'Gujarat', 'India', 23.2156, 72.6369, 5.0),
  ('Gandhinagar', 'Infocity', 'Gujarat', 'India', 23.2156, 72.6369, 5.0),
  ('Gandhinagar', 'GIFT City', 'Gujarat', 'India', 23.2156, 72.6369, 5.0),
  ('Gandhinagar', 'Adalaj', 'Gujarat', 'India', 23.2156, 72.6369, 5.0),
  ('Raipur', 'Shankar Nagar', 'Chhattisgarh', 'India', 21.2514, 81.6296, 5.0),
  ('Raipur', 'Tatibandh', 'Chhattisgarh', 'India', 21.2514, 81.6296, 5.0),
  ('Raipur', 'Mowa', 'Chhattisgarh', 'India', 21.2514, 81.6296, 5.0),
  ('Raipur', 'Pandri', 'Chhattisgarh', 'India', 21.2514, 81.6296, 5.0),
  ('Raipur', 'Telibandha', 'Chhattisgarh', 'India', 21.2514, 81.6296, 5.0),
  ('Raipur', 'Fafadih', 'Chhattisgarh', 'India', 21.2514, 81.6296, 5.0),
  ('Raipur', 'VIP Road', 'Chhattisgarh', 'India', 21.2514, 81.6296, 5.0),
  ('Raipur', 'Devendra Nagar', 'Chhattisgarh', 'India', 21.2514, 81.6296, 5.0),
  ('Raipur', 'Avanti Vihar', 'Chhattisgarh', 'India', 21.2514, 81.6296, 5.0),
  ('Panaji', 'Fontainhas', 'Goa', 'India', 15.4909, 73.8278, 5.0),
  ('Panaji', 'Campal', 'Goa', 'India', 15.4909, 73.8278, 5.0),
  ('Panaji', 'Miramar', 'Goa', 'India', 15.4909, 73.8278, 5.0),
  ('Panaji', 'Dona Paula', 'Goa', 'India', 15.4909, 73.8278, 5.0),
  ('Panaji', 'Caranzalem', 'Goa', 'India', 15.4909, 73.8278, 5.0),
  ('Panaji', 'Porvorim', 'Goa', 'India', 15.4909, 73.8278, 5.0),
  ('Panaji', 'Mapusa', 'Goa', 'India', 15.4909, 73.8278, 5.0),
  ('Panaji', 'Calangute', 'Goa', 'India', 15.4909, 73.8278, 5.0),
  ('Panaji', 'Baga', 'Goa', 'India', 15.4909, 73.8278, 5.0),
  ('Panaji', 'Anjuna', 'Goa', 'India', 15.4909, 73.8278, 5.0),
  ('Panaji', 'Vagator', 'Goa', 'India', 15.4909, 73.8278, 5.0),
  ('Imphal', 'Paona Bazaar', 'Manipur', 'India', 24.8170, 93.9368, 5.0),
  ('Imphal', 'Thangal Bazaar', 'Manipur', 'India', 24.8170, 93.9368, 5.0),
  ('Imphal', 'Singjamei', 'Manipur', 'India', 24.8170, 93.9368, 5.0),
  ('Imphal', 'Langol', 'Manipur', 'India', 24.8170, 93.9368, 5.0),
  ('Imphal', 'Lamphel', 'Manipur', 'India', 24.8170, 93.9368, 5.0),
  ('Imphal', 'Keishamthong', 'Manipur', 'India', 24.8170, 93.9368, 5.0),
  ('Shillong', 'Police Bazaar', 'Meghalaya', 'India', 25.5788, 91.8933, 5.0),
  ('Shillong', 'Laitumkhrah', 'Meghalaya', 'India', 25.5788, 91.8933, 5.0),
  ('Shillong', 'Nongthymmai', 'Meghalaya', 'India', 25.5788, 91.8933, 5.0),
  ('Shillong', 'Malki', 'Meghalaya', 'India', 25.5788, 91.8933, 5.0),
  ('Shillong', 'Ri Bhoi', 'Meghalaya', 'India', 25.5788, 91.8933, 5.0),
  ('Shillong', 'Mawlai', 'Meghalaya', 'India', 25.5788, 91.8933, 5.0)
ON CONFLICT (city, area) DO NOTHING;

-- ============================================================
-- SMART CITY FEED: Returns posts from city + all its sub-areas
-- ============================================================
CREATE OR REPLACE FUNCTION get_city_feed_smart(
  p_city          TEXT,
  p_user_id       UUID DEFAULT NULL,
  p_lim           INTEGER DEFAULT 20,
  p_cursor_time   TIMESTAMPTZ DEFAULT NULL,
  p_user_tags     TEXT[] DEFAULT '{}'   -- interests for personalization
)
RETURNS TABLE (
  id                  UUID,
  user_id             UUID,
  content             TEXT,
  image_url           TEXT,
  video_url           TEXT,
  video_thumbnail_url TEXT,
  is_anonymous        BOOLEAN,
  is_mystery          BOOLEAN,
  city                TEXT,
  tags                TEXT[],
  reveal_count        INTEGER,
  view_count          INTEGER,
  reshare_count       INTEGER,
  reshared_from_id    UUID,
  room_id             UUID,
  created_at          TIMESTAMPTZ,
  total_score         DOUBLE PRECISION,
  reaction_counts     JSONB,
  comment_count       BIGINT,
  user_reaction       TEXT,
  has_revealed        BOOLEAN,
  area_label          TEXT       -- which sub-area the post is from
) AS $$
BEGIN
  RETURN QUERY
  WITH

  -- All posts from the city (exact match) OR sub-areas
  city_posts AS (
    SELECT p.*,
      CASE
        WHEN LOWER(p.city) = LOWER(p_city) THEN p_city
        ELSE p.city
      END AS area_label
    FROM posts p
    WHERE p.is_deleted = FALSE
      AND (
        LOWER(p.city) = LOWER(p_city)
        OR LOWER(p.city) IN (
          SELECT LOWER(ca.area) FROM city_areas ca
          WHERE LOWER(ca.city) = LOWER(p_city)
        )
        OR LOWER(p.city) IN (
          SELECT LOWER(unnest(ca.aliases)) FROM city_areas ca
          WHERE LOWER(ca.city) = LOWER(p_city)
        )
      )
      AND (p_cursor_time IS NULL OR p.created_at < p_cursor_time)
    LIMIT 300
  ),

  -- Social graph
  social AS (
    SELECT
      cp.id AS post_id,
      CASE
        WHEN p_user_id IS NULL THEN 'stranger'
        WHEN cp.user_id = p_user_id THEN 'self'
        WHEN EXISTS(SELECT 1 FROM follows f1 WHERE f1.follower_id = p_user_id AND f1.following_id = cp.user_id)
          AND EXISTS(SELECT 1 FROM follows f2 WHERE f2.follower_id = cp.user_id AND f2.following_id = p_user_id)
          THEN 'mutual'
        WHEN EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = p_user_id AND f.following_id = cp.user_id)
          THEN 'following'
        ELSE 'stranger'
      END AS relationship
    FROM city_posts cp
    WHERE NOT cp.is_anonymous
  ),

  -- Reactions
  rxn AS (
    SELECT r.post_id,
      JSONB_BUILD_OBJECT(
        'interesting', COUNT(*) FILTER (WHERE r.type = 'interesting'),
        'funny',       COUNT(*) FILTER (WHERE r.type = 'funny'),
        'deep',        COUNT(*) FILTER (WHERE r.type = 'deep'),
        'curious',     COUNT(*) FILTER (WHERE r.type = 'curious')
      ) AS counts,
      COUNT(*) AS total
    FROM reactions r
    WHERE r.post_id IN (SELECT id FROM city_posts)
    GROUP BY r.post_id
  ),

  cmt AS (
    SELECT post_id, COUNT(*) AS cnt
    FROM comments
    WHERE post_id IN (SELECT id FROM city_posts) AND is_deleted = FALSE
    GROUP BY post_id
  ),

  my_rxn AS (
    SELECT post_id, type
    FROM reactions
    WHERE p_user_id IS NOT NULL
      AND user_id = p_user_id
      AND post_id IN (SELECT id FROM city_posts)
  ),

  my_reveal AS (
    SELECT post_id
    FROM mystery_reveals
    WHERE p_user_id IS NOT NULL
      AND user_id = p_user_id
      AND post_id IN (SELECT id FROM city_posts WHERE is_mystery = TRUE)
  ),

  scored AS (
    SELECT
      cp.id, cp.user_id, cp.content, cp.image_url, cp.video_url,
      cp.video_thumbnail_url, cp.is_anonymous, cp.is_mystery,
      cp.city, cp.tags, cp.reveal_count, cp.view_count,
      COALESCE(cp.reshare_count, 0) AS reshare_count,
      cp.reshared_from_id, cp.room_id, cp.created_at,
      COALESCE(rxn.counts, '{"interesting":0,"funny":0,"deep":0,"curious":0}'::JSONB) AS reaction_counts,
      COALESCE(cmt.cnt, 0) AS comment_count,
      my_rxn.type AS user_reaction,
      (my_reveal.post_id IS NOT NULL) AS has_revealed,
      cp.area_label,
      (
        -- Social bonus
        CASE COALESCE(social.relationship, 'stranger')
          WHEN 'mutual'    THEN 45
          WHEN 'following' THEN 30
          WHEN 'self'      THEN 0
          ELSE 0
        END
        +
        -- Engagement
        LEAST(
          (COALESCE(rxn.total, 0)*3 + COALESCE(cmt.cnt,0)*2 + COALESCE(cp.reveal_count,0)*4)::FLOAT
            / GREATEST(EXTRACT(EPOCH FROM (NOW()-cp.created_at))/3600.0, 0.1)^1.5,
          80.0
        )
        +
        -- Tag personalization bonus
        CASE
          WHEN p_user_tags && cp.tags THEN 15
          ELSE 0
        END
        +
        -- Scope bonus: posts explicitly targeted to city get +25
        CASE WHEN cp.scope = 'city' THEN 25 ELSE 0 END
        +
        -- Recency
        CASE
          WHEN cp.created_at > NOW() - INTERVAL '1 hour'   THEN 15
          WHEN cp.created_at > NOW() - INTERVAL '6 hours'  THEN 10
          WHEN cp.created_at > NOW() - INTERVAL '24 hours' THEN 5
          ELSE 0
        END
      )::DOUBLE PRECISION AS total_score
    FROM city_posts cp
    LEFT JOIN social    ON social.post_id    = cp.id
    LEFT JOIN rxn       ON rxn.post_id       = cp.id
    LEFT JOIN cmt       ON cmt.post_id       = cp.id
    LEFT JOIN my_rxn    ON my_rxn.post_id    = cp.id
    LEFT JOIN my_reveal ON my_reveal.post_id = cp.id
  )

  SELECT
    s.id, s.user_id, s.content, s.image_url, s.video_url,
    s.video_thumbnail_url, s.is_anonymous, s.is_mystery,
    s.city, s.tags, s.reveal_count, s.view_count,
    s.reshare_count, s.reshared_from_id, s.room_id, s.created_at,
    s.total_score, s.reaction_counts, s.comment_count,
    s.user_reaction, s.has_revealed, s.area_label
  FROM scored s
  ORDER BY s.total_score DESC, s.created_at DESC
  LIMIT p_lim;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ============================================================
-- PRIVATE ACCOUNT ENFORCEMENT
-- ============================================================
-- Function: returns user IDs that the given user can see posts from
-- (public accounts + private accounts they follow)
CREATE OR REPLACE FUNCTION get_visible_user_ids(p_viewer_id UUID)
RETURNS TABLE(user_id UUID) AS $$
BEGIN
  RETURN QUERY
  -- Public accounts
  SELECT u.id FROM users u WHERE u.is_private = FALSE OR u.is_private IS NULL
  UNION
  -- Private accounts the viewer follows
  SELECT f.following_id FROM follows f WHERE f.follower_id = p_viewer_id
  UNION
  -- The viewer themselves
  SELECT p_viewer_id WHERE p_viewer_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ============================================================
-- ADVANCED RECOMMENDATION ENGINE
-- ============================================================

-- ── USER BEHAVIOR TRACKING ───────────────────────────────────
-- Tracks detailed user interactions for recommendation learning
CREATE TABLE IF NOT EXISTS user_interactions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id       UUID REFERENCES posts(id) ON DELETE CASCADE,
  action        TEXT NOT NULL CHECK (action IN (
                  'view',          -- saw the post in feed
                  'dwell',         -- spent >3s reading
                  'react',         -- reacted (emoji)
                  'comment',       -- commented
                  'share',         -- reshared
                  'reveal',        -- revealed mystery
                  'profile_tap',   -- tapped author profile
                  'tag_tap',       -- tapped a tag
                  'skip',          -- scrolled past quickly (<1s)
                  'hide'           -- explicitly hidden
                )),
  tag           TEXT,              -- for tag_tap actions
  dwell_ms      INTEGER,           -- milliseconds spent on post
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactions_user
  ON user_interactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_post
  ON user_interactions(post_id, action);

ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "interactions_own" ON user_interactions FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ── USER CONTENT AFFINITY SCORES ─────────────────────────────
-- Computed affinity scores per user per content dimension
-- Updated by trigger/cron after interactions
CREATE TABLE IF NOT EXISTS user_affinity (
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dimension      TEXT NOT NULL,   -- 'tag:startup', 'type:mystery', 'author:uuid', 'city:kolkata'
  score          FLOAT NOT NULL DEFAULT 0,
  decay_weight   FLOAT NOT NULL DEFAULT 1.0,  -- reduces over time without interaction
  interactions   INTEGER NOT NULL DEFAULT 0,
  last_interacted TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, dimension)
);

CREATE INDEX IF NOT EXISTS idx_affinity_user
  ON user_affinity(user_id, score DESC);

ALTER TABLE user_affinity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "affinity_own" ON user_affinity FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ── UPDATE AFFINITY FUNCTION ─────────────────────────────────
CREATE OR REPLACE FUNCTION update_user_affinity(
  p_user_id   UUID,
  p_dimension TEXT,
  p_delta     FLOAT DEFAULT 1.0
) RETURNS void AS $$
BEGIN
  INSERT INTO user_affinity(user_id, dimension, score, interactions, last_interacted)
  VALUES (p_user_id, p_dimension, p_delta, 1, NOW())
  ON CONFLICT (user_id, dimension) DO UPDATE SET
    score         = user_affinity.score + p_delta,
    interactions  = user_affinity.interactions + 1,
    last_interacted = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── FACEBOOK-STYLE GLOBAL FEED SQL FUNCTION ──────────────────
-- Multi-signal ranking:
--   A. Social graph (friends/mutual > following > stranger)
--   B. Content affinity (tags, content types user engages with)
--   C. Post quality (engagement velocity)
--   D. Content diversity (prevents seeing same author repeatedly)
--   E. Recency with decay
--   F. Virality signal (reshare velocity)
--   G. Mystery/reveal engagement bonus
CREATE OR REPLACE FUNCTION get_global_feed_smart(
  p_user_id       UUID DEFAULT NULL,
  p_lim           INTEGER DEFAULT 20,
  p_cursor_time   TIMESTAMPTZ DEFAULT NULL,
  p_seen_post_ids UUID[] DEFAULT '{}'  -- client sends IDs already seen to avoid repeats
)
RETURNS TABLE (
  id                  UUID,
  user_id             UUID,
  content             TEXT,
  image_url           TEXT,
  video_url           TEXT,
  video_thumbnail_url TEXT,
  is_anonymous        BOOLEAN,
  is_mystery          BOOLEAN,
  is_challenge        BOOLEAN,
  city                TEXT,
  tags                TEXT[],
  scope               TEXT,
  reveal_count        INTEGER,
  view_count          INTEGER,
  reshare_count       INTEGER,
  reshared_from_id    UUID,
  room_id             UUID,
  created_at          TIMESTAMPTZ,
  total_score         DOUBLE PRECISION,
  reaction_counts     JSONB,
  comment_count       BIGINT,
  user_reaction       TEXT,
  has_revealed        BOOLEAN,
  social_context      TEXT,
  score_breakdown     JSONB
) AS $$
DECLARE
  v_following_ids UUID[];
  v_mutual_ids    UUID[];
BEGIN
  -- Pre-compute social graph for this viewer
  IF p_user_id IS NOT NULL THEN
    SELECT ARRAY_AGG(f.following_id) INTO v_following_ids
    FROM follows f WHERE f.follower_id = p_user_id;

    SELECT ARRAY_AGG(f1.following_id) INTO v_mutual_ids
    FROM follows f1
    WHERE f1.follower_id = p_user_id
      AND f1.following_id IN (
        SELECT f2.follower_id FROM follows f2 WHERE f2.following_id = p_user_id
      );
  END IF;

  RETURN QUERY
  WITH

  -- Base post pool: recent posts (last 7 days) not yet seen
  base_posts AS (
    SELECT
      p.id, p.user_id, p.content, p.image_url, p.video_url,
      p.video_thumbnail_url, p.is_anonymous, p.is_mystery,
      p.city, p.tags, p.scope, p.reveal_count, p.view_count,
      p.reshare_count, p.reshared_from_id, p.room_id, p.created_at,
      p.is_deleted, p.is_sensitive, p.feeling_emoji, p.activity_emoji,
      p.life_event_emoji, p.life_event_type, p.tagged_user_ids,
      p.location_name, p.gif_url,
      EXISTS(SELECT 1 FROM challenge_posts cp WHERE cp.post_id = p.id) AS is_challenge
    FROM posts p
    WHERE p.is_deleted = FALSE
      AND p.created_at > NOW() - INTERVAL '7 days'
      AND (p.scope = 'global' OR p.scope IS NULL)
      AND NOT (p.id = ANY(p_seen_post_ids))
      AND (
        -- Private account posts only visible to followers
        p.is_anonymous = TRUE
        OR p.user_id = p_user_id
        OR NOT EXISTS(
          SELECT 1 FROM users u2
          WHERE u2.id = p.user_id AND u2.is_private = TRUE
          AND NOT (p.user_id = ANY(COALESCE(v_following_ids, '{}'::UUID[])))
        )
      )
      AND (p_cursor_time IS NULL OR p.created_at < p_cursor_time)
    LIMIT 500
  ),

  -- Engagement data
  rxn AS (
    SELECT r.post_id,
      JSONB_BUILD_OBJECT(
        'interesting', COUNT(*) FILTER (WHERE r.type = 'interesting'),
        'funny',       COUNT(*) FILTER (WHERE r.type = 'funny'),
        'deep',        COUNT(*) FILTER (WHERE r.type = 'deep'),
        'curious',     COUNT(*) FILTER (WHERE r.type = 'curious')
      ) AS counts,
      COUNT(*) AS total
    FROM reactions r WHERE r.post_id IN (SELECT bp.id FROM base_posts bp)
    GROUP BY r.post_id
  ),

  cmt AS (
    SELECT post_id, COUNT(*) AS cnt FROM comments
    WHERE post_id IN (SELECT id FROM base_posts) AND is_deleted = FALSE
    GROUP BY post_id
  ),

  my_rxn AS (
    SELECT post_id, type FROM reactions
    WHERE p_user_id IS NOT NULL AND user_id = p_user_id
      AND post_id IN (SELECT id FROM base_posts)
  ),

  my_reveal AS (
    SELECT post_id FROM mystery_reveals
    WHERE p_user_id IS NOT NULL AND user_id = p_user_id
      AND post_id IN (SELECT id FROM base_posts WHERE is_mystery = TRUE)
  ),

  -- User's content affinities
  affinities AS (
    SELECT dimension, score FROM user_affinity
    WHERE p_user_id IS NOT NULL AND user_id = p_user_id
    ORDER BY score DESC LIMIT 50
  ),

  scored AS (
    SELECT
      p.id, p.user_id, p.content, p.image_url, p.video_url,
      p.video_thumbnail_url, p.is_anonymous, p.is_mystery, p.is_challenge,
      p.city, p.tags, p.scope, p.reveal_count, p.view_count,
      COALESCE(p.reshare_count, 0) AS reshare_count,
      p.reshared_from_id, p.room_id, p.created_at,

      -- Engagement stats
      COALESCE(rxn.counts, '{"interesting":0,"funny":0,"deep":0,"curious":0}'::JSONB) AS reaction_counts,
      COALESCE(cmt.cnt, 0) AS comment_count,
      my_rxn.type AS user_reaction,
      (my_reveal.post_id IS NOT NULL) AS has_revealed,

      -- Social context
      CASE
        WHEN p.user_id = p_user_id THEN 'self'
        WHEN p.user_id = ANY(COALESCE(v_mutual_ids, '{}'::UUID[])) THEN 'mutual'
        WHEN p.user_id = ANY(COALESCE(v_following_ids, '{}'::UUID[])) THEN 'following'
        ELSE 'stranger'
      END AS social_context,

      -- ── SCORE CALCULATION ─────────────────────────────────────
      (
        -- A. SOCIAL GRAPH SIGNAL (0-60 pts)
        -- Friends first, then following, then discovery
        CASE
          WHEN p.user_id = p_user_id THEN 0
          WHEN p.user_id = ANY(COALESCE(v_mutual_ids, '{}'::UUID[])) THEN 60
          WHEN p.user_id = ANY(COALESCE(v_following_ids, '{}'::UUID[])) THEN 40
          ELSE 0
        END

        +

        -- B. ENGAGEMENT VELOCITY (0-80 pts)
        -- Not just total engagement — HOW FAST it's being engaged
        -- Posts getting 10 reactions in 30min beat posts with 100 over 24hrs
        LEAST(
          (
            COALESCE(rxn.total, 0) * 3
            + COALESCE(cmt.cnt, 0) * 2
            + COALESCE(p.reveal_count, 0) * 4
            + COALESCE(p.reshare_count, 0) * 5  -- reshares = strongest signal
          )::FLOAT
          / GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0, 0.1) ^ 1.5,
          80.0
        )

        +

        -- C. CONTENT AFFINITY (0-40 pts)
        -- Based on tags user has interacted with before
        COALESCE((
          SELECT SUM(LEAST(a.score * 2, 8))  -- cap per-tag at 8
          FROM affinities a
          WHERE a.dimension LIKE 'tag:%'
            AND REPLACE(a.dimension, 'tag:', '') = ANY(p.tags)
          LIMIT 5
        ), 0)

        +

        -- D. AUTHOR AFFINITY (0-20 pts)
        -- If user has previously engaged with this author
        COALESCE((
          SELECT LEAST(a.score * 5, 20)
          FROM affinities a
          WHERE a.dimension = 'author:' || p.user_id::text
        ), 0)

        +

        -- E. CONTENT TYPE BONUS
        CASE WHEN p.is_mystery = TRUE THEN 12 ELSE 0 END    -- mystery drives engagement
        + CASE WHEN p.is_challenge = TRUE THEN 10 ELSE 0 END -- challenge posts = community
        + CASE WHEN p.image_url IS NOT NULL THEN 5 ELSE 0 END -- visual content performs
        + CASE WHEN p.video_url IS NOT NULL THEN 8 ELSE 0 END -- video performs best

        +

        -- F. RECENCY (0-20 pts) — smooth decay not cliff
        -- Less aggressive than nearby (global feed values quality over freshness)
        CASE
          WHEN p.created_at > NOW() - INTERVAL '1 hour'  THEN 20
          WHEN p.created_at > NOW() - INTERVAL '3 hours' THEN 15
          WHEN p.created_at > NOW() - INTERVAL '12 hours' THEN 10
          WHEN p.created_at > NOW() - INTERVAL '24 hours' THEN 5
          WHEN p.created_at > NOW() - INTERVAL '48 hours' THEN 2
          ELSE 0
        END

        +

        -- G. VIRALITY SIGNAL (0-20 pts)
        -- Posts going viral get boosted
        CASE
          WHEN COALESCE(p.reshare_count, 0) >= 50 THEN 20
          WHEN COALESCE(p.reshare_count, 0) >= 20 THEN 15
          WHEN COALESCE(p.reshare_count, 0) >= 10 THEN 10
          WHEN COALESCE(p.reshare_count, 0) >= 5  THEN 5
          ELSE 0
        END

        +

        -- H. MYSTERY REVEAL MOMENTUM (0-15 pts)
        -- Mystery posts with high reveal rate are super engaging
        CASE
          WHEN p.is_mystery AND p.view_count > 0
            AND (p.reveal_count::FLOAT / GREATEST(p.view_count, 1)) > 0.3 THEN 15
          WHEN p.is_mystery AND COALESCE(p.reveal_count, 0) > 50 THEN 10
          ELSE 0
        END

      )::DOUBLE PRECISION AS total_score,

      -- Score breakdown for debugging
      JSONB_BUILD_OBJECT(
        'social', CASE
          WHEN p.user_id = ANY(COALESCE(v_mutual_ids, '{}'::UUID[])) THEN 60
          WHEN p.user_id = ANY(COALESCE(v_following_ids, '{}'::UUID[])) THEN 40
          ELSE 0 END,
        'engagement', ROUND(LEAST(
          (COALESCE(rxn.total,0)*3 + COALESCE(cmt.cnt,0)*2)::FLOAT
          / GREATEST(EXTRACT(EPOCH FROM (NOW()-p.created_at))/3600.0, 0.1)^1.5, 80.0)::NUMERIC, 1),
        'age_hours', ROUND((EXTRACT(EPOCH FROM (NOW()-p.created_at))/3600.0)::NUMERIC, 1)
      ) AS score_breakdown

    FROM base_posts p
    LEFT JOIN rxn       ON rxn.post_id      = p.id
    LEFT JOIN cmt       ON cmt.post_id      = p.id
    LEFT JOIN my_rxn    ON my_rxn.post_id   = p.id
    LEFT JOIN my_reveal ON my_reveal.post_id = p.id
  ),

  -- DIVERSITY FILTER: Limit same author to max 2 posts in top results
  ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY total_score DESC) AS author_rank
    FROM scored
  )

  SELECT
    r.id, r.user_id, r.content, r.image_url, r.video_url,
    r.video_thumbnail_url, r.is_anonymous, r.is_mystery, r.is_challenge,
    r.city, r.tags, r.scope, r.reveal_count, r.view_count,
    r.reshare_count, r.reshared_from_id, r.room_id, r.created_at,
    r.total_score, r.reaction_counts, r.comment_count,
    r.user_reaction, r.has_revealed, r.social_context, r.score_breakdown
  FROM ranked r
  WHERE r.author_rank <= 2  -- max 2 posts per author = diversity
  ORDER BY r.total_score DESC
  LIMIT p_lim;

END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ============================================================
-- BOOKMARKS (Save posts for later)
-- ============================================================
CREATE TABLE IF NOT EXISTS bookmarks (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id, created_at DESC);

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookmarks_own" ON bookmarks FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ── BLOCKED USERS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON user_blocks(blocked_id);

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocks_own" ON user_blocks FOR ALL
  USING (blocker_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ── MUTED USERS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_mutes (
  muter_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (muter_id, muted_id)
);

ALTER TABLE user_mutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mutes_own" ON user_mutes FOR ALL
  USING (muter_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ── NOTIFICATION PREFERENCES ──────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  new_follower         BOOLEAN NOT NULL DEFAULT TRUE,
  follow_request       BOOLEAN NOT NULL DEFAULT TRUE,
  new_reaction         BOOLEAN NOT NULL DEFAULT TRUE,
  new_comment          BOOLEAN NOT NULL DEFAULT TRUE,
  new_message          BOOLEAN NOT NULL DEFAULT TRUE,
  mystery_revealed     BOOLEAN NOT NULL DEFAULT TRUE,
  challenge_reminder   BOOLEAN NOT NULL DEFAULT TRUE,
  new_anonymous_question BOOLEAN NOT NULL DEFAULT TRUE,
  badge_awarded        BOOLEAN NOT NULL DEFAULT TRUE,
  level_up             BOOLEAN NOT NULL DEFAULT TRUE,
  marketing            BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_prefs_own" ON notification_prefs FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ── SCHEDULED POSTS ───────────────────────────────────────────
-- (Future feature - store drafts and scheduled posts)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_sensitive BOOLEAN NOT NULL DEFAULT FALSE;


-- Q&A enabled flag on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS qa_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Challenge participation streak tracking
ALTER TABLE user_streaks ADD COLUMN IF NOT EXISTS challenge_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_streaks ADD COLUMN IF NOT EXISTS last_challenge_date DATE;
ALTER TABLE user_streaks ADD COLUMN IF NOT EXISTS longest_challenge_streak INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deactivated BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- EXTENDED PROFILE (Facebook-style)
-- ============================================================

-- Add extended profile fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS hometown       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_city  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS relationship_status TEXT CHECK (
  relationship_status IN ('single','in_relationship','engaged','married','complicated','open','widowed','separated','divorced')
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS languages     TEXT[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS website_url   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_url     TEXT;     -- cover/banner photo
ALTER TABLE users ADD COLUMN IF NOT EXISTS pronouns      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_pref    TEXT NOT NULL DEFAULT 'dark' CHECK (theme_pref IN ('dark','light','system'));

-- Extended privacy (per-field visibility)
-- privacy_settings already a JSONB column; we extend its expected fields here via comment
-- Fields: show_hometown, show_relationship, show_work, show_education, show_interests, show_links

-- ── PROFILE WORK EXPERIENCE ───────────────────────────────────
CREATE TABLE IF NOT EXISTS profile_work (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company      TEXT NOT NULL,
  position     TEXT,
  city         TEXT,
  description  TEXT CHECK (char_length(description) <= 500),
  start_date   DATE,
  end_date     DATE,    -- NULL = current
  is_current   BOOLEAN NOT NULL DEFAULT FALSE,
  visibility   TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','followers','private')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  display_order SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_profile_work_user ON profile_work(user_id, display_order);
ALTER TABLE profile_work ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work_own" ON profile_work FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY "work_view" ON profile_work FOR SELECT
  USING (visibility = 'public' OR user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ── PROFILE EDUCATION ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profile_education (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school       TEXT NOT NULL,
  degree       TEXT,    -- 'High School', 'Bachelor', 'Master', 'PhD' etc.
  field        TEXT,    -- field of study
  city         TEXT,
  start_year   SMALLINT,
  end_year     SMALLINT,
  is_current   BOOLEAN NOT NULL DEFAULT FALSE,
  visibility   TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','followers','private')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  display_order SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_profile_edu_user ON profile_education(user_id, display_order);
ALTER TABLE profile_education ENABLE ROW LEVEL SECURITY;
CREATE POLICY "edu_own" ON profile_education FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY "edu_view" ON profile_education FOR SELECT
  USING (visibility = 'public' OR user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ── PROFILE INTERESTS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profile_interests (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  music        TEXT[] DEFAULT '{}',        -- artist/genre names
  tv_shows     TEXT[] DEFAULT '{}',
  movies       TEXT[] DEFAULT '{}',
  games        TEXT[] DEFAULT '{}',
  sports       TEXT[] DEFAULT '{}',        -- teams/athletes
  places       TEXT[] DEFAULT '{}',        -- travel places
  hobbies      TEXT[] DEFAULT '{}',
  books        TEXT[] DEFAULT '{}',
  visibility   TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','followers','private')),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE profile_interests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "interests_own" ON profile_interests FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY "interests_view" ON profile_interests FOR SELECT
  USING (visibility = 'public' OR user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ── PROFILE LINKS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profile_links (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,   -- 'Website', 'Portfolio', 'Instagram' etc.
  url         TEXT NOT NULL,
  icon        TEXT,            -- 'globe', 'instagram', 'twitter' etc.
  display_order SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_profile_links_user ON profile_links(user_id, display_order);
ALTER TABLE profile_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "links_own" ON profile_links FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY "links_view" ON profile_links FOR SELECT USING (true);

-- ── POST METADATA (feeling, activity, location tag, tagged users) ──
ALTER TABLE posts ADD COLUMN IF NOT EXISTS feeling          TEXT;       -- e.g. 'happy'
ALTER TABLE posts ADD COLUMN IF NOT EXISTS feeling_emoji    TEXT;       -- e.g. '😊'
ALTER TABLE posts ADD COLUMN IF NOT EXISTS activity         TEXT;       -- e.g. 'watching'
ALTER TABLE posts ADD COLUMN IF NOT EXISTS activity_emoji   TEXT;       -- e.g. '📺'
ALTER TABLE posts ADD COLUMN IF NOT EXISTS activity_detail  TEXT;       -- e.g. 'Stranger Things'
ALTER TABLE posts ADD COLUMN IF NOT EXISTS location_name    TEXT;       -- e.g. 'Victoria Memorial, Kolkata'
ALTER TABLE posts ADD COLUMN IF NOT EXISTS location_place_id TEXT;      -- Google Places ID (future)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_life_event    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS life_event_type  TEXT;       -- 'new_job','moved','relationship' etc.

-- Post tagged users (many-to-many)
CREATE TABLE IF NOT EXISTS post_tags (
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_post_tags_user ON post_tags(user_id);
ALTER TABLE post_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "post_tags_read" ON post_tags FOR SELECT USING (true);
CREATE POLICY "post_tags_write" ON post_tags FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id AND p.user_id = (SELECT id FROM users WHERE auth_id = auth.uid())));


-- Post enhancement columns (added separately for clarity)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS gif_url           TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS feeling           TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS feeling_emoji     TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS activity          TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS activity_emoji    TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS activity_detail   TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS location_name     TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_life_event     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS life_event_type   TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS life_event_emoji  TEXT;

-- User extended profile columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_instagram  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_twitter    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_linkedin   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_youtube    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_url         TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hometown          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_city      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS relationship_status TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pronouns          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS languages         TEXT[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS pinned_info       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_pref        TEXT NOT NULL DEFAULT 'dark';

-- ============================================================
-- PERFORMANCE INDEXES (added for production)
-- ============================================================

-- Feed query optimization
CREATE INDEX IF NOT EXISTS idx_posts_global_feed
  ON posts(created_at DESC)
  WHERE is_deleted = FALSE AND (scope = 'global' OR scope IS NULL);

CREATE INDEX IF NOT EXISTS idx_posts_nearby
  ON posts USING GIST(location)
  WHERE is_deleted = FALSE AND location IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_user_created
  ON posts(user_id, created_at DESC)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_posts_tags
  ON posts USING GIN(tags);

-- Reactions
CREATE INDEX IF NOT EXISTS idx_reactions_post_user
  ON reactions(post_id, user_id);

CREATE INDEX IF NOT EXISTS idx_reactions_user
  ON reactions(user_id, created_at DESC);

-- Comments  
CREATE INDEX IF NOT EXISTS idx_comments_post_created
  ON comments(post_id, created_at ASC)
  WHERE is_deleted = FALSE;

-- Follows graph (critical for feed)
CREATE INDEX IF NOT EXISTS idx_follows_follower
  ON follows(follower_id, following_id);

CREATE INDEX IF NOT EXISTS idx_follows_following
  ON follows(following_id, follower_id);

-- Notifications (unread badge)
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(user_id, is_read, created_at DESC);

-- Direct messages
CREATE INDEX IF NOT EXISTS idx_dm_conversation
  ON direct_messages(sender_id, receiver_id, created_at DESC)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_dm_receiver_unread
  ON direct_messages(receiver_id, is_read)
  WHERE is_deleted = FALSE AND is_read = FALSE;

-- Bookmarks
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_created
  ON bookmarks(user_id, created_at DESC);

-- User affinity (recommendation engine)
CREATE INDEX IF NOT EXISTS idx_affinity_user_score
  ON user_affinity(user_id, score DESC);

-- Stories (active only)
CREATE INDEX IF NOT EXISTS idx_stories_active
  ON stories(user_id, created_at DESC)
  WHERE expires_at > NOW();

-- User location (nearby queries)
CREATE INDEX IF NOT EXISTS idx_user_locations_active
  ON user_locations USING GIST(location)
  WHERE expires_at > NOW();

-- ============================================================
-- DATABASE FUNCTIONS FOR PERFORMANCE
-- ============================================================

-- Increment post views atomically (prevents race condition)
CREATE OR REPLACE FUNCTION increment_post_view(p_post_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS void AS $$
BEGIN
  UPDATE posts SET view_count = view_count + 1 WHERE id = p_post_id;
  -- Track in post_views if user is logged in
  IF p_user_id IS NOT NULL THEN
    INSERT INTO post_views(user_id, post_id) VALUES (p_user_id, p_post_id)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- RECOMMENDATION ENGINE v2 — UPGRADES
-- Run these migrations on your Supabase SQL editor
-- ============================================================

-- ── 1. Hidden posts table (for "I don't want to see this") ───
CREATE TABLE IF NOT EXISTS post_hides (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_post_hides_user ON post_hides(user_id);
ALTER TABLE post_hides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hides_own" ON post_hides FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ── 2. Affinity decay function (run via pg_cron daily) ───────
-- Slowly reduces old interests so feed stays fresh
CREATE OR REPLACE FUNCTION decay_user_affinities()
RETURNS void AS $$
BEGIN
  -- Reduce scores by 5% per day for affinities not interacted with in 7 days
  UPDATE user_affinity
  SET
    score        = GREATEST(score * 0.95, 0),
    decay_weight = GREATEST(decay_weight * 0.95, 0.1)
  WHERE last_interacted < NOW() - INTERVAL '7 days'
    AND score > 0.1;

  -- Remove dead affinities (score too low to matter)
  DELETE FROM user_affinity
  WHERE score < 0.05 AND last_interacted < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. Upgraded get_global_feed_smart with ALL improvements ──
CREATE OR REPLACE FUNCTION get_global_feed_smart(
  p_user_id        UUID DEFAULT NULL,
  p_lim            INTEGER DEFAULT 20,
  p_cursor_time    TIMESTAMPTZ DEFAULT NULL,
  p_seen_post_ids  UUID[] DEFAULT '{}',
  p_time_window    INTERVAL DEFAULT '7 days'  -- expandable for infinite scroll
)
RETURNS TABLE (
  id                  UUID,
  user_id             UUID,
  content             TEXT,
  image_url           TEXT,
  video_url           TEXT,
  video_thumbnail_url TEXT,
  is_anonymous        BOOLEAN,
  is_mystery          BOOLEAN,
  is_challenge        BOOLEAN,
  city                TEXT,
  tags                TEXT[],
  scope               TEXT,
  reveal_count        INTEGER,
  view_count          INTEGER,
  reshare_count       INTEGER,
  reshared_from_id    UUID,
  room_id             UUID,
  created_at          TIMESTAMPTZ,
  total_score         DOUBLE PRECISION,
  reaction_counts     JSONB,
  comment_count       BIGINT,
  user_reaction       TEXT,
  has_revealed        BOOLEAN,
  social_context      TEXT,
  score_breakdown     JSONB
) AS $$
DECLARE
  v_following_ids UUID[];
  v_mutual_ids    UUID[];
  v_hidden_ids    UUID[];
BEGIN
  IF p_user_id IS NOT NULL THEN
    -- Social graph
    SELECT ARRAY_AGG(f.following_id) INTO v_following_ids
    FROM follows f WHERE f.follower_id = p_user_id;

    SELECT ARRAY_AGG(f1.following_id) INTO v_mutual_ids
    FROM follows f1
    WHERE f1.follower_id = p_user_id
      AND f1.following_id IN (
        SELECT f2.follower_id FROM follows f2 WHERE f2.following_id = p_user_id
      );

    -- Hidden posts: never show again
    SELECT ARRAY_AGG(ph.post_id) INTO v_hidden_ids
    FROM post_hides ph WHERE ph.user_id = p_user_id;
  END IF;

  RETURN QUERY
  WITH

  base_posts AS (
    SELECT
      p.id, p.user_id, p.content, p.image_url, p.video_url,
      p.video_thumbnail_url, p.is_anonymous, p.is_mystery,
      p.city, p.tags, p.scope, p.reveal_count, p.view_count,
      p.reshare_count, p.reshared_from_id, p.room_id, p.created_at,
      p.is_deleted, p.is_sensitive, p.feeling_emoji, p.activity_emoji,
      p.life_event_emoji, p.life_event_type, p.tagged_user_ids,
      p.location_name, p.gif_url,
      EXISTS(SELECT 1 FROM challenge_posts cp WHERE cp.post_id = p.id) AS is_challenge
    FROM posts p
    WHERE p.is_deleted = FALSE
      AND p.created_at > NOW() - p_time_window          -- expandable window
      AND (p.scope = 'global' OR p.scope IS NULL)
      AND NOT (p.id = ANY(p_seen_post_ids))              -- no repeats (global)
      AND NOT (p.id = ANY(COALESCE(v_hidden_ids, '{}'::UUID[])))  -- not hidden
      AND (
        p.is_anonymous = TRUE
        OR p.user_id = p_user_id
        OR NOT EXISTS(
          SELECT 1 FROM users u2
          WHERE u2.id = p.user_id AND u2.is_private = TRUE
          AND NOT (p.user_id = ANY(COALESCE(v_following_ids, '{}'::UUID[])))
        )
      )
      AND (p_cursor_time IS NULL OR p.created_at < p_cursor_time)
    LIMIT 500
  ),

  rxn AS (
    SELECT r.post_id,
      JSONB_BUILD_OBJECT(
        'interesting', COUNT(*) FILTER (WHERE r.type = 'interesting'),
        'funny',       COUNT(*) FILTER (WHERE r.type = 'funny'),
        'deep',        COUNT(*) FILTER (WHERE r.type = 'deep'),
        'curious',     COUNT(*) FILTER (WHERE r.type = 'curious')
      ) AS counts,
      COUNT(*) AS total
    FROM reactions r WHERE r.post_id IN (SELECT bp.id FROM base_posts bp)
    GROUP BY r.post_id
  ),

  cmt AS (
    SELECT post_id, COUNT(*) AS cnt FROM comments
    WHERE post_id IN (SELECT id FROM base_posts) AND is_deleted = FALSE
    GROUP BY post_id
  ),

  my_rxn AS (
    SELECT post_id, type FROM reactions
    WHERE p_user_id IS NOT NULL AND user_id = p_user_id
      AND post_id IN (SELECT id FROM base_posts)
  ),

  my_reveal AS (
    SELECT post_id FROM mystery_reveals
    WHERE p_user_id IS NOT NULL AND user_id = p_user_id
      AND post_id IN (SELECT id FROM base_posts WHERE is_mystery = TRUE)
  ),

  -- Dwell signals: posts user spent real time on = strong negative/positive
  my_dwells AS (
    SELECT
      post_id,
      SUM(CASE WHEN action = 'dwell' THEN 1 ELSE 0 END) AS dwell_count,
      SUM(CASE WHEN action = 'skip'  THEN 1 ELSE 0 END) AS skip_count
    FROM user_interactions
    WHERE p_user_id IS NOT NULL
      AND user_id = p_user_id
      AND post_id IN (SELECT id FROM base_posts)
      AND created_at > NOW() - INTERVAL '30 days'
    GROUP BY post_id
  ),

  affinities AS (
    SELECT dimension, score FROM user_affinity
    WHERE p_user_id IS NOT NULL AND user_id = p_user_id
    ORDER BY score DESC LIMIT 100
  ),

  scored AS (
    SELECT
      p.id, p.user_id, p.content, p.image_url, p.video_url,
      p.video_thumbnail_url, p.is_anonymous, p.is_mystery, p.is_challenge,
      p.city, p.tags, p.scope, p.reveal_count, p.view_count,
      COALESCE(p.reshare_count, 0) AS reshare_count,
      p.reshared_from_id, p.room_id, p.created_at,
      COALESCE(rxn.counts, '{"interesting":0,"funny":0,"deep":0,"curious":0}'::JSONB) AS reaction_counts,
      COALESCE(cmt.cnt, 0) AS comment_count,
      my_rxn.type AS user_reaction,
      (my_reveal.post_id IS NOT NULL) AS has_revealed,

      CASE
        WHEN p.user_id = p_user_id THEN 'self'
        WHEN p.user_id = ANY(COALESCE(v_mutual_ids, '{}'::UUID[])) THEN 'mutual'
        WHEN p.user_id = ANY(COALESCE(v_following_ids, '{}'::UUID[])) THEN 'following'
        ELSE 'stranger'
      END AS social_context,

      (
        -- A. SOCIAL GRAPH (0-60)
        CASE
          WHEN p.user_id = p_user_id THEN 0
          WHEN p.user_id = ANY(COALESCE(v_mutual_ids, '{}'::UUID[])) THEN 60
          WHEN p.user_id = ANY(COALESCE(v_following_ids, '{}'::UUID[])) THEN 40
          ELSE 0
        END

        +

        -- B. ENGAGEMENT VELOCITY (0-80)
        LEAST(
          (
            COALESCE(rxn.total, 0) * 3
            + COALESCE(cmt.cnt, 0) * 5     -- comments weighted higher
            + COALESCE(p.reveal_count, 0) * 4
            + COALESCE(p.reshare_count, 0) * 6
          )::FLOAT
          / GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0, 0.1) ^ 1.5,
          80.0
        )

        +

        -- C. TAG AFFINITY (0-40) — weighted per-tag, not binary
        COALESCE((
          SELECT SUM(LEAST(a.score * 2, 8))
          FROM affinities a
          WHERE a.dimension LIKE 'tag:%'
            AND REPLACE(a.dimension, 'tag:', '') = ANY(p.tags)
          LIMIT 5
        ), 0)

        +

        -- D. AUTHOR AFFINITY (0-20)
        COALESCE((
          SELECT LEAST(a.score * 5, 20)
          FROM affinities a
          WHERE a.dimension = 'author:' || p.user_id::text
        ), 0)

        +

        -- E. DWELL SIGNAL BOOST/PENALTY
        -- If user dwelled on similar posts → boost; skipped → penalty
        COALESCE((
          SELECT (dwell_count * 3 - skip_count * 2)
          FROM my_dwells WHERE post_id = p.id
        ), 0)

        +

        -- F. CONTENT TYPE BONUS
        CASE WHEN p.is_mystery = TRUE    THEN 12 ELSE 0 END
        + CASE WHEN p.is_challenge = TRUE THEN 10 ELSE 0 END
        + CASE WHEN p.image_url IS NOT NULL THEN 5 ELSE 0 END
        + CASE WHEN p.video_url IS NOT NULL THEN 8 ELSE 0 END

        +

        -- G. RECENCY (0-20)
        CASE
          WHEN p.created_at > NOW() - INTERVAL '1 hour'   THEN 20
          WHEN p.created_at > NOW() - INTERVAL '3 hours'  THEN 15
          WHEN p.created_at > NOW() - INTERVAL '12 hours' THEN 10
          WHEN p.created_at > NOW() - INTERVAL '24 hours' THEN 5
          WHEN p.created_at > NOW() - INTERVAL '48 hours' THEN 2
          ELSE 0
        END

        +

        -- H. VIRALITY (0-20)
        CASE
          WHEN COALESCE(p.reshare_count, 0) >= 50 THEN 20
          WHEN COALESCE(p.reshare_count, 0) >= 20 THEN 15
          WHEN COALESCE(p.reshare_count, 0) >= 10 THEN 10
          WHEN COALESCE(p.reshare_count, 0) >= 5  THEN 5
          ELSE 0
        END

        +

        -- I. MYSTERY REVEAL MOMENTUM (0-15)
        CASE
          WHEN p.is_mystery AND p.view_count > 0
            AND (p.reveal_count::FLOAT / GREATEST(p.view_count, 1)) > 0.3 THEN 15
          WHEN p.is_mystery AND COALESCE(p.reveal_count, 0) > 50 THEN 10
          ELSE 0
        END

      )::DOUBLE PRECISION AS total_score,

      JSONB_BUILD_OBJECT(
        'social', CASE
          WHEN p.user_id = ANY(COALESCE(v_mutual_ids, '{}'::UUID[])) THEN 60
          WHEN p.user_id = ANY(COALESCE(v_following_ids, '{}'::UUID[])) THEN 40
          ELSE 0 END,
        'engagement', ROUND(LEAST(
          (COALESCE(rxn.total,0)*3 + COALESCE(cmt.cnt,0)*5)::FLOAT
          / GREATEST(EXTRACT(EPOCH FROM (NOW()-p.created_at))/3600.0, 0.1)^1.5, 80.0)::NUMERIC, 1),
        'age_hours', ROUND((EXTRACT(EPOCH FROM (NOW()-p.created_at))/3600.0)::NUMERIC, 1)
      ) AS score_breakdown

    FROM base_posts p
    LEFT JOIN rxn       ON rxn.post_id      = p.id
    LEFT JOIN cmt       ON cmt.post_id      = p.id
    LEFT JOIN my_rxn    ON my_rxn.post_id   = p.id
    LEFT JOIN my_reveal ON my_reveal.post_id = p.id
    LEFT JOIN my_dwells ON my_dwells.post_id = p.id
  ),

  ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY total_score DESC) AS author_rank
    FROM scored
  )

  SELECT
    r.id, r.user_id, r.content, r.image_url, r.video_url,
    r.video_thumbnail_url, r.is_anonymous, r.is_mystery, r.is_challenge,
    r.city, r.tags, r.scope, r.reveal_count, r.view_count,
    r.reshare_count, r.reshared_from_id, r.room_id, r.created_at,
    r.total_score, r.reaction_counts, r.comment_count,
    r.user_reaction, r.has_revealed, r.social_context, r.score_breakdown
  FROM ranked r
  WHERE r.author_rank <= 2
  ORDER BY r.total_score DESC
  LIMIT p_lim;

END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ── 4. Upgraded get_city_feed_smart with weighted tag affinity ──
CREATE OR REPLACE FUNCTION get_city_feed_smart(
  p_city          TEXT,
  p_user_id       UUID DEFAULT NULL,
  p_lim           INTEGER DEFAULT 20,
  p_cursor_time   TIMESTAMPTZ DEFAULT NULL,
  p_user_tags     TEXT[] DEFAULT '{}',
  p_seen_post_ids UUID[] DEFAULT '{}'
)
RETURNS TABLE (
  id                  UUID,
  user_id             UUID,
  content             TEXT,
  image_url           TEXT,
  video_url           TEXT,
  video_thumbnail_url TEXT,
  is_anonymous        BOOLEAN,
  is_mystery          BOOLEAN,
  city                TEXT,
  tags                TEXT[],
  reveal_count        INTEGER,
  view_count          INTEGER,
  reshare_count       INTEGER,
  reshared_from_id    UUID,
  room_id             UUID,
  created_at          TIMESTAMPTZ,
  total_score         DOUBLE PRECISION,
  reaction_counts     JSONB,
  comment_count       BIGINT,
  user_reaction       TEXT,
  has_revealed        BOOLEAN,
  area_label          TEXT
) AS $$
DECLARE
  v_hidden_ids UUID[];
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT ARRAY_AGG(ph.post_id) INTO v_hidden_ids
    FROM post_hides ph WHERE ph.user_id = p_user_id;
  END IF;

  RETURN QUERY
  WITH
  city_posts AS (
    SELECT p.*,
      CASE WHEN LOWER(p.city) = LOWER(p_city) THEN p_city ELSE p.city END AS area_label
    FROM posts p
    WHERE p.is_deleted = FALSE
      AND (
        LOWER(p.city) = LOWER(p_city)
        OR LOWER(p.city) IN (
          SELECT LOWER(ca.area) FROM city_areas ca WHERE LOWER(ca.city) = LOWER(p_city)
        )
        OR LOWER(p.city) IN (
          SELECT LOWER(unnest(ca.aliases)) FROM city_areas ca WHERE LOWER(ca.city) = LOWER(p_city)
        )
      )
      AND NOT (p.id = ANY(p_seen_post_ids))
      AND NOT (p.id = ANY(COALESCE(v_hidden_ids, '{}'::UUID[])))
      AND (p_cursor_time IS NULL OR p.created_at < p_cursor_time)
    LIMIT 300
  ),

  social AS (
    SELECT cp.id AS post_id,
      CASE
        WHEN p_user_id IS NULL THEN 'stranger'
        WHEN cp.user_id = p_user_id THEN 'self'
        WHEN EXISTS(SELECT 1 FROM follows f1 WHERE f1.follower_id = p_user_id AND f1.following_id = cp.user_id)
          AND EXISTS(SELECT 1 FROM follows f2 WHERE f2.follower_id = cp.user_id AND f2.following_id = p_user_id)
          THEN 'mutual'
        WHEN EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = p_user_id AND f.following_id = cp.user_id)
          THEN 'following'
        ELSE 'stranger'
      END AS relationship
    FROM city_posts cp WHERE NOT cp.is_anonymous
  ),

  rxn AS (
    SELECT r.post_id,
      JSONB_BUILD_OBJECT(
        'interesting', COUNT(*) FILTER (WHERE r.type = 'interesting'),
        'funny',       COUNT(*) FILTER (WHERE r.type = 'funny'),
        'deep',        COUNT(*) FILTER (WHERE r.type = 'deep'),
        'curious',     COUNT(*) FILTER (WHERE r.type = 'curious')
      ) AS counts, COUNT(*) AS total
    FROM reactions r WHERE r.post_id IN (SELECT id FROM city_posts)
    GROUP BY r.post_id
  ),

  cmt AS (
    SELECT post_id, COUNT(*) AS cnt FROM comments
    WHERE post_id IN (SELECT id FROM city_posts) AND is_deleted = FALSE
    GROUP BY post_id
  ),

  my_rxn AS (
    SELECT post_id, type FROM reactions
    WHERE p_user_id IS NOT NULL AND user_id = p_user_id
      AND post_id IN (SELECT id FROM city_posts)
  ),

  my_reveal AS (
    SELECT post_id FROM mystery_reveals
    WHERE p_user_id IS NOT NULL AND user_id = p_user_id
      AND post_id IN (SELECT id FROM city_posts WHERE is_mystery = TRUE)
  ),

  -- Weighted tag affinity for city feed (replaces binary p_user_tags && tags)
  affinities AS (
    SELECT dimension, score FROM user_affinity
    WHERE p_user_id IS NOT NULL AND user_id = p_user_id
      AND dimension LIKE 'tag:%'
    ORDER BY score DESC LIMIT 50
  ),

  scored AS (
    SELECT
      cp.id, cp.user_id, cp.content, cp.image_url, cp.video_url,
      cp.video_thumbnail_url, cp.is_anonymous, cp.is_mystery,
      cp.city, cp.tags, cp.reveal_count, cp.view_count,
      COALESCE(cp.reshare_count, 0) AS reshare_count,
      cp.reshared_from_id, cp.room_id, cp.created_at,
      COALESCE(rxn.counts, '{"interesting":0,"funny":0,"deep":0,"curious":0}'::JSONB) AS reaction_counts,
      COALESCE(cmt.cnt, 0) AS comment_count,
      my_rxn.type AS user_reaction,
      (my_reveal.post_id IS NOT NULL) AS has_revealed,
      cp.area_label,
      (
        CASE COALESCE(social.relationship, 'stranger')
          WHEN 'mutual'    THEN 45
          WHEN 'following' THEN 30
          WHEN 'self'      THEN 0
          ELSE 0
        END
        +
        LEAST(
          (COALESCE(rxn.total,0)*3 + COALESCE(cmt.cnt,0)*5 + COALESCE(cp.reveal_count,0)*4)::FLOAT
          / GREATEST(EXTRACT(EPOCH FROM (NOW()-cp.created_at))/3600.0, 0.1)^1.5,
          80.0
        )
        +
        -- Weighted tag interest (0-40) — replaces binary
        COALESCE((
          SELECT SUM(LEAST(a.score * 2, 8))
          FROM affinities a
          WHERE REPLACE(a.dimension, 'tag:', '') = ANY(cp.tags)
          LIMIT 5
        ), 0)
        +
        CASE WHEN cp.scope = 'city' THEN 25 ELSE 0 END
        +
        CASE
          WHEN cp.created_at > NOW() - INTERVAL '1 hour'   THEN 15
          WHEN cp.created_at > NOW() - INTERVAL '6 hours'  THEN 10
          WHEN cp.created_at > NOW() - INTERVAL '24 hours' THEN 5
          ELSE 0
        END
      )::DOUBLE PRECISION AS total_score
    FROM city_posts cp
    LEFT JOIN social    ON social.post_id    = cp.id
    LEFT JOIN rxn       ON rxn.post_id       = cp.id
    LEFT JOIN cmt       ON cmt.post_id       = cp.id
    LEFT JOIN my_rxn    ON my_rxn.post_id    = cp.id
    LEFT JOIN my_reveal ON my_reveal.post_id = cp.id
  ),

  ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY total_score DESC) AS author_rank
    FROM scored
  )

  SELECT
    r.id, r.user_id, r.content, r.image_url, r.video_url,
    r.video_thumbnail_url, r.is_anonymous, r.is_mystery,
    r.city, r.tags, r.reveal_count, r.view_count,
    r.reshare_count, r.reshared_from_id, r.room_id, r.created_at,
    r.total_score, r.reaction_counts, r.comment_count,
    r.user_reaction, r.has_revealed, r.area_label
  FROM ranked r
  WHERE r.author_rank <= 2
  ORDER BY r.total_score DESC
  LIMIT p_lim;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ── 5. get_nearby_posts_smart — add seen exclusion + hidden exclusion ──
CREATE OR REPLACE FUNCTION get_nearby_posts_smart(
  p_lat           DOUBLE PRECISION,
  p_lng           DOUBLE PRECISION,
  p_radius_km     DOUBLE PRECISION DEFAULT 5.0,
  p_lim           INTEGER DEFAULT 20,
  p_user_id       UUID DEFAULT NULL,
  p_cursor_time   TIMESTAMPTZ DEFAULT NULL,
  p_seen_post_ids UUID[] DEFAULT '{}'
)
RETURNS TABLE (
  id                    UUID,
  user_id               UUID,
  content               TEXT,
  image_url             TEXT,
  video_url             TEXT,
  video_thumbnail_url   TEXT,
  is_anonymous          BOOLEAN,
  is_mystery            BOOLEAN,
  city                  TEXT,
  tags                  TEXT[],
  reveal_count          INTEGER,
  view_count            INTEGER,
  reshare_count         INTEGER,
  reshared_from_id      UUID,
  room_id               UUID,
  created_at            TIMESTAMPTZ,
  distance_km           DOUBLE PRECISION,
  total_score           DOUBLE PRECISION,
  reaction_counts       JSONB,
  comment_count         BIGINT,
  user_reaction         TEXT,
  has_revealed          BOOLEAN,
  social_context        TEXT
) AS $$
DECLARE
  viewer_point GEOGRAPHY;
  v_hidden_ids UUID[];
BEGIN
  viewer_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY;

  IF p_user_id IS NOT NULL THEN
    SELECT ARRAY_AGG(ph.post_id) INTO v_hidden_ids
    FROM post_hides ph WHERE ph.user_id = p_user_id;
  END IF;

  RETURN QUERY
  WITH
  nearby AS (
    SELECT p.*,
      ROUND((ST_Distance(p.location, viewer_point) / 1000)::NUMERIC, 2)::DOUBLE PRECISION AS dist_km
    FROM posts p
    WHERE p.is_deleted = FALSE
      AND p.location IS NOT NULL
      AND ST_DWithin(p.location, viewer_point, p_radius_km * 1000)
      AND NOT (p.id = ANY(p_seen_post_ids))
      AND NOT (p.id = ANY(COALESCE(v_hidden_ids, '{}'::UUID[])))
      AND (p_cursor_time IS NULL OR p.created_at < p_cursor_time)
    LIMIT 200
  ),

  social AS (
    SELECT n.id AS post_id,
      CASE
        WHEN p_user_id IS NULL THEN 'stranger'
        WHEN n.user_id = p_user_id THEN 'self'
        WHEN EXISTS(SELECT 1 FROM follows f1 WHERE f1.follower_id = p_user_id AND f1.following_id = n.user_id)
          AND EXISTS(SELECT 1 FROM follows f2 WHERE f2.follower_id = n.user_id AND f2.following_id = p_user_id)
          THEN 'mutual'
        WHEN EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = p_user_id AND f.following_id = n.user_id)
          THEN 'following'
        ELSE 'stranger'
      END AS relationship
    FROM nearby n WHERE NOT n.is_anonymous
  ),

  rxn AS (
    SELECT r.post_id,
      JSONB_BUILD_OBJECT(
        'interesting', COUNT(*) FILTER (WHERE r.type = 'interesting'),
        'funny',       COUNT(*) FILTER (WHERE r.type = 'funny'),
        'deep',        COUNT(*) FILTER (WHERE r.type = 'deep'),
        'curious',     COUNT(*) FILTER (WHERE r.type = 'curious')
      ) AS counts, COUNT(*) AS total
    FROM reactions r WHERE r.post_id IN (SELECT id FROM nearby)
    GROUP BY r.post_id
  ),

  cmt AS (
    SELECT post_id, COUNT(*) AS cnt FROM comments
    WHERE post_id IN (SELECT id FROM nearby) AND is_deleted = FALSE
    GROUP BY post_id
  ),

  my_rxn AS (
    SELECT post_id, type FROM reactions
    WHERE p_user_id IS NOT NULL AND user_id = p_user_id
      AND post_id IN (SELECT id FROM nearby)
  ),

  my_reveal AS (
    SELECT post_id FROM mystery_reveals
    WHERE p_user_id IS NOT NULL AND user_id = p_user_id
      AND post_id IN (SELECT id FROM nearby WHERE is_mystery = TRUE)
  ),

  scored AS (
    SELECT
      n.id, n.user_id, n.content, n.image_url, n.video_url,
      n.video_thumbnail_url, n.is_anonymous, n.is_mystery,
      n.city, n.tags, n.reveal_count, n.view_count,
      COALESCE(n.reshare_count, 0) AS reshare_count,
      n.reshared_from_id, n.room_id, n.created_at, n.dist_km,
      COALESCE(rxn.counts, '{"interesting":0,"funny":0,"deep":0,"curious":0}'::JSONB) AS reaction_counts,
      COALESCE(cmt.cnt, 0) AS comment_count,
      my_rxn.type AS user_reaction,
      (my_reveal.post_id IS NOT NULL) AS has_revealed,
      COALESCE(social.relationship, 'stranger') AS social_context,
      (
        CASE COALESCE(social.relationship, 'stranger')
          WHEN 'self'      THEN 0
          WHEN 'mutual'    THEN 50
          WHEN 'following' THEN 35
          ELSE 0
        END
        +
        LEAST(
          (COALESCE(rxn.total,0)*3 + COALESCE(cmt.cnt,0)*5 + COALESCE(n.reveal_count,0)*4)::FLOAT
          / GREATEST(EXTRACT(EPOCH FROM (NOW()-n.created_at))/3600.0, 0.1)^1.5,
          80.0
        )
        +
        CASE
          WHEN n.dist_km < 0.5 THEN 20 WHEN n.dist_km < 1.0 THEN 15
          WHEN n.dist_km < 3.0 THEN 10 WHEN n.dist_km < 5.0 THEN 5 ELSE 0
        END
        +
        CASE WHEN n.scope = 'nearby' THEN 30 ELSE 0 END
        +
        CASE
          WHEN n.created_at > NOW() - INTERVAL '1 hour'   THEN 15
          WHEN n.created_at > NOW() - INTERVAL '6 hours'  THEN 10
          WHEN n.created_at > NOW() - INTERVAL '24 hours' THEN 5
          ELSE 0
        END
      )::DOUBLE PRECISION AS total_score
    FROM nearby n
    LEFT JOIN social    ON social.post_id   = n.id
    LEFT JOIN rxn       ON rxn.post_id      = n.id
    LEFT JOIN cmt       ON cmt.post_id      = n.id
    LEFT JOIN my_rxn    ON my_rxn.post_id   = n.id
    LEFT JOIN my_reveal ON my_reveal.post_id = n.id
  )

  SELECT
    s.id, s.user_id, s.content, s.image_url, s.video_url,
    s.video_thumbnail_url, s.is_anonymous, s.is_mystery,
    s.city, s.tags, s.reveal_count, s.view_count,
    s.reshare_count, s.reshared_from_id, s.room_id, s.created_at,
    s.dist_km, s.total_score, s.reaction_counts, s.comment_count,
    s.user_reaction, s.has_revealed, s.social_context
  FROM scored s
  ORDER BY s.total_score DESC, s.created_at DESC
  LIMIT p_lim;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
