-- ============================================================
-- CURIOCITY — RECOMMENDATION ENGINE v4 (FACEBOOK-LEVEL)
-- MIGRATION FILE — Run in Supabase SQL Editor AFTER v3
-- Safe to run multiple times (OR REPLACE / IF NOT EXISTS)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. NEW TABLES
-- ────────────────────────────────────────────────────────────

-- 1a. User personas — reader vs poster vs explorer
CREATE TABLE IF NOT EXISTS user_personas (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  persona          TEXT NOT NULL DEFAULT 'explorer',
  -- 'reader'   = mostly consumes, rarely posts
  -- 'poster'   = posts frequently, moderate consumption
  -- 'explorer' = balanced, clicks many different tags
  -- 'social'   = high follow/comment activity
  post_rate        FLOAT DEFAULT 0,   -- posts per week
  comment_rate     FLOAT DEFAULT 0,   -- comments per week
  diversity_score  FLOAT DEFAULT 0,   -- how varied their tag interests are
  session_count    INTEGER DEFAULT 0,
  avg_session_mins FLOAT DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE user_personas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "personas_own" ON user_personas;
CREATE POLICY "personas_own" ON user_personas FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- 1b. Time-of-day interest patterns
-- Tracks what content users engage with at different times
CREATE TABLE IF NOT EXISTS user_time_patterns (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hour_slot   SMALLINT NOT NULL CHECK (hour_slot BETWEEN 0 AND 23),
  dimension   TEXT NOT NULL,  -- same format as user_affinity: 'tag:cricket', 'type:video'
  score       FLOAT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, hour_slot, dimension)
);
CREATE INDEX IF NOT EXISTS idx_time_patterns_user
  ON user_time_patterns(user_id, hour_slot, score DESC);
