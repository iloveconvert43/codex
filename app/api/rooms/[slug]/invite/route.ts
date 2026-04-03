export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/rooms/[slug]/invite   — generate invite link
 * GET  /api/rooms/[slug]/invite?code=  — use invite code to join
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

type Ctx = { params: { slug: string } }

function randomCode(len = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let r = ''
  for (let i = 0; i < len; i++) r += chars[Math.floor(Math.random() * chars.length)]
  return r
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
    const { data: room } = await supabase.from('topic_rooms').select('id, is_private').eq('slug', params.slug).single()
    if (!room || !me) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Check user is member or moderator
    const { data: isMember } = await supabase
      .from('room_memberships').select('room_id').eq('room_id', room.id).eq('user_id', me.id).single()
    if (!isMember) return NextResponse.json({ error: 'Must be a member to invite' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const expiresHours = Math.min(body.expires_hours || 24, 168) // Max 7 days
    const expiresAt = new Date(Date.now() + expiresHours * 3600000).toISOString()

    const code = randomCode(8)
    const { data, error } = await supabase.from('room_invites').insert({
      room_id: room.id,
      invited_by: me.id,
      invited_user: body.user_id || null,
      code,
      expires_at: expiresAt }).select().single()

    if (error) throw error

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/rooms/${params.slug}?invite=${code}`
    return NextResponse.json({ code, invite_url: inviteUrl, expires_at: expiresAt })
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to generate invite' }, { status: 500 })
  }
}

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Sign in to join via invite' }, { status: 401 })

    const code = new URL(req.url).searchParams.get('code')
    if (!code) return NextResponse.json({ error: 'Invite code required' }, { status: 400 })

    const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    const { data: room } = await supabase.from('topic_rooms').select('id, name, member_count').eq('slug', params.slug).single()
    if (!room || !me) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Validate invite
    const { data: invite } = await supabase
      .from('room_invites').select('*')
      .eq('room_id', room.id).eq('code', code).eq('used', false).single()

    if (!invite) return NextResponse.json({ error: 'Invalid or expired invite code' }, { status: 400 })
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invite code has expired' }, { status: 400 })
    }
    if (invite.invited_user && invite.invited_user !== me.id) {
      return NextResponse.json({ error: 'This invite is for someone else' }, { status: 403 })
    }

    // Join room
    const { data: existing } = await supabase
      .from('room_memberships').select('room_id').eq('room_id', room.id).eq('user_id', me.id).maybeSingle()

    if (!existing) {
      await supabase.from('room_memberships').insert({ room_id: room.id, user_id: me.id })
      await supabase.from('topic_rooms').update({ member_count: room.member_count + 1 }).eq('id', room.id)
    }

    // Mark invite used if it was a personal invite
    if (invite.invited_user) {
      await supabase.from('room_invites').update({ used: true }).eq('id', invite.id)
    }

    return NextResponse.json({ joined: true, room: { name: room.name } })
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to use invite' }, { status: 500 })
  }
}
