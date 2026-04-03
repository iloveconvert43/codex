-- Comment media, mentions, and like/dislike reactions
-- Run this once in Supabase SQL editor before deploying the matching app code.

ALTER TABLE comments ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS dislike_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS mentions TEXT[] DEFAULT '{}';
ALTER TABLE comments ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS video_thumbnail_url TEXT;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS gif_url TEXT;

ALTER TABLE comment_likes ADD COLUMN IF NOT EXISTS reaction TEXT NOT NULL DEFAULT 'like';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comment_likes_reaction_check'
  ) THEN
    ALTER TABLE comment_likes
      ADD CONSTRAINT comment_likes_reaction_check
      CHECK (reaction IN ('like', 'dislike'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comment_likes_reaction ON comment_likes(comment_id, reaction);

CREATE OR REPLACE FUNCTION toggle_comment_reaction(
  p_comment_id UUID,
  p_user_id UUID,
  p_reaction TEXT
) RETURNS TABLE(reaction TEXT, like_count INTEGER, dislike_count INTEGER) AS $$
DECLARE
  v_existing_reaction TEXT;
  v_like_count INTEGER;
  v_dislike_count INTEGER;
BEGIN
  IF p_reaction NOT IN ('like', 'dislike') THEN
    RAISE EXCEPTION 'Invalid reaction type';
  END IF;

  SELECT cl.reaction
  INTO v_existing_reaction
  FROM comment_likes cl
  WHERE cl.comment_id = p_comment_id AND cl.user_id = p_user_id;

  IF v_existing_reaction IS NULL THEN
    INSERT INTO comment_likes(comment_id, user_id, reaction)
    VALUES (p_comment_id, p_user_id, p_reaction);

    IF p_reaction = 'like' THEN
      UPDATE comments SET like_count = like_count + 1 WHERE id = p_comment_id;
    ELSE
      UPDATE comments SET dislike_count = dislike_count + 1 WHERE id = p_comment_id;
    END IF;

    reaction := p_reaction;
  ELSIF v_existing_reaction = p_reaction THEN
    DELETE FROM comment_likes
    WHERE comment_id = p_comment_id AND user_id = p_user_id;

    IF p_reaction = 'like' THEN
      UPDATE comments SET like_count = GREATEST(0, like_count - 1) WHERE id = p_comment_id;
    ELSE
      UPDATE comments SET dislike_count = GREATEST(0, dislike_count - 1) WHERE id = p_comment_id;
    END IF;

    reaction := NULL;
  ELSE
    UPDATE comment_likes
    SET reaction = p_reaction, created_at = NOW()
    WHERE comment_id = p_comment_id AND user_id = p_user_id;

    IF p_reaction = 'like' THEN
      UPDATE comments
      SET like_count = like_count + 1,
          dislike_count = GREATEST(0, dislike_count - 1)
      WHERE id = p_comment_id;
    ELSE
      UPDATE comments
      SET like_count = GREATEST(0, like_count - 1),
          dislike_count = dislike_count + 1
      WHERE id = p_comment_id;
    END IF;

    reaction := p_reaction;
  END IF;

  SELECT c.like_count, c.dislike_count
  INTO v_like_count, v_dislike_count
  FROM comments c
  WHERE c.id = p_comment_id;

  like_count := COALESCE(v_like_count, 0);
  dislike_count := COALESCE(v_dislike_count, 0);

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION toggle_comment_like(p_comment_id UUID, p_user_id UUID)
RETURNS TABLE(liked BOOLEAN, like_count INTEGER) AS $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT * INTO v_result
  FROM toggle_comment_reaction(p_comment_id, p_user_id, 'like');

  liked := v_result.reaction = 'like';
  like_count := v_result.like_count;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
