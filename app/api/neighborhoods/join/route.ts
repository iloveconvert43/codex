export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('id, neighborhood_id').eq('auth_id', sessionUser.id).single()
    if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    const { neighborhood_id } = body

    // Decrement count for old neighborhood
    if (profile.neighborhood_id && profile.neighborhood_id !== neighborhood_id) {
      const { data: oldHood } = await supabase
        .from('neighborhoods').select('member_count').eq('id', profile.neighborhood_id).single()
      if (oldHood) {
        await supabase.from('neighborhoods')
          .update({ member_count: Math.max(0, (oldHood.member_count || 1) - 1) })
          .eq('id', profile.neighborhood_id)
      }
    }

    if (!neighborhood_id) {
      // Leave neighborhood
      await supabase.from('users').update({ neighborhood_id: null }).eq('id', profile.id)
      return NextResponse.json({ joined: false })
    }

    const { data: hood } = await supabase
      .from('neighborhoods').select('id, member_count').eq('id', neighborhood_id).single()
    if (!hood) return NextResponse.json({ error: 'Neighborhood not found' }, { status: 404 })

    await supabase.from('users').update({ neighborhood_id }).eq('id', profile.id)
    await supabase.from('neighborhoods')
      .update({ member_count: (hood.member_count || 0) + 1 })
      .eq('id', neighborhood_id)

    return NextResponse.json({ joined: true })
  } catch (err: any) {
    console.error('[neighborhoods/join]', err.message)
    return NextResponse.json({ error: 'Failed to join neighborhood' }, { status: 500 })
  }
}
