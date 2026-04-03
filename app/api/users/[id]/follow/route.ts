export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST  /api/users/[id]/follow — Follow / Unfollow / Request Follow
 * GET   /api/users/[id]/follow — Check follow status
 *
 * Instagram-style private profile logic:
 *   Public profile  → immediate follow
 *   Private profile → send follow_request (pending until accepted)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidUUID, rateLimit } from '@/lib/security'
import { queuePush } from '@/lib/push'
import { awardPoints } from '@/lib/points'

type Ctx = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    if (!isValidUUID(params.id)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
    }
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ is_following: false, request_pending: false })

    const { data: me } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ is_following: false, request_pending: false })

    const [{ data: follow }, { data: request }] = await Promise.all([
      supabase.from('follows').select('follower_id')
        .eq('follower_id', me.id).eq('following_id', params.id).single(),
      supabase.from('follow_requests').select('status')
        .eq('requester_id', me.id).eq('target_id', params.id).single(),
    ])

    return NextResponse.json({
      is_following:    !!follow,
      request_pending: request?.status === 'pending',
      request_status:  request?.status ?? null })
  } catch (err: any) {
    console.error('[follow GET]', err.message)
    return NextResponse.json({ is_following: false, request_pending: false })
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    if (!isValidUUID(params.id)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
    }
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Sign in to follow' }, { status: 401 })

    const { data: me } = await supabase
      .from('users').select('id, display_name, username').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    if (me.id === params.id) {
      return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 })
    }

    // Rate limit: 60 follows per hour
    const rl = rateLimit(`follow:${me.id}`, { max: 60, windowMs: 3600000 })
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Following too fast. Slow down.' }, { status: 429 })
    }

    // Get target user
    const { data: target } = await supabase
      .from('users')
      .select('id, display_name, username, is_banned, is_private')
      .eq('id', params.id).single()
    if (!target || target.is_banned) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if already following
    const { data: existingFollow } = await supabase.from('follows').select('follower_id')
      .eq('follower_id', me.id).eq('following_id', params.id).single()

    if (existingFollow) {
      // Unfollow
      await supabase.from('follows').delete()
        .eq('follower_id', me.id).eq('following_id', params.id)
      return NextResponse.json({ is_following: false, action: 'unfollowed' })
    }

    // ── PRIVATE PROFILE LOGIC (Instagram-style) ──────────────────
    if (target.is_private) {
      // Check for existing pending request
      const { data: existingReq } = await supabase.from('follow_requests').select('id, status')
        .eq('requester_id', me.id).eq('target_id', params.id).single()

      if (existingReq?.status === 'pending') {
        // Cancel the request
        await supabase.from('follow_requests').delete()
          .eq('requester_id', me.id).eq('target_id', params.id)
        return NextResponse.json({ is_following: false, action: 'request_cancelled', request_pending: false })
      }

      // Send follow request
      await supabase.from('follow_requests').upsert({
        requester_id: me.id,
        target_id:    params.id,
        status:       'pending',
        updated_at:   new Date().toISOString() }, { onConflict: 'requester_id,target_id' })

      // Notify target
      supabase.from('notifications').insert({
        user_id:   params.id,
        actor_id:  me.id,
        type:      'follow_request',
        message:   'wants to follow you' }).then(() => {}).catch(() => {})

      queuePush(params.id, {
        title: `${me.display_name || me.username || 'Someone'} wants to follow you`,
        body: 'Tap to accept or decline',
        url: `/profile/${me.id}` }).then(() => {}).catch(() => {})

      return NextResponse.json({
        is_following:    false,
        action:          'request_sent',
        request_pending: true })
    }

    // ── PUBLIC PROFILE: Immediate follow ─────────────────────────
    await supabase.from('follows').insert({ follower_id: me.id, following_id: params.id })

    // Award points + notify (non-blocking)
    awardPoints(me.id, 'reaction_received', params.id).then(() => {}).catch(() => {})

    // Following someone = strong author affinity signal (weight 5.0)
    supabase.rpc('update_user_affinity', {
      p_user_id: me.id, p_dimension: `author:${params.id}`, p_delta: 5.0
    }).then(() => {}).catch(() => {})

    supabase.from('notifications').insert({
      user_id:  params.id,
      actor_id: me.id,
      type:     'new_follower',
      message:  'started following you' }).then(() => {}).catch(() => {})

    queuePush(params.id, {
      title: `${me.display_name || me.username || 'Someone'} followed you`,
      body: 'Check out their profile!',
      url: `/profile/${me.id}` }).then(() => {}).catch(() => {})

    return NextResponse.json({ is_following: true, action: 'followed' })
  } catch (err: any) {
    console.error('[follow POST]', err.message)
    return NextResponse.json({ error: 'Failed to follow' }, { status: 500 })
  }
}
