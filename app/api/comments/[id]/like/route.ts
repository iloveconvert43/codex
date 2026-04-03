export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/comments/[id]/like — Toggle like on a comment
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
type Ctx = { params: { id: string } }


export async function POST(req: NextRequest, { params }: Ctx) {
  try {
  // Validate UUID format to prevent injection
  if (!params.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.id)) {
    return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
  }
  const supabase = createAdminClient()
  const { rateLimit, isValidUUID } = await import('@/lib/security')
  const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
  if (!sessionUser) return NextResponse.json({ error: 'Sign in to like' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('id').eq('auth_id', sessionUser.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // Use stored procedure for atomic toggle
  const { data, error } = await supabase.rpc('toggle_comment_like', {
    p_comment_id: params.id,
    p_user_id: profile.id })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = data?.[0] ?? { liked: false, like_count: 0 }

  // Non-blocking: award points to comment author
  if (result.liked) {
    supabase.from('comments').select('user_id').eq('id', params.id).single()
      .then(async ({ data: comment }) => {
        if (comment && comment.user_id !== profile.id) {
          const { awardPoints } = await import('@/lib/points')
          awardPoints(comment.user_id, 'comment_liked', params.id).then(() => {}).catch(() => {})
        }
      }).then(() => {}).catch(() => {})
  }

  return NextResponse.json({ liked: result.liked, like_count: result.like_count })
  } catch (err: any) {
    console.error('[route error]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}