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

    let query = supabase
      .from('posts')
      .select('id, content, image_url, video_url, gif_url, is_mystery, is_anonymous, created_at, tags, reaction_count, comment_count, scope, feeling, feeling_emoji, activity, activity_emoji, activity_detail, location_name, is_life_event, life_event_type, life_event_emoji')
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

    const { data: posts, error } = await query
    if (error) throw error

    const nextCursor = posts && posts.length === limit
      ? posts[posts.length - 1].created_at
      : null

    return NextResponse.json({
      data: posts || [],
      hasMore: posts?.length === limit,
      nextCursor
    })
  } catch (err: any) {
    console.error('[users/posts]', err.message)
    return NextResponse.json({ data: [] })
  }
}
