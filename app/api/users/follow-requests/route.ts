export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * GET  /api/users/follow-requests — Get pending follow requests for logged-in user
 * POST /api/users/follow-requests — Accept or reject a follow request
 *
 * Body for POST: { request_id, action: 'accept' | 'reject' }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ data: [] })

    const { data: requests } = await supabase
      .from('follow_requests')
      .select(`
        id, status, created_at,
        requester:users!requester_id(
          id, username, display_name, full_name, avatar_url, is_verified, bio
        )
      `)
      .eq('target_id', me.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50)

    return NextResponse.json({ data: requests || [] })
  } catch (err: any) {
    console.error('[follow-requests GET]', err.message)
    return NextResponse.json({ error: 'Failed to load requests' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me } = await supabase
      .from('users').select('id, display_name, username').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const { request_id, action } = await req.json()
    if (!request_id || !['accept', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // Verify this request is for the current user
    const { data: request } = await supabase.from('follow_requests')
      .select('id, requester_id, target_id').eq('id', request_id).single()

    if (!request || request.target_id !== me.id) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    if (action === 'accept') {
      // Create the follow relationship
      await supabase.from('follows').upsert({
        follower_id:  request.requester_id,
        following_id: me.id }, { onConflict: 'follower_id,following_id', ignoreDuplicates: true })

      // Delete the request
      await supabase.from('follow_requests').delete().eq('id', request_id)

      // Notify requester
      supabase.from('notifications').insert({
        user_id:  request.requester_id,
        actor_id: me.id,
        type:     'follow_accepted',
        message:  'accepted your follow request' }).then(() => {}).catch(() => {})

      return NextResponse.json({ success: true, action: 'accepted' })
    } else {
      // Reject: just delete the request
      await supabase.from('follow_requests').delete().eq('id', request_id)
      return NextResponse.json({ success: true, action: 'rejected' })
    }
  } catch (err: any) {
    console.error('[follow-requests POST]', err.message)
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
  }
}
