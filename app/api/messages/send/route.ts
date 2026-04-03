export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createRouteClient } from '@/lib/supabase-server'
import { sendMessageSchema, validate } from '@/lib/validation/schemas'
import { sanitizeInput, rateLimit, getClientIP, isValidUUID } from '@/lib/security'
import { queuePush } from '@/lib/push'
import { getDirectMessagePreview, normalizeDirectMessageAttachments } from '@/lib/direct-messages'

function isMissingMessageUpgrade(err: any) {
  const msg = err?.message || ''
  return /column .* does not exist|schema cache/i.test(msg)
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Sign in to send messages' }, { status: 401 })

    const { data: me } = await supabase
      .from('users').select('id, is_banned').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    if (me.is_banned) return NextResponse.json({ error: 'Account suspended' }, { status: 403 })

    // Rate limit: 60 messages per minute per user
    const rl = rateLimit(`msg:${me.id}`, { max: 60, windowMs: 60000 })
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Sending too fast. Slow down.' }, { status: 429 })
    }

    let rawBody: any
    try { rawBody = await req.json() }
    catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

    const v = validate(sendMessageSchema, rawBody)
    if (!v.success) return NextResponse.json({ error: v.error }, { status: 400 })

    const { to_user_id, content, image_url, video_url, video_thumbnail_url, attachments: rawAttachments } = v.data

    // UUID validation
    if (!isValidUUID(to_user_id)) {
      return NextResponse.json({ error: 'Invalid recipient ID' }, { status: 400 })
    }
    if (to_user_id === me.id) {
      return NextResponse.json({ error: 'Cannot message yourself' }, { status: 400 })
    }

    // Sanitize message content
    const sanitizedContent = sanitizeInput(content || '')
    const attachments = normalizeDirectMessageAttachments({
      attachments: rawAttachments,
      image_url,
      video_url,
      video_thumbnail_url,
    })

    if (!sanitizedContent && attachments.length === 0) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 })
    }

    const { data: receiver } = await supabase
      .from('users').select('id, is_banned, display_name').eq('id', to_user_id).single()
    if (!receiver || receiver.is_banned) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })
    }

    // ── Permission check ──────────────────────────────────
    // Uses SQL function: returns 'free' | 'request_needed' | 'request_accepted' | 'blocked' etc.
    const { data: permission } = await supabase
      .rpc('get_dm_permission', { p_sender_id: me.id, p_receiver_id: to_user_id })

    if (permission === 'blocked') {
      return NextResponse.json({ error: 'Cannot message this user' }, { status: 403 })
    }
    if (permission === 'request_needed') {
      return NextResponse.json({
        error: 'Send a message request first',
        code:  'REQUEST_REQUIRED',
        hint:  'Use POST /api/messages/requests to send a message request'
      }, { status: 403 })
    }
    if (permission === 'request_pending') {
      return NextResponse.json({
        error: 'Your message request is pending — wait for them to accept',
        code:  'REQUEST_PENDING'
      }, { status: 403 })
    }
    if (permission === 'request_declined') {
      return NextResponse.json({
        error: 'Cannot message this user',
        code:  'REQUEST_DECLINED'
      }, { status: 403 })
    }
    // 'free' or 'request_accepted' → proceed

    const firstImage = attachments.find((item) => item.type === 'image') || null
    const firstVideo = attachments.find((item) => item.type === 'video') || null

    let { data, error } = await supabase.from('direct_messages')
      .insert({
        sender_id: me.id,
        receiver_id: to_user_id,
        content: sanitizedContent || null,
        image_url: firstImage?.url || null,
        video_url: firstVideo?.url || null,
        video_thumbnail_url: firstVideo?.thumbnail_url || null,
        attachments,
      })
      .select('*, sender:users!sender_id(id,username,display_name,avatar_url)')
      .single()

    if (error && isMissingMessageUpgrade(error)) {
      if (attachments.length > 1 || firstVideo) {
        return NextResponse.json({
          error: 'Messaging upgrade needs the latest SQL migration. Run scripts/messaging-upgrade-v1.sql first.',
          code: 'MESSAGING_SQL_REQUIRED',
        }, { status: 409 })
      }

      const legacyInsert = await supabase.from('direct_messages')
        .insert({
          sender_id: me.id,
          receiver_id: to_user_id,
          content: sanitizedContent || null,
          image_url: firstImage?.url || null,
        })
        .select('*, sender:users!sender_id(id,username,display_name,avatar_url)')
        .single()
      data = legacyInsert.data
      error = legacyInsert.error
    }

    if (error) throw error

    // Notify receiver (non-blocking)
    supabase.from('notifications').insert({
      user_id: to_user_id,
      actor_id: me.id,
      type: 'new_message',
      message: 'sent you a message' }).then(() => {}).catch(() => {})

    queuePush(to_user_id, {
      title: 'New message',
      body: getDirectMessagePreview({ content: sanitizedContent, attachments }, me.id).slice(0, 80) || 'New message',
      url: `/messages?user=${me.id}` }).then(() => {}).catch(() => {})

    return NextResponse.json({ data }, { status: 201 })
  } catch (err: any) {
    console.error('[messages/send]', err.message)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { message_id, scope } = await req.json()
    if (!message_id) return NextResponse.json({ error: 'message_id required' }, { status: 400 })
    const { data: msg } = await supabase.from('direct_messages')
      .select('id,sender_id,receiver_id').eq('id', message_id).single()
    if (!msg || (msg.sender_id !== me.id && msg.receiver_id !== me.id)) {
      return NextResponse.json({ error: 'Cannot delete this message' }, { status: 403 })
    }
    const deleteScope = scope === 'everyone' ? 'everyone' : 'me'

    if (deleteScope === 'everyone') {
      if (msg.sender_id !== me.id) {
        return NextResponse.json({ error: 'Only the sender can remove for everyone' }, { status: 403 })
      }

      const updatePayload: Record<string, any> = {
        is_deleted: true,
        deleted_for_everyone: true,
        deleted_at: new Date().toISOString(),
        deleted_by: me.id,
        content: null,
        image_url: null,
      }

      const everyoneDelete = await supabase.from('direct_messages').update({
        ...updatePayload,
        video_url: null,
        video_thumbnail_url: null,
        attachments: [],
      }).eq('id', message_id)

      if (everyoneDelete.error && isMissingMessageUpgrade(everyoneDelete.error)) {
        const legacyDelete = await supabase.from('direct_messages').update({
          is_deleted: true,
          content: 'Message deleted',
        }).eq('id', message_id)
        if (legacyDelete.error) throw legacyDelete.error
      } else if (everyoneDelete.error) {
        throw everyoneDelete.error
      }
      return NextResponse.json({ ok: true })
    }

    const sideColumn = msg.sender_id === me.id ? 'deleted_for_sender' : 'deleted_for_receiver'
    const { error: updateError } = await supabase.from('direct_messages')
      .update({ [sideColumn]: true })
      .eq('id', message_id)

    if (updateError && isMissingMessageUpgrade(updateError)) {
      if (msg.sender_id !== me.id) {
        return NextResponse.json({
          error: 'Delete-for-you needs the latest SQL migration. Run scripts/messaging-upgrade-v1.sql first.',
          code: 'MESSAGING_SQL_REQUIRED',
        }, { status: 409 })
      }
      await supabase.from('direct_messages').update({ is_deleted: true, content: 'Message deleted' }).eq('id', message_id)
    } else if (updateError) {
      throw updateError
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  // Mark all messages in a conversation as read
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ ok: true })
    const { conversation_with } = await req.json()
    if (!conversation_with) return NextResponse.json({ ok: true })
    await supabase.from('direct_messages')
      .update({ is_read: true })
      .eq('receiver_id', me.id)
      .eq('sender_id', conversation_with)
      .eq('is_read', false)
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ ok: true }) }
}
