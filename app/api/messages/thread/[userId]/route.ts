export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'
import { isValidUUID } from '@/lib/security'

type Ctx = { params: { userId: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = createRouteClient()
    if (!isValidUUID(params.userId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const { getUserIdFromToken } = await import('@/lib/jwt')
    const authUserId = getUserIdFromToken(req.headers.get('authorization'))
    if (!authUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me } = await supabase
      .from('users').select('id').eq('auth_id', authUserId).single()
    if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (false) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
    }

    const { searchParams } = new URL(req.url)
    const cursor  = searchParams.get('before')   // ISO timestamp — load messages before this
    const limit   = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

    let query = supabase
      .from('direct_messages')
      .select('*, sender:users!sender_id(id,username,display_name,avatar_url)')
      .or(
        `and(sender_id.eq.${me.id},receiver_id.eq.${params.userId}),` +
        `and(sender_id.eq.${params.userId},receiver_id.eq.${me.id})`
      )
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })  // newest first for cursor
      .limit(limit + 1)  // fetch one extra to know if there are more

    if (cursor) query = query.lt('created_at', cursor)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const msgs = data || []
    const hasMore = msgs.length > limit
    const result  = hasMore ? msgs.slice(0, limit) : msgs
    // Return in ascending order for display
    result.reverse()

    const nextCursor = hasMore ? result[0]?.created_at : null

    // Mark as read — only once (server-side only, removes client-side double-write)
    supabase.from('direct_messages')
      .update({ is_read: true })
      .eq('sender_id', params.userId)
      .eq('receiver_id', me.id)
      .eq('is_read', false)
      .then(() => {}).catch(() => {})

    return NextResponse.json({ data: result, hasMore, nextCursor })
  } catch (err: any) {
    console.error('[thread]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
