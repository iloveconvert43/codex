-- ============================================================
-- CURIOCITY — RECOMMENDATION ENGINE (COMPLETE)
-- Combines v3 + v4 into one file
-- Run this ONCE in Supabase SQL Editor
-- Safe to run multiple times (IF NOT EXISTS / OR REPLACE)
-- Does NOT touch your existing schema.sql data
-- ============================================================

-- ============================================================
-- CURIOCITY — RECOMMENDATION ENGINE v3
-- MIGRATION FILE — Run this in Supabase SQL Editor
-- ============================================================
-- This is a STANDALONE migration. Safe to run on existing DB.
-- All statements use IF NOT EXISTS / OR REPLACE — no data loss.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. NEW TABLES
-- ────────────────────────────────────────────────────────────

-- 1a. post_hides — user explicitly hides a post → never show again
CREATE TABLE IF NOT EXISTS post_hides (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_post_hides_user ON post_hides(user_id);
ALTER TABLE post_hides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hides_own" ON post_hides;
CREATE POLICY "hides_own" ON post_hides FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- 1b. follow_suggestions — precomputed "people you may know"
CREATE TABLE IF NOT EXISTS follow_suggestions (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  suggested_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason        TEXT NOT NULL DEFAULT 'mutual_follow',
  -- reason: 'mutual_follow' | 'same_city' | 'same_tags' | 'popular'
  score         FLOAT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, suggested_id)
);
CREATE INDEX IF NOT EXISTS idx_follow_suggestions_user
  ON follow_suggestions(user_id, score DESC);
