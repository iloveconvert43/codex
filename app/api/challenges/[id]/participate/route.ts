export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/challenges/[id]/participate
 * Works for both admin challenges and user-created challenges
 * 
 * Body: { post_id: string, challenge_type: 'admin' | 'user' }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidUUID } from '@/lib/security'
import { awardPoints } from '@/lib/points'
import { queuePush } from '@/lib/push'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!isValidUUID(params.id)) {
      return NextResponse.json({ error: 'Invalid challenge ID' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Sign in to participate' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const body = await req.json()
    const { post_id, challenge_type = 'user' } = body

    if (!isValidUUID(post_id)) {
      return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 })
    }

    // Verify post belongs to user
    const { data: post } = await supabase
      .from('posts').select('user_id, tags').eq('id', post_id).single()
    if (!post || post.user_id !== profile.id) {
      return NextResponse.json({ error: 'Post not found or not yours' }, { status: 403 })
    }

    if (challenge_type === 'admin') {
      // Admin daily challenge participation
      const { error } = await supabase.from('challenge_posts').upsert(
        { user_id: profile.id, challenge_id: params.id, post_id, is_featured: true },
        { onConflict: 'user_id,challenge_id', ignoreDuplicates: true }
      )
      if (error) throw error

      // Update participant count on daily_challenges
      await supabase.rpc('increment', { table: 'daily_challenges', col: 'participant_count', row_id: params.id })
        .then(() => {}).catch(() => {
          supabase.from('daily_challenges')
            .update({ participant_count: supabase.rpc('increment_count', { p_id: params.id }) })
            .eq('id', params.id).then(() => {}).catch(() => {})
        })
    } else {
      // User-created challenge participation
      const { data: challenge } = await supabase
        .from('user_challenges')
        .select('id, participant_count, creator_id, title, expires_at, is_anonymous')
        .eq('id', params.id).single()
      if (!challenge) return NextResponse.json({ error: 'Challenge not found' }, { status: 404 })

      // Check expiry
      if (new Date(challenge.expires_at) < new Date()) {
        return NextResponse.json({ error: 'This challenge has expired' }, { status: 410 })
      }

      const { error } = await supabase.from('user_challenge_posts').upsert(
        { user_challenge_id: params.id, post_id, user_id: profile.id, is_featured: true },
        { onConflict: 'user_challenge_id,user_id', ignoreDuplicates: true }
      )
      if (error) throw error

      // Update participant count
      await supabase.from('user_challenges')
        .update({ participant_count: (challenge.participant_count || 0) + 1 })
        .eq('id', params.id)

      // Notify challenge creator (if not self, not anonymous)
      if (challenge.creator_id && challenge.creator_id !== profile.id && !challenge.is_anonymous) {
        supabase.from('notifications').insert({
          user_id:  challenge.creator_id,
          actor_id: profile.id,
          type:     'challenge_reminder',
          message:  `joined your challenge: ${challenge.title}`
        }).then(() => {}).catch(() => {})
        queuePush(challenge.creator_id, {
          title: 'Someone joined your challenge! 🔥',
          body:  `New response to "${challenge.title}"`,
          url:   '/challenge'
        }).then(() => {}).catch(() => {})
      }
    }

    // Award points for challenge participation
    awardPoints(profile.id, 'daily_challenge', post_id).then(() => {}).catch(() => {})

    // Update tag interests based on post tags
    if (post.tags?.length) {
      supabase.rpc('update_tag_interest', {
        p_user_id: profile.id,
        p_tags: post.tags,
        p_delta: 2 }).then(() => {}).catch(() => {})
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[challenges/participate]', err.message)
    return NextResponse.json({ error: 'Failed to participate' }, { status: 500 })
  }
}
