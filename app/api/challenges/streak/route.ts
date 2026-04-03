export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export async function GET(req: import('next/server').NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    if (!sessionUser) return NextResponse.json({ streak: 0, longest_streak: 0, total_days: 0 })

    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!profile) return NextResponse.json({ streak: 0, longest_streak: 0, total_days: 0 })

    // Use the SQL function for accurate streak calculation
    const { data, error } = await supabase
      .rpc('get_challenge_streak', { p_user_id: profile.id })

    if (error || !data?.[0]) {
      return NextResponse.json({ streak: 0, longest_streak: 0, total_days: 0 })
    }

    const result = data[0]
    return NextResponse.json({
      streak:         result.streak,
      longest_streak: result.longest_streak,
      total_days:     result.total_days,
    })
  } catch (err: any) {
    console.error('[challenges/streak]', err.message)
    return NextResponse.json({ streak: 0, longest_streak: 0, total_days: 0 })
  }
}
