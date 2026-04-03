export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

// Cache: 120s server-side, stale-while-revalidate
export async function GET(req: NextRequest) {
  try {
  const supabase = createAdminClient()
  const { searchParams } = new URL(req.url)
  const period = searchParams.get('period') === 'all' ? 'all_time' : 'weekly'
  const col = period === 'weekly' ? 'weekly_points' : 'total_points'

  const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
  let myUserId: string | null = null
  if (sessionUser) {
    const { data: p } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    myUserId = p?.id ?? null
  }

  const { data, error } = await supabase
    .from('user_points')
    .select(`
      ${col},
      level,
      user:users(id, username, full_name, display_name, avatar_url, city, is_verified)
    `)
    .gt(col, 0)
    .order(col, { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const leaderboard = (data || []).map((entry: any, i) => ({
    rank: i + 1,
    points: entry[col],
    level: entry.level,
    user: entry.user,
    is_me: entry.user?.id === myUserId }))

  // Also get my rank if not in top 50
  let myEntry = leaderboard.find(e => e.is_me)
  if (!myEntry && myUserId) {
    const { data: myPoints } = await supabase
      .from('user_points').select(col).eq('user_id', myUserId).single()
    if (myPoints) {
      const { count: myRank } = await supabase
        .from('user_points')
        .select('*', { count: 'exact', head: true })
        .gt(col, (myPoints as any)[col])
      myEntry = {
        rank: (myRank ?? 0) + 1,
        points: (myPoints as any)[col],
        level: '',
        user: null,
        is_me: true }
    }
  }

  // Add rank number + trend indicator to each entry
  const withRank = (leaderboard || []).map((e: any, i: number) => ({
    ...e,
    rank: i + 1,
    rank_trend: (e.weekly_points || 0) > ((e.total_points || 0) * 0.15)
      ? 'up'
      : (e.weekly_points || 0) < ((e.total_points || 0) * 0.04)
        ? 'down'
        : 'same' }))

  return NextResponse.json({ data: withRank, my_entry: myEntry || null, period })
  } catch (err: any) {
    console.error('[leaderboard]', err.message)
    return (await import('next/server')).NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