ALTER TABLE follow_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suggestions_own" ON follow_suggestions;
CREATE POLICY "suggestions_own" ON follow_suggestions FOR SELECT
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- 1c. onboarding_interests — user picks topics on signup → seeds affinity cold start
CREATE TABLE IF NOT EXISTS onboarding_interests (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag        TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tag)
);
ALTER TABLE onboarding_interests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "onboarding_own" ON onboarding_interests;
CREATE POLICY "onboarding_own" ON onboarding_interests FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ────────────────────────────────────────────────────────────
-- 2. COLD START FIX
-- Seed user_affinity from onboarding picks
-- Called right after user selects interests during signup
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seed_affinity_from_onboarding(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_tag TEXT;
BEGIN
  FOR v_tag IN
    SELECT tag FROM onboarding_interests WHERE user_id = p_user_id
  LOOP
    INSERT INTO user_affinity(user_id, dimension, score, interactions, last_interacted)
    VALUES (p_user_id, 'tag:' || v_tag, 5.0, 1, NOW())
    ON CONFLICT (user_id, dimension) DO UPDATE SET
      score        = GREATEST(user_affinity.score, 5.0),
      last_interacted = NOW();
  END LOOP;

  -- Also seed user_tag_interests for city feed compat
  INSERT INTO user_tag_interests(user_id, tag, score)
  SELECT p_user_id, tag, 5
  FROM onboarding_interests WHERE user_id = p_user_id
  ON CONFLICT (user_id, tag) DO UPDATE SET score = GREATEST(user_tag_interests.score, 5);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 3. AFFINITY DECAY (run via pg_cron daily at 3am)
-- Schedule: SELECT cron.schedule('decay-affinities', '0 3 * * *', 'SELECT decay_user_affinities()');
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION decay_user_affinities()
RETURNS void AS $$
BEGIN
  -- 5% daily decay for affinities not interacted with in 7 days
  UPDATE user_affinity
  SET
    score        = GREATEST(score * 0.95, 0),
    decay_weight = GREATEST(decay_weight * 0.95, 0.1)
  WHERE last_interacted < NOW() - INTERVAL '7 days'
    AND score > 0.1;

  -- Remove dead affinities (score < 0.05 and inactive 30+ days)
  DELETE FROM user_affinity
  WHERE score < 0.05 AND last_interacted < NOW() - INTERVAL '30 days';

  -- Decay user_tag_interests too
  UPDATE user_tag_interests
  SET score = GREATEST(score * 0.95, 0)
  WHERE updated_at < NOW() - INTERVAL '7 days' AND score > 0.1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 4. FOLLOW SUGGESTIONS ENGINE
-- Computes "people you may know" — run via pg_cron hourly
-- Schedule: SELECT cron.schedule('follow-suggestions', '0 * * * *', 'SELECT compute_follow_suggestions()');
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION compute_follow_suggestions()
RETURNS void AS $$
BEGIN
  -- Clear old suggestions
  DELETE FROM follow_suggestions WHERE created_at < NOW() - INTERVAL '2 hours';

  -- Mutual follows: A follows B, B follows C → suggest C to A
  INSERT INTO follow_suggestions (user_id, suggested_id, reason, score)
  SELECT DISTINCT
    f1.follower_id   AS user_id,
    f2.following_id  AS suggested_id,
    'mutual_follow'  AS reason,
    COUNT(*) * 10    AS score
  FROM follows f1
  JOIN follows f2 ON f1.following_id = f2.follower_id
  WHERE f2.following_id != f1.follower_id
    AND NOT EXISTS (
      SELECT 1 FROM follows f3
      WHERE f3.follower_id = f1.follower_id
        AND f3.following_id = f2.following_id
    )
  GROUP BY f1.follower_id, f2.following_id
  HAVING COUNT(*) >= 2
  ON CONFLICT (user_id, suggested_id) DO UPDATE SET
    score = EXCLUDED.score, created_at = NOW();

  -- Same city users with high engagement
  INSERT INTO follow_suggestions (user_id, suggested_id, reason, score)
  SELECT
    u1.id  AS user_id,
    u2.id  AS suggested_id,
    'same_city' AS reason,
    5      AS score
  FROM users u1
  JOIN users u2 ON LOWER(u1.city) = LOWER(u2.city)
    AND u1.id != u2.id
    AND u2.is_private = FALSE
    AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = u1.id AND f.following_id = u2.id)
  WHERE u1.city IS NOT NULL
  LIMIT 10000
  ON CONFLICT (user_id, suggested_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 5. PERSONALIZED TRENDING TAGS
-- Returns trending tags weighted by user's own affinity
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_trending_tags_personalized(
  p_user_id UUID DEFAULT NULL,
  p_limit   INTEGER DEFAULT 10
)
RETURNS TABLE(tag TEXT, post_count BIGINT, affinity_score FLOAT, is_interested BOOLEAN) AS $$
BEGIN
  RETURN QUERY
  WITH
  raw_tags AS (
    SELECT unnest(p.tags) AS tag
    FROM posts p
    WHERE p.is_deleted = FALSE
      AND p.created_at > NOW() - INTERVAL '7 days'
      AND (p.scope = 'global' OR p.scope IS NULL)
  ),
  counted AS (
    SELECT tag, COUNT(*) AS cnt FROM raw_tags GROUP BY tag
  ),
  user_scores AS (
    SELECT
      REPLACE(dimension, 'tag:', '') AS tag,
      score
    FROM user_affinity
    WHERE p_user_id IS NOT NULL
      AND user_id = p_user_id
      AND dimension LIKE 'tag:%'
  )
  SELECT
    c.tag,
    c.cnt                               AS post_count,
    COALESCE(us.score, 0)              AS affinity_score,
    COALESCE(us.score, 0) > 0         AS is_interested
  FROM counted c
  LEFT JOIN user_scores us ON us.tag = c.tag
  ORDER BY
    -- Personalized: blend trending + personal interest
    (c.cnt * 1.0 + COALESCE(us.score, 0) * 3.0) DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 6. UPGRADED get_global_feed_smart v3
-- New vs v2: dwell signal in scoring, p_time_window param,
-- hidden posts excluded, better diversity (3 signals combined)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_global_feed_smart(
  p_user_id        UUID DEFAULT NULL,
  p_lim            INTEGER DEFAULT 20,
  p_cursor_time    TIMESTAMPTZ DEFAULT NULL,
  p_seen_post_ids  UUID[] DEFAULT '{}',
  p_time_window    INTERVAL DEFAULT '7 days'
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
    SELECT ARRAY_AGG(f.following_id) INTO v_following_ids
    FROM follows f WHERE f.follower_id = p_user_id;

    SELECT ARRAY_AGG(f1.following_id) INTO v_mutual_ids
    FROM follows f1
    WHERE f1.follower_id = p_user_id
      AND f1.following_id IN (
        SELECT f2.follower_id FROM follows f2 WHERE f2.following_id = p_user_id
      );

    SELECT ARRAY_AGG(ph.post_id) INTO v_hidden_ids
    FROM post_hides ph WHERE ph.user_id = p_user_id;
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
      ) AS counts, COUNT(*) AS total
    FROM reactions r WHERE r.post_id IN (SELECT id FROM base_posts)
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

  -- Dwell signals from this user's interaction history (last 30 days)
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
        -- A. SOCIAL GRAPH (0-60 pts)
        CASE
          WHEN p.user_id = p_user_id THEN 0
          WHEN p.user_id = ANY(COALESCE(v_mutual_ids, '{}'::UUID[])) THEN 60
          WHEN p.user_id = ANY(COALESCE(v_following_ids, '{}'::UUID[])) THEN 40
          ELSE 0
        END

        +

        -- B. ENGAGEMENT VELOCITY (0-80 pts)
        -- reshares weighted highest (6x) — strongest signal of quality
        LEAST(
          (
            COALESCE(rxn.total, 0) * 3
            + COALESCE(cmt.cnt, 0) * 5
            + COALESCE(p.reveal_count, 0) * 4
            + COALESCE(p.reshare_count, 0) * 6
          )::FLOAT
          / GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0, 0.1) ^ 1.5,
          80.0
        )

        +

        -- C. TAG AFFINITY (0-40 pts) — weighted per-tag with score
        COALESCE((
          SELECT SUM(LEAST(a.score * 2, 8))
          FROM affinities a
          WHERE a.dimension LIKE 'tag:%'
            AND REPLACE(a.dimension, 'tag:', '') = ANY(p.tags)
          LIMIT 5
        ), 0)

        +

        -- D. AUTHOR AFFINITY (0-20 pts)
        COALESCE((
          SELECT LEAST(a.score * 5, 20)
          FROM affinities a
          WHERE a.dimension = 'author:' || p.user_id::text
        ), 0)

        +

        -- E. DWELL/SKIP SIGNAL (variable, +/-)
        -- Posts from same author/tags where user dwelled = positive
        -- Posts user previously skipped = negative
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

        -- G. RECENCY BONUS (0-20 pts)
        CASE
          WHEN p.created_at > NOW() - INTERVAL '1 hour'   THEN 20
          WHEN p.created_at > NOW() - INTERVAL '3 hours'  THEN 15
          WHEN p.created_at > NOW() - INTERVAL '12 hours' THEN 10
          WHEN p.created_at > NOW() - INTERVAL '24 hours' THEN 5
          WHEN p.created_at > NOW() - INTERVAL '48 hours' THEN 2
          ELSE 0
        END

        +

        -- H. VIRALITY (0-20 pts)
        CASE
          WHEN COALESCE(p.reshare_count, 0) >= 50 THEN 20
          WHEN COALESCE(p.reshare_count, 0) >= 20 THEN 15
          WHEN COALESCE(p.reshare_count, 0) >= 10 THEN 10
          WHEN COALESCE(p.reshare_count, 0) >= 5  THEN 5
          ELSE 0
        END

        +

        -- I. MYSTERY REVEAL MOMENTUM (0-15 pts)
        CASE
          WHEN p.is_mystery AND p.view_count > 0
            AND (p.reveal_count::FLOAT / GREATEST(p.view_count, 1)) > 0.3 THEN 15
          WHEN p.is_mystery AND COALESCE(p.reveal_count, 0) > 50 THEN 10
          ELSE 0
        END

        +

        -- J. COLD START BOOST (0-25 pts)
        -- New users (no affinity data) → boost popular + recent content
        -- This ensures new users see good content immediately
        CASE
          WHEN p_user_id IS NULL THEN
            CASE WHEN COALESCE(rxn.total, 0) + COALESCE(cmt.cnt::INT, 0) > 50 THEN 25
                 WHEN COALESCE(rxn.total, 0) + COALESCE(cmt.cnt::INT, 0) > 20 THEN 15
                 ELSE 0 END
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
        'affinity', COALESCE((
          SELECT ROUND(SUM(LEAST(a.score * 2, 8))::NUMERIC, 1)
          FROM affinities a
          WHERE a.dimension LIKE 'tag:%' AND REPLACE(a.dimension, 'tag:', '') = ANY(p.tags)
        ), 0),
        'age_hours', ROUND((EXTRACT(EPOCH FROM (NOW()-p.created_at))/3600.0)::NUMERIC, 1)
      ) AS score_breakdown

    FROM base_posts p
    LEFT JOIN rxn       ON rxn.post_id      = p.id
    LEFT JOIN cmt       ON cmt.post_id      = p.id
    LEFT JOIN my_rxn    ON my_rxn.post_id   = p.id
    LEFT JOIN my_reveal ON my_reveal.post_id = p.id
    LEFT JOIN my_dwells ON my_dwells.post_id = p.id
  ),

  -- Diversity: max 2 posts per author, but also ensure variety in content types
  ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY user_id  ORDER BY total_score DESC) AS author_rank
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

