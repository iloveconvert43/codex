export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ data: [] })
    const { data: blocks } = await supabase
      .from('user_blocks')
      .select('blocked:users!blocked_id(id, username, display_name, avatar_url)')
      .eq('blocker_id', me.id)
      .order('created_at', { ascending: false })
    const users = (blocks || []).map((b: any) => b.blocked).filter(Boolean)
    return NextResponse.json({ data: users })
  } catch { return NextResponse.json({ data: [] }) }
}
