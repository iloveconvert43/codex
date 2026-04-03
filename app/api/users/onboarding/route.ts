export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/users/onboarding
 * Called after signup — user picks interest tags (e.g. cricket, food, tech)
 * Seeds affinity data so new users don't get cold start blank feed
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

const VALID_TAGS = [
  'cricket', 'food', 'tech', 'movies', 'music', 'fitness', 'travel',
  'politics', 'startup', 'gaming', 'fashion', 'art', 'education',
  'nature', 'photography', 'humor', 'news', 'finance', 'relationships',
  'spirituality', 'pets', 'books', 'health', 'sports', 'entertainment'
]

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const body = await req.json()
    const tags: string[] = Array.isArray(body.tags)
      ? body.tags.filter((t: any) => typeof t === 'string' && VALID_TAGS.includes(t)).slice(0, 10)
      : []

    if (tags.length === 0) {
      return NextResponse.json({ error: 'Select at least one interest' }, { status: 400 })
    }

    // Save onboarding picks
    await supabase.from('onboarding_interests').upsert(
      tags.map(tag => ({ user_id: profile.id, tag })),
      { onConflict: 'user_id,tag', ignoreDuplicates: true }
    )

    // Seed affinity data → fixes cold start problem
    await supabase.rpc('seed_affinity_from_onboarding', { p_user_id: profile.id })

    return NextResponse.json({ ok: true, tags_saved: tags.length })
  } catch (err: any) {
    console.error('[onboarding]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ data: [] })

    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!profile) return NextResponse.json({ data: [] })

    const { data: interests } = await supabase
      .from('onboarding_interests').select('tag').eq('user_id', profile.id)

    return NextResponse.json({
      data: (interests || []).map((i: any) => i.tag),
      all_tags: VALID_TAGS
    })
  } catch {
    return NextResponse.json({ data: [], all_tags: VALID_TAGS })
  }
}
