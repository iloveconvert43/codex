-- ============================================================
-- STORY MENTIONS & TEXT OVERLAYS
-- Run in Supabase SQL Editor
-- ============================================================

-- Add mentions + text overlay options to stories
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS mentioned_user_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS text_size          TEXT DEFAULT 'md'
    CHECK (text_size IN ('sm','md','lg','xl')),
  ADD COLUMN IF NOT EXISTS text_align         TEXT DEFAULT 'center'
    CHECK (text_align IN ('left','center','right')),
  ADD COLUMN IF NOT EXISTS text_color         TEXT DEFAULT '#FFFFFF';

-- Index for mention lookups
CREATE INDEX IF NOT EXISTS idx_story_mentions
  ON stories USING GIN(mentioned_user_ids)
  WHERE array_length(mentioned_user_ids,1) > 0;

-- ============================================================
-- END story-mentions-v1.sql
-- ============================================================
