export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * POST /api/interactions
 * 
 * Records user interactions for recommendation learning.
 * Called from client via sendBeacon (survives page unload).
 * 
 * Actions tracked:
 *   dwell   - user spent >3s on post → strong positive signal
 *   skip    - scrolled past <1s → mild negative signal
 *   react   - reacted to post → strong positive signal
 *   reveal  - revealed mystery → very strong signal
 *   tag_tap - tapped a tag → interest signal
 *   hide    - hid post → negative signal → reduce this author/tag
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { rateLimit, getClientIP, isValidUUID } from '@/lib/security'

const ACTION_WEIGHTS: Record<string, number> = {
  dwell:       0.5,   // reading = moderate positive
  react:       2.0,   // reacting = strong positive
  comment:     3.0,   // commenting = very strong
  share:       4.0,   // sharing = strongest
  reveal:      3.5,   // revealing mystery = very strong
  tag_tap:     1.5,   // interest in tag
  profile_tap: 1.0,   // interest in author
  view:        0.1,   // just seeing = weak
  skip:       -0.2,   // skipping = mild negative
  hide:       -3.0,   // hiding = strong negative
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ ok: true })  // not logged in = ignore

    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', sessionUser.id).single()
    if (!profile) return NextResponse.json({ ok: true })

    // Rate limit: 200 interactions per minute (batched, not per-interaction)
    const ip = getClientIP(req)
    const rl = rateLimit(`interactions:${profile.id}`, { max: 200, windowMs: 60000 })
    if (!rl.allowed) return NextResponse.json({ ok: true })

    const body = await req.json()
    const interactions: Array<{
      post_id: string
      action: string
      tag?: string
      dwell_ms?: number
    }> = Array.isArray(body) ? body : [body]

    // Validate and process in batch
    const validInteractions = interactions.filter(i =>
      i.post_id && isValidUUID(i.post_id) &&
      i.action && ACTION_WEIGHTS[i.action] !== undefined
    ).slice(0, 50)  // max 50 per batch

    if (!validInteractions.length) return NextResponse.json({ ok: true })

    // Insert all interactions
    await supabase.from('user_interactions').insert(
      validInteractions.map(i => ({
        user_id:   profile.id,
        post_id:   i.post_id,
        action:    i.action,
        tag:       i.tag ?? null,
        dwell_ms:  i.dwell_ms ?? null }))
    )

    // "hide" action → permanently exclude from feed via post_hides table
    const hides = validInteractions.filter(i => i.action === 'hide')
    if (hides.length > 0) {
      await supabase.from('post_hides').upsert(
        hides.map(i => ({ user_id: profile.id, post_id: i.post_id })),
        { onConflict: 'user_id,post_id', ignoreDuplicates: true }
      )
    }

    // Update affinity scores (async, non-blocking)
    for (const interaction of validInteractions) {
      const weight = ACTION_WEIGHTS[interaction.action] ?? 0
      if (weight === 0) continue

      // Get post data to extract tags and author
      const { data: post } = await supabase
        .from('posts')
        .select('user_id, tags, is_anonymous, is_mystery')
        .eq('id', interaction.post_id)
        .single()

      if (!post) continue

      // Update tag affinities + time-of-day patterns
      if (post.tags?.length && !post.is_anonymous) {
        for (const tag of post.tags.slice(0, 5)) {
          supabase.rpc('update_user_affinity', {
            p_user_id:   profile.id,
            p_dimension: `tag:${tag}`,
            p_delta:     weight }).then(() => {}).catch(() => {})
          // Also update time-of-day pattern (what user reads at this hour)
          if (weight > 0) {
            supabase.rpc('update_time_pattern', {
              p_user_id:   profile.id,
              p_dimension: `tag:${tag}`,
              p_delta:     weight * 0.5 }).then(() => {}).catch(() => {})
          }
        }
      }

      // Update author affinity (not for anonymous posts)
      if (post.user_id && !post.is_anonymous) {
        supabase.rpc('update_user_affinity', {
          p_user_id:   profile.id,
          p_dimension: `author:${post.user_id}`,
          p_delta:     weight }).then(() => {}).catch(() => {})
      }

      // Update content type affinity
      if (post.is_mystery) {
        supabase.rpc('update_user_affinity', {
          p_user_id:   profile.id,
          p_dimension: 'type:mystery',
          p_delta:     weight }).then(() => {}).catch(() => {})
      }
      if (post.image_url) {
        supabase.rpc('update_user_affinity', {
          p_user_id:   profile.id,
          p_dimension: 'type:visual',
          p_delta:     weight * 0.5 }).then(() => {}).catch(() => {})
      }
      if (post.video_url) {
        supabase.rpc('update_user_affinity', {
          p_user_id:   profile.id,
          p_dimension: 'type:video',
          p_delta:     weight }).then(() => {}).catch(() => {})
      }

      // If tag_tap: specifically boost that tag
      if (interaction.action === 'tag_tap' && interaction.tag) {
        supabase.rpc('update_user_affinity', {
          p_user_id:   profile.id,
          p_dimension: `tag:${interaction.tag}`,
          p_delta:     3.0,
        }).then(() => {}).catch(() => {})
      }

      // If share: fire network signal so sharer's followers see this post boosted
      if (interaction.action === 'share' || interaction.action === 'react') {
        supabase.rpc('update_network_signals_for_post', {
          p_actor_id: profile.id,
          p_post_id:  interaction.post_id,
          p_signal:   interaction.action === 'share' ? 'friend_shared' : 'friend_reacted'
        }).then(() => {}).catch(() => {})
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[interactions]', err.message)
    return NextResponse.json({ ok: true })  // never fail UX for analytics
  }
}
