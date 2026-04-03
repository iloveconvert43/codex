export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/qa/answer/[id] — Answer a question (creates a post)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { awardPoints } from '@/lib/points'
import { sanitizeText } from '@/lib/sanitize'

type Ctx = { params: { id: string } }

export async function POST(req: NextRequest, { params }: Ctx) {
  const supabase = createAdminClient()
  const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
  if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // Verify question belongs to this user
  const { data: question } = await supabase
    .from('anonymous_questions')
    .select('*').eq('id', params.id).eq('target_user_id', profile.id).single()

  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })
  if (question.is_answered) return NextResponse.json({ error: 'Already answered' }, { status: 400 })

  let rawBody: any
  try { rawBody = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { answer_text } = rawBody
  if (!answer_text?.trim() || answer_text.length > 2000) {
    return NextResponse.json({ error: 'Answer must be 1-2000 characters' }, { status: 400 })
  }

  // Create post with Q&A format
  const postContent = `❓ "${question.question_text}"\n\n💬 ${sanitizeText(answer_text.trim())}`

  const { data: post, error: postErr } = await supabase.from('posts').insert({
    user_id: profile.id,
    content: postContent,
    is_anonymous: false,
    is_mystery: false,
    tags: ['qa', 'anonymous-question'] }).select().single()

  if (postErr) return NextResponse.json({ error: postErr.message }, { status: 500 })

  // Mark question answered
  await supabase.from('anonymous_questions')
    .update({ is_answered: true, answer_post_id: post.id })
    .eq('id', params.id)

  awardPoints(profile.id, 'question_answered', post.id).then(() => {}).catch(() => {})

  return NextResponse.json({ data: post }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = (await import('@/lib/supabase-server')).createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    // Mark as answered (dismissed) so it doesn't show again
    await supabase.from('anonymous_questions')
      .update({ is_answered: true })
      .eq('id', params.id)
      .eq('target_user_id', me.id)
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
