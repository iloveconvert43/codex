export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/challenges/create
 * 
 * Any logged-in user can create a community challenge.
 * - Expires in 24 hours
 * - Time slot auto-detected from user's current time OR manually set
 * - Rate limit: 3 challenges per day per user
 * - Participation works same as admin challenges
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { sanitizeInput, rateLimit, getClientIP } from '@/lib/security'
import { z } from 'zod'
import { validate } from '@/lib/validation/schemas'
import { awardPoints } from '@/lib/points'

const createChallengeSchema = z.object({
  title: z.string().min(5, 'Title must be 5+ characters').max(100).trim(),
  description: z.string().min(10, 'Description must be 10+ characters').max(300).trim(),
  emoji: z.string().max(8).default('🔥'),
  time_slot: z.enum(['night','morning','afternoon','evening','allday']).default('allday'),
  is_anonymous: z.boolean().default(false),
  expires_hours: z.number().min(1).max(48).default(24) })

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Sign in to create challenges' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('id, is_banned, display_name, username').eq('auth_id', sessionUser.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    if (profile.is_banned) return NextResponse.json({ error: 'Account suspended' }, { status: 403 })

    // Rate limit: 3 per day per user
    const rl = rateLimit(`challenge-create:${profile.id}`, { max: 3, windowMs: 86400000 })
    if (!rl.allowed) {
      return NextResponse.json({ error: 'You can create max 3 challenges per day.' }, { status: 429 })
    }

    let rawBody: any
    try { rawBody = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const v = validate(createChallengeSchema, rawBody)
    if (!v.success) return NextResponse.json({ error: v.error }, { status: 400 })

    const { title, description, emoji, time_slot, is_anonymous, expires_hours } = v.data
    const expiresAt = new Date(Date.now() + expires_hours * 3600000).toISOString()

    const { data: challenge, error } = await supabase.from('user_challenges').insert({
      creator_id: profile.id,
      title: sanitizeInput(title),
      description: sanitizeInput(description),
      emoji: emoji.slice(0, 4),
      time_slot,
      is_anonymous,
      expires_at: expiresAt }).select().single()

    if (error) throw error

    // Award points for creating a community challenge
    awardPoints(profile.id, 'post_created', challenge.id).then(() => {}).catch(() => {})

    // Boost creator's affinity for 'challenge' content type
    supabase.rpc('update_user_affinity', {
      p_user_id:   profile.id,
      p_dimension: 'type:challenge',
      p_delta:     3.0
    }).then(() => {}).catch(() => {})

    return NextResponse.json({
      data: {
        ...challenge,
        expires_in_hours: v.data.expires_hours,
        message: `Challenge active for ${v.data.expires_hours} hours. Others can now participate!`
      }
    }, { status: 201 })
  } catch (err: any) {
    console.error('[challenges/create]', err.message)
    return NextResponse.json({ error: 'Failed to create challenge' }, { status: 500 })
  }
}
