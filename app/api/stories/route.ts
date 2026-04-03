export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * GET  /api/stories — Smart affinity-ranked story feed (Facebook-style)
 * POST /api/stories — create a new story
 *
 * RANKING LOGIC:
 *   1. Own stories — always first
 *   2. Affinity-ranked — users you react/comment/follow more appear earlier
 *   3. Social graph expansion — if you follow nobody, shows posts you've interacted with
 *   4. Unviewed stories boosted
 *   5. Anonymous stories appended at end (engagement-ranked)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { z } from 'zod'
import { validate } from '@/lib/validation/schemas'
import { sanitizeText } from '@/lib/sanitize'
import { awardPoints } from '@/lib/points'
import { rateLimit } from '@/lib/security'

const createStorySchema = z.object({
  content:   z.string().max(500).optional().nullable(),
  // Accept URL, empty string, or null — transform empty to null
  image_url: z.union([z.string().url(), z.literal(''), z.null()]).optional()
    .transform(v => (v === '' || v === undefined) ? null : v),
  video_url: z.union([z.string().url(), z.literal(''), z.null()]).optional()
    .transform(v => (v === '' || v === undefined) ? null : v),
  // Accept any 6-digit hex OR empty string (default to purple)
  bg_color:  z.string().optional().default('#6C63FF')
    .transform(v => /^#[0-9a-fA-F]{6}$/.test(v || '') ? v : '#6C63FF'),
  is_anonymous: z.boolean().default(false),
  is_mystery: z.boolean().default(false),
  mystery_reveal_threshold: z.number().min(1).max(100).default(10),
  mentioned_user_ids: z.array(z.string().uuid()).max(10).default([]),
  text_size:  z.enum(['sm','md','lg','xl']).default('md'),
  text_align: z.enum(['left','center','right']).default('center'),
  text_color: z.string().optional().nullable().default('#FFFFFF')
    .transform(v => (v && /^#[0-9a-fA-F]{6}$/.test(v)) ? v : '#FFFFFF'),
}).refine(d => !!(d.content?.trim() || d.image_url || d.video_url), {
  message: 'Add some text or a photo to your story'
})

export async function GET(req: import('next/server').NextRequest) {
  try {
    const supabase = createAdminClient()
    // Fast: get user from JWT, then fetch profile only if logged in
    const authHeader = req.headers.get('authorization') || null
    const { getUserIdFromToken } = await import('@/lib/jwt')
    const authUserId = getUserIdFromToken(authHeader)
    let userId: string | null = null
    if (authUserId) {
      const { data: p } = await supabase.from('users').select('id').eq('auth_id', authUserId).single()
      userId = p?.id ?? null
    }

    let groups: any[] = []

    if (userId) {
      // ── LOGGED IN: Use legacy direct query (fast, no RPC dependency) ──
      groups = await legacyStoriesFeed(supabase, userId)

      // Append anonymous stories at end (engagement-ranked)
      const { data: anonStories } = await supabase
        .from('stories')
        .select('id,user_id,content,image_url,video_url,bg_color,view_count,expires_at,created_at')
        .gt('expires_at', new Date().toISOString())
        .eq('is_anonymous', true)
        .order('view_count', { ascending: false })
        .limit(10)

      if (anonStories?.length) {
        // Check which anon stories the user has viewed
        const anonIds = anonStories.map((s: any) => s.id)
        const { data: anonViews } = await supabase
          .from('story_views').select('story_id').in('story_id', anonIds).eq('viewer_id', userId)
        const anonViewedSet = new Set((anonViews || []).map((v: any) => v.story_id))

        for (const s of anonStories) {
          groups.push({
            user: null,
            is_anonymous: true,
            stories: [{
              id: s.id, content: s.content,
              image_url: s.image_url, video_url: s.video_url,
              bg_color: s.bg_color, view_count: s.view_count,
              expires_at: s.expires_at, created_at: s.created_at,
              has_viewed: anonViewedSet.has(s.id),
            }],
            has_unviewed: !anonViewedSet.has(s.id),
            story_score:  0,
            social_context: 'anonymous',
          })
        }
      }

    } else {
      // ── LOGGED OUT: Show recent public non-anonymous stories ──
      const { data: publicStories } = await supabase
        .from('stories')
        .select('id,user_id,content,image_url,video_url,bg_color,is_anonymous,view_count,expires_at,created_at,text_size,text_align,text_color,user:users!user_id(id,username,display_name,avatar_url,is_verified)')
        .gt('expires_at', new Date().toISOString())
        .eq('is_anonymous', false)
        .order('view_count', { ascending: false })
        .limit(10)  // reduced from 20

      const groupMap = new Map<string, any>()
      for (const s of (publicStories || [])) {
        if (!groupMap.has(s.user_id)) {
          groupMap.set(s.user_id, {
            user: s.user, is_anonymous: false,
            stories: [], has_unviewed: true, story_score: s.view_count
          })
        }
        groupMap.get(s.user_id)!.stories.push({ ...s, has_viewed: false })
      }
      groups = [...groupMap.values()]
    }

    return NextResponse.json({ data: groups })
  } catch (err: any) {
    console.error('[stories GET]', err.message)
    return NextResponse.json({ error: 'Failed to load stories' }, { status: 500 })
  }
}

// ── Legacy fallback (when SQL function not yet deployed) ─────
async function legacyStoriesFeed(supabase: any, userId: string) {
  // Fast: parallel queries
  const [followsRes, affinityRes] = await Promise.all([
    supabase.from('follows').select('following_id').eq('follower_id', userId).limit(200),
    supabase.from('user_affinity').select('dimension').eq('user_id', userId)
      .like('dimension', 'author:%').gt('score', 2.0).order('score', { ascending: false }).limit(20)
  ])

  const followingIds = (followsRes.data || []).map((f: any) => f.following_id)
  const affinityIds = (affinityRes.data || []).map((a: any) => a.dimension.replace('author:', ''))
  const visibleIds = [...new Set([userId, ...followingIds, ...affinityIds])].slice(0, 100)

  const [storiesRes, _] = await Promise.all([
    supabase.from('stories')
      .select('id,user_id,content,image_url,video_url,bg_color,is_anonymous,is_mystery,mystery_reveal_threshold,view_count,expires_at,created_at')
      .gt('expires_at', new Date().toISOString())
      .eq('is_anonymous', false)
      .in('user_id', visibleIds)
      .order('created_at', { ascending: false })
      .limit(50),
    Promise.resolve(null)
  ])

  const storyList = storiesRes.data || []
  if (!storyList.length) return []

  // Batch fetch users + views in parallel
  const authorIds = [...new Set(storyList.map((s: any) => s.user_id))] as string[]
  const storyIds = storyList.map((s: any) => s.id)

  const [usersRes, viewsRes] = await Promise.all([
    supabase.from('users').select('id,username,display_name,avatar_url,is_verified').in('id', authorIds),
    supabase.from('story_views').select('story_id').in('story_id', storyIds).eq('viewer_id', userId)
  ])

  const userMap: Record<string, any> = Object.fromEntries((usersRes.data || []).map((u: any) => [u.id, u]))
  const viewedSet = new Set((viewsRes.data || []).map((v: any) => v.story_id))

  const groupMap = new Map<string, any>()
  for (const s of storyList) {
    if (!groupMap.has(s.user_id)) {
      groupMap.set(s.user_id, {
        user: userMap[s.user_id] ?? null, is_anonymous: false,
        stories: [], has_unviewed: false, story_score: 0,
        social_context: followingIds.includes(s.user_id) ? 'following' : 'affinity'
      })
    }
    const g = groupMap.get(s.user_id)!
    const viewed = viewedSet.has(s.id)
    if (!viewed) g.has_unviewed = true
    g.stories.push({ ...s, has_viewed: viewed })
  }

  return [...groupMap.values()].sort((a, b) => {
    if (a.user?.id === userId) return -1
    if (b.user?.id === userId) return 1
    if (a.has_unviewed && !b.has_unviewed) return -1
    if (!a.has_unviewed && b.has_unviewed) return 1
    return 0
  })
}

// ── POST: Create story ───────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { getUserIdFromToken: _getUID } = await import('@/lib/jwt')
    const _authId = _getUID(req.headers.get('authorization'))
    const sessionUser = _authId ? { id: _authId } : null
    // (auth.getUser replaced with JWT decode)
    if (!sessionUser) return NextResponse.json({ error: 'Sign in to post stories' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('id, is_banned').eq('auth_id', sessionUser.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    if (profile.is_banned) return NextResponse.json({ error: 'Account suspended' }, { status: 403 })

    // Rate limit: 10 stories per day
    const rl = rateLimit(`story-create:${profile.id}`, { max: 10, windowMs: 86400000 })
    if (!rl.allowed) return NextResponse.json({ error: 'Max 10 stories per day' }, { status: 429 })

    let rawBody: any
    try { rawBody = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const v = validate(createStorySchema, rawBody)
    if (!v.success) return NextResponse.json({ error: v.error }, { status: 400 })

    const storyData: Record<string, any> = {
      user_id:      profile.id,
      content:      v.data.content ? sanitizeText(v.data.content) : null,
      image_url:    v.data.image_url || null,
      video_url:    v.data.video_url || null,
      bg_color:     v.data.bg_color  || '#6C63FF',
      is_anonymous: v.data.is_anonymous,
      is_mystery:   v.data.is_mystery,
      mystery_reveal_threshold: v.data.mystery_reveal_threshold,
    }
    // Add optional columns only if they exist in DB (migration may not have run)
    if (v.data.mentioned_user_ids?.length) storyData.mentioned_user_ids = v.data.mentioned_user_ids
    if (v.data.text_size)  storyData.text_size  = v.data.text_size
    if (v.data.text_align) storyData.text_align = v.data.text_align
    if (v.data.text_color) storyData.text_color = v.data.text_color

    const { data: story, error } = await supabase.from('stories')
      .insert(storyData).select().single()

    if (error || !story) return NextResponse.json({ error: error?.message || 'Failed to create story' }, { status: 500 })

    // Notify mentioned users
    if (v.data.mentioned_user_ids?.length) {
      for (const uid of v.data.mentioned_user_ids) {
        if (uid === profile.id) continue
        supabase.from('notifications').insert({
          user_id: uid, actor_id: profile.id,
          type: 'story_mention', message: 'mentioned you in their story'
        }).then(() => {}).catch(() => {})
      }
    }

    awardPoints(profile.id, 'post_created', story.id).then(() => {}).catch(() => {})

    return NextResponse.json({ data: story }, { status: 201 })
  } catch (err: any) {
    console.error('[stories POST]', err.message)
    return NextResponse.json({ error: 'Failed to create story' }, { status: 500 })
  }
}
