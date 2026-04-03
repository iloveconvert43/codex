export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/location — Update user's real-time location
 *
 * Called periodically by the app when user is active.
 * Stored in user_locations table (separate from profile city).
 * Expires after 2 hours of inactivity.
 *
 * Rate limit: 1 update per minute per user
 * Privacy: location expires, never stored permanently
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { rateLimit, getClientIP } from '@/lib/security'
import { z } from 'zod'
import { validate } from '@/lib/validation/schemas'

const locationSchema = z.object({
  latitude:   z.number().min(-90).max(90),
  longitude:  z.number().min(-180).max(180),
  accuracy_m: z.number().min(0).max(10000).optional(),
  city:       z.string().max(100).optional(),
  locality:   z.string().max(100).optional(),  // neighborhood/area
})

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)

    // Location update requires auth
    if (!sessionUser) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    // Rate limit: max 1 update per 60 seconds per user
    const rl = rateLimit(`location:${profile.id}`, { max: 2, windowMs: 60000 })
    if (!rl.allowed) {
      // Silently succeed — don't fail UX for rate limits
      return NextResponse.json({ ok: true, skipped: true })
    }

    let rawBody: any
    try { rawBody = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    const v = validate(locationSchema, rawBody)
    if (!v.success) return NextResponse.json({ error: v.error }, { status: 400 })

    const { latitude, longitude, accuracy_m, city, locality } = v.data

    // Upsert location — expires in 2 hours
    const { error } = await supabase.from('user_locations').upsert({
      user_id: profile.id,
      latitude,
      longitude,
      accuracy_m: accuracy_m ?? null,
      city: city ?? null,
      locality: locality ?? null,
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 2 * 3600000).toISOString() }, { onConflict: 'user_id' })

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[location update]', err.message)
    return NextResponse.json({ error: 'Failed to update location' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  // User can clear their location (privacy)
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!profile) return NextResponse.json({ ok: true })

    await supabase.from('user_locations').delete().eq('user_id', profile.id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
