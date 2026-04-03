export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * GET  /api/bookmarks — Get user's saved posts
 * POST /api/bookmarks — Toggle bookmark on a post
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidUUID } from '@/lib/security'

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ data: [] })

    const { searchParams } = new URL(req.url)
    const cursor = searchParams.get('cursor')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

    let q = supabase.from('bookmarks')
      .select('post_id, created_at, post:posts(*, user:users(id,username,display_name,avatar_url,is_verified))')
      .eq('user_id', me.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (cursor) q = q.lt('created_at', cursor)

    const { data: bookmarks, error } = await q
    if (error) throw error

    const posts = (bookmarks || []).map((b: any) => b.post).filter(Boolean)

    return NextResponse.json({
      data: posts,
      hasMore: posts.length === limit,
      nextCursor: posts.length === limit ? bookmarks?.[bookmarks.length - 1]?.created_at : null })
  } catch (err: any) {
    console.error('[bookmarks GET]', err.message)
    return NextResponse.json({ error: 'Failed to load bookmarks' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    // Rate limit: 30 bookmarks per minute
    const { rateLimit } = await import('@/lib/security')
    const rl = rateLimit(`bookmark:${me.id}`, { max: 30, windowMs: 60000 })
    if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const { post_id } = await req.json()
    if (!post_id || !isValidUUID(post_id)) {
      return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 })
    }

    // Toggle bookmark
    const { data: existing } = await supabase.from('bookmarks')
      .select('id').eq('user_id', me.id).eq('post_id', post_id).single()

    if (existing) {
      await supabase.from('bookmarks').delete().eq('user_id', me.id).eq('post_id', post_id)
      return NextResponse.json({ bookmarked: false })
    }

    await supabase.from('bookmarks').insert({ user_id: me.id, post_id })

    // Bookmark = strong save intent → update affinity (weight 2.5)
    supabase.from('posts').select('user_id, tags, is_anonymous').eq('id', post_id).single()
      .then(({ data: post }: any) => {
        if (!post) return
        if (post.tags?.length) {
          for (const tag of post.tags.slice(0, 5)) {
            supabase.rpc('update_user_affinity', {
              p_user_id: me.id, p_dimension: `tag:${tag}`, p_delta: 2.5
            }).then(() => {}).catch(() => {})
          }
        }
        if (post.user_id && !post.is_anonymous) {
          supabase.rpc('update_user_affinity', {
            p_user_id: me.id, p_dimension: `author:${post.user_id}`, p_delta: 2.5
          }).then(() => {}).catch(() => {})
        }
      }).catch(() => {})

    return NextResponse.json({ bookmarked: true })
  } catch (err: any) {
    console.error('[bookmarks POST]', err.message)
    return NextResponse.json({ error: 'Failed to bookmark' }, { status: 500 })
  }
}
