export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { createPostSchema, validate } from '@/lib/validation/schemas'
import { sanitizeText, sanitizeTags } from '@/lib/sanitize'
import { rateLimit } from '@/lib/security'
import { awardPoints } from '@/lib/points'
import { queuePush } from '@/lib/push'
import { invalidateProfile } from '@/lib/redis'

// Simple in-memory rate limiter (production: use Upstash Redis)
const rateLimitMap = new Map<string, { count: number; reset: number }>()

function checkRateLimit(userId: string, maxPerHour = 20): boolean {
  const now = Date.now()
  const key = userId
  const record = rateLimitMap.get(key)

  if (!record || now > record.reset) {
    rateLimitMap.set(key, { count: 1, reset: now + 3600000 })
    return true
  }
  if (record.count >= maxPerHour) return false
  record.count++
  return true
}

export async function POST(req: NextRequest) {
  try {
  const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
  if (!_authId) return NextResponse.json({ error: 'Please sign in to post' }, { status: 401 })

  // Use admin client to bypass RLS — auth verified via JWT
  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('users').select('id, is_banned, full_name, username, display_name, avatar_url, is_verified, city').eq('auth_id', _authId).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  if (profile.is_banned) return NextResponse.json({ error: 'Account suspended' }, { status: 403 })

  // Rate limit: 10 posts per minute, 50 per hour
  const rl = rateLimit(`post:${profile.id}`, { max: 10, windowMs: 60000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Posting too fast. Please wait a moment.' }, { status: 429 })
  }

  // Rate limiting: 20 posts per hour
  if (!checkRateLimit(profile.id)) {
    return NextResponse.json(
      { error: 'You\'re posting too fast. Max 20 posts per hour.' },
      { status: 429 }
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const {
    content, image_url, video_url, video_thumbnail_url,
    is_anonymous, is_mystery, latitude, longitude, city, tags,
    room_id, scope,
    gif_url, feeling, feeling_emoji,
    activity, activity_emoji, activity_detail,
    location_name, is_life_event, life_event_type, life_event_emoji,
    neighborhood_id, reshared_from_id, reshare_comment,
    tagged_user_ids, is_sensitive,
  } = body

  // Validate content — optional if image or video is provided
  const trimmed = (content || '').trim()
  const hasMedia = !!(image_url || video_url || gif_url)
  const hasStructuredContext = !!(
    (typeof feeling === 'string' && feeling.trim()) ||
    (typeof activity === 'string' && activity.trim()) ||
    (typeof location_name === 'string' && location_name.trim()) ||
    is_life_event
  )
  const hasReshare = !!reshared_from_id
  if (!trimmed && !hasMedia && !hasStructuredContext && !hasReshare) {
    return NextResponse.json(
      { error: 'Add text, photo, video, GIF, or an activity to post' },
      { status: 400 }
    )
  }
  if (trimmed.length > 5000) return NextResponse.json({ error: 'Text too long (max 5000 chars)' }, { status: 400 })

  // Validate image URL
  if (image_url && typeof image_url === 'string') {
    try { new URL(image_url) } catch {
      return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 })
    }
  }

  if (video_url && typeof video_url === 'string') {
    try { new URL(video_url) } catch {
      return NextResponse.json({ error: 'Invalid video URL' }, { status: 400 })
    }
  }

  if (gif_url && typeof gif_url === 'string') {
    try { new URL(gif_url) } catch {
      return NextResponse.json({ error: 'Invalid GIF URL' }, { status: 400 })
    }
  }

  // Validate coordinates
  let validLat: number | null = null
  let validLng: number | null = null
  if (latitude != null && longitude != null) {
    const lat = parseFloat(latitude)
    const lng = parseFloat(longitude)
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      validLat = lat
      validLng = lng
    }
  }

  // Validate tags
  const validTags = Array.isArray(tags)
    ? tags.slice(0, 5).map((t: string) => String(t).toLowerCase().slice(0, 30)).filter(Boolean)
    : []

  // ── Duplicate submission guard ─────────────────────────────
  // Prevents same post being submitted twice within 5 seconds (double-click, network retry)
  if (trimmed) {
    const fiveSecsAgo = new Date(Date.now() - 5000).toISOString()
    const { data: recentDupe } = await supabase
      .from('posts').select('id')
      .eq('user_id', profile.id)
      .eq('content', trimmed)
      .gt('created_at', fiveSecsAgo)
      .limit(1)
    if (recentDupe && recentDupe.length > 0) {
      return NextResponse.json({ error: 'Duplicate post detected. Please wait a moment.' }, { status: 429 })
    }
  }

  const { data: post, error } = await supabase.from('posts').insert({
    user_id:     profile.id,
    content:     trimmed || null,
    image_url:   image_url || null,
    video_url:   video_url || null,
    video_thumbnail_url: video_thumbnail_url || null,
    is_anonymous: !!is_anonymous,
    is_mystery:   !!is_mystery,
    latitude:    validLat,
    longitude:   validLng,
    city:        city ? String(city).slice(0, 100) : null,
    tags:        validTags,
    room_id:     room_id || null,
    // New columns — safe to include, ignored if column missing after migration
    ...(scope        !== undefined ? { scope: scope || 'global' }          : {}),
    ...(is_sensitive !== undefined ? { is_sensitive: !!is_sensitive }       : {}),
    ...(gif_url      ? { gif_url }                                          : {}),
    ...(feeling      ? { feeling, feeling_emoji: feeling_emoji || null }    : {}),
    ...(activity     ? { activity, activity_emoji: activity_emoji || null,
                         activity_detail: activity_detail || null }        : {}),
    ...(location_name ? { location_name }                                  : {}),
    ...(is_life_event ? { is_life_event: true,
                          life_event_type:  life_event_type  || null,
                          life_event_emoji: life_event_emoji || null }     : {}),
  }).select().single()

  if (error) {
    console.error('[POST /api/posts]', error.message)
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 })
  }

  // Award points + update streak (non-blocking)
  const pointsReason = hasMedia
    ? (body.is_mystery ? 'mystery_post' : 'media_post')
    : 'post_created'
  awardPoints(profile.id, pointsReason as any, post.id).then(() => {}).catch(() => {})

  if (reshared_from_id) {
    supabase.rpc('increment_reshare_count', { p_post_id: reshared_from_id }).then(() => {}).catch(() => {})
    // Notify original post owner
    supabase.from('posts').select('user_id').eq('id', reshared_from_id).single()
      .then(({ data: orig }) => {
        if (orig && orig.user_id !== profile.id) {
          queuePush(orig.user_id, {
            title: 'Someone reshared your post!',
            body: 'Your post is spreading 🔥',
            url: `/post/${post.id}` })
        }
      }).then(() => {}).catch(() => {})
  }

  // Increment room post count
  if (room_id) {
    supabase.rpc('increment_room_post_count', { p_room_id: room_id })
      .then(() => {})
      .catch(() => {
        // Fallback: manual increment if RPC doesn't exist
        supabase.from('topic_rooms').select('post_count').eq('id', room_id).single()
          .then(({ data: r }) => {
            if (r) supabase.from('topic_rooms').update({ post_count: (r.post_count || 0) + 1 }).eq('id', room_id)
          }).catch(() => {})
      })
  }

  supabase.rpc('update_user_streak', { p_user_id: profile.id })
    .then(() => checkAndAwardBadges(supabase, profile.id))
    .catch(console.error)

  // Handle tagged_user_ids — tag people in post
  const taggedIds: string[] = Array.isArray(tagged_user_ids) ? tagged_user_ids.slice(0, 20) : []
  if (taggedIds.length > 0 && post?.id) {
    const valid = taggedIds.filter((id: string) => /^[0-9a-f-]{36}$/i.test(id))
    if (valid.length) {
      supabase.from('post_tags')
        .insert(valid.map((uid: string) => ({ post_id: post.id, user_id: uid })))
        .then(() => {}, () => {})
      valid.forEach((uid: string) => {
        if (uid !== profile.id) {
          supabase.from('notifications').insert({
            user_id: uid, actor_id: profile.id,
            type: 'tagged_in_post', post_id: post.id,
            message: 'tagged you in a post' }).then(() => {}, () => {})
        }
      })
    }
  }

  invalidateProfile(profile.id).catch(() => {})

  const responsePost = {
    ...post,
    user: {
      id: profile.id,
      full_name: profile.full_name ?? null,
      username: profile.username ?? null,
      display_name: profile.display_name ?? null,
      avatar_url: profile.avatar_url ?? null,
      is_verified: !!profile.is_verified,
      city: profile.city ?? null,
    },
    comment_count: 0,
    reaction_counts: { interesting: 0, funny: 0, deep: 0, curious: 0 },
    user_reaction: null,
    has_revealed: false,
  }

  return NextResponse.json({ data: responsePost }, { status: 201 })

  } catch (err: any) {
    console.error('[POST /api/posts]', err.message)
    return NextResponse.json({ error: err.message || 'Failed to create post' }, { status: 500 })
  }
}

async function checkAndAwardBadges(supabase: any, userId: string) {
  const { data: streak } = await supabase
    .from('user_streaks').select('current_streak, total_posts').eq('user_id', userId).single()
  if (!streak) return

  const badges: Record<number, string> = { 7: 'streak_7', 30: 'streak_30', 100: 'streak_100' }
  for (const [days, badge] of Object.entries(badges)) {
    if (streak.current_streak >= parseInt(days)) {
      await supabase.from('user_badges')
        .upsert({ user_id: userId, badge }, { onConflict: 'user_id,badge', ignoreDuplicates: true })
    }
  }
}
