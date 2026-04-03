export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

type Ctx = { params: { slug: string } }

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const { data: room } = await supabase
      .from('topic_rooms').select('id, member_count').eq('slug', params.slug).single()
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

    const { data: existing } = await supabase
      .from('room_memberships')
      .select('room_id')
      .eq('room_id', room.id)
      .eq('user_id', profile.id)
      .maybeSingle()

    if (existing) {
      // Leave room
      await supabase.from('room_memberships')
        .delete().eq('room_id', room.id).eq('user_id', profile.id)
      await supabase.from('topic_rooms')
        .update({ member_count: Math.max(0, (room.member_count || 1) - 1) })
        .eq('id', room.id)
      return NextResponse.json({ joined: false })
    }

    // Join room
    await supabase.from('room_memberships')
      .insert({ room_id: room.id, user_id: profile.id })
    await supabase.from('topic_rooms')
      .update({ member_count: (room.member_count || 0) + 1 })
      .eq('id', room.id)
    // Joining a room = strong topic interest signal
    supabase.from('topic_rooms').select('name, slug').eq('id', room.id).single()
      .then(({ data: r }: any) => {
        if (r) {
          supabase.rpc('update_user_affinity', {
            p_user_id:   profile.id,
            p_dimension: `room:${r.slug}`,
            p_delta:     5.0
          }).then(() => {}).catch(() => {})
        }
      }).catch(() => {})

    return NextResponse.json({ joined: true })

  } catch (err: any) {
    console.error('[rooms/join]', err.message)
    return NextResponse.json({ error: 'Failed to join room' }, { status: 500 })
  }
}
