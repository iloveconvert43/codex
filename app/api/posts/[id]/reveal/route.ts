export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidUUID } from '@/lib/security'

type Ctx = { params: { id: string } }

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    if (!isValidUUID(params.id)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const { data: post } = await supabase.from('posts')
      .select('id, content, image_url, video_url, video_thumbnail_url, is_mystery')
      .eq('id', params.id).single()
    if (!post?.is_mystery) return NextResponse.json({ error: 'Not a mystery post' }, { status: 400 })

    // Check if already revealed
    const { data: existing } = await supabase
      .from('mystery_reveals')
      .select('post_id')
      .eq('post_id', params.id)
      .eq('user_id', profile.id)
      .single()

    if (!existing) {
      await supabase.from('mystery_reveals')
        .insert({ post_id: params.id, user_id: profile.id })
      await supabase.rpc('increment_reveal_count', { p_post_id: params.id })
    }

    // Reveal = very high intent signal (weight 3.5)
    supabase.from('posts').select('user_id, tags, is_anonymous').eq('id', params.id).single()
      .then(({ data: p }: any) => {
        if (!p) return
        if (p.tags?.length) {
          for (const tag of p.tags.slice(0, 5)) {
            supabase.rpc('update_user_affinity', {
              p_user_id: profile.id, p_dimension: `tag:${tag}`, p_delta: 3.5
            }).then(() => {}).catch(() => {})
          }
        }
        if (p.user_id && !p.is_anonymous) {
          supabase.rpc('update_user_affinity', {
            p_user_id: profile.id, p_dimension: `author:${p.user_id}`, p_delta: 3.5
          }).then(() => {}).catch(() => {})
        }
        supabase.rpc('update_user_affinity', {
          p_user_id: profile.id, p_dimension: 'type:mystery', p_delta: 3.5
        }).then(() => {}).catch(() => {})
      }).catch(() => {})

    return NextResponse.json({
      data: {
        content: post.content,
        image_url: post.image_url,
        video_url: (post as any).video_url ?? null,
        video_thumbnail_url: (post as any).video_thumbnail_url ?? null }
    })
  } catch (err: any) {
    console.error('[posts/reveal]', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
