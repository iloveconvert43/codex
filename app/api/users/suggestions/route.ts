export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * GET /api/users/suggestions
 * Returns "People you may know" — follow suggestions for current user
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ data: [] })

    const { data: profile } = await supabase
      .from('users').select('id, city').eq('auth_id', sessionUser.id).single()
    if (!profile) return NextResponse.json({ data: [] })

    const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '5'), 20)

    // Get precomputed suggestions
    const { data: suggestions } = await supabase
      .from('follow_suggestions')
      .select('suggested_id, reason, score')
      .eq('user_id', profile.id)
      .order('score', { ascending: false })
      .limit(limit)

    if (!suggestions?.length) return NextResponse.json({ data: [] })

    const ids = suggestions.map((s: any) => s.suggested_id)
    const { data: users } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, is_verified, bio, city, is_private')
      .in('id', ids)

    const enriched = suggestions.map((s: any) => ({
      ...(users || []).find((u: any) => u.id === s.suggested_id),
      suggestion_reason: s.reason,
      score: s.score
    })).filter((u: any) => u.id)

    return NextResponse.json({ data: enriched })
  } catch (err: any) {
    console.error('[suggestions]', err.message)
    return NextResponse.json({ data: [] })
  }
}
