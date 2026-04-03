export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * GET  /api/qa?user_id= — get unanswered questions for a user
 * POST /api/qa         — send anonymous question to a user
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { z } from 'zod'
import { validate } from '@/lib/validation/schemas'
import { sanitizeText } from '@/lib/sanitize'
import { queuePush } from '@/lib/push'

const askSchema = z.object({
  target_user_id: z.string().uuid(),
  question_text: z.string().min(3).max(280).trim() })

// Rate limit for anonymous asks: 5 per IP per hour
const ipRL = new Map<string, { count: number; reset: number }>()
function checkAskLimit(ip: string): boolean {
  const now = Date.now()
  const r = ipRL.get(ip)
  if (!r || now > r.reset) { ipRL.set(ip, { count: 1, reset: now + 3600000 }); return true }
  if (r.count >= 5) return false
  r.count++; return true
}

export async function GET(req: NextRequest) {
  const supabase = createAdminClient()
  const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
  if (!sessionUser) return NextResponse.json({ data: [] })

  const { data: profile } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
  if (!profile) return NextResponse.json({ data: [] })

  const { searchParams } = new URL(req.url)
  const answered = searchParams.get('answered') === 'true'

  const { data, error } = await supabase
    .from('anonymous_questions')
    .select('id, question_text, is_answered, answer_post_id, created_at')
    .eq('target_user_id', profile.id)
    .eq('is_answered', answered)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Include total unanswered count
  const { count: unansweredCount } = await supabase
    .from('anonymous_questions')
    .select('id', { count: 'exact', head: true })
    .eq('target_user_id', profile.id)
    .eq('is_answered', false)

  return NextResponse.json({ data: data || [], unansweredCount: unansweredCount ?? 0 })
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  if (!checkAskLimit(ip)) {
    return NextResponse.json({ error: 'Too many questions. Try again later.' }, { status: 429 })
  }
  // Additional rate limit from security lib
  const rl = rateLimit(`qa:${ip}`, { max: 10, windowMs: 3600000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  let rawBody: any
  try { rawBody = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const v = validate(askSchema, rawBody)
  if (!v.success) return NextResponse.json({ error: v.error }, { status: 400 })

  const supabase = createAdminClient()

  // Verify target user exists
  const { data: targetUser } = await supabase
    .from('users').select('id, display_name, is_banned').eq('id', v.data.target_user_id).single()
  if (!targetUser || targetUser.is_banned) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { data, error } = await supabase.from('anonymous_questions').insert({
    target_user_id: v.data.target_user_id,
    question_text: sanitizeInput(v.data.question_text) }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify target user
  await supabase.from('notifications').insert({
    user_id: v.data.target_user_id,
    type: 'new_anonymous_question',
    message: 'Someone sent you an anonymous question 🤫' }).then(() => {}).catch(() => {})

  queuePush(v.data.target_user_id, {
    title: 'New anonymous question 🤫',
    body: 'Someone just asked you something. Tap to see!',
    url: '/profile?tab=questions' }).then(() => {}).catch(() => {})

  return NextResponse.json({ success: true }, { status: 201 })
}
