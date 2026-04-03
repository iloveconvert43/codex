export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidUUID } from '@/lib/security'

type Ctx = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = createAdminClient()

    if (!isValidUUID(params.id)) {
      return NextResponse.json({ data: [] })
    }

    const { searchParams } = new URL(req.url)
    const limit  = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
    const cursor = searchParams.get('cursor')

    // Check if viewer is the owner (to show anonymous posts)
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    let isOwner = false
    let viewerId: string | null = null
    if (sessionUser) {
      const { data: me } = await supabase
        .from('users').select('id').eq('auth_id', sessionUser.id).single()
      viewerId = me?.id ?? null
      isOwner = me?.id === params.id
    }

    const { data: targetUser } = await supabase
      .from('users')
      .select('is_private')
      .eq('id', params.id)
      .maybeSingle()

    let canViewPosts = true
    if (targetUser?.is_private && !isOwner) {
      const { data: follow } = viewerId
        ? await supabase
            .from('follows')
            .select('follower_id')
            .eq('follower_id', viewerId)
            .eq('following_id', params.id)
            .maybeSingle()
        : { data: null as any }
      canViewPosts = !!follow
    }

    if (!canViewPosts) {
      const res = NextResponse.json({ data: [], hasMore: false, nextCursor: null })
      res.headers.set('Cache-Control', 'no-store')
      return res
    }

    const coreSelect = 'id,user_id,content,image_url,video_url,video_thumbnail_url,is_mystery,is_anonymous,created_at,updated_at,tags,view_count,city,latitude,longitude'
    const optionalSelect = 'id,gif_url,scope,feeling,feeling_emoji,activity,activity_emoji,activity_detail,location_name,is_life_event,life_event_type,life_event_emoji'

    let query = supabase
      .from('posts')
      .select(coreSelect)
      .eq('user_id', params.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (!isOwner) {
      query = query.eq('is_anonymous', false)
    }

    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data: posts, error } = await query
    if (error) throw error

    let enrichedPosts = posts || []
    if (posts?.length) {
      const postIds = posts.map((post) => post.id)
      const [{ data: optionalPosts, error: optionalError }, reactionRes, commentRes] = await Promise.all([
        supabase.from('posts').select(optionalSelect).in('id', postIds),
        supabase.from('reactions').select('post_id').in('post_id', postIds),
        supabase.from('comments').select('post_id').in('post_id', postIds).eq('is_deleted', false),
      ])

      const optionalMap = new Map(
        optionalError
          ? []
          : (optionalPosts || []).map((post) => [post.id, post])
      )
      if (optionalError) {
        console.warn('[users/posts] optional post fields unavailable, using core fields only:', optionalError.message)
      }

      const reactionCountMap: Record<string, number> = {}
      for (const reaction of (reactionRes.data || [])) {
        reactionCountMap[reaction.post_id] = (reactionCountMap[reaction.post_id] || 0) + 1
      }

      const commentCountMap: Record<string, number> = {}
      for (const comment of (commentRes.data || [])) {
        commentCountMap[comment.post_id] = (commentCountMap[comment.post_id] || 0) + 1
      }

      enrichedPosts = posts.map((post) => ({
        ...post,
        ...(optionalMap.get(post.id) || {}),
        reaction_count: reactionCountMap[post.id] || 0,
        comment_count: commentCountMap[post.id] || 0,
      }))
    }

    const nextCursor = enrichedPosts.length === limit
      ? enrichedPosts[enrichedPosts.length - 1].created_at
      : null

    const res = NextResponse.json({
      data: enrichedPosts,
      hasMore: enrichedPosts.length === limit,
      nextCursor
    })
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (err: any) {
    console.error('[users/posts]', err.message)
    return NextResponse.json({ data: [] })
  }
}
