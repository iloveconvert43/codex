export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // Delete profile (CASCADE will handle related data)
    await supabase.from('users').delete().eq('id', me.id)
    // Delete auth user
    const admin = createAdminClient()
    await admin.auth.admin.deleteUser(sessionUser.id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[delete account]', err.message)
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }
}
