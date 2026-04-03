export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidUUID } from '@/lib/security'

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ data: [] })

    const { searchParams } = new URL(req.url)
    const story_id = searchParams.get('story_id')
    if (!story_id || !isValidUUID(story_id)) return NextResponse.json({ data: [] })

    // Only story owner can see viewers
    const { data: story } = await supabase.from('stories').select('user_id').eq('id', story_id).single()
    if (!story || story.user_id !== me.id) {
      return NextResponse.json({ error: 'Not your story', data: [] }, { status: 403 })
    }

    const { data: views } = await supabase
      .from('story_views')
      .select('viewer_id, viewed_at, viewer:users!viewer_id(id, username, display_name, avatar_url)')
      .eq('story_id', story_id)
      .order('viewed_at', { ascending: false })
      .limit(100)

    return NextResponse.json({ data: views || [], count: views?.length ?? 0 })
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed', data: [] }, { status: 500 })
  }
}
