export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * GET    /api/rooms/[slug]/moderators   — list moderators
 * POST   /api/rooms/[slug]/moderators   — add moderator (room admin only)
 * DELETE /api/rooms/[slug]/moderators   — remove moderator
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidUUID } from '@/lib/security'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = createAdminClient()
    const { data: room } = await supabase
      .from('topic_rooms').select('id').eq('slug', params.slug).single()
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

    const { data, error } = await supabase
      .from('room_moderators')
      .select('role, assigned_at, user:users(id, username, display_name, avatar_url)')
      .eq('room_id', room.id)

    if (error) throw error
    return NextResponse.json({ data: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to load moderators' }, { status: 500 })
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
    if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: room } = await supabase
      .from('topic_rooms').select('id, created_by').eq('slug', params.slug).single()
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

    // Only room creator or existing admin can add moderators
    const { data: myMod } = await supabase
      .from('room_moderators').select('role')
      .eq('room_id', room.id).eq('user_id', me.id).single()
    const isAdmin = room.created_by === me.id || myMod?.role === 'admin'
    if (!isAdmin) return NextResponse.json({ error: 'Only room admins can add moderators' }, { status: 403 })

    const { user_id, role = 'moderator' } = await req.json()
    if (!isValidUUID(user_id)) return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
    if (!['moderator', 'admin'].includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })

    // Check target is a room member
    const { data: isMember } = await supabase
      .from('room_memberships').select('room_id').eq('room_id', room.id).eq('user_id', user_id).single()
    if (!isMember) return NextResponse.json({ error: 'User must be a room member first' }, { status: 400 })

    await supabase.from('room_moderators').upsert({
      room_id: room.id, user_id, role, assigned_by: me.id }, { onConflict: 'room_id,user_id' })

    // Notify new moderator
    supabase.from('notifications').insert({
      user_id,
      type: 'badge_awarded',
      room_id: room.id,
      message: `You are now a ${role} in this room!` }).then(() => {}).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to add moderator' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    const { data: room } = await supabase.from('topic_rooms').select('id, created_by').eq('slug', params.slug).single()
    if (!room || !me) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isAdmin = room.created_by === me.id
    const { user_id } = await req.json()
    if (!isValidUUID(user_id)) return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })

    // Can remove self OR admin can remove anyone
    if (me.id !== user_id && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    await supabase.from('room_moderators')
      .delete().eq('room_id', room.id).eq('user_id', user_id)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to remove moderator' }, { status: 500 })
  }
}
