export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * GET /api/messages/permission?user_id=X
 * Returns current DM permission between logged-in user and target user
 * Used by frontend to show correct UI (free chat / request box / pending / blocked)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidUUID } from '@/lib/security'

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ permission: 'free' })

    const { data: me } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ permission: 'free' })

    const { searchParams } = new URL(req.url)
    const targetId = searchParams.get('user_id')

    if (!targetId || !isValidUUID(targetId)) {
      return NextResponse.json({ permission: 'free' })
    }

    const { data: permission } = await supabase
      .rpc('get_dm_permission', { p_sender_id: me.id, p_receiver_id: targetId })

    // Also check can_call
    const { data: callable } = await supabase
      .rpc('can_call', { p_caller_id: me.id, p_recipient_id: targetId })

    return NextResponse.json({
      permission: permission || 'free',
      can_call:   callable ?? false,
    })
  } catch (err: any) {
    console.error('[messages/permission]', err.message)
    return NextResponse.json({ permission: 'free', can_call: false })
  }
}
