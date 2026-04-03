export const dynamic = 'force-dynamic'
export const maxDuration = 10
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { sendPushToUser } from '@/lib/push'
import { isValidUUID, rateLimit } from '@/lib/security'

export async function POST(req: NextRequest) {
  try {
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    if (!_authId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Use admin client to bypass RLS
    const supabase = createAdminClient()

    const { data: me } = await supabase
      .from('users').select('id, display_name, username, avatar_url').eq('auth_id', _authId).single()
    if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const rl = rateLimit(`call-ring:${me.id}`, { max: 5, windowMs: 60000 })
    if (!rl.allowed) return NextResponse.json({ error: 'Too many calls' }, { status: 429 })

    const { recipient_id, call_type = 'audio' } = await req.json()
    if (!recipient_id || !isValidUUID(recipient_id)) {
      return NextResponse.json({ error: 'Invalid recipient' }, { status: 400 })
    }
    if (recipient_id === me.id) return NextResponse.json({ error: 'Cannot call yourself' }, { status: 400 })

    const { data: recipient } = await supabase.from('users').select('id, is_banned').eq('id', recipient_id).single()
    if (!recipient || recipient.is_banned) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Calling requires MUTUAL follow (both follow each other) + not blocked
    const { data: canCall } = await supabase
      .rpc('can_call', { p_caller_id: me.id, p_recipient_id: recipient_id })

    if (!canCall) {
      // Tell client WHY so it can show proper message
      const { data: blockedCheck } = await supabase.from('user_blocks').select('id')
        .eq('blocker_id', recipient_id).eq('blocked_id', me.id).maybeSingle()
      if (blockedCheck) {
        return NextResponse.json({ error: 'Cannot call this user', code: 'BLOCKED' }, { status: 403 })
      }
      return NextResponse.json({
        error: 'You can only call people who follow you back',
        code:  'NOT_MUTUAL_FOLLOW',
        hint:  'Both users must follow each other to enable calls'
      }, { status: 403 })
    }

    const callerName = me.display_name || me.username || 'Someone'
    const callEmoji  = call_type === 'video' ? '📹' : '📞'

    await sendPushToUser(recipient_id, {
      title: `${callEmoji} Incoming ${call_type} call`,
      body:  `${callerName} is calling you`,
      url:   `/messages?user=${me.id}&action=answer&type=${call_type}`,
      tag:   'incoming-call',
      data:  {
        type: 'incoming_call', caller_id: me.id, call_type,
        caller_name: callerName, caller_avatar: me.avatar_url,
      }
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[calls/ring]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
