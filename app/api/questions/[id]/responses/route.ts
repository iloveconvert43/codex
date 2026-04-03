export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

type Ctx = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('question_responses')
      .select('*, user:users(id,username,display_name,avatar_url)')
      .eq('question_id', params.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data || [] })
  } catch (err: any) {
    console.error('[responses GET]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { content, is_anonymous } = await req.json()
    if (!content || content.trim().length < 1 || content.length > 1000)
      return NextResponse.json({ error: 'Content must be 1-1000 chars' }, { status: 400 })

    const { data, error } = await supabase
      .from('question_responses')
      .insert({
        question_id: params.id,
        user_id: profile.id,
        content: content.trim(),
        is_anonymous: !!is_anonymous })
      .select('*, user:users(id,username,display_name,avatar_url)')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data }, { status: 201 })
  } catch (err: any) {
    console.error('[responses POST]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
