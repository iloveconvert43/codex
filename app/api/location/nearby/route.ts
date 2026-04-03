export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * GET /api/location/nearby
 * Returns users who are currently active near the given coordinates
 * Uses user_locations table (expires after 2hrs)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(req.url)

    const lat    = parseFloat(searchParams.get('lat') || '0')
    const lng    = parseFloat(searchParams.get('lng') || '0')
    const radius = parseFloat(searchParams.get('radius') || '5')

    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({ data: [] })
    }

    // Must be logged in to see who's nearby
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ data: [] })

    const { data: me } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ data: [] })

    // Use PostGIS to find nearby active users
    const { data: nearbyLocs } = await supabase.rpc('get_nearby_users', {
      p_lat:      lat,
      p_lng:      lng,
      p_radius_m: radius * 1000,
      p_user_id:  me.id,
      p_limit:    10
    })

    if (!nearbyLocs?.length) return NextResponse.json({ data: [] })

    // Fetch user profiles
    const userIds = nearbyLocs.map((u: any) => u.user_id)
    const { data: users } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, is_verified')
      .in('id', userIds)
      .eq('is_private', false)  // only public profiles

    const enriched = (users || []).map((u: any) => ({
      ...u,
      distance_m: nearbyLocs.find((l: any) => l.user_id === u.id)?.distance_m ?? null
    })).sort((a: any, b: any) => (a.distance_m || 0) - (b.distance_m || 0))

    return NextResponse.json({ data: enriched })
  } catch (err: any) {
    console.error('[location/nearby]', err.message)
    return NextResponse.json({ data: [] })
  }
}
