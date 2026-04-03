-- ============================================================
-- NEARBY SYSTEM v2 — SQL ADDITIONS
-- Run in Supabase SQL Editor
-- NOTE: location column + GIST index already exist in schema.sql
--       This file only adds the get_nearby_users function + trigger
-- ============================================================

-- 1. get_nearby_users — find active users near a point
CREATE OR REPLACE FUNCTION get_nearby_users(
  p_lat       DOUBLE PRECISION,
  p_lng       DOUBLE PRECISION,
  p_radius_m  DOUBLE PRECISION DEFAULT 5000,
  p_user_id   UUID DEFAULT NULL,
  p_limit     INTEGER DEFAULT 10
)
RETURNS TABLE(
  user_id    UUID,
  distance_m DOUBLE PRECISION,
  locality   TEXT,
  updated_at TIMESTAMPTZ
) AS $$
DECLARE
  viewer_point GEOGRAPHY;
BEGIN
  viewer_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY;

  RETURN QUERY
  SELECT
    ul.user_id,
    ST_Distance(ul.location, viewer_point)::DOUBLE PRECISION AS distance_m,
    ul.locality,
    ul.updated_at
  FROM user_locations ul
  WHERE ul.expires_at > NOW()
    AND (p_user_id IS NULL OR ul.user_id != p_user_id)
    AND ST_DWithin(ul.location, viewer_point, p_radius_m)
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = ul.user_id
        AND (u.is_private = FALSE OR u.is_private IS NULL)
    )
  ORDER BY distance_m ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. sync_user_location_geo trigger — NOT needed since location is
--    a GENERATED ALWAYS column (auto-computed from lat/lng)
--    Keeping as no-op for compatibility

-- ============================================================
-- END nearby-v2.sql
-- ============================================================
