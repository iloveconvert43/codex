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
    if (!me) return NextResponse.json({ data: null })
    const { data: prefs } = await supabase.from('notification_prefs').select('*').eq('user_id', me.id).single()
    return NextResponse.json({ data: prefs })
  } catch { return NextResponse.json({ data: null }) }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const body = await req.json()
    const allowedKeys = ['new_follower','follow_request','new_reaction','new_comment','new_message',
      'mystery_revealed','challenge_reminder','new_anonymous_question','badge_awarded','level_up','marketing']
    const prefs = Object.fromEntries(Object.entries(body).filter(([k]) => allowedKeys.includes(k)))
    await supabase.from('notification_prefs').upsert({ user_id: me.id, ...prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    return NextResponse.json({ ok: true })
  } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }) }
}
