export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/comments/[id]/like — Toggle comment reaction (like/dislike)
 * Uses direct table updates so a broken SQL function doesn't block reactions.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

type Ctx = { params: { id: string } }

function getMigrationMessage() {
  return 'Comment dislikes need the latest SQL migration. Run scripts/comment-engagement-v1.sql first.'
}

function isMissingReactionSupport(message: string) {
  return /column .*reaction.* does not exist|column .*dislike_count.* does not exist|schema cache/i.test(message || '')
}

async function syncCommentCounts(
  supabase: ReturnType<typeof createAdminClient>,
  commentId: string
) {
  const { data: reactionRows, error } = await supabase
    .from('comment_likes')
    .select('reaction')
    .eq('comment_id', commentId)

  if (error) throw error

  let likeCount = 0
  let dislikeCount = 0

  for (const row of reactionRows || []) {
    if ((row as any).reaction === 'dislike') dislikeCount += 1
    else likeCount += 1
  }

  const { error: updateError } = await supabase
    .from('comments')
    .update({
      like_count: likeCount,
      dislike_count: dislikeCount,
    })
    .eq('id', commentId)

  if (updateError) throw updateError

  return { like_count: likeCount, dislike_count: dislikeCount }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    if (!params.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.id)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { getUserIdFromToken: getUID } = await import('@/lib/jwt')
    const authId = getUID(req.headers.get('authorization'))
    const sessionUser = authId ? { id: authId } : null

    if (!sessionUser) return NextResponse.json({ error: 'Sign in to react' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', sessionUser.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    let body: any = {}
    try {
      body = await req.json()
    } catch {}

    const requestedReaction = body?.reaction === 'dislike' ? 'dislike' : 'like'

    const currentReactionRes = await supabase
      .from('comment_likes')
      .select('reaction')
      .eq('comment_id', params.id)
      .eq('user_id', profile.id)
      .maybeSingle()

    if (currentReactionRes.error) {
      if (requestedReaction === 'dislike' && isMissingReactionSupport(currentReactionRes.error.message || '')) {
        return NextResponse.json({ error: getMigrationMessage() }, { status: 409 })
      }

      if (!isMissingReactionSupport(currentReactionRes.error.message || '')) {
        return NextResponse.json({ error: currentReactionRes.error.message }, { status: 500 })
      }

      const legacy = await supabase.rpc('toggle_comment_like', {
        p_comment_id: params.id,
        p_user_id: profile.id,
      })

      if (legacy.error) {
        return NextResponse.json({ error: legacy.error.message }, { status: 500 })
      }

      const result = legacy.data?.[0] ?? { liked: false, like_count: 0 }
      const res = NextResponse.json({
        reaction: result.liked ? 'like' : null,
        liked: !!result.liked,
        like_count: Number(result.like_count || 0),
        dislike_count: 0,
      })
      res.headers.set('Cache-Control', 'no-store')
      return res
    }

    const currentReaction = currentReactionRes.data?.reaction === 'dislike' ? 'dislike' : currentReactionRes.data?.reaction === 'like' ? 'like' : null
    const nextReaction = currentReaction === requestedReaction ? null : requestedReaction

    if (!currentReaction) {
      const { error } = await supabase
        .from('comment_likes')
        .insert({
          comment_id: params.id,
          user_id: profile.id,
          reaction: requestedReaction,
        })

      if (error) {
        if (requestedReaction === 'dislike' && isMissingReactionSupport(error.message || '')) {
          return NextResponse.json({ error: getMigrationMessage() }, { status: 409 })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else if (!nextReaction) {
      const { error } = await supabase
        .from('comment_likes')
        .delete()
        .eq('comment_id', params.id)
        .eq('user_id', profile.id)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await supabase
        .from('comment_likes')
        .update({ reaction: requestedReaction })
        .eq('comment_id', params.id)
        .eq('user_id', profile.id)

      if (error) {
        if (requestedReaction === 'dislike' && isMissingReactionSupport(error.message || '')) {
          return NextResponse.json({ error: getMigrationMessage() }, { status: 409 })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    const counts = await syncCommentCounts(supabase, params.id)

    if (nextReaction === 'like') {
      supabase.from('comments').select('user_id').eq('id', params.id).single()
        .then(async ({ data: comment }) => {
          if (comment && comment.user_id !== profile.id) {
            const { awardPoints } = await import('@/lib/points')
            awardPoints(comment.user_id, 'comment_liked', params.id).then(() => {}).catch(() => {})
          }
        }).then(() => {}).catch(() => {})
    }

    const res = NextResponse.json({
      reaction: nextReaction,
      liked: nextReaction === 'like',
      like_count: counts.like_count,
      dislike_count: counts.dislike_count,
    })
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (err: any) {
    console.error('[comment reaction]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
