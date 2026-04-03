export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidUUID } from '@/lib/security'

// GET /api/stories/highlights?user_id=X — get user's highlights
// POST /api/stories/highlights — save a story as highlight
export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('user_id')

    if (!userId || !isValidUUID(userId)) {
      return NextResponse.json({ data: [] })
    }

    const { data: highlights } = await supabase
      .from('story_highlights')
      .select('*, story:stories(id, content, image_url, video_url, bg_color)')
      .eq('user_id', userId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: false })

    return NextResponse.json({ data: highlights || [] })
  } catch (err: any) {
    return NextResponse.json({ data: [] })
  }
}

export async function POST(req: NextRequest) {
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

    const { story_id, title } = await req.json()
    if (!isValidUUID(story_id)) return NextResponse.json({ error: 'Invalid story_id' }, { status: 400 })

    // Verify story belongs to user
    const { data: story } = await supabase
      .from('stories').select('user_id').eq('id', story_id).single()
    if (!story || story.user_id !== profile.id) {
      return NextResponse.json({ error: 'Not your story' }, { status: 403 })
    }

    const { data, error } = await supabase.from('story_highlights').upsert({
      user_id:  profile.id,
      story_id,
      title:    (title || 'Highlight').slice(0, 30),
    }, { onConflict: 'user_id,story_id' }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { searchParams } = new URL(req.url)
    const story_id = searchParams.get('story_id')
    if (!story_id || !isValidUUID(story_id)) return NextResponse.json({ error: 'Invalid' }, { status: 400 })

    await supabase.from('story_highlights').delete()
      .eq('user_id', profile.id).eq('story_id', story_id)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
