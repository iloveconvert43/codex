export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST   /api/posts/[id]/react — Add/update reaction
 * DELETE /api/posts/[id]/react — Remove reaction
 * 
 * Also triggers notification to post owner.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { z } from 'zod'
import { validate } from '@/lib/validation/schemas'

const reactSchema = z.object({
  type: z.enum(['interesting','funny','deep','curious']) })

type Ctx = { params: { id: string } }

async function getProfile(supabase: any, req: NextRequest) {
  const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
  const _authId = _getUID(req.headers.get('authorization'))
  const sessionUser = _authId ? { id: _authId } : null
  if (!sessionUser) return null
  const { data } = await supabase
    .from('users').select('id').eq('auth_id', sessionUser.id).single()
  return data
}

export async function POST(req: NextRequest, { params }: Ctx) {
  // Validate UUID format to prevent injection
  if (!params.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.id)) {
    return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
  }
  const admin = createAdminClient()
  const profile = await getProfile(admin, req)
  if (!profile) return NextResponse.json({ error: 'Sign in to react' }, { status: 401 })

  let rawBody: any
  try { rawBody = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const v = validate(reactSchema, rawBody)
  if (!v.success) return NextResponse.json({ error: v.error }, { status: 400 })

  const { data, error } = await admin.from('reactions')
    .upsert(
      { post_id: params.id, user_id: profile.id, type: v.data.type },
      { onConflict: 'post_id,user_id' }
    )
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Non-blocking: single post query for all side effects (notification, points, affinity, tags)
  admin.from('posts').select('user_id, tags').eq('id', params.id).single()
    .then(async ({ data: post }: any) => {
      if (!post) return

      // Tag interest update
      if (post.tags?.length && profile?.id) {
        admin.rpc('update_tag_interest', {
          p_user_id: profile.id,
          p_tags: post.tags,
          p_delta: 1 }).then(() => {}).catch(() => {})
      }

      // Network signals for followers of reactor
      admin.rpc('update_network_signals_for_post', {
        p_actor_id: profile.id, p_post_id: params.id, p_signal: 'friend_reacted'
      }).then(() => {}).catch(() => {})

      if (post.user_id !== profile.id) {
        // Notification
        admin.from('notifications').insert({
          user_id: post.user_id, actor_id: profile.id,
          type: 'new_reaction', post_id: params.id,
          message: 'reacted to your post' }).then(() => {}).catch(() => {})
        // Points
        const { awardPoints } = await import('@/lib/points')
        awardPoints(post.user_id, 'reaction_received', params.id).then(() => {}).catch(() => {})
        // Affinity: reacting = author interest signal (weight 2.0)
        admin.rpc('update_user_affinity', {
          p_user_id: profile.id,
          p_dimension: `author:${post.user_id}`,
          p_delta: 2.0
        }).then(() => {}).catch(() => {})
      }

      // Affinity: tag interests from this post
      if (post.tags?.length) {
        post.tags.slice(0, 3).forEach((tag: string) => {
          admin.rpc('update_user_affinity', {
            p_user_id: profile.id, p_dimension: `tag:${tag}`, p_delta: 1.0
          }).then(() => {}).catch(() => {})
        })
      }
    }).then(() => {}).catch(() => {})

  return NextResponse.json({ data })
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const admin = createAdminClient()
  const profile = await getProfile(admin, req)
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await admin.from('reactions')
    .delete().eq('post_id', params.id).eq('user_id', profile.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
