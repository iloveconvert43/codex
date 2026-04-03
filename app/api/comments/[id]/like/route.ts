export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/comments/[id]/like — Toggle comment reaction (like/dislike)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

type Ctx = { params: { id: string } }

function getMigrationMessage() {
  return 'Comment dislikes need the latest SQL migration. Run scripts/comment-engagement-v1.sql first.'
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

    const rpc = await supabase.rpc('toggle_comment_reaction', {
      p_comment_id: params.id,
      p_user_id: profile.id,
      p_reaction: requestedReaction,
    })

    if (!rpc.error) {
      const result = rpc.data?.[0] ?? {
        reaction: null,
        like_count: 0,
        dislike_count: 0,
      }

      if (result.reaction === 'like') {
        supabase.from('comments').select('user_id').eq('id', params.id).single()
          .then(async ({ data: comment }) => {
            if (comment && comment.user_id !== profile.id) {
              const { awardPoints } = await import('@/lib/points')
              awardPoints(comment.user_id, 'comment_liked', params.id).then(() => {}).catch(() => {})
            }
          }).then(() => {}).catch(() => {})
      }

      const res = NextResponse.json({
        reaction: result.reaction,
        liked: result.reaction === 'like',
        like_count: Number(result.like_count || 0),
        dislike_count: Number(result.dislike_count || 0),
      })
      res.headers.set('Cache-Control', 'no-store')
      return res
    }

    if (requestedReaction === 'dislike') {
      return NextResponse.json({ error: getMigrationMessage() }, { status: 409 })
    }

    if (!/toggle_comment_reaction|function .* does not exist|column .* does not exist|schema cache/i.test(rpc.error.message || '')) {
      return NextResponse.json({ error: rpc.error.message }, { status: 500 })
    }

    const legacy = await supabase.rpc('toggle_comment_like', {
      p_comment_id: params.id,
      p_user_id: profile.id,
    })

    if (legacy.error) {
      return NextResponse.json({ error: legacy.error.message }, { status: 500 })
    }

    const result = legacy.data?.[0] ?? { liked: false, like_count: 0 }

    if (result.liked) {
      supabase.from('comments').select('user_id').eq('id', params.id).single()
        .then(async ({ data: comment }) => {
          if (comment && comment.user_id !== profile.id) {
            const { awardPoints } = await import('@/lib/points')
            awardPoints(comment.user_id, 'comment_liked', params.id).then(() => {}).catch(() => {})
          }
        }).then(() => {}).catch(() => {})
    }

    const res = NextResponse.json({
      reaction: result.liked ? 'like' : null,
      liked: !!result.liked,
      like_count: Number(result.like_count || 0),
      dislike_count: 0,
    })
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (err: any) {
    console.error('[comment reaction]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