-- ────────────────────────────────────────────────────────────
-- 7. UPGRADED get_city_feed_smart v3
-- New: seen exclusion, hidden exclusion, weighted tag affinity
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_city_feed_smart(
  p_city          TEXT,
  p_user_id       UUID DEFAULT NULL,
  p_lim           INTEGER DEFAULT 20,
  p_cursor_time   TIMESTAMPTZ DEFAULT NULL,
  p_user_tags     TEXT[] DEFAULT '{}',
  p_seen_post_ids UUID[] DEFAULT '{}'
)
RETURNS TABLE (
  id                  UUID, user_id UUID, content TEXT,
  image_url           TEXT, video_url TEXT, video_thumbnail_url TEXT,
  is_anonymous        BOOLEAN, is_mystery BOOLEAN,
  city                TEXT, tags TEXT[], reveal_count INTEGER,
  view_count          INTEGER, reshare_count INTEGER,
  reshared_from_id    UUID, room_id UUID, created_at TIMESTAMPTZ,
  total_score         DOUBLE PRECISION, reaction_counts JSONB,
  comment_count       BIGINT, user_reaction TEXT,
  has_revealed        BOOLEAN, area_label TEXT
) AS $$
DECLARE v_hidden_ids UUID[];
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
        OR LOWER(p.city) IN (SELECT LOWER(ca.area) FROM city_areas ca WHERE LOWER(ca.city) = LOWER(p_city))
        OR LOWER(p.city) IN (SELECT LOWER(unnest(ca.aliases)) FROM city_areas ca WHERE LOWER(ca.city) = LOWER(p_city))
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
        WHEN EXISTS(SELECT 1 FROM follows f1 WHERE f1.follower_id=p_user_id AND f1.following_id=cp.user_id)
          AND EXISTS(SELECT 1 FROM follows f2 WHERE f2.follower_id=cp.user_id AND f2.following_id=p_user_id)
          THEN 'mutual'
        WHEN EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=p_user_id AND f.following_id=cp.user_id)
          THEN 'following'
        ELSE 'stranger'
      END AS relationship
    FROM city_posts cp WHERE NOT cp.is_anonymous
  ),
  rxn AS (
    SELECT r.post_id,
      JSONB_BUILD_OBJECT('interesting',COUNT(*) FILTER(WHERE r.type='interesting'),
        'funny',COUNT(*) FILTER(WHERE r.type='funny'),
        'deep',COUNT(*) FILTER(WHERE r.type='deep'),
        'curious',COUNT(*) FILTER(WHERE r.type='curious')) AS counts, COUNT(*) AS total
    FROM reactions r WHERE r.post_id IN (SELECT id FROM city_posts) GROUP BY r.post_id
  ),
  cmt AS (
    SELECT post_id, COUNT(*) AS cnt FROM comments
    WHERE post_id IN (SELECT id FROM city_posts) AND is_deleted=FALSE GROUP BY post_id
  ),
  my_rxn AS (
    SELECT post_id, type FROM reactions
    WHERE p_user_id IS NOT NULL AND user_id=p_user_id AND post_id IN (SELECT id FROM city_posts)
  ),
  my_reveal AS (
    SELECT post_id FROM mystery_reveals
    WHERE p_user_id IS NOT NULL AND user_id=p_user_id
      AND post_id IN (SELECT id FROM city_posts WHERE is_mystery=TRUE)
  ),
  -- Weighted tag affinity (replaces binary p_user_tags && tags)
  affinities AS (
    SELECT dimension, score FROM user_affinity
    WHERE p_user_id IS NOT NULL AND user_id=p_user_id AND dimension LIKE 'tag:%'
    ORDER BY score DESC LIMIT 50
  ),
  scored AS (
    SELECT
      cp.id, cp.user_id, cp.content, cp.image_url, cp.video_url,
      cp.video_thumbnail_url, cp.is_anonymous, cp.is_mystery,
      cp.city, cp.tags, cp.reveal_count, cp.view_count,
      COALESCE(cp.reshare_count,0) AS reshare_count,
      cp.reshared_from_id, cp.room_id, cp.created_at,
      COALESCE(rxn.counts,'{"interesting":0,"funny":0,"deep":0,"curious":0}'::JSONB) AS reaction_counts,
      COALESCE(cmt.cnt,0) AS comment_count, my_rxn.type AS user_reaction,
      (my_reveal.post_id IS NOT NULL) AS has_revealed, cp.area_label,
      (
        CASE COALESCE(social.relationship,'stranger')
          WHEN 'mutual'    THEN 45 WHEN 'following' THEN 30 WHEN 'self' THEN 0 ELSE 0 END
        + LEAST((COALESCE(rxn.total,0)*3+COALESCE(cmt.cnt,0)*5+COALESCE(cp.reveal_count,0)*4)::FLOAT
            /GREATEST(EXTRACT(EPOCH FROM(NOW()-cp.created_at))/3600.0,0.1)^1.5, 80.0)
        + COALESCE((SELECT SUM(LEAST(a.score*2,8)) FROM affinities a
            WHERE REPLACE(a.dimension,'tag:','')=ANY(cp.tags) LIMIT 5), 0)
        + CASE WHEN cp.scope='city' THEN 25 ELSE 0 END
        + CASE WHEN cp.created_at > NOW()-INTERVAL '1 hour'   THEN 15
               WHEN cp.created_at > NOW()-INTERVAL '6 hours'  THEN 10
               WHEN cp.created_at > NOW()-INTERVAL '24 hours' THEN 5 ELSE 0 END
      )::DOUBLE PRECISION AS total_score
    FROM city_posts cp
    LEFT JOIN social    ON social.post_id=cp.id
    LEFT JOIN rxn       ON rxn.post_id=cp.id
    LEFT JOIN cmt       ON cmt.post_id=cp.id
    LEFT JOIN my_rxn    ON my_rxn.post_id=cp.id
    LEFT JOIN my_reveal ON my_reveal.post_id=cp.id
  ),
  ranked AS (
    SELECT *, ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY total_score DESC) AS author_rank
    FROM scored
  )
  SELECT r.id, r.user_id, r.content, r.image_url, r.video_url, r.video_thumbnail_url,
    r.is_anonymous, r.is_mystery, r.city, r.tags, r.reveal_count, r.view_count,
    r.reshare_count, r.reshared_from_id, r.room_id, r.created_at, r.total_score,
    r.reaction_counts, r.comment_count, r.user_reaction, r.has_revealed, r.area_label
  FROM ranked r WHERE r.author_rank <= 2
  ORDER BY r.total_score DESC LIMIT p_lim;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 8. UPGRADED get_nearby_posts_smart v3
