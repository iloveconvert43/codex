-- ============================================================
-- MESSAGE REQUEST SYSTEM
-- Logic:
--   1. follower/following each other → free DM (no request needed)
--   2. Stranger → sends a "message request" (1 message only)
--      recipient sees request, can accept/decline
--      accepted → full DM unlocked
--      declined → sender blocked from messaging
--   3. Calling → ONLY allowed between mutual follows (both follow each other)
-- ============================================================

-- 1. message_requests table
CREATE TABLE IF NOT EXISTS message_requests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message      TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','accepted','declined')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sender_id, receiver_id)   -- one active request per pair
);

CREATE INDEX IF NOT EXISTS idx_msg_requests_receiver
  ON message_requests(receiver_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_requests_sender
  ON message_requests(sender_id, status);

ALTER TABLE message_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "msg_req_read"   ON message_requests;
DROP POLICY IF EXISTS "msg_req_insert" ON message_requests;
DROP POLICY IF EXISTS "msg_req_update" ON message_requests;

CREATE POLICY "msg_req_read" ON message_requests FOR SELECT
  USING (
    sender_id   = (SELECT id FROM users WHERE auth_id = auth.uid()) OR
    receiver_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );
CREATE POLICY "msg_req_insert" ON message_requests FOR INSERT
  WITH CHECK (sender_id = (SELECT id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY "msg_req_update" ON message_requests FOR UPDATE
  USING (receiver_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- 2. Helper function: check if two users can DM freely
-- Returns: 'free' | 'request_needed' | 'request_pending' | 'request_accepted' | 'blocked'
CREATE OR REPLACE FUNCTION get_dm_permission(
  p_sender_id   UUID,
  p_receiver_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_blocked       BOOLEAN;
  v_follows_fwd   BOOLEAN;  -- sender follows receiver
  v_follows_back  BOOLEAN;  -- receiver follows sender
  v_req_status    TEXT;
BEGIN
  -- Check block (either direction)
  SELECT EXISTS(
    SELECT 1 FROM user_blocks
    WHERE (blocker_id = p_receiver_id AND blocked_id = p_sender_id)
       OR (blocker_id = p_sender_id   AND blocked_id = p_receiver_id)
  ) INTO v_blocked;

  IF v_blocked THEN RETURN 'blocked'; END IF;

  -- Check follow relationships
  SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id = p_sender_id   AND following_id = p_receiver_id) INTO v_follows_fwd;
  SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id = p_receiver_id AND following_id = p_sender_id)   INTO v_follows_back;

  -- Either side follows the other → free DM
  IF v_follows_fwd OR v_follows_back THEN
    RETURN 'free';
  END IF;

  -- Check existing message request
  SELECT status INTO v_req_status
  FROM message_requests
  WHERE sender_id = p_sender_id AND receiver_id = p_receiver_id
  LIMIT 1;

  IF v_req_status IS NOT NULL THEN
    RETURN 'request_' || v_req_status;   -- 'request_pending' | 'request_accepted' | 'request_declined'
  END IF;

  RETURN 'request_needed';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. Helper function: can user call another?
-- Only mutual follows (both follow each other) can call
CREATE OR REPLACE FUNCTION can_call(
  p_caller_id    UUID,
  p_recipient_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM follows f1
    WHERE f1.follower_id  = p_caller_id
      AND f1.following_id = p_recipient_id
  )
  AND EXISTS(
    SELECT 1 FROM follows f2
    WHERE f2.follower_id  = p_recipient_id
      AND f2.following_id = p_caller_id
  )
  AND NOT EXISTS(
    SELECT 1 FROM user_blocks
    WHERE (blocker_id = p_recipient_id AND blocked_id = p_caller_id)
       OR (blocker_id = p_caller_id    AND blocked_id = p_recipient_id)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- END message-request-v1.sql
-- ============================================================
