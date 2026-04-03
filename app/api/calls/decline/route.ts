export const dynamic = 'force-dynamic'
export const maxDuration = 10
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidUUID } from '@/lib/security'

export async function POST(req: NextRequest) {
  try {
    const { caller_id } = await req.json()
    if (!caller_id || !isValidUUID(caller_id)) return NextResponse.json({ ok: true })

    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ ok: true })
    const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ ok: true })

    // Broadcast decline signal to caller's channel
    const admin = createAdminClient()
    const channelId = [caller_id, me.id].sort().join('-')
    const ch = admin.channel(`call:${channelId}`)
    await ch.subscribe()
    await ch.send({ type: 'broadcast', event: 'call-decline', payload: { from: me.id } })
    await admin.removeChannel(ch)

    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ ok: true }) }
}
