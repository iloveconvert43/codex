export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteClient()
    const { getUserIdFromToken } = await import('@/lib/jwt')
    const authUserId = getUserIdFromToken(req.headers.get('authorization'))
    if (!authUserId) return NextResponse.json({ data: [] })

    const { data: me } = await supabase
      .from('users').select('id').eq('auth_id', authUserId).single()
    if (!me) return NextResponse.json({ data: [] })

    // Fast: get latest message per conversation using efficient query
    // Get distinct conversation partners with their latest message
    const { data: msgs, error } = await supabase
      .from('direct_messages')
      .select('id,sender_id,receiver_id,content,created_at,is_read')
      .or(`sender_id.eq.${me.id},receiver_id.eq.${me.id}`)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(100)  // Much less than before (was 200+200)

    if (error) return NextResponse.json({ data: [] })

    // Build conversation map efficiently
    const convMap = new Map<string, { last_message: any; unread_count: number }>()
    for (const msg of (msgs || [])) {
      const otherId = msg.sender_id === me.id ? msg.receiver_id : msg.sender_id
      if (!convMap.has(otherId)) {
        convMap.set(otherId, { last_message: msg, unread_count: 0 })
      }
      // Count unread (messages TO me that are unread)
      if (msg.receiver_id === me.id && !msg.is_read) {
        convMap.get(otherId)!.unread_count++
      }
    }

    if (!convMap.size) return NextResponse.json({ data: [] })

    // Batch fetch user profiles
    const otherIds = [...convMap.keys()]
    const { data: users } = await supabase
      .from('users')
      .select('id,username,display_name,avatar_url,is_verified')
      .in('id', otherIds)

    const userMap = Object.fromEntries((users || []).map((u: any) => [u.id, u]))

    const data = otherIds
      .map(id => ({
        other_user:   userMap[id] ?? null,
        last_message: convMap.get(id)!.last_message,
        unread_count: convMap.get(id)!.unread_count,
      }))
      .filter(c => c.other_user)
      .sort((a, b) => new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime())

    const res = NextResponse.json({ data })
    res.headers.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=30')
    return res
  } catch (err: any) {
    return NextResponse.json({ data: [] })
  }
}
