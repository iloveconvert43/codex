export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/users/[id]/block — Block/Unblock a user
 * GET  /api/users/[id]/block — Check if blocked
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidUUID } from '@/lib/security'

type Ctx = { params: { id: string } }

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    if (!isValidUUID(params.id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (me.id === params.id) return NextResponse.json({ error: 'Cannot block yourself' }, { status: 400 })

    const { data: existing } = await supabase.from('user_blocks')
      .select('blocker_id').eq('blocker_id', me.id).eq('blocked_id', params.id).single()

    if (existing) {
      // Unblock
      await supabase.from('user_blocks').delete().eq('blocker_id', me.id).eq('blocked_id', params.id)
      return NextResponse.json({ blocked: false })
    }

    // Block - also remove any follows between them
    await supabase.from('user_blocks').insert({ blocker_id: me.id, blocked_id: params.id })
    await supabase.from('follows').delete()
      .or(`and(follower_id.eq.${me.id},following_id.eq.${params.id}),and(follower_id.eq.${params.id},following_id.eq.${me.id})`)

    return NextResponse.json({ blocked: true })
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ blocked: false })

    const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ blocked: false })

    const { data } = await supabase.from('user_blocks')
      .select('blocker_id').eq('blocker_id', me.id).eq('blocked_id', params.id).single()

    return NextResponse.json({ blocked: !!data })
  } catch {
    return NextResponse.json({ blocked: false })
  }
}