-- New: seen exclusion, hidden exclusion, weighted comments (x5)
-- ────────────────────────────────────────────────────────────
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
  id UUID, user_id UUID, content TEXT, image_url TEXT, video_url TEXT,
  video_thumbnail_url TEXT, is_anonymous BOOLEAN, is_mystery BOOLEAN,
  city TEXT, tags TEXT[], reveal_count INTEGER, view_count INTEGER,
  reshare_count INTEGER, reshared_from_id UUID, room_id UUID, created_at TIMESTAMPTZ,
  distance_km DOUBLE PRECISION, total_score DOUBLE PRECISION,
  reaction_counts JSONB, comment_count BIGINT, user_reaction TEXT,
  has_revealed BOOLEAN, social_context TEXT
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
      ROUND((ST_Distance(p.location, viewer_point)/1000)::NUMERIC, 2)::DOUBLE PRECISION AS dist_km
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
        WHEN EXISTS(SELECT 1 FROM follows f1 WHERE f1.follower_id=p_user_id AND f1.following_id=n.user_id)
          AND EXISTS(SELECT 1 FROM follows f2 WHERE f2.follower_id=n.user_id AND f2.following_id=p_user_id)
          THEN 'mutual'
        WHEN EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=p_user_id AND f.following_id=n.user_id)
          THEN 'following'
        ELSE 'stranger'
      END AS relationship
    FROM nearby n WHERE NOT n.is_anonymous
  ),
  rxn AS (
    SELECT r.post_id,
      JSONB_BUILD_OBJECT('interesting',COUNT(*) FILTER(WHERE r.type='interesting'),
        'funny',COUNT(*) FILTER(WHERE r.type='funny'),'deep',COUNT(*) FILTER(WHERE r.type='deep'),
        'curious',COUNT(*) FILTER(WHERE r.type='curious')) AS counts, COUNT(*) AS total
    FROM reactions r WHERE r.post_id IN (SELECT id FROM nearby) GROUP BY r.post_id
  ),
  cmt AS (SELECT post_id, COUNT(*) AS cnt FROM comments
    WHERE post_id IN (SELECT id FROM nearby) AND is_deleted=FALSE GROUP BY post_id),
  my_rxn AS (SELECT post_id, type FROM reactions
    WHERE p_user_id IS NOT NULL AND user_id=p_user_id AND post_id IN (SELECT id FROM nearby)),
  my_reveal AS (SELECT post_id FROM mystery_reveals
    WHERE p_user_id IS NOT NULL AND user_id=p_user_id
      AND post_id IN (SELECT id FROM nearby WHERE is_mystery=TRUE)),
  scored AS (
    SELECT
      n.id, n.user_id, n.content, n.image_url, n.video_url, n.video_thumbnail_url,
      n.is_anonymous, n.is_mystery, n.city, n.tags, n.reveal_count, n.view_count,
      COALESCE(n.reshare_count,0) AS reshare_count, n.reshared_from_id, n.room_id,
      n.created_at, n.dist_km,
      COALESCE(rxn.counts,'{"interesting":0,"funny":0,"deep":0,"curious":0}'::JSONB) AS reaction_counts,
      COALESCE(cmt.cnt,0) AS comment_count, my_rxn.type AS user_reaction,
      (my_reveal.post_id IS NOT NULL) AS has_revealed,
      COALESCE(social.relationship,'stranger') AS social_context,
      (
        CASE COALESCE(social.relationship,'stranger')
          WHEN 'self' THEN 0 WHEN 'mutual' THEN 50 WHEN 'following' THEN 35 ELSE 0 END
        + LEAST((COALESCE(rxn.total,0)*3+COALESCE(cmt.cnt,0)*5+COALESCE(n.reveal_count,0)*4)::FLOAT
            /GREATEST(EXTRACT(EPOCH FROM(NOW()-n.created_at))/3600.0,0.1)^1.5, 80.0)
        + CASE WHEN n.dist_km<0.5 THEN 20 WHEN n.dist_km<1.0 THEN 15
               WHEN n.dist_km<3.0 THEN 10 WHEN n.dist_km<5.0 THEN 5 ELSE 0 END
        + CASE WHEN n.scope='nearby' THEN 30 ELSE 0 END
        + CASE WHEN n.created_at>NOW()-INTERVAL '1 hour'   THEN 15
               WHEN n.created_at>NOW()-INTERVAL '6 hours'  THEN 10
               WHEN n.created_at>NOW()-INTERVAL '24 hours' THEN 5 ELSE 0 END
      )::DOUBLE PRECISION AS total_score
    FROM nearby n
    LEFT JOIN social    ON social.post_id=n.id
    LEFT JOIN rxn       ON rxn.post_id=n.id
    LEFT JOIN cmt       ON cmt.post_id=n.id
    LEFT JOIN my_rxn    ON my_rxn.post_id=n.id
    LEFT JOIN my_reveal ON my_reveal.post_id=n.id
  )
  SELECT s.id, s.user_id, s.content, s.image_url, s.video_url, s.video_thumbnail_url,
    s.is_anonymous, s.is_mystery, s.city, s.tags, s.reveal_count, s.view_count,
    s.reshare_count, s.reshared_from_id, s.room_id, s.created_at, s.dist_km,
    s.total_score, s.reaction_counts, s.comment_count, s.user_reaction,
    s.has_revealed, s.social_context
  FROM scored s ORDER BY s.total_score DESC, s.created_at DESC LIMIT p_lim;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 9. INDEXES for new tables + performance
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_post_hides_post ON post_hides(post_id);
CREATE INDEX IF NOT EXISTS idx_follow_suggestions_score ON follow_suggestions(user_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_user_interactions_action ON user_interactions(user_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_affinity_dimension ON user_affinity(user_id, dimension, score DESC);
CREATE INDEX IF NOT EXISTS idx_posts_global_v3
  ON posts(created_at DESC)
  WHERE is_deleted = FALSE AND (scope = 'global' OR scope IS NULL);

-- ────────────────────────────────────────────────────────────
-- 10. pg_cron SETUP (run once in Supabase SQL editor)
-- Only works if pg_cron extension is enabled in your project
-- Enable at: Supabase Dashboard → Database → Extensions → pg_cron
-- ────────────────────────────────────────────────────────────
-- SELECT cron.schedule('decay-affinities',       '0 3 * * *', 'SELECT decay_user_affinities()');
-- SELECT cron.schedule('follow-suggestions',     '0 * * * *', 'SELECT compute_follow_suggestions()');
-- SELECT cron.schedule('cleanup-interactions',   '0 4 * * 0', 'DELETE FROM user_interactions WHERE created_at < NOW() - INTERVAL ''90 days''');

-- ============================================================
-- END OF MIGRATION
-- ============================================================
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
