export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * GET  /api/messages/requests          — list my pending incoming requests
 * POST /api/messages/requests          — send a message request to a stranger
 * PATCH /api/messages/requests         — accept or decline a request
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { sanitizeInput, rateLimit, isValidUUID } from '@/lib/security'
import { queuePush } from '@/lib/push'

// ── GET: list pending incoming requests ──────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ data: [] })

    const { data: me } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ data: [] })

    const { data: requests } = await supabase
      .from('message_requests')
      .select(`
        id, message, status, created_at,
        sender:users!sender_id(id, username, display_name, avatar_url, is_verified)
      `)
      .eq('receiver_id', me.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50)

    return NextResponse.json({ data: requests || [] })
  } catch (err: any) {
    console.error('[msg/requests GET]', err.message)
    return NextResponse.json({ data: [] })
  }
}

// ── POST: send a message request ─────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

    const { data: me } = await supabase
      .from('users').select('id, is_banned, display_name, username').eq('auth_id', sessionUser.id).single()
    if (!me)        return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    if (me.is_banned) return NextResponse.json({ error: 'Account suspended' }, { status: 403 })

    // Rate limit: max 10 requests per hour
    const rl = rateLimit(`msg-req:${me.id}`, { max: 10, windowMs: 3600000 })
    if (!rl.allowed) return NextResponse.json({ error: 'Too many message requests. Try again later.' }, { status: 429 })

    let reqBody: any
    try { reqBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
    const { to_user_id, message } = reqBody

    if (!isValidUUID(to_user_id)) return NextResponse.json({ error: 'Invalid user' }, { status: 400 })
    if (to_user_id === me.id)     return NextResponse.json({ error: 'Cannot message yourself' }, { status: 400 })

    const sanitized = sanitizeInput(message || '')
    if (!sanitized) return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    if (sanitized.length > 500) return NextResponse.json({ error: 'Message too long (max 500 chars)' }, { status: 400 })

    // Check recipient exists
    const { data: recipient } = await supabase
      .from('users').select('id, is_banned, display_name').eq('id', to_user_id).single()
    if (!recipient || recipient.is_banned) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Check permission using SQL function
    const { data: permission } = await supabase
      .rpc('get_dm_permission', { p_sender_id: me.id, p_receiver_id: to_user_id })

    if (permission === 'blocked') {
      return NextResponse.json({ error: 'Cannot message this user' }, { status: 403 })
    }
    if (permission === 'free' || permission === 'request_accepted') {
      // Should use normal send — redirect client
      return NextResponse.json({ error: 'Use /api/messages/send instead', code: 'USE_DIRECT_DM' }, { status: 400 })
    }
    if (permission === 'request_pending') {
      return NextResponse.json({ error: 'You already have a pending message request to this user' }, { status: 409 })
    }
    if (permission === 'request_declined') {
      return NextResponse.json({ error: 'This user has declined your message request' }, { status: 403 })
    }

    // Insert request
    const { data: requestRow, error } = await supabase
      .from('message_requests')
      .insert({ sender_id: me.id, receiver_id: to_user_id, message: sanitized })
      .select().single()

    if (error) throw error

    // Notify recipient
    const senderName = me.display_name || me.username || 'Someone'
    supabase.from('notifications').insert({
      user_id:  to_user_id,
      actor_id: me.id,
      type:     'message_request',
      message:  'sent you a message request'
    }).then(() => {}).catch(() => {})

    queuePush(to_user_id, {
      title: '💬 Message request',
      body:  `${senderName}: ${sanitized.slice(0, 60)}`,
      url:   '/messages/requests',
      data:  { type: 'message_request', sender_id: me.id }
    }).catch(() => {})

    return NextResponse.json({ data: requestRow, status: 'request_sent' }, { status: 201 })
  } catch (err: any) {
    console.error('[msg/requests POST]', err.message)
    return NextResponse.json({ error: 'Failed to send request' }, { status: 500 })
  }
}

// ── PATCH: accept or decline ──────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let patchBody: any
    try { patchBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
    const { request_id, action } = patchBody

    if (!isValidUUID(request_id)) return NextResponse.json({ error: 'Invalid request ID' }, { status: 400 })
    if (!['accept', 'decline'].includes(action)) return NextResponse.json({ error: 'action must be accept or decline' }, { status: 400 })

    // Verify this request belongs to me (I'm the receiver)
    const { data: request } = await supabase
      .from('message_requests')
      .select('id, sender_id, status')
      .eq('id', request_id)
      .eq('receiver_id', me.id)
      .single()

    if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    if (request.status !== 'pending') return NextResponse.json({ error: 'Request already handled' }, { status: 409 })

    const newStatus = action === 'accept' ? 'accepted' : 'declined'

    await supabase
      .from('message_requests')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', request_id)

    if (action === 'accept') {
      // Notify sender that request was accepted
      queuePush(request.sender_id, {
        title: '✅ Message request accepted',
        body:  'You can now send messages',
        url:   `/messages?user=${me.id}`,
        data:  { type: 'request_accepted', user_id: me.id }
      }).catch(() => {})

      supabase.from('notifications').insert({
        user_id:  request.sender_id,
        actor_id: me.id,
        type:     'message_request',
        message:  'accepted your message request'
      }).then(() => {}).catch(() => {})
    }

    return NextResponse.json({ ok: true, status: newStatus })
  } catch (err: any) {
    console.error('[msg/requests PATCH]', err.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
