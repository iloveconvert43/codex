-- ============================================================
-- STORY SYSTEM v2 — SMART RANKING + HIGHLIGHTS
-- Run in Supabase SQL Editor after previous migrations
-- ============================================================

-- 1. Add reaction/reply tracking to story_views
ALTER TABLE story_views
  ADD COLUMN IF NOT EXISTS reaction   TEXT DEFAULT NULL,    -- emoji reaction
  ADD COLUMN IF NOT EXISTS has_replied BOOLEAN DEFAULT FALSE;

-- 2. Story highlights — save stories to profile permanently  
CREATE TABLE IF NOT EXISTS story_highlights (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  story_id    UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'Highlight',
  cover_url   TEXT,
  position    INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, story_id)
);
ALTER TABLE story_highlights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "highlights_own" ON story_highlights;
CREATE POLICY "highlights_own" ON story_highlights FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- 3. Smart story feed function — Facebook-style affinity ranking
-- Algorithm:
--   score = affinity_score * 40          (how much you interact with this author)
--         + mutual_boost * 20            (mutual follow = stronger signal)
--         + recency_score * 25           (fresher stories rank higher)
--         + unviewed_boost * 15          (unviewed stories first)
CREATE OR REPLACE FUNCTION get_stories_smart(
  p_user_id   UUID,
  p_limit     INTEGER DEFAULT 30
)
RETURNS TABLE (
  story_id          UUID,
  user_id           UUID,
  content           TEXT,
  image_url         TEXT,
  video_url         TEXT,
  bg_color          TEXT,
  is_anonymous      BOOLEAN,
  is_mystery        BOOLEAN,
  mystery_reveal_threshold INTEGER,
  view_count        INTEGER,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ,
  has_viewed        BOOLEAN,
  affinity_score    FLOAT,
  story_score       FLOAT,
  social_context    TEXT
) AS $$
DECLARE
  v_mutual_ids    UUID[];
  v_following_ids UUID[];
