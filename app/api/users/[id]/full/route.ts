export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidUUID } from '@/lib/security'
import { getAuthUser } from '@/lib/auth-cache'
import { getCachedProfile, setCachedProfile } from '@/lib/redis'

type Ctx = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    if (!isValidUUID(params.id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const auth = await getAuthUser(req, supabase)
    const viewerId = auth?.userId ?? null

    // Redis cache — 60s
    const cached = await getCachedProfile(params.id, viewerId || 'anon')
    if (cached) {
      const res = NextResponse.json(cached)
      res.headers.set('X-Cache', 'HIT')
      return res
    }

    // All queries in parallel — each wrapped so one failure doesn't block others
    const safeQuery = async (fn: () => Promise<any>) => {
      try { return await fn() } catch { return { data: null, count: 0, error: null } }
    }

    const [userRes, followerRes, followingRes, pointsRes, postsRes, followRes] = await Promise.all([
      // Users query is NOT wrapped in safeQuery — we need to distinguish "not found" vs "error"
      supabase.from('users').select('id,username,full_name,display_name,bio,avatar_url,city,is_verified,is_banned,created_at,privacy_settings,is_private,is_anonymous').eq('id', params.id).single(),
      safeQuery(() => supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', params.id)),
      safeQuery(() => supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', params.id)),
      safeQuery(() => supabase.from('user_points').select('total_points,weekly_points,level').eq('user_id', params.id).single()),
      safeQuery(() => supabase.from('posts')
        .select('id,content,created_at,view_count,is_anonymous,is_mystery,image_url,video_url,gif_url,feeling,feeling_emoji,activity,activity_emoji,activity_detail,location_name,is_life_event,life_event_type,life_event_emoji')
        .eq('user_id', params.id).eq('is_deleted', false)
        .order('created_at', { ascending: false }).limit(20)),
      safeQuery(() => viewerId && viewerId !== params.id
        ? supabase.from('follows').select('follower_id')
            .eq('follower_id', viewerId).eq('following_id', params.id).maybeSingle()
        : Promise.resolve({ data: null })),
    ])

    if (!userRes.data) {
      const r = NextResponse.json({ error: 'User not found' }, { status: 404 })
      r.headers.set('Cache-Control', 'no-store')
      return r
    }

    const isOwner = viewerId === params.id
    const posts = (postsRes.data || []).filter((p: any) => isOwner || !p.is_anonymous)

    const result = {
      data: {
        user:            userRes.data,
        follower_count:  followerRes.count ?? 0,
        following_count: followingRes.count ?? 0,
        points:          pointsRes.data ?? { total_points: 0, weekly_points: 0, level: 'curious_newcomer' },
        posts,
        is_following:    !!followRes.data,
        is_own_profile:  isOwner,
      }
    }

    setCachedProfile(params.id, viewerId || 'anon', result)  // async

    const res = NextResponse.json(result)
    res.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60')
    return res
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
