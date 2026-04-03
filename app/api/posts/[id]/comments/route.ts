export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * GET  /api/posts/[id]/comments — Fetch threaded comments (no N+1)
 * POST /api/posts/[id]/comments — Create comment with Zod validation
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { createCommentSchema, validate } from '@/lib/validation/schemas'
import { sanitizeInput, isValidUUID, rateLimit, getClientIP } from '@/lib/security'

type Ctx = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  // Pagination support via ?cursor=<timestamp>&limit=<n>
  const url = new URL(req.url)
  const cursor = url.searchParams.get('cursor')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100)
  if (!params.id || !/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 })
  }
  try {
    // Use admin client to bypass RLS for reading comments (public content)
    const admin = createAdminClient()
    const userSelect = 'id,username,full_name,display_name,avatar_url,is_verified'

    // Fetch ALL non-deleted comments for this post in one query
    const { data: allComments, error } = await admin
      .from('comments')
      .select(`*, user:users(${userSelect})`)
      .eq('post_id', params.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) throw error

    // Build tree: separate top-level and replies
    const topLevel: any[] = []
    const replyMap: Record<string, any[]> = {}

    for (const c of (allComments || [])) {
      if (!c.parent_id) {
        topLevel.push({ ...c, replies: [] })
      } else {
        if (!replyMap[c.parent_id]) replyMap[c.parent_id] = []
        replyMap[c.parent_id].push(c)
      }
    }

    // Attach replies to parents
    const withReplies = topLevel.map(c => ({
      ...c,
      replies: replyMap[c.id] || [] }))

    return NextResponse.json({ data: withReplies })
  } catch (err: any) {
    console.error('[comments GET]', err.message)
    return NextResponse.json({ error: 'Failed to load comments' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Sign in to comment' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('id, is_banned').eq('auth_id', sessionUser.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    if (profile.is_banned) return NextResponse.json({ error: 'Account suspended' }, { status: 403 })

  // Rate limit: 30 comments per minute
  const ip = getClientIP(req)
  const rl = rateLimit(`comment:${profile.id}`, { max: 30, windowMs: 60000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Commenting too fast. Please slow down.' }, { status: 429 })
  }

    let rawBody: any
    try { rawBody = await req.json() }
    catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

    const v = validate(createCommentSchema, rawBody)
    if (!v.success) return NextResponse.json({ error: v.error }, { status: 400 })
    const rawContent = v.data.content
    const content = sanitizeInput(rawContent)
    const parent_id = v.data.parent_id
    const is_anonymous = v.data.is_anonymous

    // Validate parent_id belongs to this post (prevent cross-post reply injection)
    if (parent_id) {
      const admin = createAdminClient()
      const { data: parent } = await admin
        .from('comments').select('post_id').eq('id', parent_id).single()
      if (!parent || parent.post_id !== params.id) {
        return NextResponse.json({ error: 'Invalid parent comment' }, { status: 400 })
      }
    }

    const admin = createAdminClient()
    const { data: comment, error } = await admin
      .from('comments')
      .insert({
        post_id: params.id,
        user_id: profile.id,
        content,
        parent_id: parent_id || null,
        is_anonymous: !!is_anonymous })
      .select(`*, user:users(id,username,full_name,display_name,avatar_url,is_verified)`)
      .single()

    if (error) throw error

    // Notify post owner (non-blocking, skip self-notifications)
    const { data: post } = await admin
      .from('posts').select('user_id').eq('id', params.id).single()

    if (post && post.user_id !== profile.id) {
      admin.from('notifications').insert({
        user_id: post.user_id,
        actor_id: is_anonymous ? null : profile.id,
        type: 'new_comment',
        post_id: params.id,
        message: 'commented on your post' }).then(() => {}).catch(() => {})
    }

    // Also notify parent comment owner (for replies)
    if (parent_id) {
      const { data: parentComment } = await admin
        .from('comments').select('user_id').eq('id', parent_id).single()
      if (parentComment && parentComment.user_id !== profile.id) {
        admin.from('notifications').insert({
          user_id: parentComment.user_id,
          actor_id: is_anonymous ? null : profile.id,
          type: 'new_comment',
          post_id: params.id,
          message: 'replied to your comment' }).then(() => {}).catch(() => {})
      }
    }

    // Award points for commenting (non-blocking)
  const { awardPoints } = await import('@/lib/points')
  awardPoints(profile.id, 'comment_posted', comment.id).then(() => {}).catch(() => {})

  // Update affinity: commenting = strong signal (3x weight)
  admin.from('posts').select('user_id, tags, is_anonymous').eq('id', params.id).single()
    .then(({ data: post }: any) => {
      if (!post) return
      // Tag affinity
      if (post.tags?.length) {
        for (const tag of post.tags.slice(0, 5)) {
          admin.rpc('update_user_affinity', {
            p_user_id: profile.id, p_dimension: `tag:${tag}`, p_delta: 3.0
          }).then(() => {}).catch(() => {})
        }
      }
      // Author affinity
      if (post.user_id && !post.is_anonymous && post.user_id !== profile.id) {
        admin.rpc('update_user_affinity', {
          p_user_id: profile.id, p_dimension: `author:${post.user_id}`, p_delta: 3.0
        }).then(() => {}).catch(() => {})
      }
    }).catch(() => {})

  return NextResponse.json({ data: { ...comment, replies: [] } }, { status: 201 })
  } catch (err: any) {
    console.error('[comments POST]', err.message)
    return NextResponse.json({ error: 'Failed to post comment' }, { status: 500 })
  }
}
