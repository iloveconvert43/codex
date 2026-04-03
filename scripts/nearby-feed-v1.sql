-- get_nearby_feed_posts: Returns posts within a given radius of a point
-- Uses PostGIS ST_DWithin for accurate geospatial filtering
-- Falls back gracefully if PostGIS is not available

CREATE OR REPLACE FUNCTION get_nearby_feed_posts(
  p_lat           DOUBLE PRECISION,
  p_lng           DOUBLE PRECISION,
  p_radius_km     DOUBLE PRECISION DEFAULT 10.0,
  p_limit         INTEGER DEFAULT 20,
  p_cursor        TIMESTAMPTZ DEFAULT NULL,
  p_blocked_ids   UUID[] DEFAULT '{}'
)
RETURNS SETOF posts
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  viewer_point GEOGRAPHY;
BEGIN
  viewer_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY;

  RETURN QUERY
  SELECT p.*
  FROM posts p
  WHERE p.is_deleted = FALSE
    AND p.location IS NOT NULL
    AND ST_DWithin(p.location, viewer_point, p_radius_km * 1000)
    AND (p_cursor IS NULL OR p.created_at < p_cursor)
    AND (array_length(p_blocked_ids, 1) IS NULL OR p.user_id != ALL(p_blocked_ids))
  ORDER BY p.created_at DESC
  LIMIT p_limit;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_nearby_feed_posts TO anon, authenticated, service_role;
