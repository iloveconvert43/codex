export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidUUID } from '@/lib/security'
import { getAuthUser } from '@/lib/auth-cache'

type Ctx = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    if (!isValidUUID(params.id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const auth = await getAuthUser(req, supabase)
    const viewerId = auth?.userId ?? null
    const isOwner = viewerId === params.id

    // All queries in parallel — each wrapped so one failure doesn't block others
    const safeQuery = async (fn: () => Promise<any>) => {
      try { return await fn() } catch { return { data: null, count: 0, error: null } }
    }

    const corePostSelect = 'id,user_id,content,created_at,updated_at,view_count,is_anonymous,is_mystery,image_url,video_url,video_thumbnail_url,tags,city,latitude,longitude'
    const optionalPostSelect = 'id,gif_url,feeling,feeling_emoji,activity,activity_emoji,activity_detail,location_name,is_life_event,life_event_type,life_event_emoji,scope'

    const queryProfilePosts = async () => {
      const { data: corePosts, error: coreError } = await supabase.from('posts')
        .select(corePostSelect)
        .eq('user_id', params.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(20)

      if (coreError) throw coreError
      const basePosts = corePosts || []
      if (!basePosts.length) {
        return { data: [], error: null }
      }

      const postIds = basePosts.map((post: any) => post.id)
      const { data: optionalPosts, error: optionalError } = await supabase.from('posts')
        .select(optionalPostSelect)
        .in('id', postIds)

      if (optionalError) {
        console.warn('[users/full] optional post fields unavailable, using core fields only:', optionalError.message)
        return { data: basePosts, error: null }
      }

      const optionalMap = new Map((optionalPosts || []).map((post: any) => [post.id, post]))
      return {
        data: basePosts.map((post: any) => ({
          ...post,
          ...(optionalMap.get(post.id) || {}),
        })),
        error: null,
      }
    }

    const [userRes, followerRes, followingRes, pointsRes, postsRes, followRes] = await Promise.all([
      // Users query is NOT wrapped in safeQuery — we need to distinguish "not found" vs "error"
      supabase.from('users').select('id,username,full_name,display_name,bio,avatar_url,city,is_verified,is_banned,created_at,privacy_settings,is_private,is_anonymous').eq('id', params.id).single(),
      safeQuery(() => supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', params.id)),
      safeQuery(() => supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', params.id)),
      safeQuery(() => supabase.from('user_points').select('total_points,weekly_points,level').eq('user_id', params.id).single()),
      safeQuery(queryProfilePosts),
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

    const canViewPosts = isOwner || !userRes.data.is_private || !!followRes.data
    const posts = canViewPosts
      ? (postsRes.data || []).filter((p: any) => isOwner || !p.is_anonymous)
      : []
    let enrichedPosts = posts

    if (posts.length > 0) {
      const postIds = posts.map((post: any) => post.id)
      const [reactionRes, commentRes] = await Promise.all([
        safeQuery(() => supabase.from('reactions').select('post_id, type').in('post_id', postIds)),
        safeQuery(() => supabase.from('comments').select('post_id').in('post_id', postIds).eq('is_deleted', false)),
      ])

      const reactionCountMap: Record<string, number> = {}
      for (const reaction of (reactionRes.data || [])) {
        reactionCountMap[reaction.post_id] = (reactionCountMap[reaction.post_id] || 0) + 1
      }

      const commentCountMap: Record<string, number> = {}
      for (const comment of (commentRes.data || [])) {
        commentCountMap[comment.post_id] = (commentCountMap[comment.post_id] || 0) + 1
      }

      enrichedPosts = posts.map((post: any) => ({
        ...post,
        reaction_count: reactionCountMap[post.id] || 0,
        comment_count: commentCountMap[post.id] || 0,
      }))
    }

    const result = {
      data: {
        user:            userRes.data,
        follower_count:  followerRes.count ?? 0,
        following_count: followingRes.count ?? 0,
        points:          pointsRes.data ?? { total_points: 0, weekly_points: 0, level: 'curious_newcomer' },
        posts:           enrichedPosts,
        is_following:    !!followRes.data,
        is_own_profile:  isOwner,
      }
    }

    const res = NextResponse.json(result)
    res.headers.set('Cache-Control', 'no-store')
    res.headers.set('X-Cache', 'BYPASS')
    return res
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
