export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * GET  /api/posts/[id]/comments — Fetch threaded comments with reactions
 * POST /api/posts/[id]/comments — Create comment with media/mentions support
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { createCommentSchema, validate } from '@/lib/validation/schemas'
import { sanitizeInput, sanitizeURL, rateLimit } from '@/lib/security'
import { getStoredCommentContent } from '@/lib/comments'

type Ctx = { params: { id: string } }

async function getViewerProfileId(req: NextRequest, admin: ReturnType<typeof createAdminClient>) {
  const { getUserIdFromToken: getUID } = await import('@/lib/jwt')
  const authId = getUID(req.headers.get('authorization'))
  if (!authId) return null

  const { data: viewer } = await admin
    .from('users')
    .select('id')
    .eq('auth_id', authId)
    .maybeSingle()

  return viewer?.id ?? null
}

async function fetchCommentReactionRows(admin: ReturnType<typeof createAdminClient>, commentIds: string[]) {
  if (!commentIds.length) return [] as Array<{ comment_id: string; user_id: string; reaction: 'like' | 'dislike' }>

  const primary = await admin
    .from('comment_likes')
    .select('comment_id, user_id, reaction')
    .in('comment_id', commentIds)

  if (!primary.error) {
    return (primary.data || []).map((row: any) => ({
      comment_id: row.comment_id,
      user_id: row.user_id,
      reaction: row.reaction === 'dislike' ? 'dislike' : 'like',
    }))
  }

  if (!/column .* does not exist|schema cache/i.test(primary.error.message || '')) {
    throw primary.error
  }

  const fallback = await admin
    .from('comment_likes')
    .select('comment_id, user_id')
    .in('comment_id', commentIds)

  if (fallback.error) throw fallback.error

  return (fallback.data || []).map((row: any) => ({
    comment_id: row.comment_id,
    user_id: row.user_id,
    reaction: 'like' as const,
  }))
}

function buildCommentReactionMap(
  rows: Array<{ comment_id: string; user_id: string; reaction: 'like' | 'dislike' }>,
  viewerProfileId: string | null
) {
  const reactionMap = new Map<string, { like_count: number; dislike_count: number; user_reaction: 'like' | 'dislike' | null }>()

  for (const row of rows) {
    const current = reactionMap.get(row.comment_id) || {
      like_count: 0,
      dislike_count: 0,
      user_reaction: null,
    }

    if (row.reaction === 'dislike') current.dislike_count += 1
    else current.like_count += 1

    if (viewerProfileId && row.user_id === viewerProfileId) {
      current.user_reaction = row.reaction
    }

    reactionMap.set(row.comment_id, current)
  }

  return reactionMap
}

