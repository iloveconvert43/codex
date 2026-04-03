export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * GET /api/rooms/[slug]/leaderboard
 * Returns top contributors in a room for the past 7 days.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

type Ctx = { params: { slug: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = createAdminClient()

    const { data: room } = await supabase
      .from('topic_rooms').select('id, name, emoji').eq('slug', params.slug).single()
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

    // Get top contributors via RPC
    const { data: leaderboard, error } = await supabase
      .rpc('get_room_leaderboard', { p_room_id: room.id, p_limit: 20 })

    if (error) throw error

    // Batch fetch user details
    const userIds = (leaderboard || []).map((e: any) => e.user_id)
    let userMap: Record<string, any> = {}
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url, is_verified, city')
        .in('id', userIds)
      userMap = Object.fromEntries((users || []).map(u => [u.id, u]))
    }

    // Check if current user is logged in for "is_me" flag
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    let myUserId: string | null = null
    if (sessionUser) {
      const { data: p } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
      myUserId = p?.id ?? null
    }

    const ranked = (leaderboard || []).map((entry: any, i: number) => ({
      rank: i + 1,
      user: userMap[entry.user_id] || null,
      post_count: Number(entry.post_count),
      score: Number(entry.score),
      is_me: entry.user_id === myUserId }))

    return NextResponse.json({ data: ranked, room })
  } catch (err: any) {
    console.error('[room/leaderboard]', err.message)
    return NextResponse.json({ error: 'Failed to load leaderboard' }, { status: 500 })
  }
}
