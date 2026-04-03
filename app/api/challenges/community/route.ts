export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * GET /api/challenges/community
 * Returns active user-created challenges, filtered by time slot
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

function getSlot(hour: number): string {
  if (hour >= 22 || hour < 5)  return 'night'
  if (hour >= 5  && hour < 11) return 'morning'
  if (hour >= 11 && hour < 17) return 'afternoon'
  return 'evening'
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(req.url)

    // Get user's time slot
    const offset = parseInt(searchParams.get('offset') || '0')
    const localHour = new Date(Date.now() + offset * 60000).getUTCHours()
    const slot = getSlot(localHour)

    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    let userId: string | null = null
    if (sessionUser) {
      const { data: p } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
      userId = p?.id ?? null
    }

    // Get active challenges (matching slot + allday)
    const { data: challenges, error } = await supabase
      .from('user_challenges')
      .select(`
        *,
        creator:users!creator_id(id, username, display_name, avatar_url, is_verified)
      `)
      .gt('expires_at', new Date().toISOString())
      .in('time_slot', [slot, 'allday'])
      .order('hot_score', { ascending: false })  // trending first
      .limit(20)

    if (error) throw error

    // Check which ones user has participated in
    let participatedSet = new Set<string>()
    if (userId && challenges?.length) {
      const ids = challenges.map(c => c.id)
      const { data: participated } = await supabase
        .from('user_challenge_posts')
        .select('user_challenge_id')
        .in('user_challenge_id', ids)
        .eq('user_id', userId)
      participatedSet = new Set((participated || []).map((p: any) => p.user_challenge_id))
    }

    const enriched = (challenges || []).map(c => {
      const expiresAt = new Date(c.expires_at)
      const now = new Date()
      const msLeft = expiresAt.getTime() - now.getTime()
      const hoursLeft = Math.max(0, Math.floor(msLeft / 3600000))
      const minutesLeft = Math.max(0, Math.floor((msLeft % 3600000) / 60000))

      return {
        ...c,
        user_has_participated: participatedSet.has(c.id),
        is_anonymous: c.is_anonymous,
        creator: c.is_anonymous ? null : c.creator,
        hours_left: hoursLeft,
        minutes_left: minutesLeft,
        is_ending_soon: hoursLeft < 2,  // flag for UI urgency
      }
    })

    return NextResponse.json({ data: enriched, time_slot: slot })
  } catch (err: any) {
    console.error('[challenges/community]', err.message)
    return NextResponse.json({ error: 'Failed to load challenges' }, { status: 500 })
  }
}
