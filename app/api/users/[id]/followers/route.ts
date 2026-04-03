export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
type Ctx = { params: { id: string } }


export async function GET(req: NextRequest, { params }: Ctx) {
  try {
  const supabase = createAdminClient()

  // Privacy check: if account is private, only followers can see the list
  const { data: targetUser } = await supabase
    .from('users').select('id, is_private').eq('id', params.id).single()

  if (targetUser?.is_private) {
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    let viewerId: string | null = null
    if (sessionUser) {
      const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
      viewerId = me?.id ?? null
    }
    if (viewerId !== params.id) {
      // Check if viewer follows this private account
      const { data: follows } = await supabase.from('follows')
        .select('follower_id').eq('follower_id', viewerId).eq('following_id', params.id).single()
      if (!follows) {
        return NextResponse.json({ error: 'This account is private', data: [] }, { status: 403 })
      }
    }
  }
  const { data, error } = await supabase
    .from('follows')
    .select('follower:users!follower_id(id, username, display_name, avatar_url, is_verified, city)')
    .eq('following_id', params.id)
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const followers = (data || []).map((f: any) => f.follower)
  const { count } = await supabase
    .from('follows').select('*', { count: 'exact', head: true }).eq('following_id', params.id)
  return NextResponse.json({ data: followers, count: count ?? 0 })
  } catch (err: any) {
    console.error('[route error]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}