export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { getUserIdFromToken } from '@/lib/jwt'
import {
  getCachedFeed, setCachedFeed,
  getCachedBlocked, setCachedBlocked,
  getCachedFollowing, setCachedFollowing,
} from '@/lib/redis'

type FeedFilter = 'global' | 'nearby' | 'city' | 'friends' | 'room'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  // Health check: /api/feed?health=1
  if (searchParams.get('health') === '1') {
    const check = (key: string) => {
      const val = process.env[key]
      return { key, set: !!val, length: val?.length ?? 0 }
    }

    return NextResponse.json({
      status: 'ok', node: process.version,
      env: [
        check('NEXT_PUBLIC_SUPABASE_URL'), check('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
        check('SUPABASE_SERVICE_ROLE_KEY'), check('NEXT_PUBLIC_IMAGEKIT_URL'),
        check('NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY'), check('IMAGEKIT_PRIVATE_KEY'),
        check('UPSTASH_REDIS_REST_URL'), check('UPSTASH_REDIS_REST_TOKEN'),
      ],
      timestamp: new Date().toISOString(),
    })
  }

  // Use admin client to bypass RLS — auth verified via JWT
  const supabase = createAdminClient()

  const filter    = (searchParams.get('filter') || 'global') as FeedFilter
  const limit     = Math.min(parseInt(searchParams.get('limit') || '20'), 30)
  const cursor    = searchParams.get('cursor') || null
  const lat       = parseFloat(searchParams.get('lat') || '0') || null
  const lng       = parseFloat(searchParams.get('lng') || '0') || null
  const cityParam = searchParams.get('city') || null
  const roomSlug  = searchParams.get('room') || null
  const seenParam = searchParams.get('seen') || ''

  // ── Auth: get user from JWT (zero DB calls) ──────────────
  const authHeader = req.headers.get('authorization')
  const authUserId = getUserIdFromToken(authHeader)  // JWT decode - no network

  let userId: string | null = null
  let userCity: string | null = null

  if (authUserId) {
    const { data: profile } = await supabase
      .from('users').select('id, city').eq('auth_id', authUserId).single()
    userId   = profile?.id   ?? null
    userCity = profile?.city ?? null
  }

  try {
    // ── Redis cache check ──────────────────────────────────
    // Skip caching the first page so newly created posts appear immediately
    // after redirect or refresh, Facebook-style.
    const shouldUseCache = false
    const cacheKey = ''
    if (shouldUseCache) {
      const cached = await getCachedFeed(cacheKey)
      if (cached) {
        const res = NextResponse.json(cached)
        res.headers.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=30')
        res.headers.set('X-Cache', 'HIT')
        return res
      }
    }

    let posts: any[] = []

    // ── Setup: blocked/following with Redis caching ──────────
    let blockedIds: string[] = []
    let followingIds: string[] = []

    if (userId) {
      const [cachedBlocked, cachedFollowing] = await Promise.all([
        getCachedBlocked(userId),
        (filter === 'friends' || filter === 'global') ? getCachedFollowing(userId) : Promise.resolve(null),
      ])

      if (cachedBlocked) {
        blockedIds = cachedBlocked
      } else {
        const { data: blkData } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', userId).limit(500)
        blockedIds = (blkData || []).map((b: any) => b.blocked_id)
        setCachedBlocked(userId, blockedIds)  // fire-and-forget
      }

      if (filter === 'friends' || filter === 'global') {
        if (cachedFollowing) {
          followingIds = cachedFollowing
        } else {
          const { data: followData } = await supabase.from('follows').select('following_id').eq('follower_id', userId).limit(1000)
          followingIds = (followData || []).map((f: any) => f.following_id)
          setCachedFollowing(userId, followingIds)  // fire-and-forget
        }
      }
    }

    // ── Base query ──────────────────────────────────────────
    // NOTE: reaction_counts and comment_count do NOT exist on the raw posts table
    // They are computed from reactions/comments tables below
    // Use core columns that ALWAYS exist + optional columns via fallback
    const baseSelect = `
      id, user_id, content, image_url, video_url, video_thumbnail_url, gif_url,
      is_anonymous, is_mystery, is_sensitive, scope,
      view_count, reveal_count, reshare_count,
      city, tags, created_at,
      feeling, feeling_emoji, activity, activity_emoji, activity_detail,
      location_name, is_life_event, life_event_type, life_event_emoji,
      room_id, reshared_from_id, reshare_comment,
      user:users!user_id(id, username, display_name, avatar_url, is_verified)
    `
    // Fallback select — only core columns that exist in the original CREATE TABLE
    const fallbackSelect = `
      id, user_id, content, image_url, video_url, video_thumbnail_url,
      is_anonymous, is_mystery,
      view_count, reveal_count,
      city, tags, created_at,
      user:users!user_id(id, username, display_name, avatar_url, is_verified)
    `

    // Helper: run query with fallback to core columns if newer columns don't exist
    async function runQuery(buildQuery: (sel: string) => any): Promise<any[]> {
      const { data, error } = await buildQuery(baseSelect)
      if (error && error.message?.includes('does not exist')) {
        console.warn('[feed] Column missing, using fallback select:', error.message)
        const { data: fb, error: fbErr } = await buildQuery(fallbackSelect)
        if (fbErr) throw fbErr
        return fb || []
      }
      if (error) throw error
      return data || []
    }

    if (filter === 'nearby') {
      if (!lat || !lng) {
        return NextResponse.json({ error: 'Location required', data: [] }, { status: 400 })
      }
      const radiusKm = Math.min(Math.max(parseFloat(searchParams.get('radius') || '10'), 1), 50)

      // Use PostGIS ST_DWithin for real radius filtering
      // Falls back to Haversine if the RPC doesn't exist
      try {
        const { data: nearbyPosts, error: rpcError } = await supabase.rpc('get_nearby_feed_posts', {
          p_lat: lat,
          p_lng: lng,
          p_radius_km: radiusKm,
          p_limit: limit,
          p_cursor: cursor || null,
          p_blocked_ids: blockedIds.length ? blockedIds : [],
        })
        if (!rpcError && nearbyPosts) {
          posts = nearbyPosts
        } else {
          // Fallback: filter by bounding box approximation using lat/lng columns on posts
          // 1 degree latitude ≈ 111km, 1 degree longitude ≈ 111km * cos(lat)
          const latDelta = radiusKm / 111.0
          const lngDelta = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180))
          const minLat = lat - latDelta
          const maxLat = lat + latDelta
          const minLng = lng - lngDelta
          const maxLng = lng + lngDelta

          posts = await runQuery((sel) => {
            let q = supabase.from('posts').select(sel)
              .eq('is_deleted', false)
              .not('latitude', 'is', null)
              .gte('latitude', minLat).lte('latitude', maxLat)
              .gte('longitude', minLng).lte('longitude', maxLng)
              .order('created_at', { ascending: false }).limit(limit)
            if (cursor) q = q.lt('created_at', cursor)
            if (blockedIds.length) q = q.not('user_id', 'in', `(${blockedIds.join(',')})`)
            return q
          })

          // If bounding box returns nothing, progressively expand to 20km
          if (posts.length === 0 && radiusKm < 20) {
            const expandedLatDelta = 20 / 111.0
            const expandedLngDelta = 20 / (111.0 * Math.cos((lat * Math.PI) / 180))
            posts = await runQuery((sel) => {
              let q = supabase.from('posts').select(sel)
                .eq('is_deleted', false)
                .not('latitude', 'is', null)
                .gte('latitude', lat - expandedLatDelta).lte('latitude', lat + expandedLatDelta)
                .gte('longitude', lng - expandedLngDelta).lte('longitude', lng + expandedLngDelta)
                .order('created_at', { ascending: false }).limit(limit)
              if (cursor) q = q.lt('created_at', cursor)
              if (blockedIds.length) q = q.not('user_id', 'in', `(${blockedIds.join(',')})`)
              return q
            })
          }
        }
      } catch {
        // Ultimate fallback: original unfiltered query
        posts = await runQuery((sel) => {
          let q = supabase.from('posts').select(sel)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false }).limit(limit)
          if (cursor) q = q.lt('created_at', cursor)
          if (blockedIds.length) q = q.not('user_id', 'in', `(${blockedIds.join(',')})`)
          return q
        })
      }

    } else if (filter === 'friends') {
      if (!followingIds.length) {
        return NextResponse.json({ data: [], hasMore: false, nextCursor: null })
      }
      posts = await runQuery((sel) => {
        let q = supabase.from('posts').select(sel)
          .eq('is_deleted', false).in('user_id', followingIds.slice(0, 500))
          .order('created_at', { ascending: false }).limit(limit)
        if (cursor) q = q.lt('created_at', cursor)
        return q
      })

    } else if (filter === 'room' && roomSlug) {
      const { data: room } = await supabase
        .from('topic_rooms').select('id').eq('slug', roomSlug).single()
      if (room) {
        posts = await runQuery((sel) => {
          let q = supabase.from('posts').select(sel)
            .eq('is_deleted', false).eq('room_id', room.id)
            .order('created_at', { ascending: false }).limit(limit)
          if (cursor) q = q.lt('created_at', cursor)
          return q
        })
      }

    } else if (filter === 'city') {
      const city = cityParam || userCity
      if (!city) {
        return NextResponse.json({ error: 'Please select a city', needsCitySelect: true, data: [] })
      }
      posts = await runQuery((sel) => {
        let q = supabase.from('posts').select(sel)
          .eq('is_deleted', false).eq('city', city)
          .order('created_at', { ascending: false }).limit(limit)
        if (cursor) q = q.lt('created_at', cursor)
        if (blockedIds.length) q = q.not('user_id', 'in', `(${blockedIds.join(',')})`)
        return q
      })

    } else {
      // GLOBAL feed
      const seenIds = seenParam.split(',').filter(id => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 50)
      posts = await runQuery((sel) => {
        let q = supabase.from('posts').select(sel)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false }).limit(limit)
        if (cursor) q = q.lt('created_at', cursor)
        if (blockedIds.length) q = q.not('user_id', 'in', `(${blockedIds.join(',')})`)
        if (seenIds.length) q = q.not('id', 'in', `(${seenIds.join(',')})`)
        return q
      })
    }

    if (!posts.length) {
      const empty = { data: [], hasMore: false, nextCursor: null }
      if (shouldUseCache) setCachedFeed(cacheKey, empty)
      const res = NextResponse.json(empty)
      res.headers.set('Cache-Control', shouldUseCache ? 'private, max-age=15, stale-while-revalidate=30' : 'no-store')
      res.headers.set('X-Cache', shouldUseCache ? 'MISS' : 'BYPASS')
      return res
    }

    // ── Enrich: reactions, comments, user data ────────────────
    const postIds = posts.map((p: any) => p.id)
    let userReactionMap: Record<string, string> = {}
    let userRevealSet = new Set<string>()

    // Fetch ALL reactions for these posts + comment counts in parallel
    const [allRxnRes, commentCountRes, userRxnRes, revealRes] = await Promise.all([
      // All reactions for these posts (to compute reaction_counts)
      supabase.from('reactions').select('post_id,type').in('post_id', postIds),
      // Comment counts
      supabase.from('comments').select('post_id').in('post_id', postIds).eq('is_deleted', false),
      // Current user's reactions
      userId
        ? supabase.from('reactions').select('post_id,type').in('post_id', postIds).eq('user_id', userId)
        : Promise.resolve({ data: [] }),
      // Mystery reveals for current user
      userId
        ? (() => {
            const mysteryIds = posts.filter((p: any) => p.is_mystery).map((p: any) => p.id)
            return mysteryIds.length
              ? supabase.from('mystery_reveals').select('post_id').in('post_id', mysteryIds).eq('user_id', userId)
              : Promise.resolve({ data: [] })
          })()
        : Promise.resolve({ data: [] })
    ])

    // Build reaction_counts map: { postId: { interesting: N, funny: N, ... } }
    const reactionCountsMap: Record<string, Record<string, number>> = {}
    for (const r of (allRxnRes.data || [])) {
      if (!reactionCountsMap[r.post_id]) reactionCountsMap[r.post_id] = { interesting: 0, funny: 0, deep: 0, curious: 0 }
      if (r.type in reactionCountsMap[r.post_id]) reactionCountsMap[r.post_id][r.type]++
    }

    // Build comment_count map: { postId: count }
    const commentCountMap: Record<string, number> = {}
    for (const c of (commentCountRes.data || [])) {
      commentCountMap[c.post_id] = (commentCountMap[c.post_id] || 0) + 1
    }

    if (userId) {
      userReactionMap = Object.fromEntries(
        ((userRxnRes as any).data || []).map((r: any) => [r.post_id, r.type])
      )
      userRevealSet = new Set(((revealRes as any).data || []).map((r: any) => r.post_id))
    }

    // ── Build response ──────────────────────────────────────
    const enriched = posts.map((p: any) => ({
      ...p,
      user_reaction: userReactionMap[p.id] || null,
      has_revealed:  userRevealSet.has(p.id),
      comment_count: commentCountMap[p.id] || 0,
      reaction_counts: reactionCountsMap[p.id] || { interesting: 0, funny: 0, deep: 0, curious: 0 },
    }))

    const responseData = {
      data:        enriched,
      hasMore:     enriched.length === limit,
      nextCursor:  enriched.length === limit ? enriched[enriched.length - 1]?.created_at : null,
    }

    // ── Cache in Redis (60s TTL) ─────────────────────────────
    if (shouldUseCache) setCachedFeed(cacheKey, responseData)  // fire-and-forget

    const res = NextResponse.json(responseData)
    res.headers.set('Cache-Control', shouldUseCache ? 'private, max-age=15, stale-while-revalidate=30' : 'no-store')
    res.headers.set('X-Cache', shouldUseCache ? 'MISS' : 'BYPASS')
    return res

  } catch (err: any) {
    console.error('[feed]', err.message)
    return NextResponse.json({ error: err.message, data: [] }, { status: 500 })
  }
}