BEGIN
  -- Get social graph
  SELECT ARRAY_AGG(f.following_id) INTO v_following_ids
  FROM follows f WHERE f.follower_id = p_user_id;

  SELECT ARRAY_AGG(f1.following_id) INTO v_mutual_ids
  FROM follows f1
  WHERE f1.follower_id = p_user_id
    AND f1.following_id IN (
      SELECT f2.follower_id FROM follows f2 WHERE f2.following_id = p_user_id
    );

  RETURN QUERY
  WITH

  -- Active stories within visible set
  visible_stories AS (
    SELECT s.*
    FROM stories s
    WHERE s.expires_at > NOW()
      AND s.is_anonymous = FALSE
      AND (
        -- Own stories always
        s.user_id = p_user_id
        -- Following
        OR s.user_id = ANY(COALESCE(v_following_ids, '{}'::UUID[]))
        -- Interacted with their posts (affinity-based expansion)
        OR EXISTS (
          SELECT 1 FROM user_affinity ua
          WHERE ua.user_id = p_user_id
            AND ua.dimension = 'author:' || s.user_id::text
            AND ua.score > 2.0  -- meaningful interaction threshold
        )
      )
    ORDER BY s.created_at DESC
    LIMIT 200
  ),

  -- Which stories have been viewed
  viewed AS (
    SELECT story_id FROM story_views
    WHERE viewer_id = p_user_id
      AND story_id IN (SELECT id FROM visible_stories)
  ),

  -- Author affinity scores
  affinities AS (
    SELECT
      REPLACE(dimension, 'author:', '') AS author_id,
      score
    FROM user_affinity
    WHERE user_id = p_user_id
      AND dimension LIKE 'author:%'
  ),

  -- Score each story
  scored AS (
    SELECT
      s.id              AS story_id,
      s.user_id,
      s.content,
      s.image_url,
      s.video_url,
      s.bg_color,
      s.is_anonymous,
      s.is_mystery,
      s.mystery_reveal_threshold,
      s.view_count,
      s.expires_at,
      s.created_at,
      (sv.story_id IS NOT NULL)    AS has_viewed,
      COALESCE(a.score, 0.0)       AS affinity_score,

      -- Composite story score
      (
        -- A. Author affinity (0-40 pts) — main signal
        LEAST(COALESCE(a.score, 0.0) * 3.0, 40.0)

        +

        -- B. Social graph bonus (0-20 pts)
        CASE
          WHEN s.user_id = p_user_id THEN 0  -- own stories shown first separately
          WHEN s.user_id = ANY(COALESCE(v_mutual_ids, '{}'::UUID[])) THEN 20
          WHEN s.user_id = ANY(COALESCE(v_following_ids, '{}'::UUID[])) THEN 12
          ELSE 5  -- affinity-only (not following but interacted)
        END

        +

        -- C. Recency (0-25 pts) — fresher = higher
        CASE
          WHEN s.created_at > NOW() - INTERVAL '2 hours'  THEN 25
          WHEN s.created_at > NOW() - INTERVAL '6 hours'  THEN 18
          WHEN s.created_at > NOW() - INTERVAL '12 hours' THEN 10
          ELSE 3
        END

        +

        -- D. Unviewed boost (0-15 pts)
        CASE WHEN sv.story_id IS NULL THEN 15 ELSE 0 END

        +

        -- E. Story has media bonus (engagement signal)
        CASE WHEN s.image_url IS NOT NULL OR s.video_url IS NOT NULL THEN 5 ELSE 0 END

      )::FLOAT AS story_score,

      CASE
        WHEN s.user_id = p_user_id THEN 'self'
        WHEN s.user_id = ANY(COALESCE(v_mutual_ids, '{}'::UUID[])) THEN 'mutual'
        WHEN s.user_id = ANY(COALESCE(v_following_ids, '{}'::UUID[])) THEN 'following'
        ELSE 'affinity'
      END AS social_context

    FROM visible_stories s
    LEFT JOIN viewed sv ON sv.story_id = s.id
    LEFT JOIN affinities a ON a.author_id = s.user_id::text
  )

  SELECT * FROM scored
  ORDER BY
    -- Own stories always first
    CASE WHEN user_id = p_user_id THEN 0 ELSE 1 END,
    -- Then by score
    story_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 4. Anonymous stories — also smart-ranked for logged-in users
CREATE OR REPLACE FUNCTION get_anon_stories_smart(
  p_user_id  UUID DEFAULT NULL,
  p_limit    INTEGER DEFAULT 10
)
RETURNS TABLE (
  story_id    UUID,
  content     TEXT,
  image_url   TEXT,
  video_url   TEXT,
  bg_color    TEXT,
  view_count  INTEGER,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ,
  has_viewed  BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id, s.content, s.image_url, s.video_url, s.bg_color,
    s.view_count, s.expires_at, s.created_at,
    CASE WHEN p_user_id IS NOT NULL
      THEN EXISTS(SELECT 1 FROM story_views sv WHERE sv.story_id = s.id AND sv.viewer_id = p_user_id)
      ELSE FALSE
    END AS has_viewed
  FROM stories s
  WHERE s.is_anonymous = TRUE
    AND s.expires_at > NOW()
  ORDER BY
    -- Unviewed first
    CASE WHEN p_user_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM story_views sv WHERE sv.story_id = s.id AND sv.viewer_id = p_user_id
    ) THEN 1 ELSE 0 END,
    -- Then by engagement
    (s.view_count * 0.5 + EXTRACT(EPOCH FROM (NOW() - s.created_at)) / -3600.0)::FLOAT DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 5. Indexes for story ranking performance
-- No WHERE clause (NOW() not allowed in index predicate)
CREATE INDEX IF NOT EXISTS idx_stories_user_expires
  ON stories(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_views_viewer
  ON story_views(viewer_id, story_id);
CREATE INDEX IF NOT EXISTS idx_story_highlights_user
  ON story_highlights(user_id, position);
-- No WHERE clause (LIKE pattern not immutable in index predicate)
CREATE INDEX IF NOT EXISTS idx_affinity_author_score
  ON user_affinity(user_id, score DESC);

-- ============================================================
-- END story-v2.sql
-- ============================================================
