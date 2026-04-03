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
    if (!sessionUser) return NextResponse.json({ data: [] })

    const { data: me } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ data: [] })

    // Get who I already follow
    const { data: following } = await supabase
      .from('follows').select('following_id').eq('follower_id', me.id)
    const followingIds = (following || []).map((f: any) => f.following_id)

    // Suggest popular users I don't follow yet
    const { data: suggestions } = await supabase
      .from('users')
      .select('id,username,display_name,avatar_url,is_verified,city')
      .eq('is_private', false)
      .neq('id', me.id)
      .not('id', 'in', `(${[me.id, ...followingIds].join(',')})`)
      .order('created_at', { ascending: false })
      .limit(10)

    return NextResponse.json({ data: suggestions || [] })
  } catch {
    return NextResponse.json({ data: [] })
  }
}
