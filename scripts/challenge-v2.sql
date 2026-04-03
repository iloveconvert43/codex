-- ============================================================
-- CHALLENGE SYSTEM v2 — ENGAGEMENT UPGRADES
-- Run in Supabase SQL Editor (safe, IF NOT EXISTS / OR REPLACE)
-- ============================================================

-- ── 1. Add participant_count to daily_challenges (was missing) ──
ALTER TABLE daily_challenges
  ADD COLUMN IF NOT EXISTS participant_count INTEGER NOT NULL DEFAULT 0;

-- ── 2. Add score/trending column to user_challenges ──
ALTER TABLE user_challenges
  ADD COLUMN IF NOT EXISTS hot_score FLOAT NOT NULL DEFAULT 0;

-- ── 3. Challenge responses expire after 12 hours from feed
-- (post still exists, just won't show in challenge feed after 12h)
-- We track this via challenge_posts.is_featured flag
ALTER TABLE challenge_posts
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE user_challenge_posts
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT TRUE;

-- ── 4. Like/react count on challenge posts for leaderboard ──
-- Already exists via reactions table — just need SQL function

-- ── 5. Challenge leaderboard — top responders per challenge ──
CREATE OR REPLACE FUNCTION get_challenge_leaderboard(
  p_challenge_id UUID,
  p_type         TEXT DEFAULT 'admin',  -- 'admin' | 'user'
  p_limit        INTEGER DEFAULT 5
)
RETURNS TABLE(
  user_id      UUID,
  post_id      UUID,
  username     TEXT,
  display_name TEXT,
  avatar_url   TEXT,
  reaction_total BIGINT,
  comment_total  BIGINT,
  score          FLOAT,
  created_at   TIMESTAMPTZ
) AS $$
BEGIN
  IF p_type = 'user' THEN
    RETURN QUERY
    SELECT
      p.user_id,
      p.id AS post_id,
      u.username,
      u.display_name,
      u.avatar_url,
      COALESCE(rxn.total, 0) AS reaction_total,
      COALESCE(cmt.cnt, 0)   AS comment_total,
      (COALESCE(rxn.total, 0) * 3 + COALESCE(cmt.cnt, 0) * 5)::FLOAT AS score,
      p.created_at
    FROM user_challenge_posts ucp
    JOIN posts p ON p.id = ucp.post_id AND p.is_deleted = FALSE AND NOT p.is_anonymous
    JOIN users u ON u.id = p.user_id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS total FROM reactions WHERE post_id IN (
        SELECT post_id FROM user_challenge_posts WHERE user_challenge_id = p_challenge_id
      ) GROUP BY post_id
    ) rxn ON rxn.post_id = p.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS cnt FROM comments WHERE is_deleted = FALSE AND post_id IN (
        SELECT post_id FROM user_challenge_posts WHERE user_challenge_id = p_challenge_id
      ) GROUP BY post_id
    ) cmt ON cmt.post_id = p.id
    WHERE ucp.user_challenge_id = p_challenge_id
    ORDER BY score DESC
    LIMIT p_limit;
  ELSE
    RETURN QUERY
    SELECT
      p.user_id,
      p.id AS post_id,
      u.username,
      u.display_name,
      u.avatar_url,
      COALESCE(rxn.total, 0) AS reaction_total,
      COALESCE(cmt.cnt, 0)   AS comment_total,
      (COALESCE(rxn.total, 0) * 3 + COALESCE(cmt.cnt, 0) * 5)::FLOAT AS score,
      p.created_at
    FROM challenge_posts cp
    JOIN posts p ON p.id = cp.post_id AND p.is_deleted = FALSE AND NOT p.is_anonymous
    JOIN users u ON u.id = p.user_id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS total FROM reactions WHERE post_id IN (
        SELECT post_id FROM challenge_posts WHERE challenge_id = p_challenge_id
      ) GROUP BY post_id
    ) rxn ON rxn.post_id = p.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS cnt FROM comments WHERE is_deleted = FALSE AND post_id IN (
        SELECT post_id FROM challenge_posts WHERE challenge_id = p_challenge_id
      ) GROUP BY post_id
    ) cmt ON cmt.post_id = p.id
    WHERE cp.challenge_id = p_challenge_id
    ORDER BY score DESC
    LIMIT p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ── 6. Hot score updater for community challenges ──
-- Score = (participant_count * 2 + reactions) / age_hours^1.3
-- Run via trigger when someone participates
CREATE OR REPLACE FUNCTION update_challenge_hot_score(p_challenge_id UUID)
RETURNS void AS $$
DECLARE
  v_age_hours FLOAT;
  v_parts INTEGER;
  v_score FLOAT;
