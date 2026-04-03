export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export async function GET(req: import('next/server').NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken } = await import('@/lib/jwt')
    const authUserId = getUserIdFromToken(req.headers.get('authorization'))
    let userId: string | null = null
    if (authUserId) {
      const { data: p } = await supabase.from('users').select('id').eq('auth_id', authUserId).single()
      userId = p?.id ?? null
    }

    // Skip slow RPC - use direct fast query
    // (get_trending_tags_personalized not available)

    // Check for nearby filter
    const { searchParams } = new URL(req.url)
    const nearbyLat = parseFloat(searchParams.get('lat') || '0')
    const nearbyLng = parseFloat(searchParams.get('lng') || '0')
    const isNearby  = !!searchParams.get('nearby') && nearbyLat && nearbyLng

    // Fallback: global (or nearby) trending
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()  // 3 days for nearby
    let postsQuery = supabase
      .from('posts').select('tags, city').eq('is_deleted', false)
      .gte('created_at', since).not('tags', 'eq', '{}')

    // For nearby: filter by user's city from recent location data
    if (isNearby && nearbyLat && nearbyLng) {
      // Get city from user_locations near these coordinates (approximate)
      const { data: locData } = await supabase
        .from('user_locations')
        .select('city')
        .not('city', 'is', null)
        .gte('expires_at', new Date().toISOString())
        .limit(1)
      const nearbyCity = locData?.[0]?.city
      if (nearbyCity) {
        postsQuery = postsQuery.ilike('city', `%${nearbyCity}%`)
      }
    }

    const { data: posts } = await postsQuery

    if (!posts?.length) return NextResponse.json({ data: [] })

    const countMap: Record<string, number> = {}
    for (const post of posts) {
      for (const tag of (post.tags || [])) {
        countMap[tag] = (countMap[tag] || 0) + 1
      }
    }
    const sorted = Object.entries(countMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([tag, count]) => ({ tag, count, is_interested: false }))

    return NextResponse.json({ data: sorted })
  } catch (err: any) {
    console.error('[trending/tags]', err.message)
    return NextResponse.json({ data: [] })
  }
}
