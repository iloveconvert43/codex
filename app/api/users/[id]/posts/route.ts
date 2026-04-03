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
    if (sessionUser) {
      const { data: me } = await supabase
        .from('users').select('id').eq('auth_id', sessionUser.id).single()
      isOwner = me?.id === params.id
    }

    const baseSelect = 'id, content, image_url, video_url, gif_url, is_mystery, is_anonymous, created_at, tags, view_count, scope, feeling, feeling_emoji, activity, activity_emoji, activity_detail, location_name, is_life_event, life_event_type, life_event_emoji'
    const fallbackSelect = 'id, content, image_url, video_url, is_mystery, is_anonymous, created_at, tags, view_count, scope, feeling, feeling_emoji, activity, activity_emoji, activity_detail, location_name, is_life_event, life_event_type, life_event_emoji'

    const buildQuery = (select: string) => {
      let query = supabase
        .from('posts')
        .select(select)
        .eq('user_id', params.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(limit)

      // Non-owners cannot see anonymous posts
      if (!isOwner) {
        query = query.eq('is_anonymous', false)
      }

      if (cursor) {
        query = query.lt('created_at', cursor)
      }

      return query
    }

    let { data: posts, error } = await buildQuery(baseSelect)
    if (error?.message?.includes('does not exist')) {
      const fallback = await buildQuery(fallbackSelect)
      posts = fallback.data
      error = fallback.error
    }
    if (error) throw error

    let enrichedPosts = posts || []
    if (posts?.length) {
      const postIds = posts.map((post) => post.id)
      const [reactionRes, commentRes] = await Promise.all([
        supabase.from('reactions').select('post_id').in('post_id', postIds),
        supabase.from('comments').select('post_id').in('post_id', postIds).eq('is_deleted', false),
      ])

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
