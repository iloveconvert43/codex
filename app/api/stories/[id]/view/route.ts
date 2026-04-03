export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidUUID } from '@/lib/security'
import { queuePush } from '@/lib/push'

type Ctx = { params: { id: string } }

// POST /api/stories/[id]/view — record view
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = createAdminClient()
    const storyId = params.id
    if (!storyId || !isValidUUID(storyId)) {
      return NextResponse.json({ error: 'Invalid story ID' }, { status: 400 })
    }

    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    let viewerId: string | null = null
    if (sessionUser) {
      const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
      viewerId = me?.id ?? null
    }

    // Record view for logged-in users
    if (viewerId) {
      await supabase.from('story_views').upsert(
        { story_id: storyId, viewer_id: viewerId },
        { onConflict: 'story_id,viewer_id', ignoreDuplicates: true }
      )
    }

    // Always increment view count
    await supabase.rpc('increment_story_views', { p_story_id: storyId }).catch(() => {
      // Fallback if RPC missing
      supabase.from('stories')
        .update({ view_count: supabase.rpc('coalesce_increment', { p_id: storyId }) })
        .eq('id', storyId).then(() => {}).catch(() => {})
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[stories/view]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH /api/stories/[id]/view — record reaction to story
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const supabase = createAdminClient()
    const storyId = params.id
    if (!isValidUUID(storyId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const { data: me } = await supabase.from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { reaction } = await req.json()
    if (!reaction) return NextResponse.json({ error: 'reaction required' }, { status: 400 })

    // Update story_views with reaction
    await supabase.from('story_views').upsert(
      { story_id: storyId, viewer_id: me.id, reaction },
      { onConflict: 'story_id,viewer_id' }
    )

    // Get story owner for notification
    const { data: story } = await supabase
      .from('stories').select('user_id, is_anonymous').eq('id', storyId).single()

    if (story && story.user_id !== me.id && !story.is_anonymous) {
      // Push notification to story owner
      queuePush(story.user_id, {
        title: 'Someone reacted to your story! ' + reaction,
        body: 'Tap to see who',
        url: '/profile/me'
      }).catch(() => {})

      // In-app notification
      supabase.from('notifications').insert({
        user_id:  story.user_id,
        actor_id: me.id,
        type:     'story_reaction',
        message:  reaction + ' reacted to your story'
      }).then(() => {}).catch(() => {})

      // Update affinity — reactor is interested in story owner's content
      supabase.rpc('update_user_affinity', {
        p_user_id:   me.id,
        p_dimension: 'author:' + story.user_id,
        p_delta:     2.0
      }).then(() => {}).catch(() => {})
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[stories/view PATCH]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
