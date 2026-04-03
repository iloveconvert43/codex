export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/analytics/events
 * Receives batched analytics events from client.
 * Stores in Supabase analytics_events table.
 * Non-blocking — app won't break if this fails.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const { events } = await req.json()
    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ ok: true })
    }

    // Get user ID if authenticated
    const authHeader = req.headers.get('Authorization')
    let userId: string | null = null

    if (authHeader) {
      const supabase = createAdminClient()
      const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
      if (sessionUser) {
        const { data: p } = await supabase
          .from('users').select('id').eq('auth_id', sessionUser.id).single()
        userId = p?.id ?? null
      }
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || null

    const supabase = createAdminClient()
    await supabase.from('analytics_events').insert(
      events.slice(0, 50).map((e: any) => ({  // Cap at 50 events per batch
        user_id: userId,
        event_type: e.event,
        properties: e.properties || {},
        ip_address: ip,
        user_agent: req.headers.get('user-agent')?.slice(0, 200) || null,
        occurred_at: new Date(e.timestamp || Date.now()).toISOString() }))
    )

    return NextResponse.json({ ok: true })
  } catch {
    // Silently fail — analytics must never break the app
    return NextResponse.json({ ok: true })
  }
}
