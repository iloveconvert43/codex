export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
  const supabase = createAdminClient()
  const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
  if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
  if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { post_id, reason, details } = await req.json()
  if (!post_id) return NextResponse.json({ error: 'post_id required' }, { status: 400 })

  const validReasons = ['spam', 'harassment', 'hate_speech', 'misinformation', 'inappropriate_content', 'other']
  const cleanReason = validReasons.includes(reason) ? reason : 'other'

  const { error } = await supabase.from('post_reports').upsert(
    { post_id, user_id: me.id, reason: cleanReason, details: details || null },
    { onConflict: 'post_id,user_id', ignoreDuplicates: true }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[reports]', err.message)
    return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 })
  }
}