BEGIN
  SELECT
    GREATEST(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0, 0.1),
    participant_count
  INTO v_age_hours, v_parts
  FROM user_challenges WHERE id = p_challenge_id;

  v_score := (v_parts * 2.0) / POWER(v_age_hours, 1.3);

  UPDATE user_challenges SET hot_score = v_score WHERE id = p_challenge_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: update hot_score after each participation
CREATE OR REPLACE FUNCTION trg_update_challenge_score()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_challenge_hot_score(NEW.user_challenge_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_challenge_hot_score ON user_challenge_posts;
CREATE TRIGGER trg_challenge_hot_score
  AFTER INSERT ON user_challenge_posts
  FOR EACH ROW EXECUTE FUNCTION trg_update_challenge_score();

-- ── 7. Challenge streak function (server-side) ──
CREATE OR REPLACE FUNCTION get_challenge_streak(p_user_id UUID)
RETURNS TABLE(streak INTEGER, longest_streak INTEGER, total_days BIGINT) AS $$
DECLARE
  v_streak INTEGER := 0;
  v_longest INTEGER := 0;
  v_current INTEGER := 0;
  v_prev_date DATE := NULL;
  v_cur_date DATE;
BEGIN
  -- Get all unique participation dates, newest first
  FOR v_cur_date IN (
    SELECT DISTINCT DATE(created_at) AS d
    FROM (
      SELECT created_at FROM challenge_posts WHERE user_id = p_user_id
      UNION ALL
      SELECT created_at FROM user_challenge_posts WHERE user_id = p_user_id
    ) combined
    ORDER BY d DESC
  ) LOOP
    IF v_prev_date IS NULL THEN
      -- First date
      v_current := 1;
    ELSIF v_prev_date - v_cur_date = 1 THEN
      -- Consecutive
      v_current := v_current + 1;
    ELSE
      -- Gap — reset current streak
      IF v_current > v_longest THEN v_longest := v_current; END IF;
      v_current := 1;
    END IF;
    v_prev_date := v_cur_date;
  END LOOP;

  IF v_current > v_longest THEN v_longest := v_current; END IF;

  -- Active streak = current only if participated today or yesterday
  IF v_prev_date >= CURRENT_DATE - 1 THEN
    v_streak := v_current;
  ELSE
    v_streak := 0;
  END IF;

  RETURN QUERY
  SELECT
    v_streak,
    v_longest,
    (SELECT COUNT(DISTINCT DATE(created_at)) FROM (
      SELECT created_at FROM challenge_posts WHERE user_id = p_user_id
      UNION ALL
      SELECT created_at FROM user_challenge_posts WHERE user_id = p_user_id
    ) c)::BIGINT;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ── 8. Mark challenge_posts as non-featured after 12 hours ──
-- Run via pg_cron every hour:
-- SELECT cron.schedule('expire-challenge-posts', '0 * * * *', 'SELECT expire_old_challenge_posts()');
CREATE OR REPLACE FUNCTION expire_old_challenge_posts()
RETURNS void AS $$
BEGIN
  -- Admin challenge posts: 12h window
  UPDATE challenge_posts SET is_featured = FALSE
  WHERE is_featured = TRUE
    AND created_at < NOW() - INTERVAL '12 hours';

  -- Community challenge posts: expire with their challenge
  UPDATE user_challenge_posts SET is_featured = FALSE
  WHERE is_featured = TRUE
    AND created_at < NOW() - INTERVAL '12 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 9. Indexes ──
CREATE INDEX IF NOT EXISTS idx_challenge_posts_featured
  ON challenge_posts(challenge_id, is_featured, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ucp_featured
  ON user_challenge_posts(user_challenge_id, is_featured, created_at DESC);
-- Index without WHERE clause (NOW() not allowed in index predicate)
CREATE INDEX IF NOT EXISTS idx_user_challenges_hot
  ON user_challenges(hot_score DESC);
CREATE INDEX IF NOT EXISTS idx_daily_challenges_date_slot
  ON daily_challenges(challenge_date, time_slot);

-- ── pg_cron (run once) ──
-- SELECT cron.schedule('expire-challenge-posts', '0 * * * *', 'SELECT expire_old_challenge_posts()');
-- SELECT cron.schedule('update-challenge-scores', '*/15 * * * *', 'UPDATE user_challenges SET hot_score = (participant_count * 2.0) / POWER(GREATEST(EXTRACT(EPOCH FROM (NOW() - created_at))/3600.0, 0.1), 1.3) WHERE expires_at > NOW()');

-- ============================================================
-- END challenge-v2.sql
-- ============================================================
