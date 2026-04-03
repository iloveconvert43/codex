export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/feed/feedback
 * "See more" / "See less" / "Not interested" / "Report spam"
 * Facebook-style explicit feed quality feedback
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidUUID } from '@/lib/security'

export async function POST(req: NextRequest) {
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

    const { post_id, feedback } = await req.json()
    const validFeedback = ['less', 'more', 'not_interested', 'spam']

    if (!post_id || !isValidUUID(post_id) || !validFeedback.includes(feedback)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // Process feedback — updates affinity + adds to exclusion list if needed
    await supabase.rpc('process_feed_feedback', {
      p_user_id:  profile.id,
      p_post_id:  post_id,
      p_feedback: feedback
    })

    const messages: Record<string, string> = {
      less:           "Got it — we'll show fewer posts like this",
      more:           "Great — we'll show more posts like this",
      not_interested: "Post removed. We'll adjust your feed.",
      spam:           "Thanks for the report. Post removed from your feed."
    }

    return NextResponse.json({ ok: true, message: messages[feedback] })
  } catch (err: any) {
    console.error('[feed/feedback]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
