export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

type Ctx = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = createAdminClient()

    const { data: user, error } = await supabase
      .from('users')
      .select('id,username,full_name,display_name,bio,avatar_url,gender,dob,nationality,city,is_verified,is_banned,created_at,privacy_settings,is_private,cover_url,hometown,relationship_status,languages,pronouns')
      .eq('id', params.id)
      .single()

    if (error || !user) {
      const r404 = NextResponse.json({ error: 'User not found' }, { status: 404 })
      r404.headers.set('Cache-Control', 'no-store')
      return r404
    }
    if ((user as any).is_banned) return NextResponse.json({ error: 'Account not available' }, { status: 404 })

    const privacy: any = (user as any).privacy_settings || {}

    // Apply privacy filters for non-owner viewers
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    let isOwner = false
    if (sessionUser) {
      const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
      isOwner = me?.id === params.id
    }

    const filtered: any = { ...user }
    if (!isOwner) {
      if (privacy.show_dob === 'private') delete filtered.dob
      if (privacy.show_gender === 'private') delete filtered.gender
      if (privacy.show_nationality === 'private') delete filtered.nationality
    }

    return NextResponse.json({ data: filtered })
  } catch (err: any) {
    console.error('[users/[id] GET]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
