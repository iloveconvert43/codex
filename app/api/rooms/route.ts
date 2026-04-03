export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

// Cache: 30s server-side, stale-while-revalidate
export async function GET(req: import('next/server').NextRequest) {
  try {
  const supabase = createAdminClient()
  const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null

  let userId: string | null = null
  if (sessionUser) {
    const { data: p } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    userId = p?.id ?? null
  }

  const { data: rooms, error } = await supabase
    .from('topic_rooms')
    .select('*')
    .order('is_featured', { ascending: false })
    .order('member_count', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mark which rooms user is a member of
  let memberRoomIds = new Set<string>()
  if (userId && rooms?.length) {
    const { data: memberships } = await supabase
      .from('room_memberships').select('room_id').eq('user_id', userId)
    memberRoomIds = new Set((memberships || []).map((m: any) => m.room_id))
  }

  const withMembership = (rooms || []).map(r => ({
    ...r, is_member: memberRoomIds.has(r.id)
  }))

  return NextResponse.json({ data: withMembership })
  } catch (err: any) {
    console.error('[rooms]', err.message)
    return (await import('next/server')).NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
