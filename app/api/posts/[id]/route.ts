export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

type Ctx = { params: { id: string } }

// GET /api/posts/[id]
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    // Use admin client to bypass RLS — posts are public content
    const admin = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null

    let userId: string | null = null
    if (sessionUser) {
      const { data: p } = await admin.from('users').select('id').eq('auth_id', sessionUser.id).single()
      userId = p?.id ?? null
    }

    const { data: post, error } = await admin
      .from('posts')
      .select('*')
      .eq('id', params.id)
      .eq('is_deleted', false)
      .maybeSingle()

    if (error || !post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

    const { data: user } = post.user_id
      ? await admin
          .from('users')
          .select('id, username, full_name, display_name, avatar_url, is_verified, city')
          .eq('id', post.user_id)
          .maybeSingle()
      : { data: null as any }

    const { data: reactions } = await admin
      .from('reactions').select('type, user_id').eq('post_id', params.id)
    const reaction_counts = { interesting: 0, funny: 0, deep: 0, curious: 0 }
    ;(reactions || []).forEach((r: any) => {
      if (r.type in reaction_counts) reaction_counts[r.type as keyof typeof reaction_counts]++
    })

    const [{ count: comment_count }] = await Promise.all([
      admin
        .from('comments').select('id', { count: 'exact', head: true })
        .eq('post_id', params.id).eq('is_deleted', false),
    ])

    let latestCommentRow: any = null
    const latestCommentSelect =
      'id, post_id, user_id, parent_id, content, created_at, is_anonymous, image_url, video_url, video_thumbnail_url, gif_url'

    const latestCommentQuery = () => admin
      .from('comments')
      .select(latestCommentSelect)
      .eq('post_id', params.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const latestCommentFallbackQuery = () => admin
      .from('comments')
      .select('id, post_id, user_id, parent_id, content, created_at, is_anonymous')
      .eq('post_id', params.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const latestCommentResponse = await latestCommentQuery()
    if (latestCommentResponse.error && /column .* does not exist/i.test(latestCommentResponse.error.message || '')) {
      const fallbackResponse = await latestCommentFallbackQuery()
      latestCommentRow = fallbackResponse.data || null
    } else {
      latestCommentRow = latestCommentResponse.data || null
    }

    let latest_comment = latestCommentRow || null
    if (latest_comment && !latest_comment.is_anonymous && latest_comment.user_id) {
      const { data: latestCommentUser } = await admin
        .from('users')
        .select('id, username, display_name, avatar_url, is_verified')
        .eq('id', latest_comment.user_id)
        .maybeSingle()

      latest_comment = {
        ...latest_comment,
        user: latestCommentUser || null,
      }
    }

    let user_reaction = null
    let has_revealed = false

    if (userId) {
      const userReaction = (reactions || []).find((r: any) => r.user_id === userId)
      user_reaction = userReaction?.type ?? null
      if (post.is_mystery) {
        const { data: rev } = await admin
          .from('mystery_reveals').select('post_id')
          .eq('post_id', params.id).eq('user_id', userId).single()
        has_revealed = !!rev
      }
    }

    admin.rpc('increment_post_view', { p_post_id: params.id, p_user_id: userId })
      .then(() => {})
      .catch(() => {
        // Fallback if RPC doesn't exist
        admin.from('posts')
          .update({ view_count: (post.view_count || 0) + 1 })
          .eq('id', params.id).then(() => {})
      })

    const res = NextResponse.json({
      data: {
        ...post,
        user,
        content: post.is_mystery && !has_revealed ? null : post.content,
        image_url: post.is_mystery && !has_revealed ? null : post.image_url,
        video_url: post.is_mystery && !has_revealed ? null : post.video_url,
        video_thumbnail_url: post.is_mystery && !has_revealed ? null : post.video_thumbnail_url,
        gif_url: post.is_mystery && !has_revealed ? null : post.gif_url,
        reaction_counts,
        comment_count: comment_count ?? 0,
        latest_comment,
        user_reaction,
        has_revealed }
    })
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (err: any) {
    console.error('[posts/[id] GET]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE /api/posts/[id]
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: post } = await supabase
      .from('posts').select('user_id').eq('id', params.id).single()
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    if (post.user_id !== profile.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error } = await supabase
      .from('posts').update({ is_deleted: true }).eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[posts/[id] DELETE]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH /api/posts/[id] — edit within 15 min
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: post } = await supabase
      .from('posts').select('user_id, created_at').eq('id', params.id).single()
    if (!post || post.user_id !== me.id) {
      return NextResponse.json({ error: 'You can only edit your own posts' }, { status: 403 })
    }

    const ageMin = (Date.now() - new Date(post.created_at).getTime()) / 60000
    if (ageMin > 15) {
      return NextResponse.json({ error: 'Posts can only be edited within 15 minutes' }, { status: 403 })
    }

    const body = await req.json()
    const { content, tags } = body
    if (!content?.trim()) return NextResponse.json({ error: 'Content cannot be empty' }, { status: 400 })

    const { data: updated, error } = await supabase
      .from('posts')
      .update({
        content: content.trim().slice(0, 2000),
        tags: Array.isArray(tags) ? tags.slice(0, 5).map((t: string) => t.toLowerCase().slice(0, 30)) : undefined,
        updated_at: new Date().toISOString() })
      .eq('id', params.id).select().single()

    if (error) throw error
    return NextResponse.json({ data: updated })
  } catch (err: any) {
    console.error('[posts/[id] PATCH]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