function getCommentMigrationErrorMessage(message: string) {
  if (/column .* does not exist|schema cache/i.test(message || '')) {
    return 'Comment attachments and reactions need the latest SQL migration. Run scripts/comment-engagement-v1.sql first.'
  }
  return null
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '30', 10), 100)

  if (!params.id || !/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const viewerProfileId = await getViewerProfileId(req, admin)

    const { data: allComments, error } = await admin
      .from('comments')
      .select('*')
      .eq('post_id', params.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) throw error

    const commentIds = (allComments || []).map((comment: any) => comment.id)
    const authorIds = Array.from(new Set((allComments || []).map((comment: any) => comment.user_id).filter(Boolean)))

    const [{ data: users }, reactionRows] = await Promise.all([
      authorIds.length
        ? admin
            .from('users')
            .select('id, username, full_name, display_name, avatar_url, is_verified')
            .in('id', authorIds)
        : Promise.resolve({ data: [] as any[] }),
      fetchCommentReactionRows(admin, commentIds),
    ])

    const userMap = new Map((users || []).map((user: any) => [user.id, user]))
    const reactionMap = buildCommentReactionMap(reactionRows, viewerProfileId)

    const topLevel: any[] = []
    const replyMap: Record<string, any[]> = {}

    for (const comment of allComments || []) {
      const reactionMeta = reactionMap.get(comment.id)
      const enrichedComment = {
        ...comment,
        mentions: Array.isArray(comment.mentions) ? comment.mentions : [],
        like_count: reactionMeta?.like_count ?? Number(comment.like_count || 0),
        dislike_count: reactionMeta?.dislike_count ?? Number(comment.dislike_count || 0),
        user_reaction: reactionMeta?.user_reaction ?? null,
        user_liked: reactionMeta?.user_reaction === 'like',
        user: comment.is_anonymous ? null : (userMap.get(comment.user_id) || null),
      }

      if (!comment.parent_id) {
        topLevel.push({ ...enrichedComment, replies: [] })
      } else {
        if (!replyMap[comment.parent_id]) replyMap[comment.parent_id] = []
        replyMap[comment.parent_id].push(enrichedComment)
      }
    }

    const withReplies = topLevel.map((comment) => ({
      ...comment,
      replies: replyMap[comment.id] || [],
    }))

    const res = NextResponse.json({ data: withReplies })
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (err: any) {
    console.error('[comments GET]', err.message)
    return NextResponse.json({ error: 'Failed to load comments' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const admin = createAdminClient()
    const { getUserIdFromToken: getUID } = await import('@/lib/jwt')
    const authId = getUID(req.headers.get('authorization'))
    const sessionUser = authId ? { id: authId } : null

    if (!sessionUser) {
      return NextResponse.json({ error: 'Sign in to comment' }, { status: 401 })
    }

    const { data: profile } = await admin
      .from('users')
      .select('id, username, display_name, avatar_url, is_verified, is_banned')
      .eq('auth_id', sessionUser.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    if (profile.is_banned) return NextResponse.json({ error: 'Account suspended' }, { status: 403 })

    const rl = rateLimit(`comment:${profile.id}`, { max: 30, windowMs: 60000 })
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Commenting too fast. Please slow down.' }, { status: 429 })
    }

    let rawBody: any
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const v = validate(createCommentSchema, rawBody)
    if (!v.success) return NextResponse.json({ error: v.error }, { status: 400 })

    const parentId = v.data.parent_id || null
    const isAnonymous = !!v.data.is_anonymous
    const mentionedUserIds = (v.data.mentioned_user_ids || [])
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
      .slice(0, 10)

    if (parentId) {
      const { data: parent } = await admin
        .from('comments')
        .select('post_id')
        .eq('id', parentId)
        .single()

      if (!parent || parent.post_id !== params.id) {
        return NextResponse.json({ error: 'Invalid parent comment' }, { status: 400 })
      }
    }

    const safeImageUrl = sanitizeURL(v.data.image_url || null)
    const safeVideoUrl = sanitizeURL(v.data.video_url || null)
    const safeVideoThumbUrl = sanitizeURL(v.data.video_thumbnail_url || null)
    const safeGifUrl = sanitizeURL(v.data.gif_url || null)
    const hasAttachment = !!(safeImageUrl || safeVideoUrl || safeGifUrl)
    const safeContent = sanitizeInput(v.data.content || '')
    const storedContent = getStoredCommentContent(safeContent, hasAttachment)

    const insertData: Record<string, any> = {
      post_id: params.id,
      user_id: profile.id,
      content: storedContent,
      parent_id: parentId,
      is_anonymous: isAnonymous,
      mentions: mentionedUserIds,
    }

    if (safeImageUrl) insertData.image_url = safeImageUrl
    if (safeVideoUrl) insertData.video_url = safeVideoUrl
    if (safeVideoThumbUrl) insertData.video_thumbnail_url = safeVideoThumbUrl
    if (safeGifUrl) insertData.gif_url = safeGifUrl

    const { data: comment, error } = await admin
      .from('comments')
      .insert(insertData)
      .select('*')
      .single()

    if (error) {
      const migrationMessage = getCommentMigrationErrorMessage(error.message || '')
      if (migrationMessage) {
        return NextResponse.json({ error: migrationMessage }, { status: 409 })
      }
      throw error
    }

    const { data: post } = await admin
      .from('posts')
      .select('user_id, tags, is_anonymous')
      .eq('id', params.id)
      .single()

    if (post && post.user_id !== profile.id) {
      admin.from('notifications').insert({
        user_id: post.user_id,
        actor_id: isAnonymous ? null : profile.id,
        type: 'new_comment',
        post_id: params.id,
        message: 'commented on your post',
      }).then(() => {}).catch(() => {})
    }

    if (parentId) {
      const { data: parentComment } = await admin
        .from('comments')
        .select('user_id')
        .eq('id', parentId)
        .single()

      if (parentComment && parentComment.user_id !== profile.id) {
        admin.from('notifications').insert({
          user_id: parentComment.user_id,
          actor_id: isAnonymous ? null : profile.id,
          type: 'new_comment',
          post_id: params.id,
          message: 'replied to your comment',
        }).then(() => {}).catch(() => {})
      }
    }

    for (const uid of mentionedUserIds) {
      if (uid === profile.id) continue
      admin.from('notifications').insert({
        user_id: uid,
        actor_id: isAnonymous ? null : profile.id,
        type: 'comment_mention',
        post_id: params.id,
        message: 'mentioned you in a comment',
      }).then(() => {}).catch(() => {})
    }

    const { awardPoints } = await import('@/lib/points')
    awardPoints(profile.id, 'comment_posted', comment.id).then(() => {}).catch(() => {})

    if (post) {
      if (post.tags?.length) {
        for (const tag of post.tags.slice(0, 5)) {
          admin.rpc('update_user_affinity', {
            p_user_id: profile.id,
            p_dimension: `tag:${tag}`,
            p_delta: 3.0,
          }).then(() => {}).catch(() => {})
        }
      }

      if (post.user_id && !post.is_anonymous && post.user_id !== profile.id) {
        admin.rpc('update_user_affinity', {
          p_user_id: profile.id,
          p_dimension: `author:${post.user_id}`,
          p_delta: 3.0,
        }).then(() => {}).catch(() => {})
      }
    }

    const res = NextResponse.json({
      data: {
        ...comment,
        mentions: Array.isArray(comment.mentions) ? comment.mentions : mentionedUserIds,
        like_count: Number(comment.like_count || 0),
        dislike_count: Number(comment.dislike_count || 0),
        user_reaction: null,
        user_liked: false,
        user: isAnonymous ? null : {
          id: profile.id,
          username: profile.username,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          is_verified: profile.is_verified,
        },
        replies: [],
      },
    }, { status: 201 })

    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (err: any) {
    console.error('[comments POST]', err.message)
    return NextResponse.json({ error: 'Failed to post comment' }, { status: 500 })
  }
}
