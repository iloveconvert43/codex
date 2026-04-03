export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * GET  /api/rooms/[slug]/challenge   — today's room challenge
 * POST /api/rooms/[slug]/challenge   — create challenge (moderators only)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { sanitizeInput, isValidUUID } from '@/lib/security'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = createAdminClient()
    const today = new Date().toISOString().split('T')[0]

    const { data: room } = await supabase
      .from('topic_rooms').select('id, name, emoji').eq('slug', params.slug).single()
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

    const { data: challenge } = await supabase
      .from('room_challenges')
      .select('*')
      .eq('room_id', room.id)
      .eq('challenge_date', today)
      .eq('is_active', true)
      .single()

    return NextResponse.json({ data: challenge || null, room })
  } catch (err: any) {
    console.error('[room/challenge GET]', err.message)
    return NextResponse.json({ error: 'Failed to load challenge' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const { data: room } = await supabase
      .from('topic_rooms').select('id').eq('slug', params.slug).single()
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

    // Check if user is a moderator of this room
    const { data: isMod } = await supabase
      .from('room_moderators').select('role')
      .eq('room_id', room.id).eq('user_id', me.id).single()
    if (!isMod) return NextResponse.json({ error: 'Only room moderators can create challenges' }, { status: 403 })

    const body = await req.json()
    const title = sanitizeInput(body.title)
    const description = sanitizeInput(body.description)
    const emoji = body.emoji?.slice(0, 4) || '🔥'
    const date = body.challenge_date || new Date().toISOString().split('T')[0]

    if (!title || title.length < 3) return NextResponse.json({ error: 'Title required (3+ chars)' }, { status: 400 })
    if (!description || description.length < 10) return NextResponse.json({ error: 'Description required (10+ chars)' }, { status: 400 })

    // Deactivate previous challenge for today if exists
    await supabase.from('room_challenges')
      .update({ is_active: false })
      .eq('room_id', room.id)
      .eq('challenge_date', date)

    const { data, error } = await supabase.from('room_challenges').insert({
      room_id: room.id, title, description, emoji,
      challenge_date: date, created_by: me.id }).select().single()

    if (error) throw error

    // Notify all room members
    const { data: members } = await supabase
      .from('room_memberships')
      .select('user_id')
      .eq('room_id', room.id)
      .neq('user_id', me.id)

    if (members?.length) {
      const { data: roomInfo } = await supabase
        .from('topic_rooms').select('name, emoji').eq('id', room.id).single()
      
      const notifications = members.map((m: any) => ({
        user_id: m.user_id,
        type: 'challenge_reminder',
        room_id: room.id,
        message: `New challenge in ${roomInfo?.emoji} ${roomInfo?.name}: "${title}"` }))
      await supabase.from('notifications').insert(notifications).then(() => {}).catch(() => {})
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err: any) {
    console.error('[room/challenge POST]', err.message)
    return NextResponse.json({ error: 'Failed to create challenge' }, { status: 500 })
  }
}