ALTER TABLE user_time_patterns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "time_patterns_own" ON user_time_patterns;
CREATE POLICY "time_patterns_own" ON user_time_patterns FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- 1c. Network reactions — tracks which posts your followees reacted to
-- This powers "Trending in your network" signal
CREATE TABLE IF NOT EXISTS network_signals (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id      UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  signal_type  TEXT NOT NULL DEFAULT 'friend_reacted',
  -- 'friend_reacted' | 'friend_commented' | 'friend_shared'
  actor_count  INTEGER NOT NULL DEFAULT 1,  -- how many friends did this
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_network_signals_user
  ON network_signals(user_id, updated_at DESC);
ALTER TABLE network_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "network_signals_own" ON network_signals;
CREATE POLICY "network_signals_own" ON network_signals FOR SELECT
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- 1d. Feed quality feedback — "See less like this" vs "See more like this"
CREATE TABLE IF NOT EXISTS feed_feedback (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  feedback    TEXT NOT NULL CHECK (feedback IN ('less', 'more', 'not_interested', 'spam')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_feed_feedback_user ON feed_feedback(user_id);
ALTER TABLE feed_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feedback_own" ON feed_feedback;
CREATE POLICY "feedback_own" ON feed_feedback FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- 2. TIME-OF-DAY AFFINITY UPDATE
-- Called alongside update_user_affinity but also stores hour slot
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_time_pattern(
  p_user_id   UUID,
  p_dimension TEXT,
  p_delta     FLOAT DEFAULT 1.0
) RETURNS void AS $$
DECLARE
  v_hour SMALLINT;
BEGIN
  v_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Kolkata')::SMALLINT;
  INSERT INTO user_time_patterns(user_id, hour_slot, dimension, score, updated_at)
  VALUES (p_user_id, v_hour, p_dimension, p_delta, NOW())
  ON CONFLICT (user_id, hour_slot, dimension) DO UPDATE SET
    score      = user_time_patterns.score + p_delta,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 3. NETWORK SIGNALS UPDATER
-- Run via trigger when reactions/comments happen
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_network_signals_for_post(
  p_actor_id  UUID,
  p_post_id   UUID,
  p_signal    TEXT DEFAULT 'friend_reacted'
) RETURNS void AS $$
BEGIN
  -- Find all followers of the actor and signal to them
  INSERT INTO network_signals(user_id, post_id, signal_type, actor_count, updated_at)
  SELECT
    f.follower_id,
    p_post_id,
    p_signal,
    1,
    NOW()
  FROM follows f
  WHERE f.following_id = p_actor_id
    AND f.follower_id != p_actor_id
  ON CONFLICT (user_id, post_id) DO UPDATE SET
    actor_count = network_signals.actor_count + 1,
    updated_at  = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on reactions
CREATE OR REPLACE FUNCTION trigger_network_signal_reaction()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_network_signals_for_post(NEW.user_id, NEW.post_id, 'friend_reacted');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_network_signal_reaction ON reactions;
CREATE TRIGGER trg_network_signal_reaction
  AFTER INSERT ON reactions
  FOR EACH ROW EXECUTE FUNCTION trigger_network_signal_reaction();

-- Trigger on comments
CREATE OR REPLACE FUNCTION trigger_network_signal_comment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_anonymous = FALSE THEN
    PERFORM update_network_signals_for_post(NEW.user_id, NEW.post_id, 'friend_commented');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_network_signal_comment ON comments;
CREATE TRIGGER trg_network_signal_comment
  AFTER INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION trigger_network_signal_comment();

-- ────────────────────────────────────────────────────────────
-- 4. USER PERSONA UPDATER (run nightly via pg_cron)
-- Schedule: SELECT cron.schedule('update-personas', '0 2 * * *', 'SELECT compute_user_personas()');
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION compute_user_personas()
RETURNS void AS $$
BEGIN
  INSERT INTO user_personas(user_id, persona, post_rate, comment_rate, diversity_score, updated_at)
  SELECT
    u.id,
    CASE
      WHEN COALESCE(posts_7d, 0) >= 5 AND COALESCE(comments_7d, 0) <= 3 THEN 'poster'
      WHEN COALESCE(comments_7d, 0) >= 10 OR COALESCE(follows_7d, 0) >= 5 THEN 'social'
      WHEN COALESCE(tag_diversity, 0) >= 8 THEN 'explorer'
      ELSE 'reader'
    END AS persona,
    COALESCE(posts_7d, 0)::FLOAT / 7.0    AS post_rate,
    COALESCE(comments_7d, 0)::FLOAT / 7.0 AS comment_rate,
    COALESCE(tag_diversity, 0)::FLOAT      AS diversity_score,
    NOW()
  FROM users u
  LEFT JOIN (
    SELECT user_id, COUNT(*) AS posts_7d
    FROM posts WHERE created_at > NOW() - INTERVAL '7 days' AND is_deleted = FALSE
    GROUP BY user_id
  ) p ON p.user_id = u.id
  LEFT JOIN (
    SELECT user_id, COUNT(*) AS comments_7d
    FROM comments WHERE created_at > NOW() - INTERVAL '7 days' AND is_deleted = FALSE
    GROUP BY user_id
  ) c ON c.user_id = u.id
  LEFT JOIN (
    SELECT follower_id AS user_id, COUNT(*) AS follows_7d
    FROM follows WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY follower_id
  ) f ON f.user_id = u.id
  LEFT JOIN (
    SELECT user_id, COUNT(DISTINCT REPLACE(dimension, 'tag:', '')) AS tag_diversity
    FROM user_affinity WHERE dimension LIKE 'tag:%' AND score > 1.0
    GROUP BY user_id
  ) d ON d.user_id = u.id
  ON CONFLICT (user_id) DO UPDATE SET
    persona       = EXCLUDED.persona,
    post_rate     = EXCLUDED.post_rate,
    comment_rate  = EXCLUDED.comment_rate,
    diversity_score = EXCLUDED.diversity_score,
    updated_at    = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 5. FRIENDS FEED WITH RANKING (Facebook-style)
-- Not just chronological — scored by social weight + engagement
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_friends_feed_smart(
  p_user_id       UUID,
  p_lim           INTEGER DEFAULT 20,
  p_cursor_time   TIMESTAMPTZ DEFAULT NULL,
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
  scope               TEXT,
  reveal_count        INTEGER,
  view_count          INTEGER,
  reshare_count       INTEGER,
  reshared_from_id    UUID,
  reshare_comment     TEXT,
  room_id             UUID,
  created_at          TIMESTAMPTZ,
  total_score         DOUBLE PRECISION,
  reaction_counts     JSONB,
  comment_count       BIGINT,
  user_reaction       TEXT,
  has_revealed        BOOLEAN,
  social_context      TEXT,
  network_actor_count INTEGER
) AS $$
DECLARE
  v_mutual_ids    UUID[];
  v_following_ids UUID[];
  v_hidden_ids    UUID[];
BEGIN
  SELECT ARRAY_AGG(f.following_id) INTO v_following_ids
  FROM follows f WHERE f.follower_id = p_user_id;

  IF v_following_ids IS NULL OR array_length(v_following_ids, 1) = 0 THEN
    RETURN;
  END IF;

  SELECT ARRAY_AGG(f1.following_id) INTO v_mutual_ids
  FROM follows f1
  WHERE f1.follower_id = p_user_id
    AND f1.following_id IN (
      SELECT f2.follower_id FROM follows f2 WHERE f2.following_id = p_user_id
    );

  SELECT ARRAY_AGG(ph.post_id) INTO v_hidden_ids
  FROM post_hides ph WHERE ph.user_id = p_user_id;

  RETURN QUERY
  WITH
  friend_posts AS (
    SELECT p.*
    FROM posts p
    WHERE p.is_deleted = FALSE
      AND p.user_id = ANY(v_following_ids)
      AND p.created_at > NOW() - INTERVAL '7 days'
      AND NOT (p.id = ANY(p_seen_post_ids))
      AND NOT (p.id = ANY(COALESCE(v_hidden_ids, '{}'::UUID[])))
      AND (p_cursor_time IS NULL OR p.created_at < p_cursor_time)
    LIMIT 300
  ),

  rxn AS (
    SELECT r.post_id,
      JSONB_BUILD_OBJECT(
        'interesting', COUNT(*) FILTER (WHERE r.type = 'interesting'),
        'funny',       COUNT(*) FILTER (WHERE r.type = 'funny'),
        'deep',        COUNT(*) FILTER (WHERE r.type = 'deep'),
        'curious',     COUNT(*) FILTER (WHERE r.type = 'curious')
      ) AS counts, COUNT(*) AS total
    FROM reactions r WHERE r.post_id IN (SELECT id FROM friend_posts)
    GROUP BY r.post_id
  ),

  cmt AS (
    SELECT post_id, COUNT(*) AS cnt FROM comments
    WHERE post_id IN (SELECT id FROM friend_posts) AND is_deleted = FALSE
    GROUP BY post_id
  ),

  my_rxn AS (
    SELECT post_id, type FROM reactions
    WHERE user_id = p_user_id AND post_id IN (SELECT id FROM friend_posts)
  ),

  my_reveal AS (
    SELECT post_id FROM mystery_reveals
    WHERE user_id = p_user_id
      AND post_id IN (SELECT id FROM friend_posts WHERE is_mystery = TRUE)
  ),

  net_sig AS (
    SELECT post_id, actor_count FROM network_signals
    WHERE user_id = p_user_id
      AND post_id IN (SELECT id FROM friend_posts)
  ),

  affinities AS (
    SELECT dimension, score FROM user_affinity
    WHERE user_id = p_user_id ORDER BY score DESC LIMIT 100
  ),

  -- Time-of-day boost: what does this user read at this hour?
  time_boosts AS (
    SELECT dimension, score FROM user_time_patterns
    WHERE user_id = p_user_id
      AND hour_slot = EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Kolkata')::SMALLINT
    ORDER BY score DESC LIMIT 30
  ),

  scored AS (
    SELECT
      fp.id, fp.user_id, fp.content, fp.image_url, fp.video_url,
      fp.video_thumbnail_url, fp.is_anonymous, fp.is_mystery,
      fp.city, fp.tags, fp.scope, fp.reveal_count, fp.view_count,
      COALESCE(fp.reshare_count, 0) AS reshare_count,
      fp.reshared_from_id, fp.reshare_comment, fp.room_id, fp.created_at,

      COALESCE(rxn.counts, '{"interesting":0,"funny":0,"deep":0,"curious":0}'::JSONB) AS reaction_counts,
      COALESCE(cmt.cnt, 0) AS comment_count,
      my_rxn.type AS user_reaction,
      (my_reveal.post_id IS NOT NULL) AS has_revealed,
      COALESCE(net_sig.actor_count, 0) AS network_actor_count,

      CASE
        WHEN fp.user_id = ANY(COALESCE(v_mutual_ids, '{}'::UUID[])) THEN 'mutual'
        WHEN fp.user_id = ANY(v_following_ids) THEN 'following'
        ELSE 'stranger'
      END AS social_context,

      (
        -- A. SOCIAL WEIGHT: mutuals rank higher
        CASE
          WHEN fp.user_id = ANY(COALESCE(v_mutual_ids, '{}'::UUID[])) THEN 30
          ELSE 15
        END

        +

        -- B. ENGAGEMENT VELOCITY (capped 80)
        LEAST(
          (COALESCE(rxn.total,0)*3 + COALESCE(cmt.cnt,0)*5
           + COALESCE(fp.reveal_count,0)*4 + COALESCE(fp.reshare_count,0)*6)::FLOAT
          / GREATEST(EXTRACT(EPOCH FROM (NOW()-fp.created_at))/3600.0, 0.1)^1.2,
          80.0
        )

        +

        -- C. TAG AFFINITY (weighted per-tag)
        COALESCE((
          SELECT SUM(LEAST(a.score * 2, 8))
          FROM affinities a
          WHERE a.dimension LIKE 'tag:%'
            AND REPLACE(a.dimension, 'tag:', '') = ANY(fp.tags)
          LIMIT 5
        ), 0)

        +

        -- D. TIME-OF-DAY boost: show content this user reads at this hour
        COALESCE((
          SELECT SUM(LEAST(tb.score * 1.5, 6))
          FROM time_boosts tb
          WHERE tb.dimension LIKE 'tag:%'
            AND REPLACE(tb.dimension, 'tag:', '') = ANY(fp.tags)
          LIMIT 3
        ), 0)

        +

        -- E. NETWORK SIGNAL: friends reacted = social proof boost
        LEAST(COALESCE(net_sig.actor_count, 0) * 8, 40)

        +

        -- F. RECENCY (friends feed is more recency-heavy than global)
        CASE
          WHEN fp.created_at > NOW() - INTERVAL '2 hours'  THEN 25
          WHEN fp.created_at > NOW() - INTERVAL '6 hours'  THEN 18
          WHEN fp.created_at > NOW() - INTERVAL '12 hours' THEN 10
          WHEN fp.created_at > NOW() - INTERVAL '24 hours' THEN 5
          ELSE 2
        END

        +

        -- G. CONTENT TYPE (based on user's type affinity)
        COALESCE((
          SELECT a.score * 2 FROM affinities a
          WHERE a.dimension = 'type:mystery' AND fp.is_mystery = TRUE LIMIT 1
        ), 0)
        + CASE WHEN fp.video_url IS NOT NULL THEN 5 ELSE 0 END
        + CASE WHEN fp.image_url IS NOT NULL THEN 3 ELSE 0 END

      )::DOUBLE PRECISION AS total_score

    FROM friend_posts fp
    LEFT JOIN rxn       ON rxn.post_id      = fp.id
    LEFT JOIN cmt       ON cmt.post_id      = fp.id
    LEFT JOIN my_rxn    ON my_rxn.post_id   = fp.id
    LEFT JOIN my_reveal ON my_reveal.post_id = fp.id
    LEFT JOIN net_sig   ON net_sig.post_id  = fp.id
  ),

  ranked AS (
    SELECT *,
      ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY total_score DESC) AS author_rank
    FROM scored
  )

  SELECT
    r.id, r.user_id, r.content, r.image_url, r.video_url,
    r.video_thumbnail_url, r.is_anonymous, r.is_mystery,
    r.city, r.tags, r.scope, r.reveal_count, r.view_count,
    r.reshare_count, r.reshared_from_id, r.reshare_comment, r.room_id, r.created_at,
    r.total_score, r.reaction_counts, r.comment_count,
    r.user_reaction, r.has_revealed, r.social_context, r.network_actor_count
  FROM ranked r
  WHERE r.author_rank <= 3  -- slightly more from friends (3 vs 2 for global)
  ORDER BY r.total_score DESC
  LIMIT p_lim;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 6. UPGRADE get_global_feed_smart — add time-of-day, network signals,
--    user_mutes exclusion, feed_feedback exclusion, persona boost
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_global_feed_smart(
  p_user_id        UUID DEFAULT NULL,
  p_lim            INTEGER DEFAULT 20,
  p_cursor_time    TIMESTAMPTZ DEFAULT NULL,
  p_seen_post_ids  UUID[] DEFAULT '{}',
  p_time_window    INTERVAL DEFAULT '7 days'
)
RETURNS TABLE (
  id UUID, user_id UUID, content TEXT, image_url TEXT, video_url TEXT,
  video_thumbnail_url TEXT, is_anonymous BOOLEAN, is_mystery BOOLEAN,
  is_challenge BOOLEAN, city TEXT, tags TEXT[], scope TEXT,
  reveal_count INTEGER, view_count INTEGER, reshare_count INTEGER,
  reshared_from_id UUID, room_id UUID, created_at TIMESTAMPTZ,
  total_score DOUBLE PRECISION, reaction_counts JSONB,
  comment_count BIGINT, user_reaction TEXT, has_revealed BOOLEAN,
  social_context TEXT, score_breakdown JSONB
) AS $$
DECLARE
  v_following_ids UUID[];
  v_mutual_ids    UUID[];
  v_hidden_ids    UUID[];
  v_muted_ids     UUID[];
  v_feedback_ids  UUID[];
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT ARRAY_AGG(f.following_id) INTO v_following_ids
    FROM follows f WHERE f.follower_id = p_user_id;

    SELECT ARRAY_AGG(f1.following_id) INTO v_mutual_ids
    FROM follows f1 WHERE f1.follower_id = p_user_id
      AND f1.following_id IN (SELECT f2.follower_id FROM follows f2 WHERE f2.following_id = p_user_id);

    SELECT ARRAY_AGG(ph.post_id) INTO v_hidden_ids
    FROM post_hides ph WHERE ph.user_id = p_user_id;

    -- Muted users (see less from them)
    SELECT ARRAY_AGG(um.muted_id) INTO v_muted_ids
    FROM user_mutes um WHERE um.muter_id = p_user_id;

    -- Feed feedback: "not_interested" and "spam" = full exclusion
    SELECT ARRAY_AGG(ff.post_id) INTO v_feedback_ids
    FROM feed_feedback ff
    WHERE ff.user_id = p_user_id AND ff.feedback IN ('not_interested', 'spam');
  END IF;

  RETURN QUERY
  WITH
  base_posts AS (
    SELECT p.*,
      EXISTS(SELECT 1 FROM challenge_posts cp WHERE cp.post_id = p.id) AS is_challenge
    FROM posts p
    WHERE p.is_deleted = FALSE
      AND p.created_at > NOW() - p_time_window
      AND (p.scope = 'global' OR p.scope IS NULL)
      AND NOT (p.id = ANY(p_seen_post_ids))
      AND NOT (p.id = ANY(COALESCE(v_hidden_ids, '{}'::UUID[])))
      AND NOT (p.id = ANY(COALESCE(v_feedback_ids, '{}'::UUID[])))
      AND (
        p.is_anonymous = TRUE OR p.user_id = p_user_id
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
      JSONB_BUILD_OBJECT('interesting', COUNT(*) FILTER(WHERE r.type='interesting'),
        'funny', COUNT(*) FILTER(WHERE r.type='funny'),
        'deep', COUNT(*) FILTER(WHERE r.type='deep'),
        'curious', COUNT(*) FILTER(WHERE r.type='curious')) AS counts,
      COUNT(*) AS total
    FROM reactions r WHERE r.post_id IN (SELECT id FROM base_posts)
    GROUP BY r.post_id
  ),

  cmt AS (
    SELECT post_id,
      COUNT(*) AS cnt,
      AVG(LENGTH(content)) AS avg_len  -- comment quality signal
    FROM comments
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

  my_dwells AS (
    SELECT post_id,
      SUM(CASE WHEN action = 'dwell' THEN 1 ELSE 0 END) AS dwell_count,
      SUM(CASE WHEN action = 'skip'  THEN 1 ELSE 0 END) AS skip_count,
      MAX(dwell_ms) AS max_dwell_ms
    FROM user_interactions
    WHERE p_user_id IS NOT NULL AND user_id = p_user_id
      AND post_id IN (SELECT id FROM base_posts)
      AND created_at > NOW() - INTERVAL '30 days'
    GROUP BY post_id
  ),

  -- Network signals: friends reacted/commented on this post
  net_sig AS (
    SELECT post_id, actor_count FROM network_signals
    WHERE p_user_id IS NOT NULL AND user_id = p_user_id
      AND post_id IN (SELECT id FROM base_posts)
  ),

  -- "See more like this" feedback boosts
  pos_feedback AS (
    SELECT post_id FROM feed_feedback
    WHERE p_user_id IS NOT NULL AND user_id = p_user_id
      AND feedback = 'more'
      AND post_id IN (SELECT id FROM base_posts)
  ),

  affinities AS (
    SELECT dimension, score FROM user_affinity
    WHERE p_user_id IS NOT NULL AND user_id = p_user_id
    ORDER BY score DESC LIMIT 100
  ),

  -- Time-of-day patterns (India time)
  time_boosts AS (
    SELECT dimension, score FROM user_time_patterns
    WHERE p_user_id IS NOT NULL AND user_id = p_user_id
      AND hour_slot = EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Kolkata')::SMALLINT
    ORDER BY score DESC LIMIT 30
  ),

  -- User persona
  persona AS (
    SELECT persona, diversity_score FROM user_personas WHERE user_id = p_user_id
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

        -- B. MUTED USER PENALTY (-30 if muted, still shows but lower)
        CASE WHEN p.user_id = ANY(COALESCE(v_muted_ids, '{}'::UUID[])) THEN -30 ELSE 0 END

        +

        -- C. "See more like this" explicit positive feedback (+25)
        CASE WHEN pos_feedback.post_id IS NOT NULL THEN 25 ELSE 0 END

        +

        -- D. ENGAGEMENT VELOCITY with comment quality signal
        -- Long comments = higher quality discussion → more weight
        LEAST(
          (
            COALESCE(rxn.total, 0) * 3
            + COALESCE(cmt.cnt, 0) * 5
              * LEAST(COALESCE(cmt.avg_len, 20)::FLOAT / 40.0, 2.0)  -- long comments = 2x weight
            + COALESCE(p.reveal_count, 0) * 4
            + COALESCE(p.reshare_count, 0) * 6
            + CASE WHEN p.reshare_comment IS NOT NULL THEN 5 ELSE 0 END  -- thoughtful reshare
          )::FLOAT
          / GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0, 0.1) ^ 1.5,
          80.0
        )

        +

        -- E. TAG AFFINITY (weighted per-tag)
        COALESCE((
          SELECT SUM(LEAST(a.score * 2, 8))
          FROM affinities a
          WHERE a.dimension LIKE 'tag:%'
            AND REPLACE(a.dimension, 'tag:', '') = ANY(p.tags)
          LIMIT 5
        ), 0)

        +

        -- F. TIME-OF-DAY boost (what does this user read at THIS hour?)
        -- e.g. user reads cricket news at 8am, funny content at 10pm
        COALESCE((
          SELECT SUM(LEAST(tb.score * 1.5, 8))
          FROM time_boosts tb
          WHERE tb.dimension LIKE 'tag:%'
            AND REPLACE(tb.dimension, 'tag:', '') = ANY(p.tags)
          LIMIT 3
        ), 0)

        +

        -- G. NETWORK SOCIAL PROOF (friends reacted = strong signal)
        -- "If your friends react to something, you're more likely to too"
        LEAST(COALESCE(net_sig.actor_count, 0) * 10, 50)

        +

        -- H. AUTHOR AFFINITY (0-20)
        COALESCE((
          SELECT LEAST(a.score * 5, 20)
          FROM affinities a WHERE a.dimension = 'author:' || p.user_id::text
        ), 0)

        +

        -- I. DWELL SIGNAL (with depth bonus for 10s+ reads)
        COALESCE((
          SELECT
            dwell_count * 3 - skip_count * 2
            + CASE WHEN max_dwell_ms > 10000 THEN 5 ELSE 0 END
          FROM my_dwells WHERE post_id = p.id
        ), 0)

        +

        -- J. PERSONA BOOST: readers get longer posts, explorers get diverse tags
        CASE
          WHEN (SELECT persona FROM persona LIMIT 1) = 'reader'
            AND LENGTH(COALESCE(p.content, '')) > 200 THEN 8
          WHEN (SELECT persona FROM persona LIMIT 1) = 'explorer'
            AND array_length(p.tags, 1) >= 3 THEN 6
          WHEN (SELECT persona FROM persona LIMIT 1) = 'social'
            AND COALESCE(cmt.cnt, 0) >= 5 THEN 8
          ELSE 0
        END

        +

        -- K. CONTENT TYPE BONUS
        CASE WHEN p.is_mystery = TRUE    THEN 12 ELSE 0 END
        + CASE WHEN p.is_challenge = TRUE THEN 10 ELSE 0 END
        + CASE WHEN p.image_url IS NOT NULL THEN 5 ELSE 0 END
        + CASE WHEN p.video_url IS NOT NULL THEN 8 ELSE 0 END

        +

        -- L. RECENCY (0-20)
        CASE
          WHEN p.created_at > NOW() - INTERVAL '1 hour'   THEN 20
          WHEN p.created_at > NOW() - INTERVAL '3 hours'  THEN 15
          WHEN p.created_at > NOW() - INTERVAL '12 hours' THEN 10
          WHEN p.created_at > NOW() - INTERVAL '24 hours' THEN 5
          WHEN p.created_at > NOW() - INTERVAL '48 hours' THEN 2
          ELSE 0
        END

        +

        -- M. VIRALITY (0-20)
        CASE
          WHEN COALESCE(p.reshare_count, 0) >= 50 THEN 20
          WHEN COALESCE(p.reshare_count, 0) >= 20 THEN 15
          WHEN COALESCE(p.reshare_count, 0) >= 10 THEN 10
          WHEN COALESCE(p.reshare_count, 0) >= 5  THEN 5
          ELSE 0
        END

        +

        -- N. MYSTERY REVEAL MOMENTUM (0-15)
        CASE
          WHEN p.is_mystery AND p.view_count > 0
            AND (p.reveal_count::FLOAT / GREATEST(p.view_count, 1)) > 0.3 THEN 15
          WHEN p.is_mystery AND COALESCE(p.reveal_count, 0) > 50 THEN 10
          ELSE 0
        END

        +

        -- O. COLD START (new/anonymous users see popular content)
        CASE
          WHEN p_user_id IS NULL THEN
            CASE WHEN COALESCE(rxn.total, 0) + COALESCE(cmt.cnt::INT, 0) > 50 THEN 25
                 WHEN COALESCE(rxn.total, 0) + COALESCE(cmt.cnt::INT, 0) > 20 THEN 15
                 ELSE 0 END
          ELSE 0
        END

      )::DOUBLE PRECISION AS total_score,

      JSONB_BUILD_OBJECT(
        'social', CASE WHEN p.user_id = ANY(COALESCE(v_mutual_ids,'{}')) THEN 60
          WHEN p.user_id = ANY(COALESCE(v_following_ids,'{}')) THEN 40 ELSE 0 END,
        'network_proof', COALESCE(net_sig.actor_count, 0),
        'engagement', ROUND(LEAST((COALESCE(rxn.total,0)*3+COALESCE(cmt.cnt,0)*5)::FLOAT
          /GREATEST(EXTRACT(EPOCH FROM(NOW()-p.created_at))/3600.0,0.1)^1.5,80.0)::NUMERIC,1),
        'affinity', COALESCE((SELECT ROUND(SUM(LEAST(a.score*2,8))::NUMERIC,1) FROM affinities a
          WHERE a.dimension LIKE 'tag:%' AND REPLACE(a.dimension,'tag:','')=ANY(p.tags)),0),
        'time_boost', COALESCE((SELECT ROUND(SUM(LEAST(tb.score*1.5,8))::NUMERIC,1) FROM time_boosts tb
          WHERE tb.dimension LIKE 'tag:%' AND REPLACE(tb.dimension,'tag:','')=ANY(p.tags)),0),
        'age_hours', ROUND((EXTRACT(EPOCH FROM(NOW()-p.created_at))/3600.0)::NUMERIC,1)
      ) AS score_breakdown

    FROM base_posts p
    LEFT JOIN rxn        ON rxn.post_id      = p.id
    LEFT JOIN cmt        ON cmt.post_id      = p.id
    LEFT JOIN my_rxn     ON my_rxn.post_id   = p.id
    LEFT JOIN my_reveal  ON my_reveal.post_id = p.id
    LEFT JOIN my_dwells  ON my_dwells.post_id = p.id
    LEFT JOIN net_sig    ON net_sig.post_id   = p.id
    LEFT JOIN pos_feedback ON pos_feedback.post_id = p.id
  ),

  ranked AS (
    SELECT *,
      ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY total_score DESC) AS author_rank
    FROM scored
  )

  SELECT r.id, r.user_id, r.content, r.image_url, r.video_url,
    r.video_thumbnail_url, r.is_anonymous, r.is_mystery, r.is_challenge,
    r.city, r.tags, r.scope, r.reveal_count, r.view_count,
    r.reshare_count, r.reshared_from_id, r.room_id, r.created_at,
    r.total_score, r.reaction_counts, r.comment_count,
    r.user_reaction, r.has_revealed, r.social_context, r.score_breakdown
  FROM ranked r WHERE r.author_rank <= 2
  ORDER BY r.total_score DESC LIMIT p_lim;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 7. FEED FEEDBACK API FUNCTION
-- "See more / less like this" explicit user feedback
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION process_feed_feedback(
  p_user_id  UUID,
  p_post_id  UUID,
  p_feedback TEXT  -- 'less' | 'more' | 'not_interested' | 'spam'
) RETURNS void AS $$
DECLARE
  v_post RECORD;
  v_weight FLOAT;
BEGIN
  INSERT INTO feed_feedback(user_id, post_id, feedback)
  VALUES (p_user_id, p_post_id, p_feedback)
  ON CONFLICT (user_id, post_id) DO UPDATE SET feedback = EXCLUDED.feedback;

  SELECT user_id, tags, is_anonymous, is_mystery INTO v_post
  FROM posts WHERE id = p_post_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- Map feedback to affinity delta
  v_weight := CASE p_feedback
    WHEN 'more'           THEN  3.0
    WHEN 'less'           THEN -2.0
    WHEN 'not_interested' THEN -5.0
    WHEN 'spam'           THEN -8.0
    ELSE 0
  END;

  IF v_weight = 0 THEN RETURN; END IF;

  -- Update tag affinities
  IF v_post.tags IS NOT NULL THEN
    FOR i IN 1..array_length(v_post.tags, 1) LOOP
      PERFORM update_user_affinity(p_user_id, 'tag:' || v_post.tags[i], v_weight);
    END LOOP;
  END IF;

  -- Update author affinity
  IF v_post.user_id IS NOT NULL AND NOT v_post.is_anonymous THEN
    PERFORM update_user_affinity(p_user_id, 'author:' || v_post.user_id::text, v_weight);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 8. INDEXES for performance
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_network_signals_post ON network_signals(post_id);
CREATE INDEX IF NOT EXISTS idx_time_patterns_user_hour ON user_time_patterns(user_id, hour_slot);
CREATE INDEX IF NOT EXISTS idx_feed_feedback_user_post ON feed_feedback(user_id, post_id);
CREATE INDEX IF NOT EXISTS idx_user_personas_persona ON user_personas(persona);

-- ────────────────────────────────────────────────────────────
-- 9. pg_cron SCHEDULES (run once in SQL editor)
-- ────────────────────────────────────────────────────────────
-- SELECT cron.schedule('update-personas',     '0 2 * * *',   'SELECT compute_user_personas()');
-- SELECT cron.schedule('decay-affinities',    '0 3 * * *',   'SELECT decay_user_affinities()');
-- SELECT cron.schedule('follow-suggestions',  '0 * * * *',   'SELECT compute_follow_suggestions()');
-- SELECT cron.schedule('cleanup-network-sig', '0 4 * * 0',   'DELETE FROM network_signals WHERE updated_at < NOW() - INTERVAL ''30 days''');
-- SELECT cron.schedule('cleanup-interactions','0 4 * * 0',   'DELETE FROM user_interactions WHERE created_at < NOW() - INTERVAL ''90 days''');

-- ============================================================
-- END OF MIGRATION v4
-- ============================================================
