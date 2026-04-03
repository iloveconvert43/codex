export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * GET /api/challenges/today
 *
 * Returns the appropriate challenge based on the user's LOCAL time.
 *
 * Time slots (user's local time, sent via ?tz= or X-Timezone header):
 *   Night     : 22:00 – 04:59  → introspective, confessional prompts
 *   Morning   : 05:00 – 10:59  → motivational, intention-setting
 *   Afternoon : 11:00 – 16:59  → fun, local, social prompts
 *   Evening   : 17:00 – 21:59  → reflective, end-of-day prompts
 *
 * Priority order:
 *   1. Admin-created challenge for today matching the time slot
 *   2. Admin-created 'allday' challenge for today
 *   3. Random challenge from library matching the time slot
 *   4. Hardcoded fallback
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

type TimeSlot = 'night' | 'morning' | 'afternoon' | 'evening'

interface SlotConfig {
  label: string
  emoji: string
  greeting: string
  hours: [number, number]  // [start_hour, end_hour) — 24h format
}

const SLOTS: Record<TimeSlot, SlotConfig> = {
  night:     { label: 'Night',     emoji: '🌙', greeting: 'Late night thoughts…',    hours: [22, 5]  },
  morning:   { label: 'Morning',   emoji: '☀️', greeting: 'Good morning!',            hours: [5, 11]  },
  afternoon: { label: 'Afternoon', emoji: '🌤️', greeting: 'Afternoon energy!',        hours: [11, 17] },
  evening:   { label: 'Evening',   emoji: '🌆', greeting: 'How was your day?',        hours: [17, 22] } }

/**
 * Determine time slot from hour (0-23)
 */
function getTimeSlot(hour: number): TimeSlot {
  if (hour >= 22 || hour < 5)  return 'night'
  if (hour >= 5  && hour < 11) return 'morning'
  if (hour >= 11 && hour < 17) return 'afternoon'
  return 'evening'
}

/**
 * Parse timezone offset from request
 * Client sends: ?offset=-330 (IST = UTC+5:30 = +330 min ahead, so offset from UTC is +330)
 * Or header: X-Timezone-Offset: 330 (minutes ahead of UTC)
 */
function getUserHour(req: NextRequest): { hour: number; slot: TimeSlot; utcOffset: number } {
  const { searchParams } = new URL(req.url)

  // Try query param first (most reliable from client)
  const offsetParam = searchParams.get('offset') || req.headers.get('x-timezone-offset')
  let utcOffset = 0 // default UTC

  if (offsetParam) {
    const parsed = parseInt(offsetParam)
    if (!isNaN(parsed) && Math.abs(parsed) <= 720) {
      utcOffset = parsed // minutes from UTC
    }
  }

  // Calculate user's local hour
  const nowUTC = Date.now()
  const localMs = nowUTC + utcOffset * 60000
  const localDate = new Date(localMs)
  const hour = localDate.getUTCHours() // local hour

  return { hour, slot: getTimeSlot(hour), utcOffset }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const today = new Date().toISOString().split('T')[0]

    // Get user's local time slot
    const { hour, slot } = getUserHour(req)
    const slotConfig = SLOTS[slot]

    // Get user ID for participation check
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    let userId: string | null = null
    if (sessionUser) {
      const { data: p } = await supabase
        .from('users').select('id').eq('auth_id', sessionUser.id).single()
      userId = p?.id ?? null
    }

    let challenge: any = null

    // ── Priority 1: Admin challenge for today matching time slot ──
    const { data: slotChallenge } = await supabase
      .from('daily_challenges')
      .select('*')
      .eq('challenge_date', today)
      .eq('is_active', true)
      .eq('time_slot', slot)
      .single()

    if (slotChallenge) {
      challenge = slotChallenge
    }

    // ── Priority 2: Admin 'allday' challenge for today ───────────
    if (!challenge) {
      const { data: alldayChallenge } = await supabase
        .from('daily_challenges')
        .select('*')
        .eq('challenge_date', today)
        .eq('is_active', true)
        .in('time_slot', ['allday', null])
        .single()

      if (alldayChallenge) challenge = alldayChallenge
    }

    // ── Priority 3: Random from library matching time slot ───────
    if (!challenge) {
      // Get all active library challenges for this slot
      const { data: libraryItems } = await supabase
        .from('challenge_library')
        .select('*')
        .eq('is_active', true)
        .eq('time_slot', slot)
        .order('use_count', { ascending: true }) // least-used first
        .limit(10)

      if (libraryItems && libraryItems.length > 0) {
        // Pick a deterministic-but-varied challenge based on date + slot
        // Same user sees same challenge for the day, different slot = different challenge
        const dateNum = parseInt(today.replace(/-/g, ''))
        const slotNum = ['morning','afternoon','evening','night'].indexOf(slot)
        const idx = (dateNum + slotNum) % libraryItems.length
        const picked = libraryItems[idx]

        challenge = {
          id: picked.id,
          title: picked.title,
          description: picked.description,
          emoji: picked.emoji,
          challenge_date: today,
          time_slot: slot,
          is_active: true,
          is_library: true, // flag to show it's auto-selected
        }

        // Increment use_count non-blocking
        supabase.from('challenge_library')
          .update({ use_count: (picked.use_count || 0) + 1 })
          .eq('id', picked.id)
          .then(() => {}).catch(() => {})
      }
    }

    // ── Priority 4: Hardcoded time-aware fallback ────────────────
    if (!challenge) {
      const fallbacks: Record<TimeSlot, { title: string; description: string; emoji: string }> = {
        night:     { emoji: '🌙', title: 'Midnight Thought',   description: 'What\'s keeping you up tonight? Share it — anonymously if you want.' },
        morning:   { emoji: '☀️', title: 'Morning Intention',  description: 'What\'s the one thing you\'re determined to do today?' },
        afternoon: { emoji: '🌤️', title: 'Afternoon Moment',   description: 'Share something interesting that happened today so far.' },
        evening:   { emoji: '🌆', title: 'Evening Reflection', description: 'Describe your day in one word and explain why.' } }
      const fb = fallbacks[slot]
      challenge = { id: 'fallback', ...fb, challenge_date: today, time_slot: slot, is_active: true }
    }

    // ── Get participation count ───────────────────────────────────
    let participant_count = 0
    let user_has_participated = false

    if (challenge.id !== 'fallback') {
      const { count } = await supabase
        .from('challenge_posts')
        .select('id', { count: 'exact', head: true })
        .eq('challenge_id', challenge.id)
      participant_count = count ?? 0

      if (userId && challenge.id !== 'fallback') {
        const { data: cp } = await supabase
          .from('challenge_posts')
          .select('id')
          .eq('challenge_id', challenge.id)
          .eq('user_id', userId)
          .maybeSingle()
        user_has_participated = !!cp
      }
    }

    return NextResponse.json({
      data: {
        ...challenge,
        participant_count,
        user_has_participated,
        // Include context for the client
        time_context: {
          slot,
          slot_label: slotConfig.label,
          slot_emoji: slotConfig.emoji,
          greeting: slotConfig.greeting,
          user_hour: hour } }
    })

  } catch (err: any) {
    console.error('[challenges/today]', err.message)
    return NextResponse.json({ error: 'Failed to load challenge' }, { status: 500 })
  }
}
